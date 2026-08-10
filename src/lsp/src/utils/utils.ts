/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { ConfigurationTarget, commands } from 'vscode';
import type { ExtensionContext, OutputChannel } from 'vscode';
import { window, workspace, Uri } from 'vscode';
import {
  moduleNameKeyInModuleJson,
  modulePathKeyInModuleJson,
  moduleGitKeyInModuleJson,
  testCangjieFile,
  builtinConditions,
  delay100,
  gitCommitIdKey,
  cjpmDefaultPath,
  MAX_CRASH_LOG_NUM,
  CJPM_TOML,
  CJPM_LOCK,
  PROJECT_VERSION,
  CJPM_CONFIG_TOML,
  REPOSITORY,
  ORG,
  DOUBLE_COLON,
  REPOSITORY_LOCAL,
  REPOSITORY_PATH,
  DEPENDENCIES,
  DEV_DEPENDENCIES,
  SCRIPT_DEPENDENCIES,
  IS_SCRIPT_DEPENDENCE,
  PACKAGE,
  WORKSPACE,
  PROFILE,
  CUSTOMIZED_OPTION,
  PACKAGE_REQUIRES,
  PACKAGE_OPTION,
  PATH_OPTION,
  NAME,
  LSP_PACKAGE_REQUIRES,
  REQUIRES,
  SCRIPTS,
  LSP_REQUIRES,
  LSP_JAVA_REQUIRES,
  LSP_PATH_OPTION,
  LSP_PACKAGE_OPTION,
  FFI,
  JAVA,
  C,
  TARGET,
  BIN_DEPENDENCIES,
  TARGET_DIR,
  MEMBERS,
  LSP_SRC_PATH,
  GENERAL_PATH,
  MULTI_PLATFORM_PATH,
  SRC_DIR,
  BUILD,
  COMBINED,
  DYNAMIC,
  FEATURES,
} from './constantNums';
import type { ChangjieContext, EnvInfo } from '../cangjie-context';
import type { ModuleJson, PackageRequires, Require, Toml } from './cjpm-config-data';
import * as os from 'os';
import * as childProcess from 'child_process';
import * as vscode from 'vscode';
import { CommonSpecificUtility } from './common-specific-utils';

interface InitializationData {
  multiModuleOption: unknown;
  conditionCompileOption: unknown;
  singleConditionCompileOption: unknown;
  conditionCompilePaths: string[];
  targetLib: string;
}

export class Utility {
  static serverRun: boolean = false;

  private static allInitializationOptions: InitializationData = {
    multiModuleOption: {} as unknown,
    conditionCompileOption: {} as unknown,
    singleConditionCompileOption: {} as unknown,
    conditionCompilePaths: [],
    targetLib: '',
  };

  private static requirePath: string = '';

  private static newRequirePath: string = '';

  private static multiModuleOption = {} as unknown;

  private static conditionCompileOption = {} as unknown;

  private static conditionPacakgeCompileOption = {} as unknown;

  private static rootModuleLockData = {} as unknown;

  private static conditionCompilePaths = [];

  private static baseTargetFeatures: string[] = [];

  private static targetLib: string = '';

  private static existed: string[] = [];

  private static isWorkspaceMode: boolean = false;

  private static projectType: string = 'origin';

  private static pathsToCheck = [
    '',
    GENERAL_PATH,
    MULTI_PLATFORM_PATH,
  ];

  private static centralRepoPath: string = '';

  private static centralRepoVersion = {} as unknown;

  // Single file mode support
  private static isSingleFileMode: boolean = false;

  private static singleFilePath: string = '';

  // Single file mode related methods
  static setSingleFileMode(filePath: string): void {
    Utility.isSingleFileMode = true;
    Utility.singleFilePath = filePath;
  }

  static getIsSingleFileMode(): boolean {
    return Utility.isSingleFileMode;
  }

  static getSingleFilePath(): string {
    return Utility.singleFilePath;
  }

  static clearSingleFileMode(): void {
    Utility.isSingleFileMode = false;
    Utility.singleFilePath = '';
  }

  static getSplit(): string {
    if (process.platform === 'win32') {
      return ';';
    }
    return ':';
  }

  static getWorkspaceFolders(): string {
    // Single file mode: return the directory of the single file
    if (!Utility.checkIsValid(workspace.workspaceFolders)) {
      // If single file mode is already set
      if (Utility.isSingleFileMode && Utility.singleFilePath) {
        return path.dirname(Utility.singleFilePath);
      }
      // Try to get from the current active editor
      const activeEditor = window.activeTextEditor;
      if (activeEditor?.document.fileName.endsWith('.cj')) {
        Utility.isSingleFileMode = true;
        Utility.singleFilePath = activeEditor.document.fileName;
        return path.dirname(activeEditor.document.fileName);
      }
      return undefined;
    }
    // Reset single file mode flag (when there is a workspace)
    Utility.isSingleFileMode = false;
    for (const pathSuffix of this.pathsToCheck) {
      const tomlPath = path.join(workspace.workspaceFolders[0].uri.fsPath, pathSuffix);
      if (fs.existsSync(path.join(tomlPath, CJPM_TOML))) {
        return tomlPath;
      }
    }
    return workspace.workspaceFolders[0].uri.fsPath;
  }

  static getWorkspaceRoot(): string {
    if (!Utility.checkIsValid(workspace.workspaceFolders) || workspace.workspaceFolders.length === 0) {
      return undefined;
    }
    return workspace.workspaceFolders[0].uri.fsPath;
  }

  static hasCjpmToml(projectPath: string = ''): boolean {
    let workspaceFolders = '';
    if (Utility.checkIsValid(projectPath)) {
      workspaceFolders = projectPath;
    } else {
      workspaceFolders = Utility.getWorkspaceFolders();
    }
    const tomlPath = path.join(workspaceFolders, CJPM_TOML);
    if (fs.existsSync(tomlPath)) {
      return true;
    }
    return false;
  }

  static getJsonContent(filePath: string): ModuleJson | '' | undefined {
    if (filePath !== CJPM_TOML) {
      return undefined;
    }
    const jsonPath = Utility.getWorkspaceFolders() + filePath;
    if (!fs.existsSync(jsonPath)) {
      return undefined;
    }
    const moduleJsonCon = fs.readFileSync(jsonPath, 'utf8');
    return moduleJsonCon === '' ? '' : JSON.parse(moduleJsonCon);
  }

  static async getLinuxNeedEnv(serverDir: string): Promise<unknown> {
    const envMap: Map<string, string> = await Utility.getScriptEnv();
    const cangjieHome = envMap.get('CANGJIE_HOME');
    const filesEnvPath = Utility.getIsSingleFileMode() ? '' : `:${await Utility.getFilesEnvPath()}`;

    return {
      LD_LIBRARY_PATH: `${envMap.get('LD_LIBRARY_PATH')}${filesEnvPath}`,
      ...(cangjieHome !== undefined && { CANGJIE_PATH: cangjieHome }),
      PATH: `${envMap.get('PATH')}:${serverDir}`,
    };
  }

  static async getWindowsNeedEnv(serverDir: string): Promise<unknown> {
    // Single file mode: skip DLL copy, just set SDK env vars
    if (Utility.getIsSingleFileMode()) {
      const envMap: Map<string, string> = await Utility.getScriptEnv();
      if (!envMap.has('CANGJIE_HOME')) {
        return { PATH: `${envMap.get('Path')};${serverDir}` };
      }
      return { PATH: `${envMap.get('Path')};${serverDir}`, CANGJIE_PATH: envMap.get('CANGJIE_HOME') };
    }

    const targetDir = await Utility.getTargetDir();
    let buildPath = path.join(targetDir, 'release');
    let aimFile = 'release';
    if (fs.existsSync(buildPath) === false) {
      buildPath = path.join(targetDir, 'debug');
      aimFile = 'debug';
    }
    let filesEnvPath = '';
    // delete old .dll File and copy new .dll file
    let lspBuildPath = path.join(this.getWorkspaceFolders(), '.cache', 'lsp');
    // makesure it's clean try 3 times
    let count = 0;
    const bak = Utility.getNonce();
    try {
      fs.renameSync(lspBuildPath, `${lspBuildPath}-${bak}`);
    } catch (e) {
      const a = 1;
    }
    while (fs.existsSync(`${lspBuildPath}-${bak}`)) {
      try {
        await fs.promises.rm(`${lspBuildPath}-${bak}`, { recursive: true, force: true });
      } catch (e) {
        break;
      }
      Utility.delay(delay100);
      count += 1;
      if (count === 3) {
        break;
      }
    }

    if (fs.existsSync(buildPath)) {
      let cmd = `xcopy  "${buildPath.toString()}"  "${lspBuildPath.toString()}" /E /I /H`;
      try {
        childProcess.execSync(cmd);
      } catch (e) {
        // ignore err
      }
    }
    // add requirelib path
    let orginPaths = this.requirePath.split(';');
    for (let orginPath of orginPaths) {
      if (orginPath === '') {
        continue;
      }
      orginPath = path.normalize(orginPath);
      const curBaseName = path.basename(orginPath);
      const aimPath = path.join(lspBuildPath.toString(), curBaseName);
      let cmd = `xcopy  "${orginPath}"  "${aimPath}" /E /I /H`;
      try {
        childProcess.execSync(cmd);
      } catch (e) {
        // ignore err
      }
      filesEnvPath = this.newRequirePath;
      // add sourse dll/so
      filesEnvPath = Utility.addPath(lspBuildPath, filesEnvPath);
      filesEnvPath = filesEnvPath.substring(0, filesEnvPath.length - 1);
    }
    const envMap: Map<string, string> = await Utility.getScriptEnv();
    if (envMap.get('CANGJIE_HOME') === undefined) {
      return { PATH: `${envMap.get('Path')};${serverDir};${filesEnvPath}` };
    }
    return { PATH: `${envMap.get('Path')};${serverDir};${filesEnvPath}`, CANGJIE_PATH: envMap.get('CANGJIE_HOME') };
  }

