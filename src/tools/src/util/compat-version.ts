/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

/**
 * Helpers of the compiler compatibility mode ("compatibility target SDK version").
 * Keep this file free of `vscode` imports so that it can be used by the extension host and by
 * the webview script (config-set-by-ui.ts) as well.
 */

// Field stored in .vscode/cjpm_build_args.json, shared by the build command and the language service.
export const COMPAT_VERSION_FIELD = 'compatVersion';

// Option forwarded to cjpm build/run/test and, below it, to cjc.
export const COMPAT_VERSION_OPTION = '--compat-version';

// Key of the LSP initializationOptions entry read by the Cangjie language server.
export const COMPAT_VERSION_LSP_OPTION = 'compatVersionOption';

// Only two-segment versions (major.minor) are supported, e.g. "1.3".
const compatVersionPattern = /^\d+\.\d+$/;

export function isCompatVersionFormatValid(version: string): boolean {
  return typeof version === 'string' && compatVersionPattern.test(version.trim());
}

function collectInlineCompatVersions(line: string, versions: string[]): void {
  const inlinePattern = /<value>\s*=\s*(\d+\.\d+)/g;
  let match: RegExpExecArray | null = inlinePattern.exec(line);
  while (match !== null) {
    versions.push(match[1]);
    match = inlinePattern.exec(line);
  }
}

/**
 * Parse the supported compatibility target versions from the `cjc -h` output. The compiler lists
 * them right after the `--compat-version` option, one `<value>=major.minor` entry per line:
 *
 *   --compat-version <value>    Compile with compatibility behavior ... Candidate versions:
 *     <value>=1.3
 */
export function parseCompatVersionsFromCjcHelp(helpText: string): string[] {
  if (typeof helpText !== 'string' || helpText.trim() === '') {
    return [];
  }
  const versions: string[] = [];
  let inCompatSection = false;
  for (const line of helpText.split(/\r?\n/)) {
    if (!inCompatSection) {
      if (line.indexOf(COMPAT_VERSION_OPTION) !== -1) {
        inCompatSection = true;
        collectInlineCompatVersions(line, versions);
      }
      continue;
    }
    const entry = line.match(/^\s*<value>\s*=\s*(\d+\.\d+)\s*$/);
    if (entry !== null) {
      versions.push(entry[1]);
      continue;
    }
    if (line.trim() === '') {
      continue;
    }
    // The candidate list ends at the next option.
    break;
  }
  return versions.filter((version, index) => versions.indexOf(version) === index);
}
