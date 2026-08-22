/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import type {CancellationToken, DebugConfiguration, ProviderResult, WorkspaceFolder} from 'vscode';
import * as vscode from 'vscode';
import {debuggeePathPlaceholder} from './constants';
import type {CangjieDebugConfiguration} from './cangjie-debug-configuration';
import {debuggerAndStartTypeArr} from './cangjie-debug-configuration';
import {pickNativeProcess} from './attach-utils';
import type {BuildType} from './types';
import {
  addDataToVSCodeJsonFile,
  getVSCodeJsonFileDataArray,
  launchJsonType,
  tasksJsonType,
  updateFieldInLaunchJson,
  updatePlaceholderInLaunchJson
} from './json-utils';
import {CangjieDebugConfigAndPreTaskBuilder} from './cangjie-debug-config-pretask-builder';
import {
  checkConfigFieldLength,
  checkFieldNotBlank,
  checkIsValid,
  getBuildBinaryPath,
  getOs,
  getSdkOption,
  isBuildCommandAvailable,
  isCangjieProject, isEmpty,
  isExistingFile,
  modifyCommandOption,
  selectFileFromWorkspace,
  unifySlashOfPath
} from './common-utils';
import {DebugAndStartTypeItem} from './debug-and-start-type-item';
import {BuildTypeItem} from './build-type-item';
import {CangjieDependencyBuilder} from './config/cangjie-dependency-builder';

