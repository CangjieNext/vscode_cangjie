/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

/**
 * project-discovery 纯函数核心单元测试（零依赖，node 直接运行）。
 *
 * 运行方式（在 src/lsp 目录下）：
 *   npx tsc src/utils/project-discovery.ts test/unit/project-discovery.test.ts \
 *     --outDir out-test --module commonjs --target es2022 --esModuleInterop
 *   node out-test/unit/project-discovery.test.js
 *
 * 覆盖：
 *  - parseWorkspaceMembers：单行/多行 members、无 workspace 段、注释、空白
 *  - discoverProjects：根级 cjpm.toml、lib/ 子目录工程、无 toml 返回 null
 *  - isInsideProject / routeProject：成员目录命中、嵌套工程最长前缀路由
 */
import * as path from 'path';
import {
  parseWorkspaceMembers,
  discoverProjects,
  isInsideProject,
  routeProject,
  CangjieProject,
  FsLike,
} from '../../src/utils/project-discovery';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(` FAIL ${name}`);
  }
}

// ---- 内存文件系统（测试注入） ----
function normKey(p: string): string {
  return path.normalize(p).replace(/\\/g, '/');
}
function memFs(raw: Record<string, string>): FsLike {
  // 键统一归一化为正斜杠，避免 Windows 反斜杠与查询键不一致
  const files: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    files[normKey(k)] = v;
  }
  return {
    existsSync: (p) => Object.prototype.hasOwnProperty.call(files, normKey(p)),
    readFileSync: (p) => files[normKey(p)],
  };
}

// ============ parseWorkspaceMembers ============
console.log('parseWorkspaceMembers:');
check(
  '单行 members',
  JSON.stringify(parseWorkspaceMembers('[workspace]\nmembers = ["pkg_a", "pkg_b"]')) ===
    JSON.stringify(['pkg_a', 'pkg_b']),
);
check(
  '多行 members（带尾逗号）',
  JSON.stringify(
    parseWorkspaceMembers('[workspace]\nmembers = [\n  "pkg_a",\n  "pkg_b",\n]\n'),
  ) === JSON.stringify(['pkg_a', 'pkg_b']),
);
check('无 workspace 段返回 null', parseWorkspaceMembers('[package]\nname = "demo"\n') === null);
check('workspace 段空 members', JSON.stringify(parseWorkspaceMembers('[workspace]\n')) === '[]');
check(
  '注释与空白行不干扰',
  JSON.stringify(
    parseWorkspaceMembers('# comment\n[workspace]\n# another\nmembers = ["x"]\n'),
  ) === JSON.stringify(['x']),
);
check(
  'workspace 之外的 members 键不误报',
  parseWorkspaceMembers('[target]\nmembers = ["nope"]\n') === null,
);

// ============ discoverProjects ============
console.log('discoverProjects:');
const root = path.normalize('/ws/projA');
const fsA = memFs({
  [path.join(root, 'cjpm.toml')]: '[package]\nname = "proj_a"\n',
});
const projA = discoverProjects(root, null, fsA);
check('根级 cjpm.toml 发现工程', projA !== null && projA.root === root);
check('根级工程 isWorkspace=false', projA !== null && projA.isWorkspace === false);
check('根级工程 memberDirs 仅含自身', projA !== null && projA.memberDirs.length === 1);

const libRoot = path.normalize('/ws/projB');
const fsB = memFs({
  [path.join(libRoot, 'lib', 'cjpm.toml')]: '[package]\nname = "proj_b"\n',
});
const projB = discoverProjects(libRoot, null, fsB);
check('lib/ 子目录工程发现', projB !== null && projB.root === path.join(libRoot, 'lib'));

const emptyRoot = path.normalize('/ws/empty');
check('无 cjpm.toml 返回 null', discoverProjects(emptyRoot, null, memFs({})) === null);

// workspace members 工程
const wsRoot = path.normalize('/ws/wsProj');
const fsWs = memFs({
  [path.join(wsRoot, 'cjpm.toml')]:
    '[workspace]\nmembers = ["pkg_1", "pkg_2"]\n[package]\nname = "ws"\n',
});
const projWs = discoverProjects(wsRoot, null, fsWs);
check('workspace 工程 isWorkspace=true', projWs !== null && projWs.isWorkspace === true);
check(
  'workspace 工程 memberDirs = root + members',
  projWs !== null &&
    projWs.memberDirs.length === 3 &&
    projWs.memberDirs.includes(path.join(wsRoot, 'pkg_1')) &&
    projWs.memberDirs.includes(path.join(wsRoot, 'pkg_2')),
);

// ============ isInsideProject ============
console.log('isInsideProject:');
check('源文件在工程内', isInsideProject(path.join(root, 'src', 'main', 'cangjie', 'main.cj'), projA!));
check('工程根目录自身命中', isInsideProject(root, projA!));
check('工程外文件不命中', isInsideProject('/other/main.cj', projA!) === false);
check(
  'workspace 成员目录内命中',
  isInsideProject(path.join(wsRoot, 'pkg_1', 'src', 'a.cj'), projWs!),
);

// ============ routeProject ============
console.log('routeProject:');
const nestedRoot = path.join(root, 'nested');
const fsNested = memFs({
  [path.join(nestedRoot, 'cjpm.toml')]: '[package]\nname = "nested"\n',
});
const projNested = discoverProjects(nestedRoot, null, fsNested)!;
check(
  '嵌套工程取最内层（最长前缀）',
  routeProject(path.join(nestedRoot, 'src', 'x.cj'), [projA, projNested]) === projNested,
);
check(
  '非嵌套文件路由到外层工程',
  routeProject(path.join(root, 'src', 'y.cj'), [projA, projNested]) === projA,
);
check('全部不命中返回 null', routeProject('/nowhere/z.cj', [projA, projNested]) === null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
