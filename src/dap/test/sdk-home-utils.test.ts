/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as path from 'path';
import {workspace} from '../src/__mocks__/vscode';
import {Utility as ToolsUtility} from '../../tools/src/util/utils';
import {Utility as LspUtility} from '../../lsp/src/utils/utils';

jest.mock('vscode', () => jest.requireActual('../src/__mocks__/vscode'));

describe.each([
  ['tools CJNative', ToolsUtility, 'CJNative', false, 'executable'],
  ['tools CJVM', ToolsUtility, 'CJVM', false, 'executable'],
  ['tools native project', ToolsUtility, 'CJVM', true, 'executable'],
  ['tools CJVM project', ToolsUtility, 'CJNative', true, 'cbc'],
  ['tools CJVM library', ToolsUtility, 'CJNative', true, 'cbclib'],
  ['language service CJNative', LspUtility, 'CJNative', false, 'executable'],
  ['language service CJVM', LspUtility, 'CJVM', false, 'executable'],
] as const)('%s SDK home', (_name, utility, backend, isCreatedProject, outputType) => {
  let originalCangjieHome: string | undefined;
  let originalIsCreatedProject: boolean;
  let originalOutputType: string;
  let configuredSdkPath: string | undefined;

  beforeEach(() => {
    originalCangjieHome = process.env.CANGJIE_HOME;
    delete process.env.CANGJIE_HOME;
    originalIsCreatedProject = ToolsUtility.isCreatedProject;
    originalOutputType = ToolsUtility.outputType;
    ToolsUtility.isCreatedProject = isCreatedProject;
    ToolsUtility.outputType = outputType;
    configuredSdkPath = '';
    const sdkBackend = isCreatedProject ?
      (outputType === 'executable' ? 'CJNative' : 'CJVM') : backend;
    jest.spyOn(workspace, 'getConfiguration').mockImplementation((section: string) => ({
      get: (setting: string) => {
        if (section === 'CangjieSdk' && setting === 'Option') {
          return backend;
        }
        if (section === 'CangjieSdkPath') {
          return setting === `${sdkBackend}Backend` ? configuredSdkPath : '/other/backend/sdk';
        }
        return undefined;
      },
    } as any));
  });

  afterEach(() => {
    if (originalCangjieHome === undefined) {
      delete process.env.CANGJIE_HOME;
    } else {
      process.env.CANGJIE_HOME = originalCangjieHome;
    }
    ToolsUtility.isCreatedProject = originalIsCreatedProject;
    ToolsUtility.outputType = originalOutputType;
    jest.restoreAllMocks();
  });

  test.each(['', undefined])('returns an empty string for configuration %p with no environment variable', (configured) => {
    configuredSdkPath = configured;
    expect(utility.getCangjieHome()).toBe('');
    expect(path.join(utility.getCangjieHome(), 'tools', 'bin')).toBe(path.join('', 'tools', 'bin'));
  });

  test('returns an empty string when both sources are empty', () => {
    process.env.CANGJIE_HOME = '';
    expect(utility.getCangjieHome()).toBe('');
  });

  test('uses CANGJIE_HOME when the selected backend configuration is empty', () => {
    process.env.CANGJIE_HOME = '/environment/sdk';
    expect(utility.getCangjieHome()).toBe('/environment/sdk');
  });

  test('keeps explicit configuration authoritative', () => {
    configuredSdkPath = '/configured/sdk';
    process.env.CANGJIE_HOME = '/environment/sdk';
    expect(utility.getCangjieHome()).toBe('/configured/sdk');
  });
});
