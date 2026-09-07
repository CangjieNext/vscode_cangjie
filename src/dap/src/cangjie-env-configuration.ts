/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import type { CangjieBackendType } from './types';
import {checkIsValid} from './common-utils';
import { workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {expandWorkspacePlaceholders} from './sdk-path-utils';

export const envPathName = {
  CANGJIE_HOME: 'CANGJIE_HOME',
  PATH: 'PATH',
  LD_LIBRARY_PATH: 'LD_LIBRARY_PATH',
};

export const envConfConstants: Map<NodeJS.Platform, any> = new Map([
  ['win32', {
    cjcPath: '\\bin\\cjc.exe',
    cjPath: '',
    envShellFileName: 'envsetup.bat',
    separator: ';',
    pathSuf: '%PATH%',
    ldLibraryPathSuf: undefined,
    confEnvCommand: '',
    commandSeparator: '&',
    executableOptions: {
      executable: 'C:\\Windows\\System32\\cmd.exe',
      shellArgs: ['/c'],
    },
  }],
  ['linux', {
    cjcPath: '/bin/cjc',
    cjPath: '/bin/cj',
    envShellFileName: 'envsetup.sh',
    separator: ':',
    pathSuf: '$PATH',
    ldLibraryPathSuf: '${LD_LIBRARY_PATH}',
    confEnvCommand: 'source',
    commandSeparator: ';',
    executableOptions: {
      executable: '/bin/bash',
      shellArgs: ['-c'],
    },
  }],
  ['darwin', {
    cjcPath: '/bin/cjc',
    cjPath: '/bin/cj',
    envShellFileName: 'envsetup.sh',
    separator: ':',
    pathSuf: '$PATH',
    ldLibraryPathSuf: '${DYLD_LIBRARY_PATH}',
    confEnvCommand: 'source',
    commandSeparator: ';',
    executableOptions: {
      executable: '/bin/bash',
      shellArgs: ['-c'],
    },
  }],
]);

export const backendTypeConfig: Map<string, string> = new Map([
  ['CJNative', 'CJNativeBackend'],
  ['CJVM', 'CJVMBackend'],
]);

export const supportedPlatform: Array<string> = ['win32', 'linux', 'darwin'];

/**
 * env 属性配置场景：
 *  1、仓颉多包工程；
 *  2、仓颉与C语言互操作；
 *  3、依赖系统环境变量；
 */
export class CangjieEnvConfiguration {
  private sdkPath: string;

  private envPaths: object = {};

  private path: string = '';

  private ldLibraryPath: string = '';

  private _pythonPath: string = '';

  private backendType: CangjieBackendType;

  private platform: NodeJS.Platform = process.platform;

  private confConstants;

  private readonly _envSetupCommand: string;

  private readonly _executableOptions: { [key: string]: string };

  public constructor(backendType: CangjieBackendType) {
    this.backendType = backendType;
    this.confConstants = envConfConstants.get(this.platform);
    this.generateSdkPath();
    this._envSetupCommand = [`${this.confConstants['confEnvCommand']}`,
      `${path.join(this.sdkPath, this.confConstants['envShellFileName'])}`].filter(Boolean).join(' ');
    this._executableOptions = this.confConstants.executableOptions;
  }

  get pythonPath(): string {
    return this._pythonPath;
  }

  set pythonPath(value: string) {
    this._pythonPath = value;
  }

  get executableOptions(): { [p: string]: string } {
    return this._executableOptions;
  }

  get envSetupCommand(): string {
    return this._envSetupCommand;
  }

  get commandSeparator(): string {
    return this.confConstants['commandSeparator'];
  }

  getCjPath(): string {
    return `${this.sdkPath}${this.confConstants['cjPath']}`;
  }

  getCjcPath(): string {
    return `${this.sdkPath}${this.confConstants['cjcPath']}`;
  }

  getEnvConfig(): { [key: string]: string } {
    if (!supportedPlatform.includes(this.platform) || !backendTypeConfig.has(this.backendType)) {
      return undefined;
    }
    this.envPaths = {};
    this.handleEnvConfig();
    return this.buildEnvConfig();
  }

  private handleEnvConfig(): void {
    switch (this.platform) {
      case 'linux': {
        this.handleLdLibrary();
        break;
      }
      case 'win32': {
        this.handlePath();
        break;
      }
      default:
        // do nothing
        break;
    }
  }

  private handlePath(): void {
    if (checkIsValid(this.path)) {
      this.envPaths[envPathName.PATH] = this.path + this.confConstants['separator'] + this.confConstants['pathSuf'];
    }
  }

  private handleLdLibrary(): void {
    let libs = '';
    if (this.backendType === 'CJVM') {
      libs = `${this.sdkPath}/tools/lib`;
    } else if (this.backendType === 'CJNative') {
      libs = `${this.sdkPath}/third_party/llvm/lldb/lib`;
    } else {
      // do nothing
    }
    this.ldLibraryPath =
      checkIsValid(this.ldLibraryPath) ? libs + this.confConstants['separator'] + this.ldLibraryPath : libs;
    if (checkIsValid(this.ldLibraryPath)) {
      this.envPaths[envPathName.LD_LIBRARY_PATH] =
        this.ldLibraryPath + this.confConstants['separator'] + this.confConstants['ldLibraryPathSuf'];
    }
  }

  private buildEnvConfig(): { [key: string]: string } {
    let envConfs: { [key: string]: string } = {};
    if (this.envPaths[envPathName.PATH]) {
      envConfs[envPathName.PATH] = this.envPaths[envPathName.PATH];
    }
    if (this.envPaths[envPathName.LD_LIBRARY_PATH]) {
      envConfs[envPathName.LD_LIBRARY_PATH] = this.envPaths[envPathName.LD_LIBRARY_PATH];
    }
    if (this.platform === 'darwin') {
      envConfs['LLDB_DEBUGSERVER_EXTRA_ARG_1'] = '--unmask-signals';
    }
    return envConfs;
  }

  private generateSdkPath(): void {
    const backendTypeConfigName = backendTypeConfig.get(this.backendType);
    let sdkPath: string = <string>workspace.getConfiguration('CangjieSdkPath').get(backendTypeConfigName);
    sdkPath = expandWorkspacePlaceholders(sdkPath, workspace.workspaceFolders?.[0]?.uri.fsPath);
    if (!sdkPath || !fs.existsSync(sdkPath)) {
      throw Error('The Cangjie SDK path has not been configured properly. Please configure it first.');
    }
    this.sdkPath = sdkPath;
  }
}
