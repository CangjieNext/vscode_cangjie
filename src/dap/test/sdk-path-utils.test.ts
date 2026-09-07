/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as path from 'path';
import * as fs from 'fs';
import {expandWorkspacePlaceholders as expandDap} from '../src/sdk-path-utils';
import {expandWorkspacePlaceholders as expandLsp} from '../../lsp/src/utils/sdk-path-utils';
import {expandWorkspacePlaceholders as expandTools} from '../../tools/src/util/sdk-path-utils';

type Resolver = (configuredPath: string, workspacePath?: string) => string;

describe.each<[string, Resolver]>([
  ['DAP', expandDap],
  ['LSP', expandLsp],
  ['tools', expandTools],
])('%s workspace placeholder resolver', (_name, expand) => {
  const workspacePath = path.join('root', 'workspace with spaces');

  test('expands the preferred workspaceFolder placeholder', () => {
    expect(expand('${workspaceFolder}/../cangjie', workspacePath))
      .toBe(path.normalize(`${workspacePath}/../cangjie`));
  });

  test('expands the workspace alias', () => {
    expect(expand('${workspace}/sdk', workspacePath))
      .toBe(path.normalize(`${workspacePath}/sdk`));
  });

  test('expands every occurrence', () => {
    expect(expand('${workspace}/${workspaceFolder}', workspacePath))
      .toBe(path.normalize(`${workspacePath}/${workspacePath}`));
  });

  test('does not change an absolute path without placeholders', () => {
    const configuredPath = path.join(path.parse(process.cwd()).root, 'opt', 'cangjie');
    expect(expand(configuredPath, workspacePath)).toBe(configuredPath);
  });

  test('does not expand when no workspace is open', () => {
    expect(expand('${workspaceFolder}/sdk')).toBe('${workspaceFolder}/sdk');
  });
});

test.each([
  'src/lsp/src/utils/utils.ts',
  'src/tools/src/util/utils.ts',
])('%s routes SDK settings through the resolver', sourcePath => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../..', sourcePath), 'utf8');
  expect(source).toContain('expandWorkspacePlaceholders');
  expect(source).toContain('workspace.workspaceFolders?.[0]?.uri.fsPath');
});
