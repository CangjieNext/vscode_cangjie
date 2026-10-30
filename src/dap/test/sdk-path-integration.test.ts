/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as fs from 'fs';
import * as path from 'path';
import {setMockSetting, Uri, workspace} from '../src/__mocks__/vscode';
import {getSdkPath} from '../src/common-utils';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
}));

describe('DAP SDK path resolution', () => {
  const existsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

  beforeEach(() => {
    Uri.fsPath = path.join('root', 'project');
    workspace.workspaceFolders = [{uri: Uri}];
    setMockSetting('CangjieSdk', 'Option', 'CJNative');
    existsSync.mockReturnValue(true);
  });

  test('validates and returns the expanded configured path', () => {
    setMockSetting('CangjieSdkPath', 'CJNativeBackend', '${workspaceFolder}/../cangjie');
    const expected = path.normalize(`${Uri.fsPath}/../cangjie`);

    expect(getSdkPath()).toBe(expected);
    expect(existsSync).toHaveBeenCalledWith(expected);
  });

  test('keeps the existing invalid-path error after expansion', () => {
    setMockSetting('CangjieSdkPath', 'CJNativeBackend', '${workspace}/missing');
    existsSync.mockReturnValue(false);

    expect(() => getSdkPath()).toThrow(
      'The Cangjie SDK path has not been configured properly. Please configure it first.',
    );
  });

  test('keeps the existing invalid-path error without a workspace', () => {
    setMockSetting('CangjieSdkPath', 'CJNativeBackend', '${workspaceFolder}/sdk');
    workspace.workspaceFolders = [];
    existsSync.mockReturnValue(false);

    expect(() => getSdkPath()).toThrow(
      'The Cangjie SDK path has not been configured properly. Please configure it first.',
    );
  });
});