  static async getMacNeedEnv(serverDir: string): Promise<unknown> {
    const filesEnvPath = await Utility.getFilesEnvPath();
    const envMap: Map<string, string> = await Utility.getScriptEnv();
    if (envMap.get('CANGJIE_HOME') === undefined) {
      return { DYLD_FALLBACK_LIBRARY_PATH: `${envMap.get('DYLD_FALLBACK_LIBRARY_PATH')}:${filesEnvPath}`,
               DYLD_LIBRARY_PATH: `${envMap.get('DYLD_LIBRARY_PATH')}:${filesEnvPath}`,
               PATH: `${envMap.get('PATH')}:${serverDir}` };
    }
    return {
      DYLD_FALLBACK_LIBRARY_PATH: `${envMap.get('DYLD_FALLBACK_LIBRARY_PATH')}:${filesEnvPath}`,
      DYLD_LIBRARY_PATH: `${envMap.get('DYLD_LIBRARY_PATH')}:${filesEnvPath}`,
      CANGJIE_PATH: envMap.get('CANGJIE_HOME'),
      PATH: `${envMap.get('PATH')}:${serverDir}`,
    };
  }

  static async getScriptEnv(): Promise<Map<string, string>> {
    return new Promise((resolve, reject) => {
      const cangjieHome: string = Utility.getCangjieHome();
      if (!fs.existsSync(cangjieHome)) {
        resolve(Utility.convertEnvToMap(process.env));
        return;
      }
      let scriptPath: string = '';
      let envCmd = 'env';
      if (process.platform === 'win32') {
        // the "" is used to handle path with space
        scriptPath = `"${cangjieHome}"\\envsetup.bat`;
        envCmd = 'set';
      }
      if (process.platform === 'linux') {
        // the '' is used to handle path with space
        const envsetupPath: string = `'${cangjieHome}'/envsetup.sh`;
        scriptPath = `bash -c "source ${envsetupPath}`;
        envCmd = 'env"';
      }
      if (process.platform === 'darwin') {
        // the '' is used to handle path with space
        const envsetupPath: string = `'${cangjieHome}'/envsetup.sh`;
        // On macOS, env considers DYLD_LIBRARY_PATH unsafe and won't output it in stdout
        // So we need to use a different environment variable name to store the value
        scriptPath = `bash -c "source ${envsetupPath} && export TEMP_DYLD_FALLBACK_LIBRARY_PATH=\\$DYLD_FALLBACK_LIBRARY_PATH && export TEMP_DYLD_LIBRARY_PATH=\\$DYLD_LIBRARY_PATH`;
        envCmd = 'env"';
      }
      const command = `${scriptPath} && ${envCmd}`;
      childProcess.exec(command, (error, stdout, stderr) => {
        if (error) {
          resolve(Utility.convertEnvToMap(process.env));
          return;
        }
        const envMap = new Map<string, string>();
        stdout.split('\n').forEach(line => {
          Utility.convertStrLineToMap(line, envMap);
        });
        if (envMap.size === 0) {
          resolve(Utility.convertEnvToMap(process.env));
          return;
        }
        if (process.platform === 'darwin' && envMap.has('TEMP_DYLD_FALLBACK_LIBRARY_PATH')) {
          const dyldfbValue = envMap.get('TEMP_DYLD_FALLBACK_LIBRARY_PATH');
          if (dyldfbValue) {
            envMap.set('DYLD_FALLBACK_LIBRARY_PATH', dyldfbValue);
          }
        }
        if (process.platform === 'darwin' && envMap.has('TEMP_DYLD_LIBRARY_PATH')) {
          const dyldValue = envMap.get('TEMP_DYLD_LIBRARY_PATH');
          if (dyldValue) {
            envMap.set('DYLD_LIBRARY_PATH', dyldValue);
          }
        }
        resolve(envMap);
      });
    });
  }

  static convertStrLineToMap(line: string, envMap: Map<string, string>): void {
    const index = line.indexOf('=');
    if (index < 0) {
      return;
    }
    const key = line.substring(0, index).trim();
    const value = line.substring(index + 1).trim();
    if (key) {
      envMap.set(key, value);
    }
  }

  static convertEnvToMap(env: NodeJS.ProcessEnv): Map<string, string> {
    const map = new Map<string, string>();
    for (const key in env) {
      if (!Object.prototype.hasOwnProperty.call(env, key)) {
        continue;
      }
      const value = env[key];
      if (value !== undefined) {
        map.set(key, value);
      }
    }
    return map;
  }

  static getSdkVersion(): Promise<string> {
    return new Promise((reslove, reject) => {
      childProcess.exec(Utility.getExecCmd('cjc -v'), (error, stdout, stderr) => {
        if (Utility.checkIsValid(error) || Utility.checkIsValid(stderr)) {
          reslove('');
          return;
        }
        reslove(stdout.match(/\d+(\.\d+)*/)[0].toString());
      });
    });
  }

  static getExecCmd(baseExecCmd: string): string {
    const cangjieHome: string = Utility.getCangjieHome();
    let cmdResult: string = baseExecCmd;
    if (process.platform === 'win32') {
      // the "" is used to handle path with space
      const envsetupPath: string = `"${cangjieHome}"\\envsetup.bat`;
      cmdResult = `${envsetupPath}&&${baseExecCmd}`;
    }
    if (process.platform === 'linux' || process.platform === 'darwin') {
      // the '' is used to handle path with space
      const envsetupPath: string = `'${cangjieHome}'/envsetup.sh`;
      cmdResult = `bash -c "source ${envsetupPath}&&${baseExecCmd}"`;
    }
    return cmdResult;
  }

  static getSdkOption(): string {
    let sdkOption = <string>workspace.getConfiguration('CangjieSdk').get('Option');
    if (sdkOption === 'llvm') {
      sdkOption = 'CJNative';
    } else if (sdkOption === 'cjvm') {
      sdkOption = 'CJVM';
    } else {
      return sdkOption;
    }
    const allSettings = workspace.getConfiguration('CangjieSdk').inspect('Option');
    if (allSettings === undefined) {
      return sdkOption;
    }
    if (allSettings.globalValue !== undefined) {
      workspace.getConfiguration('CangjieSdk').update('Option', sdkOption, ConfigurationTarget.Global);
    }
    if (allSettings.workspaceValue !== undefined) {
      workspace.getConfiguration('CangjieSdk').update('Option', sdkOption, ConfigurationTarget.Workspace);
    }
    return sdkOption;
  }

  static getCangjieHome(): string {
    if (this.getSdkOption() === 'CJNative') {
      return <string>workspace.getConfiguration('CangjieSdkPath').get('CJNativeBackend');
    } else {
      return <string>workspace.getConfiguration('CangjieSdkPath').get('CJVMBackend');
    }
  }

  static getEnvPaths(): string[] {
    const cangjieHome = Utility.getCangjieHome();
    try {
      if (!fs.existsSync(cangjieHome)) {
        throw new Error('The Cangjie SDK path has not been configured properly. Please configure it first.');
      }
      let envContent = fs.readFileSync(`${cangjieHome}/envsetup.sh`, 'utf8');
      let cangjieHomeTarget = /\${script_dir}/g;
      let pathTarget = /\${CANGJIE_HOME}/g;
      let matchTarget = /export(?<id>.)*/g;
      if (process.platform === 'win32') {
        envContent = fs.readFileSync(`${cangjieHome}/envsetup.bat`, 'utf8');
        cangjieHomeTarget = /%~dp0/g;
        pathTarget = /%CANGJIE_HOME%/g;
        matchTarget = /set(?<id>.)*/g;
      }
      if (!Utility.checkIsValid(envContent)) {
        throw new Error('envsetup.sh is empty');
      }
      envContent = envContent.replace(cangjieHomeTarget, cangjieHome);
      if (process.platform === 'linux' || process.platform === 'darwin') {
        envContent = envContent.replace(pathTarget, cangjieHome);
      } else {
        envContent = envContent.replace(pathTarget, `${cangjieHome}\\`);
      }
      const envPaths = <string[]>envContent.match(matchTarget);
      return envPaths;
    } catch (error: any) {
      if (Utility.checkIsValid(error) && 'message' in error) {
        window.showErrorMessage(error.message);
      }
      return [];
    }
  }