export class CangjieDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  public static async createDebugConfigurationAsync(folder: WorkspaceFolder, addToLaunchJson: boolean,
    autoStart: boolean): Promise<CangjieDebugConfiguration> {
    const isProject = isCangjieProject() && isBuildCommandAvailable();
    const builder = new CangjieDebugConfigAndPreTaskBuilder();
    if (isProject) {
      builder.workspaceFolder = folder;
      builder.debuggerType = 'cjdb';
      builder.startDebugType = 'launch';
      builder.buildType = 'cangjieProject';
      if (getSdkOption() === 'CJVM') {
        builder.cangjieBackendType = 'CJVM';
      }
    } else {
      const selectedDebuggerAndStartType = await vscode.window.showQuickPick(
        debuggerAndStartTypeArr.filter(t => t[2] !== 'debugMacro').map(i => new DebugAndStartTypeItem(i)));
      if (!selectedDebuggerAndStartType) {
        return null;
      }
      let buildTypes: BuildType[] = ['chooseFile'];
      const curFile = vscode.window.activeTextEditor?.document.fileName;
      if (selectedDebuggerAndStartType.typeTuple[1] === 'launch' && curFile !== null) {
        if (selectedDebuggerAndStartType.typeTuple[3] === 'CJVM') {
          buildTypes.unshift('singleFile(CJVM)');
        } else {
          buildTypes.unshift('singleFile');
        }
      }
      if (selectedDebuggerAndStartType.typeTuple[1] === 'attach') {
        buildTypes = ['chooseFile'];
      }
      let selectedBuildType: BuildType;
      if (buildTypes.length === 1) {
        [selectedBuildType] = buildTypes;
      } else {
        selectedBuildType = (await vscode.window.showQuickPick(buildTypes.map(t => new BuildTypeItem(t)))).buildType;
      }
      builder.workspaceFolder = folder;
      [builder.debuggerType, builder.startDebugType, builder.debugMacro, builder.cangjieBackendType] =
        selectedDebuggerAndStartType.typeTuple;
      builder.buildType = selectedBuildType;
      switch (selectedBuildType) {
        case 'singleFile':
        case 'singleFile(CJVM)':
          builder.sourceFilePath = curFile;
          break;
        default:
          break;
      }
    }
    const tasks = builder.buildPreTask();
    const config = builder.buildConfig();
    await addDataToVSCodeJsonFile(folder, tasksJsonType, tasks);
    if (addToLaunchJson) {
      await addDataToVSCodeJsonFile(folder, launchJsonType, [config]);
    }
    if (autoStart && builder.buildType !== 'chooseFile') {
      vscode.debug.startDebugging(folder, config);
    }
    return config;
  }

  private static async resolveDebugConfiguration(config: CangjieDebugConfiguration | undefined,
    folder: WorkspaceFolder | undefined): Promise<void> {
    this.configBaseCheck(config);
    if (config.request === 'attach') {
      await this.attachConfigCheck(config);
    } else {
      if (config.vmMode !== true && config.buildBeforeLaunch !== undefined) {
        await CangjieDebugConfigurationProvider.configEnvProperty(config, folder);
      }
      await this.launchConfigCheck(config, folder);
    }
  }

  private static configBaseCheck(config: CangjieDebugConfiguration): void {
    if (config.request !== 'launch' && config.request !== 'attach') {
      throw new Error('The value of request can be "launch" or "attach"');
    }
    checkConfigFieldLength(config.program, 'program');
    checkConfigFieldLength(config.processId, 'processId');
    checkConfigFieldLength(config.preLaunchTask, 'preLaunchTask');
    checkConfigFieldLength(config.remoteAddress, 'remoteAddress');
    checkConfigFieldLength(config.remotePlatform, 'remotePlatform');
    checkConfigFieldLength(config.remoteFilePath, 'remoteFilePath');
    checkConfigFieldLength(config.remoteCangjieSdkPath, 'remoteCangjieSdkPath');
    const { scriptCommands } = config;
    if (scriptCommands !== undefined && scriptCommands !== null) {
      for (let i = 0; i < scriptCommands.length; i++) {
        checkConfigFieldLength(scriptCommands[i], 'scriptCommands');
      }
    }
  }

  private static async attachConfigCheck(config: CangjieDebugConfiguration): Promise<void> {
    if (config.remote) {
      this.remoteConfigCheck(config);
    } else {
      const item = await pickNativeProcess();
      // server should support integer pid!!
      config.processId = item.pid.toString();
      // try set program path
      config.program = item.getProgramPath();
    }
  }

  private static remoteConfigCheck(config: CangjieDebugConfiguration): void {
    if (!checkFieldNotBlank(config.remoteAddress)) {
      throw new Error('remoteAddress not set');
    }
    config.remoteAddress = `connect://${config.remoteAddress}`;
    if (!checkFieldNotBlank(config.remotePlatform)) {
      throw new Error('remotePlatform not set');
    }
  }

  private static async launchConfigCheck(config: CangjieDebugConfiguration, folder: WorkspaceFolder): Promise<void> {
    if (config.remote) {
      this.remoteConfigCheck(config);
      if (!checkFieldNotBlank(config.remoteFilePath)) {
        throw new Error('remoteFilePath not set');
      }
      if (!checkFieldNotBlank(config.remoteCangjieSdkPath)) {
        throw new Error('remoteCangjieSdkPath not set');
      }
    }
    if (config.program === null || config.program === debuggeePathPlaceholder) {
      config.program = await selectFileFromWorkspace(folder);
      if (config.program && folder) {
        await updatePlaceholderInLaunchJson('program', debuggeePathPlaceholder, config.program,
          config, folder);
      } else {
        throw new Error('target program not set');
      }
      if (!config.preLaunchTask && !isExistingFile(config.program)) {
        throw new Error('target program file doesn\'t exist or permission denied');
      }
    } else {
      if (config.buildBeforeLaunch !== undefined) {
        const buildDir = await getBuildBinaryPath(config.vmMode);
        await updateFieldInLaunchJson('program', buildDir, config, folder,
          (src, dest) =>
            src.type === dest.type && src.name === dest.name && src.request === dest.request &&
            src.buildBeforeLaunch !== undefined && src.program !== buildDir);
        config.program = buildDir;
        if (config.buildBeforeLaunch && config.debugMacro !== undefined) {
          await modifyCommandOption(config.debugMacro);
        }
      }
    }
  }

  private static async configEnvProperty(config: CangjieDebugConfiguration, folder: WorkspaceFolder): Promise<void> {
    let property = '';
    let os = getOs();
    if (os === 'win') {
      property = 'Path';
    } else if (os === 'linux') {
      property = 'LD_LIBRARY_PATH';
    } else if (os === 'mac') {
      property = 'DYLD_LIBRARY_PATH';
    } else {
      // do nothing
    }
    let cdb = new CangjieDependencyBuilder();
    // 创建仓颉依赖构造器，builder方法内部解析toml文件，获取被调试程序依赖的动态库，并构造依赖路径字符串
    let oldEnv = checkIsValid(config.env) ? config.env : {};
    let envStr = await cdb.builder(oldEnv[property], true);
    if (envStr !== '') {
      config.env = {
        ...config.env,
        [property]: envStr
      };
    }
    // 如果env选项为空或者依赖项改变，更新launch.json中env配置项
    await updateFieldInLaunchJson('env', config.env, config, folder,
      (src, dest) => true);
  }

  private static createDebugConfiguration(folder: WorkspaceFolder | undefined, autoStart: boolean,
    addToLaunchJson: boolean)
    : ProviderResult<CangjieDebugConfiguration> {
    return CangjieDebugConfigurationProvider.createDebugConfigurationAsync(folder, addToLaunchJson, autoStart);
  }

  private static async provideDebugConfigurationsAsync(folder: WorkspaceFolder): Promise<CangjieDebugConfiguration[]> {
    const config = await CangjieDebugConfigurationProvider.createDebugConfiguration(folder, true, false);
    if (!config) {
      return [];
    }
    return [config];
  }

  private static async resolveDebugConfigurationAsync(configuration: DebugConfiguration,
    folder: WorkspaceFolder): Promise<CangjieDebugConfiguration> {
    let debugConfiguration: DebugConfiguration = configuration;
    if (!debugConfiguration || !debugConfiguration.type) {
      // fix empty 'configurations' array problem, https://github.com/microsoft/vscode/issues/127284
      if (!folder) {
        return null;
      }
      const existingConfigs = getVSCodeJsonFileDataArray(folder, launchJsonType);
      if (existingConfigs.length !== 0) {
        return null;
      }
      debugConfiguration = await CangjieDebugConfigurationProvider.createDebugConfiguration(folder, false, true);
    }
    const config = <CangjieDebugConfiguration>debugConfiguration;
    if (config.cwd !== null && config.cwd !== undefined) {
      config.cwd = unifySlashOfPath(config.cwd);
    }
    if (config.externalConsole === null) {
      config.externalConsole = false;
    }
    if (config.vmMode === true) {
      if (config.vmPort === undefined || config.vmPort === null) {
        config.vmPort = 3001;
      }
      if (config.remote !== true) {
        config.vmAddress = '127.0.0.1';
      }
    }
    await CangjieDebugConfigurationProvider.resolveDebugConfiguration(config, folder);
    //  when check debugger path?
    config.program = unifySlashOfPath(config.program);
    return config;
  }

  provideDebugConfigurations(folder: WorkspaceFolder | undefined,
    token?: CancellationToken): ProviderResult<DebugConfiguration[]> {
    return CangjieDebugConfigurationProvider.provideDebugConfigurationsAsync(folder);
  }

  resolveDebugConfiguration(folder: WorkspaceFolder | undefined, configuration: DebugConfiguration,
    token?: CancellationToken): ProviderResult<DebugConfiguration> {
    if (configuration.configPlatform !== undefined && configuration.configPlatform === "keels") {
      return configuration;
    }
    return CangjieDebugConfigurationProvider.resolveDebugConfigurationAsync(configuration, folder);
  }
}
