/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

/**
 * 单工作区多文件夹场景下的仓颉工程发现。
 *
 * 设计原则：
 * - 纯函数核心（discoverProjects / isInside / routeProject）不依赖 vscode，可单元测试；
 * - vscode 适配层（discoverWorkspaceProjects / onDidChangeProjects）放在文件底部，
 *   负责从 workspace.workspaceFolders 收集根目录并缓存结果。
 *
 * 工程语义（与 cjpm 保持一致）：
 * - 每个含 cjpm.toml 的目录是一个工程（project root）；
 * - 若该 cjpm.toml 带 [workspace] members，则 members 声明的子包共享同一工程，
 *   只为其根目录启动一个语言服务实例；
 * - 不含 cjpm.toml 的工作区文件夹不启动服务（日志提示）。
 */

import * as path from 'path';
import * as fs from 'fs';

export interface CangjieProject {
  /** 工程根目录（含 cjpm.toml 的绝对路径） */
  root: string;
  /** cjpm.toml 绝对路径 */
  cjpmToml: string;
  /** 是否声明了 [workspace]（多包工作区，members 共享本实例） */
  isWorkspace: boolean;
  /** [workspace] members 解析出的子包目录（绝对路径，含 root 本身） */
  memberDirs: string[];
}

/** 用于纯函数核心的文件系统抽象（默认用 node:fs，测试可注入） */
export interface FsLike {
  existsSync(p: string): boolean;
  readFileSync(p: string, enc: BufferEncoding): string;
}

const nodeFs: FsLike = {
  existsSync: (p) => fs.existsSync(p),
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
};

/** 工程根下寻找 cjpm.toml 的候选相对位置（与 Utility.pathsToCheck 对齐） */
export const CJPM_PATHS_TO_CHECK = ['', 'entry/src/main/cangjie', 'lib'];

/**
 * 从 cjpm.toml 文本中解析 [workspace] members（行级解析，不依赖 toml 库）。
 * 支持形态：
 *   [workspace]
 *   members = ["pkg_a", "pkg_b"]
 *   或
 *   members = [
 *     "pkg_a",
 *     "pkg_b",
 *   ]
 */
export function parseWorkspaceMembers(tomlText: string): string[] | null {
  const lines = tomlText.split(/\r?\n/);
  let inWorkspace = false;
  let sawWorkspace = false;
  let collectingArray = false;
  const members: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    if (collectingArray) {
      const items = line.match(/"([^"]*)"/g);
      if (items) {
        for (const item of items) {
          members.push(item.slice(1, -1));
        }
      }
      if (line.includes(']')) {
        collectingArray = false;
      }
      continue;
    }
    if (line.startsWith('[')) {
      inWorkspace = line === '[workspace]';
      // 与 utils.ts 的 hasOwnProperty(cjpmContent, WORKSPACE) 语义对齐：
      // 只要文件出现过 [workspace] 段即为 workspace 工程（后续 [package] 段不影响判定）
      if (inWorkspace) {
        sawWorkspace = true;
      }
      continue;
    }
    if (inWorkspace && line.startsWith('members')) {
      const eqPos = line.indexOf('=');
      const rhs = line.slice(eqPos + 1).trim();
      if (rhs.startsWith('[')) {
        if (rhs.endsWith(']') && rhs.length > 1) {
          const items = rhs.match(/"([^"]*)"/g) ?? [];
          members.push(...items.map((i) => i.slice(1, -1)));
        } else {
          collectingArray = true;
          members.push(...((rhs.match(/"([^"]*)"/g) ?? []).map((i) => i.slice(1, -1))));
        }
      }
    }
  }
  return sawWorkspace ? members : null;
}

/**
 * 纯函数核心：在给定根目录下发现工程。
 * @param folder 工作区文件夹绝对路径
 * @param tomlTextMap 预先读好的 toml 文本（root -> text）。为 null 时回退 fs 直读。
 */