  static getSingleFileInitializationOptions(): Record<string, unknown> | '' {
    if (Utility.isSingleFileMode || (window.activeTextEditor?.document.fileName.endsWith('.cj'))) {
      const activeEditor = window.activeTextEditor;
      if (activeEditor?.document.fileName.endsWith('.cj')) {
        if (!Utility.isSingleFileMode) {
          Utility.setSingleFileMode(activeEditor.document.fileName);
        }
        return {
          multiModuleOption: {},
          conditionCompileOption: {},
          singleConditionCompileOption: {},
          conditionCompilePaths: [],
          targetLib: '',
          singleFilePath: Utility.getSingleFilePath(),
        };
      }
    }
    return '';
  }

  static async getInitializationOptions(): Promise<unknown> {
    if (!Utility.checkIsValid(workspace.workspaceFolders)) {
      return this.getSingleFileInitializationOptions();
    }
    let cjProjectPath = Utility.getCjRootProjectPath();
    for (const pathSuffix of this.pathsToCheck) {
      const fullPath = path.join(cjProjectPath, pathSuffix, CJPM_TOML);
      if (fs.existsSync(fullPath)) {
        cjProjectPath = path.join(cjProjectPath, pathSuffix);
        if (pathSuffix === GENERAL_PATH) {
          this.projectType = 'general';
        } else if (pathSuffix === MULTI_PLATFORM_PATH) {
          this.projectType = 'multi-platform';
        }
        break;
      }
    }
    const buildArgsJson: JSON = Utility.getCjpmBuildArgsContent();
    if (Utility.checkIsValid(buildArgsJson) && Object.prototype.hasOwnProperty.call(buildArgsJson, FEATURES)) {
      const features = buildArgsJson[FEATURES];
      this.baseTargetFeatures = features.split(',').map(item => item.trim()).filter(item => item !== '');
    }
    await this.setCentralRepoPath();
    await this.getCjpmLockVersion(cjProjectPath);
    await this.getMultiModuleOption(cjProjectPath);
    await this.initTargetLib();
    this.getConditionCompileOption();
    return this.allInitializationOptions;
  }

  static getCjRootProjectPath(): string {
    let customPath = <string>workspace.getConfiguration('Cangjie.Root.Cjpm').get('Path');
    if (!Utility.checkIsValid(customPath)) {
      return workspace.workspaceFolders[0].uri.fsPath;
    }
    try {
      const stat = fs.statSync(customPath);
      if (!stat.isDirectory()) {
        customPath = path.dirname(customPath);
      }
    } catch (e) {
      return workspace.workspaceFolders[0].uri.fsPath;
    }
    if (!Utility.isSubPath(workspace.workspaceFolders[0].uri.fsPath, customPath)) {
      return workspace.workspaceFolders[0].uri.fsPath;
    }
    if (!Utility.checkIsValid(customPath)) {
      return workspace.workspaceFolders[0].uri.fsPath;
    }
    return customPath;
  }

  static async getMultiModuleOption(cjProjectPath: string): Promise<void> {
    let tomlPath = path.join(cjProjectPath, CJPM_TOML);
    const cjpmContent: unknown = await Utility.getTomlObj(tomlPath);
    if (Object.prototype.hasOwnProperty.call(cjpmContent, WORKSPACE) && Object.prototype.hasOwnProperty.call(cjpmContent, PACKAGE)) {
      window.showErrorMessage('Only one of workspace or package fields can exist at cjpm.toml.');
    }
    const workspaceConfig = cjpmContent[WORKSPACE];
    if (this.checkIsValid(workspaceConfig) && Object.prototype.hasOwnProperty.call(workspaceConfig, MEMBERS)) {
      // workspace mode
      // Set workspace mode features: hide run button and add monitoring for root toml file
      commands.executeCommand('setContext', 'cangjie.run.state', false);
      this.isWorkspaceMode = true;
      // Find common dependencies
      // dependencies
      let commonRequires = {};
      if (Object.prototype.hasOwnProperty.call(cjpmContent, DEPENDENCIES)) {
        commonRequires = await this.getRequires(cjpmContent[DEPENDENCIES], cjProjectPath, cjProjectPath);
      }
      // target.xxx.bin-dependencies
      let commonBinRequires: PackageRequires = {
        package_option: {} as JSON,
        path_option: [],
      };
      if (Object.prototype.hasOwnProperty.call(cjpmContent, TARGET)) {
        commonBinRequires = this.getTargetsPackageRequires(cjpmContent[TARGET], cjProjectPath);
      }

      // Parse members and add common dependencies to each member
      const members = this.getMembers(workspaceConfig, cjProjectPath);
      for (const member of members) {
        await Utility.findAllToml(member, '');
        const memberUri = Uri.file(member).toString();
        const curRequires = this.multiModuleOption[memberUri][REQUIRES];
        this.multiModuleOption[memberUri][REQUIRES] = Object.assign({}, curRequires, commonRequires);
        if (!Utility.checkIsValid(this.multiModuleOption[memberUri][LSP_PACKAGE_REQUIRES])) {
          this.multiModuleOption[memberUri][LSP_PACKAGE_REQUIRES] = {
            package_option: {} as JSON,
            path_option: [],
          };
        }
        if (!Array.isArray(this.multiModuleOption[memberUri][LSP_PACKAGE_REQUIRES][LSP_PATH_OPTION])) {
          this.multiModuleOption[memberUri][LSP_PACKAGE_REQUIRES][LSP_PATH_OPTION] = [];
        }
        this.multiModuleOption[memberUri][LSP_PACKAGE_REQUIRES][LSP_PACKAGE_OPTION] =
          Object.assign({}, this.multiModuleOption[memberUri][LSP_PACKAGE_REQUIRES][LSP_PACKAGE_OPTION], commonBinRequires.package_option);
        let curMemberPathOption: string[] = this.multiModuleOption[memberUri][LSP_PACKAGE_REQUIRES][LSP_PATH_OPTION];
        this.multiModuleOption[memberUri][LSP_PACKAGE_REQUIRES][LSP_PATH_OPTION] =
          Utility.mergeUniqueStrings(curMemberPathOption, commonBinRequires.path_option);
      }
    } else {
      // package mode
      await Utility.findAllToml(cjProjectPath, '');
    }

    this.allInitializationOptions.multiModuleOption = this.multiModuleOption;
  }

  static getConditionCompileOption(): void {
    this.allInitializationOptions.conditionCompileOption = this.conditionCompileOption;
    this.allInitializationOptions.singleConditionCompileOption = this.conditionPacakgeCompileOption;
    this.allInitializationOptions.conditionCompilePaths = this.conditionCompilePaths;
    this.allInitializationOptions.targetLib = this.targetLib;
  }

  static setConditionCompileOption(conditionKey: string, conditionValue: string): string {
    if (!this.regexName(conditionKey) || !this.regexName(conditionValue)) {
      return 'invalid';
    }
    if (this.checkBuiltinCondition(conditionKey)) {
      return 'builtin';
    }
    if (Object.prototype.hasOwnProperty.call(this.conditionCompileOption, conditionKey)) {
      return 'repeat';
    }
    this.conditionCompileOption[conditionKey] = conditionValue;
    return 'success';
  }

  static setPackageCompileOption(conditionKey: string, conditionValue: string, packageName: string): string {
    if (!Object.prototype.hasOwnProperty.call(this.conditionPacakgeCompileOption, packageName)) {
      this.conditionPacakgeCompileOption[packageName] = {};
    }
    if (!this.regexName(conditionKey) || !this.regexName(conditionValue)) {
      return 'invalid';
    }
    if (this.checkBuiltinCondition(conditionKey)) {
      return 'builtin';
    }
    if (
      Object.prototype.hasOwnProperty.call(this.conditionCompileOption, conditionKey) ||
      Object.prototype.hasOwnProperty.call(this.conditionPacakgeCompileOption[packageName], conditionKey)
    ) {
      return 'repeat';
    }
    this.conditionPacakgeCompileOption[packageName][conditionKey] = conditionValue;
    return 'success';
  }

  static getConditionCompileContent(conditionItem: string): string {
    const index = conditionItem.indexOf('--cfg=');
    if (index === -1) {
      return '';
    }
    const leftPos = conditionItem.indexOf('"');
    const rightPos = conditionItem.lastIndexOf('"');
    if (leftPos === -1 || rightPos === -1 || leftPos >= rightPos) {
      return '';
    }
    return conditionItem.substring(leftPos + 1, rightPos);
  }

