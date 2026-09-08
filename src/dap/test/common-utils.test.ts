/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as fs from 'fs';
import {workspace} from '../src/__mocks__/vscode';
import {getSdkPath} from '../src/common-utils';

jest.mock('vscode', () => jest.requireActual('../src/__mocks__/vscode'));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
}));

describe('getSdkPath', () => {
  const originalCangjieHome = process.env.CANGJIE_HOME;
  const existsSyncMock = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
  let configuredSdkPath: string;

  beforeEach(() => {
    configuredSdkPath = '';
    process.env.CANGJIE_HOME = '';
    existsSyncMock.mockReset();
    jest.spyOn(workspace, 'getConfiguration').mockImplementation((section: string) => ({
      get: (setting: string) => {
        if (section === 'CangjieSdk' && setting === 'Option') {
          return 'CJNative';
        }
        if (section === 'CangjieSdkPath' && setting === 'CJNativeBackend') {
          return configuredSdkPath;
        }
        return undefined;
      },
      inspect: jest.fn(),
      update: jest.fn(),
    } as any));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (originalCangjieHome === undefined) {
      delete process.env.CANGJIE_HOME;
    } else {
      process.env.CANGJIE_HOME = originalCangjieHome;
    }
  });

  test('uses the configured SDK path before CANGJIE_HOME', () => {
    configuredSdkPath = '/configured/sdk';
    process.env.CANGJIE_HOME = '/environment/sdk';
    existsSyncMock.mockImplementation((sdkPath) => sdkPath === configuredSdkPath);

    expect(getSdkPath()).toBe(configuredSdkPath);
    expect(existsSyncMock).toHaveBeenCalledWith(configuredSdkPath);
  });

  test('uses CANGJIE_HOME when the SDK path is not configured', () => {
    process.env.CANGJIE_HOME = '/environment/sdk';
    existsSyncMock.mockImplementation((sdkPath) => sdkPath === process.env.CANGJIE_HOME);

    expect(getSdkPath()).toBe(process.env.CANGJIE_HOME);
    expect(existsSyncMock).toHaveBeenCalledWith(process.env.CANGJIE_HOME);
  });

  test('does not mask an invalid configured path with CANGJIE_HOME', () => {
    configuredSdkPath = '/invalid/configured/sdk';
    process.env.CANGJIE_HOME = '/environment/sdk';
    existsSyncMock.mockImplementation((sdkPath) => sdkPath === process.env.CANGJIE_HOME);

    expect(() => getSdkPath()).toThrow('The Cangjie SDK path has not been configured properly.');
    expect(existsSyncMock).toHaveBeenCalledWith(configuredSdkPath);
  });

  test('throws when neither SDK path source is configured', () => {
    expect(() => getSdkPath()).toThrow('The Cangjie SDK path has not been configured properly.');
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  test('throws when CANGJIE_HOME does not exist', () => {
    process.env.CANGJIE_HOME = '/invalid/environment/sdk';
    existsSyncMock.mockReturnValue(false);

    expect(() => getSdkPath()).toThrow('The Cangjie SDK path has not been configured properly.');
    expect(existsSyncMock).toHaveBeenCalledWith(process.env.CANGJIE_HOME);
  });
});