export function discoverProjects(
  folder: string,
  tomlTextMap: Map<string, string> | null,
  fsLike: FsLike = nodeFs,
): CangjieProject | null {
  const norm = (p: string) => path.normalize(p).replace(/\\/g, '/').toLowerCase();

  for (const suffix of CJPM_PATHS_TO_CHECK) {
    const base = suffix ? path.join(folder, suffix) : folder;
    const tomlPath = path.join(base, 'cjpm.toml');
    if (!fsLike.existsSync(tomlPath)) {
      continue;
    }
    let text = '';
    if (tomlTextMap) {
      text = tomlTextMap.get(norm(tomlPath)) ?? '';
      if (!text && !tomlTextMap.has(norm(tomlPath))) {
        // 未预读，回退直读
        try {
          text = fsLike.readFileSync(tomlPath, 'utf8');
        } catch {
          continue;
        }
      }
    } else {
      try {
        text = fsLike.readFileSync(tomlPath, 'utf8');
      } catch {
        continue;
      }
    }
    const members = parseWorkspaceMembers(text);
    const root = suffix ? base : folder;
    const memberDirs = members
      ? [root, ...members.map((m) => path.join(root, m))]
      : [root];
    return {
      root: path.normalize(root),
      cjpmToml: path.normalize(tomlPath),
      isWorkspace: members !== null,
      memberDirs,
    };
  }
  return null;
}

/** 文档路径是否位于某工程（root 或其 memberDirs）之内 */
export function isInsideProject(filePath: string, project: CangjieProject): boolean {
  const p = path.normalize(filePath).replace(/\\/g, '/');
  const dirs = [project.root, ...project.memberDirs].map((d) => path.normalize(d).replace(/\\/g, '/'));
  return dirs.some((d) => p === d || p.startsWith(d + '/'));
}

/**
 * 文档 -> 工程 路由：最长前缀优先（嵌套工程取最内层）。
 * 无命中返回 null（调用方走回退逻辑）。
 */
export function routeProject(filePath: string, projects: CangjieProject[]): CangjieProject | null {
  let best: CangjieProject | null = null;
  let bestLen = -1;
  for (const proj of projects) {
    if (!isInsideProject(filePath, proj)) {
      continue;
    }
    const prefixLen = proj.memberDirs
      .map((d) => path.normalize(d).replace(/\\/g, '/'))
      .reduce((m, d) => (filePath.replace(/\\/g, '/').startsWith(d + '/') ? Math.max(m, d.length) : m), 0);
    if (prefixLen > bestLen) {
      best = proj;
      bestLen = prefixLen;
    }
  }
  return best;
}

/* ==================== vscode 适配层 ==================== */

let vscodeApi: typeof import('vscode') | null = null;
let cachedProjects: CangjieProject[] = [];

function loadVscode(): typeof import('vscode') {
  if (!vscodeApi) {
    // 延迟加载：让纯函数核心在无 vscode 环境下可被 import（单元测试）
    vscodeApi = require('vscode');
  }
  return vscodeApi!;
}

/**
 * 收集当前工作区全部仓颉工程。
 * 返回空数组 = 单文件模式或无仓颉工程（调用方回退单工程旧逻辑）。
 */
export function discoverWorkspaceProjects(): CangjieProject[] {
  const vscode = loadVscode();
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    cachedProjects = [];
    return cachedProjects;
  }
  const projects: CangjieProject[] = [];
  const seen = new Set<string>();
  for (const f of folders) {
    const proj = discoverProjects(f.uri.fsPath, null);
    if (!proj) {
      continue;
    }
    const key = path.normalize(proj.root).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      projects.push(proj);
    }
  }
  cachedProjects = projects;
  return projects;
}

/** 当前缓存的工程列表（discoverWorkspaceProjects 之后有效） */
export function getCachedProjects(): CangjieProject[] {
  return cachedProjects;
}

/**
 * 注册工作区文件夹变更监听：增删文件夹后重新发现工程并回调。
 * 返回 disposable。
 */
export function onProjectsChanged(cb: (projects: CangjieProject[]) => void): import('vscode').Disposable {
  const vscode = loadVscode();
  return vscode.workspace.onDidChangeWorkspaceFolders(() => {
    const projects = discoverWorkspaceProjects();
    cb(projects);
  });
}