  static getAllKeys(): string[] {
    let res: string[] = [];
    for (const key of Object.keys(this.multiModuleOption)) {
      res.push(key);
    }
    if (this.isWorkspaceMode) {
      res.push(Uri.file(this.getWorkspaceFolders()).toString());
    }
    return res;
  }

  /**
   * check package name, e.g., org::package, package
   */
  static regexDependency(name: string): boolean {
    let myRe = /(?<first>[A-Za-z_]\w*)(?:::(?<second>[A-Za-z_]\w*))?/;
    return myRe.test(name);
  }

  static regexName(name: string): boolean {
    let myRe = /^[A-Za-z_]\w*$/;
    return myRe.test(name);
  }

  static innerGetPackageRequires(packageRequires: unknown, workspacePath: string, option: string, item: number | string): void {
    let pathModule = Utility.getRealPath(packageRequires[option][item]);
    const normalizePath = path.normalize(pathModule);
    if (!path.isAbsolute(normalizePath)) {
      pathModule = path.join(workspacePath, normalizePath);
    }
    if (pathModule[pathModule.length - 1] === path.sep) {
      pathModule = pathModule.substring(0, pathModule.length - 1);
    }
    packageRequires[option][item] = Uri.file(pathModule).toString();
    if (pathModule.toString().length > 0) {
      const splitChar = Utility.getSplit();
      this.requirePath += `${pathModule.toString()}${splitChar}`;
    }
    if (process.platform === 'win32') {
      const lspBuildPath = path.join(this.getWorkspaceFolders(), '.cache', 'lsp');
      pathModule = path.join(lspBuildPath, path.basename(pathModule));
    }
    if (pathModule.toString().length > 0) {
      const splitChar = Utility.getSplit();
      this.newRequirePath += `${pathModule.toString()}${splitChar}`;
    }
    packageRequires[option][item] = Uri.file(pathModule).toString();
  }

  static innerGetPackageRequiresWithDir(packageRequires: unknown, workspacePath: string, option: string, item: number | string): void {
    if (Object.prototype.hasOwnProperty.call(packageRequires[option], item)) {
      let pathModule = Utility.getRealPath(packageRequires[option][item]);
      const normalizePath = path.normalize(pathModule);
      if (!path.isAbsolute(normalizePath)) {
        pathModule = path.join(workspacePath, normalizePath);
      }

      packageRequires[option][item] = Uri.file(pathModule).toString();
      if (pathModule.toString().length > 0) {
        const splitChar = Utility.getSplit();
        let dirPathName = path.dirname(pathModule);
        this.requirePath += `${dirPathName.toString()}${splitChar}`;
      }
      if (process.platform === 'win32') {
        const lspBuildPath = path.join(this.getWorkspaceFolders(), '.cache', 'lsp');
        const pkgDirName = path.basename(path.dirname(pathModule));
        pathModule = path.join(lspBuildPath, pkgDirName, path.basename(pathModule));
      }
      if (pathModule.toString().length > 0) {
        const splitChar = Utility.getSplit();
        this.newRequirePath += `${pathModule.toString()}${splitChar}`;
      }
      packageRequires[option][item] = Uri.file(pathModule).toString();
    }
  }

  static getPackageRequires(packageRequires: unknown, workspacePath: string): PackageRequires {
    // pacakge-requires.path-option
    if (Object.prototype.hasOwnProperty.call(packageRequires, PATH_OPTION)) {
      for (let i = 0; i < packageRequires[PATH_OPTION].length; i++) {
        this.innerGetPackageRequires(packageRequires, workspacePath, PATH_OPTION, i);
      }
    }
    // package-requires.package-option
    if (Object.prototype.hasOwnProperty.call(packageRequires, PACKAGE_OPTION)) {
      Object.keys(packageRequires[PACKAGE_OPTION]).forEach((requireItem) => {
        this.innerGetPackageRequiresWithDir(packageRequires, workspacePath, PACKAGE_OPTION, requireItem);
      });
    }
    if (!Utility.checkIsValid(packageRequires)) {
      return { package_option: {} as JSON, path_option: [] };
    }
    const lspPackageRequires: PackageRequires = {
      package_option: {} as JSON,
      path_option: [],
    };
    lspPackageRequires[LSP_PATH_OPTION] = packageRequires[PATH_OPTION];
    if (!Utility.checkIsValid(lspPackageRequires[LSP_PATH_OPTION]) || !Array.isArray(lspPackageRequires[LSP_PATH_OPTION])) {
      lspPackageRequires[LSP_PATH_OPTION] = [];
    }
    lspPackageRequires[LSP_PACKAGE_OPTION] = packageRequires[PACKAGE_OPTION];
    if (!Utility.checkIsValid(lspPackageRequires[LSP_PACKAGE_OPTION])) {
      lspPackageRequires[LSP_PACKAGE_OPTION] = {} as JSON;
    }
    return lspPackageRequires;
  }

  static getJavaModules(moduleJavaData: unknown): unknown {
    let res = moduleJavaData;
    if (!Utility.checkIsValid(moduleJavaData)) {
      return [];
    }
    res = Object.keys(moduleJavaData);
    return moduleJavaData;
  }

  static getCModuels(moduleCData: Map<string, unknown>, workspacePath: string): void {
    for (let cItem in moduleCData) {
      if (Object.prototype.hasOwnProperty.call(moduleCData[cItem], modulePathKeyInModuleJson)) {
        let modulePath = Utility.getRealPath(moduleCData[cItem][modulePathKeyInModuleJson]);
        modulePath = path.normalize(modulePath);
        if (!path.isAbsolute(modulePath)) {
          modulePath = path.join(workspacePath, modulePath);
        }
        if (modulePath[modulePath.length - 1] === path.sep) {
          modulePath = modulePath.substring(0, modulePath.length - 1);
        }
        if (modulePath.toString().length > 0) {
          const splitChar = Utility.getSplit();
          this.requirePath += `${modulePath.toString()}${splitChar}`;
          this.newRequirePath += `${modulePath.toString()}${splitChar}`;
        }
      }
    }
  }

  static async findAllToml(memberPath: string, expectedModuleName: string): Promise<void> {
    const workspacePathUri = Uri.file(memberPath).toString();
    if (this.existed.includes(workspacePathUri)) {
      return;
    }
    this.existed.push(workspacePathUri);
    const tomlPath = path.join(memberPath, CJPM_TOML);
    const curModuleData = {};
    if (!fs.existsSync(tomlPath)) {
      this.multiModuleOption[workspacePathUri] = curModuleData;
      return;
    }

    const cjpmContent = await Utility.getTomlObj(tomlPath);

    // package
    if (!Utility.checkIsValid(cjpmContent) || Object.keys(cjpmContent).length <= 0) {
      window.showWarningMessage(`The content of cjpm.toml is invalid in ${path.normalize(memberPath)}. Enter the correct content.`);
      this.multiModuleOption[workspacePathUri] = curModuleData;
      return;
    }
    // members can not contain workspace
    if (Object.keys(cjpmContent).includes(WORKSPACE)) {
      window.showWarningMessage(`The workspace field is not allowed in ${tomlPath}.`);
      this.multiModuleOption[workspacePathUri] = curModuleData;
      return;
    }

    const packageConfig = cjpmContent[PACKAGE];
    // module name
    if (Object.prototype.hasOwnProperty.call(packageConfig, NAME)) {
      const name = Utility.getModuleName(packageConfig);
      if (expectedModuleName !== '' && name !== expectedModuleName) {
        window.showWarningMessage(`The require module name ${expectedModuleName}
          ' is different to file module name ${name} in ${tomlPath}`);
      }
      curModuleData[moduleNameKeyInModuleJson] = name;
    } else {
      curModuleData[moduleNameKeyInModuleJson] = path.dirname(memberPath);
    }
    // get module src path
    Utility.getSrcPath(packageConfig, memberPath, curModuleData, cjpmContent);
    // find src_path
    if (this.projectType !== 'origin' && Object.prototype.hasOwnProperty.call(packageConfig, SRC_DIR)) {
      if (this.projectType === 'general') {
        curModuleData[LSP_SRC_PATH] = workspacePathUri;
      } else {
        curModuleData[LSP_SRC_PATH] = `${workspacePathUri}/src`;
      }
    }
    curModuleData[COMBINED] = this.getProfileBuildCombined(cjpmContent, curModuleData[moduleNameKeyInModuleJson]);
    // find dependencies
    await Utility.findDependencies(cjpmContent, curModuleData, memberPath, tomlPath);
    this.multiModuleOption[workspacePathUri] = curModuleData;
  }

  static async getPathByLockFile(workspacePath: string, moduleName: string): Promise<string> {
    let cjpmConfigPath = this.getCjpmConfigPath('git');
    const tomlLockPath = path.join(workspacePath, 'cjpm.lock');
    let moduleLockData = {} as any;
    if (fs.existsSync(tomlLockPath)) {
      moduleLockData = await vscode.commands.executeCommand('cangjie.toml.parser', tomlLockPath);
    }
    // Try [requires] first, then [scripts] for script-dependencies
    let lockSection = REQUIRES;
    if (!Object.prototype.hasOwnProperty.call(moduleLockData, REQUIRES) || !Object.prototype.hasOwnProperty.call(moduleLockData[REQUIRES], moduleName)) {
      if (Object.prototype.hasOwnProperty.call(moduleLockData, SCRIPTS) && Object.prototype.hasOwnProperty.call(moduleLockData[SCRIPTS], moduleName)) {
        lockSection = SCRIPTS;
      } else {
        moduleLockData = this.rootModuleLockData;
        if (Object.prototype.hasOwnProperty.call(moduleLockData, SCRIPTS) && Object.prototype.hasOwnProperty.call(moduleLockData[SCRIPTS], moduleName)) {
          lockSection = SCRIPTS;
        }
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(moduleLockData, lockSection) &&
      Object.prototype.hasOwnProperty.call(moduleLockData[lockSection], moduleName) &&
      this.checkIsValid(moduleLockData[lockSection][moduleName][gitCommitIdKey])
    ) {
      this.rootModuleLockData = moduleLockData;
      return path.join(cjpmConfigPath, moduleName, moduleLockData[lockSection][moduleName][gitCommitIdKey]);
    }
    window.showWarningMessage('The cjpm.lock file does not exist or is invalid. Please run cjpm update.');
    return '';
  }

  static getCjpmConfigPath(type: string): string {
    if (this.checkIsValid(process.env.CJPM_CONFIG)) {
      return path.join(process.env.CJPM_CONFIG, type);
    }
    if (os.platform() === 'win32') {
      return path.join(process.env.USERPROFILE, cjpmDefaultPath, type);
    } else {
      return path.join(process.env.HOME, cjpmDefaultPath, type);
    }
  }

  static clearMultiModuleOption(): void {
    this.existed = [];
    this.multiModuleOption = {};
    this.rootModuleLockData = {};
    this.allInitializationOptions = {
      multiModuleOption: {},
      conditionCompileOption: {},
      singleConditionCompileOption: {},
      conditionCompilePaths: [],
      targetLib: '',
    };
    this.requirePath = '';
  }

  static clearConditionOption(): void {
    this.conditionCompileOption = {};
    this.conditionPacakgeCompileOption = {};
    this.conditionCompilePaths = [];
    this.targetLib = '';
    this.baseTargetFeatures = [];
  }

  static checkBuiltinCondition(conditionKey: string): boolean {
    return builtinConditions.has(conditionKey);
  }

  static printWrongConditionMessage(errorType: string): void {
    switch (errorType) {
      case 'invalid':
        window.showWarningMessage('Condition string need a valid "name" (like [A-Za-z_]\w*)');
        break;
      case 'repeat':
        window.showWarningMessage('User defined condition"s key can not repeat');
        break;
      case 'builtin':
        window.showWarningMessage('User defined condition"s key can not be the same with builtin condition');
        break;
      default:
        break;
    }
  }

  static innerConditionBuild(tempConditionItem: string): void {
    let setResult: string = 'success';
    const tempArrayLength = 2;
    if (Utility.matchCounts(tempConditionItem, /=/g) !== Utility.matchCounts(tempConditionItem, /\\=/g)) {
      let tmpArray: string[] = tempConditionItem.split(/(?<!\\)=/);
      if (tmpArray.length === tempArrayLength) {
        setResult = Utility.setConditionCompileOption(tmpArray[0], tmpArray[1]);
        if (setResult !== 'success') {
          Utility.printWrongConditionMessage(setResult);
          return;
        }
      }
    } else {
      setResult = Utility.setConditionCompilePath(tempConditionItem);
      if (setResult !== 'success') {
        Utility.printWrongConditionPathMessage(setResult);
        return;
      }
    }
  }

  static async conditionBuild(context: ExtensionContext, cangjieContext: ChangjieContext, outputChannel: OutputChannel): Promise<void> {
    const cjpmContent: unknown = await vscode.commands.executeCommand('cangjie.toml.parser');
    Utility.clearConditionOption();
    let conditionOptions = [];
    if (Utility.checkIsValid(cjpmContent[PROFILE]) && Utility.checkIsValid(cjpmContent[PROFILE][CUSTOMIZED_OPTION])) {
      conditionOptions = Object.keys(cjpmContent[PROFILE][CUSTOMIZED_OPTION]);
    }
    if (conditionOptions.length === 0) {
      window.showWarningMessage('There is no related configuration for profile.customized-option in cjpm.toml, ' + 'please configure this parameter first');
      return;
    }
    // conditionItem : extends QuickPickItem, use for quick pick
    let conditionItem = [];
    if (conditionOptions.length > 0) {
      conditionOptions.forEach((cnd) => {
        conditionItem.push({
          label: cnd,
          target: { global: cjpmContent[PROFILE][CUSTOMIZED_OPTION][cnd] },
          description: cjpmContent[PROFILE][CUSTOMIZED_OPTION][cnd],
        });
      });
    }
    await Utility.delay(delay100);
    let option = await window.showQuickPick(conditionItem, {
      placeHolder: 'choose one or more customized-option params',
      canPickMany: true,
    });
    // choose nothing
    if (!Utility.checkIsValid(option)) {
      return;
    }
    // get condition key value
    let conditionArray: string[] = [];
    option.forEach((op) => {
      let conditionContent = Utility.getConditionCompileContent(op.description);
      if (conditionContent !== '') {
        conditionContent.split(',').forEach((element) => {
          conditionArray.push(element.trim());
        });
      }
    });

    for (let tempConditionItem of conditionArray) {
      this.innerConditionBuild(tempConditionItem);
    }
    Utility.clearMultiModuleOption();
    await cangjieContext.dispose();
    const initializationOptions = await Utility.getInitializationOptions();
    await cangjieContext.activate(context.globalStoragePath, outputChannel, context.workspaceState, context, initializationOptions);
  }

  static getRealPath(p: string): string {
    let resPath = p;
    if (!Utility.checkIsValid(resPath)) {
      return resPath;
    }
    resPath = resPath.replace(/\\/g, '/');
    const pattern = /\${(?<match>\w+)}/g;
    let matcher: RegExpExecArray;
    const workspaceConfiguration =
      vscode.workspace.getConfiguration(`terminal.integrated.env.${Utility.getOsSystem()}`);
    while ((matcher = pattern.exec(resPath)) !== null) {
      const match = matcher.groups?.match;
      if (!Utility.checkIsValid(match) || !Utility.checkIsValid(process.env[match])) {
        let config = workspaceConfiguration.get<string>(match);
        if (Utility.checkIsValid(config)) {
          resPath = resPath.replace(matcher[0], config).replace(/\\/g, '/');
        }
        continue;
      }
      resPath = resPath.replace(matcher[0], process.env[match]).replace(/\\/g, '/');
    }
    return resPath;
  }

  static async delay(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
    return;
  }

  static checkIsValid(val: unknown): boolean {
    if (val === null || val === undefined) {
      return false;
    }
    if (typeof val === 'string' && val.trim() === '') {
      return false;
    }
    if (typeof val === 'number' && val === 0) {
      return false;
    }
    if (typeof val === 'boolean') {
      return val;
    }
    return true;
  }

  static handleErrorFile(data: EnvInfo): void {
    // write env info
    const curTimestamp: number = Date.now();
    const logDirPath = path.join(__dirname, '..', '.log');
    if (!fs.existsSync(logDirPath)) {
      return;
    }
    try {
      fs.writeFileSync(path.join(logDirPath, `crash_env_${curTimestamp}.txt`), JSON.stringify(data, null, '\t'));
    } catch (error) {
      // ignore err
    }

    // move file
    const destDirPath = path.join(logDirPath, `crash_log_${curTimestamp}`);
    fs.mkdirSync(destDirPath);
    const files = fs.readdirSync(logDirPath);
    for (let file of files) {
      const filePath = path.join(logDirPath, file);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        continue;
      }

      const destPath = path.join(destDirPath, file);
      try {
        fs.renameSync(filePath, destPath);
      } catch (error) {
        // ignore err
      }
    }

    // delete files when count over MAX_CRASH_LOG_NUM
    const curFiles = fs.readdirSync(logDirPath);
    if (curFiles.length > MAX_CRASH_LOG_NUM) {
      let deleteNums = curFiles.length - MAX_CRASH_LOG_NUM;
      for (let file of curFiles) {
        if (deleteNums <= 0) {
          break;
        }
        const dirPath = path.join(logDirPath, file);
        const stat = fs.statSync(dirPath);
        if (!stat.isDirectory()) {
          continue;
        }
        try {
          deleteNums--;
          Utility.deleteDirFiles(dirPath);
          fs.rmdirSync(dirPath);
        } catch (err) {
          // ignore err
        }
      }
    }
  }

  static deleteDirFiles(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      return;
    }
    const files = fs.readdirSync(dirPath);
    for (let file of files) {
      const filePath = path.join(dirPath, file);
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        // ignore err
      }
    }
  }

  static addPath(nowDir: string, nowfilesEnvPath: string): string {
    let res = nowfilesEnvPath;
    if (!fs.existsSync(nowDir)) {
      return res;
    }
    const splitChar = Utility.getSplit();
    const dirs = fs.readdirSync(nowDir);
    for (let dir of dirs) {
      const stat = fs.statSync(path.join(nowDir, dir));
      if (!stat.isDirectory() || dir === '.cached') {
        continue;
      }
      res += `${path.join(nowDir, dir)}${splitChar}`;
      res = Utility.addPath(path.join(nowDir, dir), res);
    }
    return res;
  }

  static matchCounts(str: string, matcher: any): number {
    return (str.match(matcher) ?? []).length;
  }

  static setConditionCompilePath(conditionPathParam: string): string {
    const conditionPath = conditionPathParam.replace(/\\=/g, '=');
    if (!fs.existsSync(conditionPath)) {
      return 'invalid';
    }
    if (this.conditionCompilePaths.includes(conditionPath)) {
      return 'repeat';
    }
    this.conditionCompilePaths.push(conditionPath);
    return 'success';
  }

  static printWrongConditionPathMessage(errorType: string): void {
    switch (errorType) {
      case 'invalid':
        window.showWarningMessage('Condition path does not exist');
        break;
      case 'repeat':
        window.showWarningMessage('User defined condition"s path can not repeat');
        break;
      default:
        break;
    }
  }

  static getNonce(): string {
    let nonce: string = '';
    const possible: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const securityCodeLength = 32;
    for (let i: number = 0; i < securityCodeLength; i++) {
      const randomBytes = crypto.randomBytes(4);
      const randomValue = randomBytes.readUInt32BE(0) / 0xffffffff;
      const random = Math.floor(randomValue * possible.length);
      nonce += possible.charAt(random);
    }
    return nonce;
  }

  static async getTargetDir(): Promise<string> {
    const workspacePathUri = this.getCjRootProjectPath();
    let tomlPath = path.join(workspacePathUri, CJPM_TOML);
    const cjpmContent = await Utility.getTomlObj(tomlPath);
    let defaultTargetDir = path.join(workspacePathUri, TARGET);
    if (!Utility.checkIsValid(cjpmContent) || Object.keys(cjpmContent).length <= 0) {
      return defaultTargetDir;
    }
    let isWorkSpace = false;
    if (Object.prototype.hasOwnProperty.call(cjpmContent, WORKSPACE)) {
      isWorkSpace = true;
    }
    if (isWorkSpace) {
      const ws = cjpmContent[WORKSPACE];
      if (!Object.prototype.hasOwnProperty.call(ws, TARGET_DIR)) {
        return defaultTargetDir;
      }
      const targetDir = ws[TARGET_DIR];
      if (!Utility.checkIsValid(targetDir)) {
        return defaultTargetDir;
      }
      return path.resolve(workspacePathUri, targetDir.replace(/\s+$/, ''));
    }
    if (!Object.prototype.hasOwnProperty.call(cjpmContent, PACKAGE)) {
      return defaultTargetDir;
    }
    const packageConfig = cjpmContent[PACKAGE];
    if (!Object.prototype.hasOwnProperty.call(packageConfig, TARGET_DIR)) {
      return defaultTargetDir;
    }
    const targetDir = packageConfig[TARGET_DIR];
    if (!Utility.checkIsValid(targetDir)) {
      return defaultTargetDir;
    }
    return path.resolve(workspacePathUri, targetDir.replace(/\s+$/, ''));
  }

  static async getFilesEnvPath(): Promise<string> {
    const targetDir = await Utility.getTargetDir();
    let buildPath = path.join(targetDir, 'release');
    if (fs.existsSync(buildPath) === false) {
      buildPath = path.join(targetDir, 'debug');
    }
    let filesEnvPath = '';
    if (fs.existsSync(buildPath)) {
      filesEnvPath = this.requirePath;
      filesEnvPath = Utility.addPath(buildPath, filesEnvPath);
      filesEnvPath = filesEnvPath.substring(0, filesEnvPath.length - 1);
    }
    return filesEnvPath;
  }

  static async initTargetLib(): Promise<void> {
    if (process.platform === 'linux' || process.platform === 'darwin') {
      const targetDir = await Utility.getTargetDir();
      let buildPath = path.join(targetDir, 'release');
      if (fs.existsSync(buildPath) === false) {
        buildPath = path.join(targetDir, 'debug');
      }
      this.targetLib = buildPath;
    } else {
      this.targetLib = path.join(this.getWorkspaceFolders(), '.cache', 'lsp');
    }
  }

  static isSubPath(parentPath: string, childPath: string): boolean {
    const parent = path.resolve(parentPath);
    const child = path.resolve(childPath);
    const platform = os.platform();
    const caseInsensitive = platform === 'win32' || platform === 'darwin';
    const normalizedParent = caseInsensitive ? parent.toLowerCase() : parent;
    const normalizedChild = caseInsensitive ? child.toLowerCase() : child;
    if (normalizedParent === normalizedChild) {
      return true;
    }
    const relative = path.relative(normalizedParent, normalizedChild);
    return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  /**
   * get the central repo path from cjpm-config.toml
   * @param ropoConfigPath cjpm-config.toml file path
   * @returns central repo path
   */
  static async getRepositoryLocal(ropoConfigPath: string): Promise<string> {
    let cjpmContent: unknown;
    let isTomlRegister = false;
    for (let i = 0; i < 3 && !isTomlRegister; i++) {
      try {
        cjpmContent = await vscode.commands.executeCommand('cangjie.toml.parser', ropoConfigPath);
        isTomlRegister = true;
      } catch (e) {
        await Utility.delay(delay100);
      }
    }
    let repoPath = path.join(os.homedir(), cjpmDefaultPath, 'repository', 'source');
    if (!Utility.checkIsValid(cjpmContent) || Object.keys(cjpmContent).length <= 0) {
      return repoPath;
    }
    if (Object.prototype.hasOwnProperty.call(cjpmContent, REPOSITORY) &&
        Object.prototype.hasOwnProperty.call(cjpmContent[REPOSITORY], REPOSITORY_LOCAL) &&
        Object.prototype.hasOwnProperty.call(cjpmContent[REPOSITORY][REPOSITORY_LOCAL], REPOSITORY_PATH)) {
      if (cjpmContent[REPOSITORY][REPOSITORY_LOCAL][REPOSITORY_PATH].length === 0) {
        return repoPath;
      }
      repoPath = cjpmContent[REPOSITORY][REPOSITORY_LOCAL][REPOSITORY_PATH];
      let normalizePath = path.normalize(repoPath);
      if (!path.isAbsolute(normalizePath)) {
        let tomlDir = path.dirname(ropoConfigPath);
        repoPath = path.dirname(path.join(tomlDir, normalizePath, testCangjieFile));
      }
      repoPath = path.join(repoPath, 'repository', 'source');
    }
    return repoPath;
  }

  /**
   * find the right cjpm-config.toml file
   * The priority is: cangjie project > user home > cangjie sdk
   * @returns cjpm-config.toml file path
   */
  static getRepoConfig(): string {
    let projectPath = path.join(Utility.getWorkspaceFolders(), CJPM_CONFIG_TOML);
    if (fs.existsSync(projectPath)) {
      return projectPath;
    }
    let homePath = path.join(os.homedir(), cjpmDefaultPath, CJPM_CONFIG_TOML);
    if (fs.existsSync(homePath)) {
      return homePath;
    }
    let sdkPath = path.join(Utility.getCangjieHome(), 'tools', 'config', CJPM_CONFIG_TOML);
    if (fs.existsSync(sdkPath)) {
      return sdkPath;
    }
    return '';
  }

  static async setCentralRepoPath(): Promise<void> {
    // default repo path
    let repoPath = path.join(os.homedir(), cjpmDefaultPath, 'repository', 'source');
    let ropoConfigPath = Utility.getRepoConfig();
    if (ropoConfigPath.length > 0 && fs.existsSync(ropoConfigPath)) {
      repoPath = await Utility.getRepositoryLocal(ropoConfigPath);
    }
    this.centralRepoPath = repoPath;
  }

  /**
   * get central project version from cjpm.lock
   * save version info in a map, key is project name with org
   * @param cjProjectPath cangjie project path
   */
  static async getCjpmLockVersion(cjProjectPath: string): Promise<void> {
    // cjpm.lock has specific version information
    let tomlPath = path.join(cjProjectPath, CJPM_LOCK);
    const cjpmContent: unknown = await Utility.getTomlObj(tomlPath);

    if (!Object.prototype.hasOwnProperty.call(cjpmContent, REQUIRES)) {
      return;
    }

    const requires = cjpmContent[REQUIRES];
    let versionMap = {};

    // get project name and version info
    for (const projectName in requires) {
      if (Object.prototype.hasOwnProperty.call(requires, projectName)) {
        const projectInfo = requires[projectName];
        if (projectInfo && Object.prototype.hasOwnProperty.call(projectInfo, PROJECT_VERSION)) {
          versionMap[projectName] = projectInfo.version;
        }
      }
    }

    this.centralRepoVersion = versionMap;
  }

  static mergeUniqueStrings(...arrays: string[][]): string[] {
    const merged = arrays.reduce((acc, arr) => acc.concat(arr), [] as string[]);
    return [...new Set(merged.filter((s): s is string => s !== undefined))];
  }

  static async isWorkSpace(pathModule: string): Promise<boolean> {
    const tomlPath = path.join(pathModule, CJPM_TOML);
    if (!fs.existsSync(tomlPath)) {
      return false;
    }
    const cjpmContent = await Utility.getTomlObj(tomlPath);
    if (!Utility.checkIsValid(cjpmContent)) {
      return false;
    }
    return Object.prototype.hasOwnProperty.call(cjpmContent, WORKSPACE);
  }

  static async getTomlObj(tomlPath: string): Promise<unknown> {
    let cjpmContent = {};
    if (!fs.existsSync(tomlPath)) {
      return cjpmContent;
    }
    let isTomlRegister = false;
    for (let i = 0; i < 3 && !isTomlRegister; i++) {
      try {
        cjpmContent = await vscode.commands.executeCommand('cangjie.toml.parser', tomlPath);
        isTomlRegister = true;
      } catch (e) {
        Utility.delay(delay100);
        cjpmContent = {};
      }
    }
    if (!Utility.checkIsValid(cjpmContent)) {
      return {};
    }
    return cjpmContent;
  }

  static async getTargetMemberPath(member: string, workspacePath: string): Promise<string> {
    if (!Utility.checkIsValid(member)) {
      return '';
    }
    const tomlPath = path.join(workspacePath, CJPM_TOML);
    if (!fs.existsSync(tomlPath)) {
      return '';
    }
    const cjpmContent = await Utility.getTomlObj(tomlPath);
    if (!Utility.checkIsValid(cjpmContent)) {
      return '';
    }
    const membersPath: string[] = Utility.getMembers(cjpmContent[WORKSPACE], workspacePath);
    for (const memberPath of membersPath) {
      const memberTomlPath = path.join(memberPath, CJPM_TOML);
      if (!fs.existsSync(memberTomlPath)) {
        continue;
      }
      const memberCjpmContent = await Utility.getTomlObj(memberTomlPath);
      if (!Utility.checkIsValid(memberCjpmContent) || !Object.prototype.hasOwnProperty.call(memberCjpmContent, PACKAGE)) {
        continue;
      }
      const packageConfig = memberCjpmContent[PACKAGE];
      // module name
      if (!Object.prototype.hasOwnProperty.call(packageConfig, NAME)) {
        continue;
      }
      const name = packageConfig[NAME];
      if (name === member) {
        return memberPath;
      }
    }
    return '';
  }

  /**
   * get project module name from cjpm.toml, if has name and organization,
   * the name is organization::name
   * @param packageConfig package config from cjpm.toml package
   * @returns project module name
   */
  static getModuleName(packageConfig: unknown): string {
    if (!Object.prototype.hasOwnProperty.call(packageConfig, NAME)) {
      return 'default';
    }
    let orgName = '';
    if (Object.prototype.hasOwnProperty.call(packageConfig, ORG) && packageConfig[ORG].length !== 0) {
      orgName = packageConfig[ORG] + DOUBLE_COLON;
    }
    let moduleName = orgName + packageConfig[NAME];
    return moduleName;
  }

  static getCjpmBuildArgsContent(): JSON {
    const workspaceRoot = Utility.getWorkspaceRoot();
    if (!workspaceRoot) {
      return {} as JSON;
    }
    const jsonPath = path.join(workspaceRoot, '.vscode', 'cjpm_build_args.json');
    if (!fs.existsSync(jsonPath)) {
      return {} as JSON;
    }
    const curCjpmBuildArgs = fs.readFileSync(jsonPath, 'utf8');
    return curCjpmBuildArgs === '' ? {} as JSON : JSON.parse(curCjpmBuildArgs);
  }

  static async removeAstData(): Promise<void> {
    const workspaceFolder = Utility.getWorkspaceFolders();
    const astCachePath = path.resolve(workspaceFolder, '.cache', 'astdata').normalize();
    if (!fs.existsSync(astCachePath)) {
      return;
    }
    const files = fs.readdirSync(astCachePath);
    if (files.length === 0) {
      return;
    }
    for (const file of files) {
      const filePath = path.join(astCachePath, file);
      try {
        await fs.promises.unlink(filePath);
      } catch (e) {
        continue;
      }
    }
  }

  static getOsSystem(): string {
    if (process.platform === 'linux') {
      return 'linux';
    } else if (process.platform === 'win32') {
      return 'windows';
    } else {
      return 'osx';
    }
  }

  static getAllInitializationOptions(): InitializationData {
    return this.allInitializationOptions;
  }

  private static getSrcPath(packageConfig: unknown, memberPath: string, curModuleData: Record<string, unknown>, cjpmContent: unknown): void {
    if (CommonSpecificUtility.isCrossPlatformModule(cjpmContent as JSON)) {
      commands.executeCommand('setContext', 'cangjie.run.state', false);
      CommonSpecificUtility.getSrcPath(memberPath, curModuleData, cjpmContent as JSON, this.baseTargetFeatures);
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(packageConfig, SRC_DIR)) {
      return;
    }
    let srcPath = packageConfig[SRC_DIR];
    if (!Utility.checkIsValid(srcPath)) {
      return;
    }
    const realPath = path.resolve(memberPath, srcPath).normalize();
    if (!Utility.isSubPath(memberPath, realPath)) {
      window.showWarningMessage('The src-dir path should be under the toml path.');
      return;
    }
    if (!fs.existsSync(realPath) || !fs.statSync(realPath).isDirectory()) {
      window.showWarningMessage(`The src-dir path '${realPath}' does not exist.`);
      return;
    }
    srcPath = Uri.file(realPath).toString();
    curModuleData[LSP_SRC_PATH] = srcPath;
  }

  private static getMembers(workspaceConfig: unknown, workspacePath: string): string[] {
    if (!Utility.checkIsValid(workspaceConfig)) {
      return [];
    }
    const members = workspaceConfig[MEMBERS];
    if (!Array.isArray(members)) {
      return [];
    }
    const memberPaths: string[] = [];
    const unExistPaths: string[] = [];
    for (const member of members) {
      let pathModule = Utility.getRealPath(member);
      let normalizePath = path.normalize(pathModule);
      const memberRealPath = path.isAbsolute(normalizePath) ? normalizePath : path.join(workspacePath, normalizePath);
      if (fs.existsSync(memberRealPath)) {
        memberPaths.push(memberRealPath);
      } else {
        unExistPaths.push(member);
      }
    }
    if (unExistPaths.length > 0) {
      window.showWarningMessage(`The paths '${unExistPaths.join("', '")}' configured in the members field cannot be found in the cjpm.toml file.`);
    }
    return memberPaths;
  }

  private static async findDependencies(cjpmContent: unknown, curModuleData: Record<string, unknown>, workspacePath: string, tomlPath: string): Promise<void> {
    // target.bin-dependencies
    if (Object.prototype.hasOwnProperty.call(cjpmContent, TARGET)) {
      if (!Utility.checkIsValid(curModuleData[LSP_PACKAGE_REQUIRES])) {
        curModuleData[LSP_PACKAGE_REQUIRES] = {
          package_option: {} as JSON,
          path_option: [],
        };
      }
      if (!Array.isArray(curModuleData[LSP_PACKAGE_REQUIRES][LSP_PATH_OPTION])) {
        curModuleData[LSP_PACKAGE_REQUIRES][LSP_PATH_OPTION] = [];
      }
      const curPkgRequires: PackageRequires = this.getTargetsPackageRequires(cjpmContent[TARGET], workspacePath);
      curModuleData[LSP_PACKAGE_REQUIRES][LSP_PACKAGE_OPTION] =
        Object.assign({}, curModuleData[LSP_PACKAGE_REQUIRES][LSP_PACKAGE_OPTION], curPkgRequires.package_option);
      let curPathOption: string[] = curModuleData[LSP_PACKAGE_REQUIRES][LSP_PATH_OPTION];
      curModuleData[LSP_PACKAGE_REQUIRES][LSP_PATH_OPTION] = Utility.mergeUniqueStrings(curPathOption, curPkgRequires.path_option);
    }
    // ffi
    // java_requires
    if (Object.prototype.hasOwnProperty.call(cjpmContent, FFI) && Object.prototype.hasOwnProperty.call(cjpmContent[FFI], JAVA)) {
      curModuleData[LSP_JAVA_REQUIRES] = this.getJavaModules(cjpmContent[FFI][JAVA]);
    }
    // c_requires
    if (Object.prototype.hasOwnProperty.call(cjpmContent, FFI) && Object.prototype.hasOwnProperty.call(cjpmContent[FFI], C)) {
      this.getCModuels(cjpmContent[FFI][C], workspacePath);
    }
    // dependencies
    if (Object.prototype.hasOwnProperty.call(cjpmContent, DEPENDENCIES)) {
      curModuleData[LSP_REQUIRES] = await Utility.getRequires(cjpmContent[DEPENDENCIES], tomlPath, workspacePath);
    } else {
      curModuleData[LSP_REQUIRES] = {};
    }
    // dev-dependencies
    if (Object.prototype.hasOwnProperty.call(cjpmContent, DEV_DEPENDENCIES)) {
      if (!Utility.checkIsValid(curModuleData[LSP_REQUIRES])) {
        curModuleData[LSP_REQUIRES] = {};
      }
      curModuleData[LSP_REQUIRES] = Object.assign(
        curModuleData[LSP_REQUIRES],
        await Utility.getRequires(cjpmContent[DEV_DEPENDENCIES], tomlPath, workspacePath),
      );
    }
    // script-dependencies
    if (Object.prototype.hasOwnProperty.call(cjpmContent, SCRIPT_DEPENDENCIES)) {
      if (!Utility.checkIsValid(curModuleData[LSP_REQUIRES])) {
        curModuleData[LSP_REQUIRES] = {};
      }
      const scriptRequires = await Utility.getRequires(cjpmContent[SCRIPT_DEPENDENCIES], tomlPath, workspacePath, true);
      curModuleData[LSP_REQUIRES] = Object.assign(curModuleData[LSP_REQUIRES], scriptRequires);
    }
    // target xxx dependencies
    if (Object.prototype.hasOwnProperty.call(cjpmContent, TARGET)) {
      if (!Utility.checkIsValid(curModuleData[LSP_REQUIRES])) {
        curModuleData[LSP_REQUIRES] = {};
      }
      curModuleData[LSP_REQUIRES] = Object.assign(curModuleData[LSP_REQUIRES], await Utility.getTargetsRequires(cjpmContent[TARGET], tomlPath, workspacePath));
    }
  }

  private static getTargetsPackageRequires(targets: unknown, workspacePath: string): PackageRequires {
    let pkgRequires: PackageRequires = {
      package_option: {} as JSON,
      path_option: [],
    };
    const targetsKey = Object.keys(targets);
    for (let targetItem of targetsKey) {
      if (Object.prototype.hasOwnProperty.call(targets[targetItem], BIN_DEPENDENCIES)) {
        const curPkgRequires = this.getPackageRequires(targets[targetItem][BIN_DEPENDENCIES], workspacePath);
        pkgRequires = {
          package_option: Object.assign({}, pkgRequires.package_option, curPkgRequires.package_option),
          path_option: Utility.mergeUniqueStrings(pkgRequires.path_option, curPkgRequires.path_option),
        };
      }
    }
    return pkgRequires;
  }

  private static async getTargetsRequires(targets: unknown, modulePath: string, workspacePath: string): Promise<unknown> {
    let requires = {};
    const targetsKey = Object.keys(targets);
    for (let targetItem of targetsKey) {
      if (Object.prototype.hasOwnProperty.call(targets[targetItem], DEPENDENCIES)) {
        const moduleRequires = await Utility.getRequires(targets[targetItem][DEPENDENCIES], modulePath, workspacePath);
        requires = Object.assign(requires, moduleRequires);
      }
      if (Object.prototype.hasOwnProperty.call(targets[targetItem], DEV_DEPENDENCIES)) {
        const moduleRequires = await Utility.getRequires(targets[targetItem][DEV_DEPENDENCIES], modulePath, workspacePath);
        requires = Object.assign(requires, moduleRequires);
      }
    }
    return requires;
  }

  /**
   * get central repo path from dependencies name
   * @returns org name and module name
   */
  private static getOrgName(depName: string): string[] {
    let names = depName.split(DOUBLE_COLON);
    if (names.length > 1) {
      return names;
    }
    return ['default', depName];
  }

  private static async getRequires(requiresData: Map<string, Require>, modulePath: string, workspacePath: string, isScriptDep = false): Promise<unknown> {
    for (let requireItem in requiresData) {
      if (!Object.prototype.hasOwnProperty.call(requiresData, requireItem)) {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(requiresData[requireItem], modulePathKeyInModuleJson)) {
        // local code path
        if (!this.regexDependency(requireItem)) {
          window.showWarningMessage(`Enter a valid 'requires' key ${requireItem} (like [A-Za-z_]\w*) in ${modulePath}`);
        }
        let pathModule = Utility.getRealPath(requiresData[requireItem][modulePathKeyInModuleJson]);
        let normalizePath = path.normalize(pathModule);
        if (!path.isAbsolute(normalizePath)) {
          pathModule = path.dirname(path.join(workspacePath, normalizePath, testCangjieFile));
        }
        const isWorkSpace = await Utility.isWorkSpace(pathModule);
        if (isWorkSpace) {
          pathModule = await Utility.getTargetMemberPath(requireItem, pathModule);
        }
        requiresData[requireItem][modulePathKeyInModuleJson] = Uri.file(pathModule).toString();
        if (isScriptDep) {
          requiresData[requireItem][IS_SCRIPT_DEPENDENCE] = true;
        }
        await Utility.findAllToml(path.join(pathModule), requireItem);
      } else if (Object.prototype.hasOwnProperty.call(requiresData[requireItem], moduleGitKeyInModuleJson)) {
        // git code
        if (!this.regexName(requireItem)) {
          window.showWarningMessage(`Enter a valid 'requires' key ${requireItem} (like [A-Za-z_]\w*) in ${modulePath}`);
        }
        let pathModule = await this.getPathByLockFile(workspacePath, requireItem);
        if (this.checkIsValid(pathModule)) {
          let normalizePath = path.normalize(pathModule);
          requiresData[requireItem] = isScriptDep
            ? { path: Uri.file(normalizePath).toString(), [IS_SCRIPT_DEPENDENCE]: true }
            : { path: Uri.file(normalizePath).toString() };
          await Utility.findAllToml(path.join(pathModule), requireItem);
        } else {
          requiresData[requireItem] = isScriptDep
            ? { path: '', [IS_SCRIPT_DEPENDENCE]: true }
            : { path: '' };
        }
      } else {
        let depName = String(requireItem);
        let repoVersion = requiresData[requireItem];
        repoVersion = this.getProjectVersion(requireItem, requiresData[requireItem]);
        if (repoVersion.length === 0) {
          continue;
        }
        let names = Utility.getOrgName(depName);
        let pathModule = path.join(this.centralRepoPath, names[0], `${names[1]}-${repoVersion}`);
        if (!fs.existsSync(pathModule) || this.checkIsValid(pathModule)) {
          let normalizePath = path.normalize(pathModule);
          requiresData[requireItem] = isScriptDep
            ? { path: Uri.file(normalizePath).toString(), [IS_SCRIPT_DEPENDENCE]: true }
            : { path: Uri.file(normalizePath).toString() };
        }
        await Utility.findAllToml(path.join(pathModule), requireItem);
      }
    }
    return requiresData;
  }

  /**
   * Get the specific version based on the project name.
   * If not found, check if `repoVersion` is an exact version; otherwise, return an empty string.
   *
   * @param project The project name.
   * @param repoVersion The currently set dependency version, which could be a version range.
   * @returns The specific version string, or an empty string if not determinable.
   */
  private static getProjectVersion(project: string, repoVersion: string): string {
    if (Object.prototype.hasOwnProperty.call(this.centralRepoVersion, project)) {
      return this.centralRepoVersion[project];
    }
    if (this.isExactVersion(repoVersion)) {
      return repoVersion;
    }
    return '';
  }

  /**
   * check if it's an exact version, not a range version
   * @param versionStr a version string
   * @returns if it's an exact version
   */
  private static isExactVersion(versionStr: string): boolean {
    const str = versionStr.trim();

    // Check if it contains interval symbols
    if (/[\[\]\(\)\,]/.test(str)) {
      return false;
    }

    return true;
  }

  private static getProfileBuildCombined(cjpmContent: unknown, moduleName: string): boolean {
    if (!Utility.checkIsValid(cjpmContent[PROFILE]) || !Utility.checkIsValid(cjpmContent[PROFILE][BUILD]) ||
      !Utility.checkIsValid(cjpmContent[PROFILE][BUILD][COMBINED])) {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(cjpmContent[PROFILE][BUILD][COMBINED], moduleName) &&
      cjpmContent[PROFILE][BUILD][COMBINED][moduleName] === DYNAMIC) {
      return true;
    }
    return false;
  }
}