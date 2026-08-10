/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {exec, execSync} from 'child_process';
import type {Uri, WorkspaceFolder} from 'vscode';
import {ConfigurationTarget, window, workspace} from 'vscode';
import {CJPM_TOML, cjpmBuildArgExtname, cjpmBuildArgs, CUSTOMIZED_OPTION, delay100, DEPENDENCIES, DEV_DEPENDENCIES, SCRIPT_DEPENDENCIES, envPathName, PACKAGE, PROFILE, SOURCE_SET, SRC, SRC_DIR} from './constant-num';
import {OutputHelper} from './output-helper';
import type {CjpmBuildArgs, ModuleJson} from './cjpm-config-data';
import type {CustomTomlTypes} from './toml/toml-types';
import {parse} from './toml/toml-export';
import { PickItemStruct } from '../buildProject/multi-step-select';

export class Utility {
  static isCreatedProject: boolean = false;

  static targetOs = 'local';

  static outputType: string = 'executable';

  static serverRun: boolean = false;

  static tomlRegister: boolean = false;

  static MAX_PATH_LENGTH: number = 260;

  static setTargetOs(): Promise<void> {
    return new Promise((reslove, reject) => {
      if (Utility.getSdkOption() === 'CJVM') {
        this.targetOs = 'cjvm';
        reslove();
        return;
      }
      exec(Utility.getExecCmd('cjc -v'), (error, stdout, stderr) => {
        if (Utility.checkIsValid(error) || Utility.checkIsValid(stderr)) {
          reslove();
          return;
        }
        this.targetOs = stdout.match(/Target:\s*(\S+)/)[1].toString();
        reslove();
      });
    });
  }

  static getDefaultWorkspaceFolder(): WorkspaceFolder | undefined {
    if (workspace.workspaceFolders === undefined) {
      return undefined;
    }
    if (workspace.workspaceFolders.length === 1) {
      return workspace.workspaceFolders[0];
    }
    if (Utility.checkIsValid(window.activeTextEditor)) {
      return workspace.getWorkspaceFolder(window.activeTextEditor.document.uri);
    }
    return undefined;
  }

  static hasCjpmToml(): boolean {
    const cjProjectPath = Utility.getCjRootProjectPath();
    const tomlPath = path.join(cjProjectPath, CJPM_TOML);
    if (fs.existsSync(tomlPath)) {
      return true;
    }
    return false;
  }

  static rightClickPath(currentEdit: Uri): string {
    let filePath: string;
    if (Utility.checkIsValid(currentEdit)) {
      filePath = currentEdit.fsPath;
    } else {
      filePath = window.activeTextEditor.document.fileName;
    }
    if (filePath === undefined) {
      return '';
    }
    return filePath;
  }

  static isExistSdk(type: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const pathSdk = Utility.getCangjieHome();
      if (Utility.checkIsValid(pathSdk)) {
        switch (type) {
          case 'cjpm': {
            const cjpmPath: string = path.join(pathSdk, ...['tools', 'bin', type]);
            // creating an environment and cjpm create command
            const cmd = Utility.getExecCmd('cjpm -v');
            exec(cmd, (error) => {
              if (Utility.checkIsValid(error)) {
                reject(error);
              }
              resolve(pathSdk);
            });
            break;
          }
          default:
            resolve(pathSdk);
            break;
        }
      } else {
        reject(new Error('error: Please download and configure the Cangjie SDK.\n'));
      }
    });
  }

  static async delay(ms: number): Promise<void> {
    await new Promise(resolve => {
      setTimeout(resolve, ms);
    });
    return;
  }

  static getBasePathAllFolders(basePath: string): string[] {
    return fs.readdirSync(basePath);
  }

  static getWorkspaceFolders(): string {
    if (!Utility.checkIsValid(workspace.workspaceFolders)) {
      OutputHelper.appendLine('no open work folder!');
      return undefined;
    }
    return workspace.workspaceFolders[0].uri.fsPath;
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
    if (this.isCreatedProject) {
      if (this.outputType === 'cbc' || this.outputType === 'cbclib') {
        return <string>workspace.getConfiguration('CangjieSdkPath').get('CJVMBackend');
      }
      return <string>workspace.getConfiguration('CangjieSdkPath').get('CJNativeBackend');
    }
    if (this.getSdkOption() === 'CJNative') {
      return <string>workspace.getConfiguration('CangjieSdkPath').get('CJNativeBackend');
    }
    return <string>workspace.getConfiguration('CangjieSdkPath').get('CJVMBackend');
  }

  static async configTerminalcjpmEnv(): Promise<void> {
    if (process.platform !== 'linux' && process.platform !== 'win32' && process.platform !== 'darwin') {
      return;
    }
    const cangjieHome = Utility.getCangjieHome();
    if (!fs.existsSync(cangjieHome)) {
      return;
    }
    // only set in cangjie project
    if (!Utility.isCangjieProject()) {
      return;
    }
    const envPaths = Utility.getenvPaths();
    let envPathArr = {};
    if (process.platform === 'linux' || process.platform === 'darwin') {
      Utility.configLinuxOrMacTerminalcjpmEnv(envPaths, envPathArr);
    } else {
      Utility.configWinTerminalcjpmEnv(envPaths, envPathArr);
    }
    await Utility.addCjPathConfig(cangjieHome, envPathArr);
  }

  static configLinuxOrMacTerminalcjpmEnv(envPaths: string[], envPathArr: any): void {
    envPaths.forEach((item) => {
      let tempPath = item.replace('export ', '').split('=');
      const [pathName, pathStr] = tempPath;
      if (!Utility.checkIsValid(envPathArr[pathName])) {
        envPathArr[pathName] = pathStr;
      } else {
        envPathArr[pathName] = `${envPathArr[pathName]}:${pathStr}`;
      }
    });
    if (process.platform === 'linux') {
      envPathArr[envPathName.LD_LIBRARY_PATH] = envPathArr[envPathName.LD_LIBRARY_PATH].replace(/:\${LD_LIBRARY_PATH}/g, '');
    } else if (process.platform === 'darwin') {
      if (envPathArr[envPathName.DYLD_FALLBACK_LIBRARY_PATH] !== undefined) {
        envPathArr[envPathName.DYLD_FALLBACK_LIBRARY_PATH] = envPathArr[envPathName.DYLD_FALLBACK_LIBRARY_PATH].replace(/:\${DYLD_FALLBACK_LIBRARY_PATH}/g, '');
      }
      if (envPathArr[envPathName.DYLD_LIBRARY_PATH] !== undefined) {
        envPathArr[envPathName.DYLD_LIBRARY_PATH] = envPathArr[envPathName.DYLD_LIBRARY_PATH].replace(/:\${DYLD_LIBRARY_PATH}/g, '');
      }
    }
  }

  static configWinTerminalcjpmEnv(envPaths: string[], envPathArr: any): void {
    envPaths.forEach((item) => {
      let tempPath = item.replace(/"/g, '')
        .replace('set ', '').split('=');
      const [pathName, pathStr] = tempPath;
      envPathArr[pathName] = pathStr;
    });
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
        // mac平台env认为DYLD_LIBRARY_PATH不安全，不会在stdout中输出该环境变量，需要使用其他名字的环境变量存值
        scriptPath = `bash -c "source ${envsetupPath} && export TEMP_DYLD_FALLBACK_LIBRARY_PATH=\\$DYLD_FALLBACK_LIBRARY_PATH && export TEMP_DYLD_LIBRARY_PATH=\\$DYLD_LIBRARY_PATH`;
        envCmd = 'env"';
      }
      const command = `${scriptPath} && ${envCmd}`;
      exec(command, (error, stdout, stderr) => {
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

  static getMacSdkRoot(): string {
    if (process.platform !== 'darwin') {
      return '';
    }
    let sdkRoot = '';
    try {
      sdkRoot = execSync('xcrun --sdk macosx --show-sdk-path', {windowsHide: true}).toString().replace(/\n/g, '');
    } catch (error) {
      // do nothing
    }
    return sdkRoot.trimEnd();
  }

  static async addCjPathConfig(cangjieHome: string, envPathArr: any): Promise<void> {
    const envMap: Map<string, string> = await Utility.getScriptEnv();
    let osSystem = Utility.getOsSystem();
    let envConfig = JSON.parse(JSON.stringify(workspace.getConfiguration('terminal.integrated.env').get(osSystem)));
    envConfig.CANGJIE_HOME = cangjieHome;
    if (process.platform === 'linux') {
      const home = process.env.HOME;
      envConfig.CANGJIE_PATH = `${cangjieHome}/bin:${cangjieHome}/tools/bin:${home}/.cjpm/bin`;
      envConfig.CANGJIE_LD_LIBRARY_PATH = `${envMap.get('LD_LIBRARY_PATH').replace(process.env.LD_LIBRARY_PATH, '')}:`;
      envConfig.JET_JRE_HOME = envPathArr[envPathName.JET_JRE_HOME];
      const cangjieLibraryPath = `\${config:terminal.integrated.env.${osSystem}.CANGJIE_LD_LIBRARY_PATH}`;
      if ('LD_LIBRARY_PATH' in envConfig) {
        if (envConfig.LD_LIBRARY_PATH.includes(cangjieLibraryPath) === false) {
          envConfig.LD_LIBRARY_PATH = `${cangjieLibraryPath}${path.delimiter}${envConfig.LD_LIBRARY_PATH}`;
        }
      } else {
        envConfig.LD_LIBRARY_PATH = `${cangjieLibraryPath}${path.delimiter}\${env:LD_LIBRARY_PATH}`;
      }
    } else if (process.platform === 'win32') {
      const userProfile = process.env.USERPROFILE;
      envConfig.CANGJIE_PATH = `${envPathArr.PATH}`.replace('%USERPROFILE%', userProfile)
        .replace('%PATH%;', '');
    } else if (process.platform === 'darwin') {
      const home = process.env.HOME;
      envConfig.CANGJIE_PATH = `${cangjieHome}/bin:${cangjieHome}/tools/bin:${home}/.cjpm/bin`;
      const rawValue = envMap.get('DYLD_FALLBACK_LIBRARY_PATH');
      envConfig.CANGJIE_DYLD_FALLBACK_LIBRARY_PATH = rawValue !== undefined
        ? `${rawValue.replace(process.env.DYLD_FALLBACK_LIBRARY_PATH ?? '', '')}:`
        : '';
      const cangjieDYLDFBLibraryPath = `\${config:terminal.integrated.env.${osSystem}.CANGJIE_DYLD_FALLBACK_LIBRARY_PATH}`;
      if ('DYLD_FALLBACK_LIBRARY_PATH' in envConfig) {
        if (envConfig.DYLD_FALLBACK_LIBRARY_PATH.includes(cangjieDYLDFBLibraryPath) === false) {
          envConfig.DYLD_FALLBACK_LIBRARY_PATH = `${cangjieDYLDFBLibraryPath}${path.delimiter}${envConfig.DYLD_FALLBACK_LIBRARY_PATH}`;
        }
      } else {
        envConfig.DYLD_FALLBACK_LIBRARY_PATH = `${cangjieDYLDFBLibraryPath}${path.delimiter}\${env:DYLD_FALLBACK_LIBRARY_PATH}`;
      }

      const rawValue2 = envMap.get('DYLD_LIBRARY_PATH');
      envConfig.CANGJIE_DYLD_LIBRARY_PATH = rawValue2 !== undefined
        ? `${rawValue2.replace(process.env.DYLD_LIBRARY_PATH ?? '', '')}:`
        : '';
      const cangjieDYLDLibraryPath = `\${config:terminal.integrated.env.${osSystem}.CANGJIE_DYLD_LIBRARY_PATH}`;
      if ('DYLD_LIBRARY_PATH' in envConfig) {
        if (envConfig.DYLD_LIBRARY_PATH.includes(cangjieDYLDLibraryPath) === false) {
          envConfig.DYLD_LIBRARY_PATH = `${cangjieDYLDLibraryPath}${path.delimiter}${envConfig.DYLD_LIBRARY_PATH}`;
        }
      } else {
        envConfig.DYLD_LIBRARY_PATH = `${cangjieDYLDLibraryPath}${path.delimiter}\${env:DYLD_LIBRARY_PATH}`;
      }
      envConfig.SDKROOT = Utility.getMacSdkRoot();
    } else {
      // do nothing
    }
    const cangjiePathName = `\${config:terminal.integrated.env.${osSystem}.CANGJIE_PATH}`;
    if ('PATH' in envConfig) {
      if (envConfig.PATH.includes(cangjiePathName) === false) {
        envConfig.PATH = `${cangjiePathName}${path.delimiter}${envConfig.PATH}`;
      }
    } else {
      envConfig.PATH = `${cangjiePathName}${path.delimiter}\${env:PATH}`;
    }
    workspace.getConfiguration('terminal.integrated.env').update(osSystem, envConfig);
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

  static gencjpmBuildArgsJSON(buildArg?: object): void {
    // only in cangjie Project
    if (!Utility.isCangjieProject() || !Utility.checkIsValid(Utility.getWorkspaceFolders())) {
      return;
    }
    const vsSettingPath = path.join(Utility.getWorkspaceFolders(), '.vscode');
    if (!fs.existsSync(vsSettingPath)) {
      fs.mkdirSync(vsSettingPath);
    }
    const buildArgs = Utility.checkIsValid(buildArg) ? buildArg : cjpmBuildArgs;
    const cjpmBuildArgsPath = path.join(Utility.getWorkspaceFolders(), '/.vscode/cjpm_build_args.json');
    if (fs.existsSync(cjpmBuildArgsPath) &&
      Object.keys(Utility.getCjpmBuildArgsContent(cjpmBuildArgExtname)).length === Object.keys(buildArgs).length) {
      return;
    }
    try {
      fs.writeFileSync(cjpmBuildArgsPath, JSON.stringify(buildArgs, null, '\t'));
    } catch (error) {
      OutputHelper.appendLine(error);
    }
  }

  static getModuleJsonContent(filePath: string): ModuleJson {
    if (filePath !== CJPM_TOML) {
      return {} as ModuleJson;
    }
    const tomlPath = path.join(Utility.getCjRootProjectPath(), filePath);
    if (!fs.existsSync(tomlPath)) {
      return {} as ModuleJson;
    }
    const tomlContent = fs.readFileSync(tomlPath, 'utf8');
    return tomlContent === '' ? {} as ModuleJson : JSON.parse(tomlContent);
  }

  static getCjpmBuildArgsContent(filePath: string): CjpmBuildArgs {
    if (filePath !== cjpmBuildArgExtname) {
      return undefined;
    }
    const jsonPath = path.join(Utility.getWorkspaceFolders(), filePath);
    if (!fs.existsSync(jsonPath)) {
      Utility.gencjpmBuildArgsJSON();
      return cjpmBuildArgs;
    }
    const curCjpmBuildArgs = fs.readFileSync(jsonPath, 'utf8');
    return curCjpmBuildArgs === '' ? '' : JSON.parse(curCjpmBuildArgs);
  }

  static getExportPath(): string {
    const envPaths = Utility.getenvPaths();
    let envPath = '';
    envPaths.forEach((envP) => {
      envPath += `${envP}&&`;
    });
    return envPath;
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

  static getenvPaths(): string[] {
    const cangjieHome = Utility.getCangjieHome();
    try {
      if (!fs.existsSync(cangjieHome)) {
        throw new Error('The Cangjie SDK path has not been configured properly. Please configure it first.');
      }
      let envPath = path.join(cangjieHome, 'envsetup.sh');
      let envContent = fs.readFileSync(envPath, 'utf8');
      let cangjieHomeTarget = /\${script_dir}/g;
      let pathTarget = /\${CANGJIE_HOME}/g;
      let matchTarget = /export(?<id>.)*/g;
      if (process.platform === 'win32') {
        envPath = path.join(cangjieHome, 'envsetup.bat');
        envContent = fs.readFileSync(envPath, 'utf8');
        cangjieHomeTarget = /%~dp0/g;
        pathTarget = /%CANGJIE_HOME%/g;
        matchTarget = /set(?<id>.)*/g;
      }
      if (!Utility.checkIsValid(envContent)) {
        throw new Error('envsetup.sh is empty');
      }
      envContent = envContent.replace(cangjieHomeTarget, `${cangjieHome}`);
      if (process.platform === 'linux' || process.platform === 'darwin') {
        envContent = envContent.replace(pathTarget, `${cangjieHome}`);
      } else {
        envContent = envContent.replace(pathTarget, `${cangjieHome}\\`);
      }
      const envPaths = envContent.match(matchTarget);
      return envPaths;
    } catch (e) {
      OutputHelper.appendLine(`[error]: ${e}`, true);
      return [];
    }
  }

  static isCangjieProject(): boolean {
    if (Utility.checkIsValid(workspace.workspaceFolders)) {
      const cjProjectPath = Utility.getCjRootProjectPath();
      const modulesJsonPath = path.join(cjProjectPath, CJPM_TOML);
      return fs.existsSync(modulesJsonPath);
    }
    return false;
  }

  static noCjpmConfig(): void {
    window.showErrorMessage('The project can not find cjpm.toml file. you can use cjpm init to create');
    return;
  }

  static checkIsValid(val: unknown): boolean {
    if (val === null || val === undefined) {
      return false;
    }
    if (typeof val === 'string' && val === '') {
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

  static checkMacroLib(): boolean {
    const cjProjectPath = Utility.getCjRootProjectPath();
    let buildPath = path.join(cjProjectPath, 'target', 'release');
    if (fs.existsSync(buildPath) === false) {
      buildPath = path.join(cjProjectPath, 'target', 'debug');
    }
    const tomlPath = path.join(cjProjectPath, 'cjpm.toml');
    if (!fs.existsSync(buildPath) || !fs.existsSync(tomlPath)) {
      return false;
    }
    const cjpmContent: CustomTomlTypes = Utility.getTomlContent();
    const folderName: string = Utility.getTomlValueByTreeKeys(['package', 'name'], cjpmContent) as string;
    const buildOutPath = path.join(buildPath, folderName);
    if (!fs.existsSync(buildOutPath)) {
      return false;
    }
    const files = fs.readdirSync(buildOutPath);
    for (let file of files) {
      if (file.endsWith('.so') || file.endsWith('.dll') || file.endsWith('.dylib')) {
        return true;
      }
      // adapt cjvm macro expend
      if (file.endsWith('.cbc')) {
        return true;
      }
    }
    return false;
  }

  static isValidSdk(): boolean {
    const cangjieHome = Utility.getCangjieHome();
    let sourceFile = path.resolve(cangjieHome, 'envsetup.sh');
    if (process.platform === 'win32') {
      sourceFile = path.resolve(cangjieHome, 'envsetup.bat');
    }
    if (fs.existsSync(sourceFile)) {
      return true;
    }
    return false;
  }

  static getTomlContent(filePath: string = ''): CustomTomlTypes {
    let tomlPath = '';
    if (Utility.checkIsValid(filePath)) {
      tomlPath = filePath;
    } else {
      tomlPath = path.join(Utility.getCjRootProjectPath(), CJPM_TOML);
    }
    let content = '';
    let tomlContent: CustomTomlTypes = {};
    if (fs.existsSync(tomlPath) === false) {
      return tomlContent;
    }
    content = fs.readFileSync(tomlPath).toString();
    try {
      tomlContent = parse(content);
    } catch (e) {
      tomlContent = {};
    }
    return tomlContent;
  }

  static getMergedTomlContentForWebview(): CustomTomlTypes {
    const rootContent = Utility.getTomlContent() as { [key: string]: unknown };
    const merged: { [key: string]: unknown } = { ...rootContent };
    const rootSourceSets = Array.isArray(rootContent[SOURCE_SET]) ? rootContent[SOURCE_SET] as unknown[] : [];
    const mergedSourceSets = [...rootSourceSets];
    const rootProjectPath = Utility.getCjRootProjectPath();
    const depCategories = [DEPENDENCIES, DEV_DEPENDENCIES, SCRIPT_DEPENDENCIES];
    for (const depType of depCategories) {
      const deps = rootContent[depType];
      if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
        continue;
      }
      const depMap = deps as Record<string, unknown>;
      for (const depName of Object.keys(depMap)) {
        const dep = depMap[depName];
        if (!dep || typeof dep !== 'object' || Array.isArray(dep)) {
          continue;
        }
        const depPath = (dep as { path?: unknown }).path;
        if (!depPath || typeof depPath !== 'string') {
          continue;
        }
        const depTomlPath = path.join(rootProjectPath, depPath, CJPM_TOML);
        if (!fs.existsSync(depTomlPath)) {
          continue;
        }
        const depContent = Utility.getTomlContent(depTomlPath) as { [key: string]: unknown };
        const depSourceSets = Array.isArray(depContent[SOURCE_SET]) ? depContent[SOURCE_SET] as unknown[] : [];
        mergedSourceSets.push(...depSourceSets);
      }
    }
    merged[SOURCE_SET] = mergedSourceSets;
    return merged as unknown as CustomTomlTypes;
  }

  static getTomlValueByTreeKeys(treeKeys: string[], tomlContentParam?: CustomTomlTypes, returnUndefined: boolean = true,
    filePath?: string): CustomTomlTypes {
    if (!Utility.checkIsValid(treeKeys)) {
      return returnUndefined === true ? undefined : {};
    }
    let tomlContent = tomlContentParam;
    if (!Utility.checkIsValid(tomlContent)) {
      tomlContent = Utility.getTomlContent(filePath);
    }
    return Utility.getValueByKeys(treeKeys, tomlContent, returnUndefined);
  }

  static getValueByKeys(keys: string[], obj: CustomTomlTypes, returnUndefined: boolean): CustomTomlTypes {
    if (!Utility.checkIsValid(obj)) {
      return returnUndefined === true ? undefined : {};
    }
    if (!Utility.checkIsValid(keys) || keys.length === 0) {
      return obj;
    }
    const key = keys.shift();
    if (Object.prototype.hasOwnProperty.call(obj, key) === false) {
      return returnUndefined === true ? undefined : {};
    }
    return Utility.getValueByKeys(keys, obj[key] as CustomTomlTypes, returnUndefined);
  }

  static translateMessage(content: string): string {
    const buffer = Buffer.from(content, 'binary');
    let message: string;
    if (Utility.isUTF8(buffer)) {
      message = buffer.toString('utf-8');
    } else {
      const arr = new Uint8Array(buffer);
      message = new TextDecoder('gb2312').decode(arr);
    }
    return message;
  }

  static isUTF8(buffer: Buffer): boolean {
    let i = 0;
    while (i < buffer.length) {
      if ((buffer[i] & 0x80) === 0) {
        // ASCII characters
        i++;
      } else if ((buffer[i] & 0xE0) === 0xC0) {
        // 2-byte UTF-8 characters
        if ((buffer[i + 1] & 0xC0) === 0x80) {
          i += 2;
        } else {
          return false;
        }
      } else if ((buffer[i] & 0xF0) === 0xE0) {
        // 3-byte UTF-8 characters
        if ((buffer[i + 1] & 0xC0) === 0x80 && (buffer[i + 2] & 0xC0) === 0x80) {
          i += 3;
        } else {
          return false;
        }
      } else {
        return false;
      }
    }
    return true;
  }

  static removeSdkAttributes(): void {
    if (os.platform() !== 'darwin') {
      return;
    }
    try {
      const cangjieHome = Utility.getCangjieHome();
      if (!fs.existsSync(cangjieHome)) {
        return;
      }
      let command = `xattr -dr com.apple.quarantine "${cangjieHome}"`;
      execSync(command);
    } catch (e) {
      // do nothing
    }
  }

  static async getCustomizedOptions(): Promise<string> {
    let tomlContent = Utility.getTomlContent();
    let profileObj = Utility.getTomlValueByTreeKeys([PROFILE], tomlContent, false);
    if (Object.prototype.hasOwnProperty.call(profileObj, CUSTOMIZED_OPTION) === false) {
      window.showWarningMessage(
        'The customized-option content of the cjpm.toml file is missing, please fill it out');
      return '';
    }
    let customizedOptionObj = Utility.getTomlValueByTreeKeys([CUSTOMIZED_OPTION], profileObj, false);
    let cndOpts = Object.keys(customizedOptionObj);
    let conditionItem = [];
    if (cndOpts.length === 0) {
      window.showWarningMessage(
        'There is no related configuration for customized-option in cjpm.toml, please configure this parameter first');
      return '';
    }
    for (let cnd of cndOpts) {
      conditionItem.push({label: cnd, target: cnd, description: customizedOptionObj[cnd]});
    }
    await Utility.delay(delay100);
    const option: PickItemStruct[] = await window.showQuickPick(conditionItem, {
      placeHolder: 'choose one or more customized-option params',
      canPickMany: true,
      ignoreFocusOut: true,
    });
    // choose nothing
    if (!Utility.checkIsValid(option)) {
      return '';
    }
    let choosedOpt = '';
    option.forEach((op) => {
      choosedOpt += `${op.label}, `;
    });
    return choosedOpt.replace(/(?<id>,\x20)$/, ' ').trim();
  }

  static checkPathLength(dirPath: string): boolean {
    let isValid = true;
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      if (fullPath.length >= this.MAX_PATH_LENGTH) {
        isValid = false;
        break;
      }
      const fileStats = fs.lstatSync(fullPath);
      if (fileStats.isDirectory()) {
        const subDirRes = this.checkPathLength(fullPath);
        if (!subDirRes) {
          isValid = false;
          break;
        }
      }
    }
    return isValid;
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

  static getSrcPath(tomlPath: string): string {
    let projectPath = Utility.getCjRootProjectPath();
    if (!fs.existsSync(tomlPath)) {
      return path.join(projectPath, SRC);
    }
    projectPath = path.dirname(tomlPath);
    const cjpmContent = Utility.getTomlContent(tomlPath);
    if (!Utility.checkIsValid(cjpmContent) || !Object.prototype.hasOwnProperty.call(cjpmContent, PACKAGE)) {
      return path.join(projectPath, SRC);
    }
    const packageConfig = cjpmContent[PACKAGE];
    if (!Utility.checkIsValid(packageConfig) || !Object.prototype.hasOwnProperty.call(packageConfig, SRC_DIR)) {
      return path.join(projectPath, SRC);
    }
    let srcPath = packageConfig[SRC_DIR];
    if (!Utility.checkIsValid(srcPath)) {
      return path.join(projectPath, SRC);
    }
    const realSrcPath = path.resolve(projectPath, srcPath).normalize();
    if (!Utility.isSubPath(projectPath, realSrcPath)) {
      return path.join(projectPath, SRC);
    }
    if (!fs.existsSync(realSrcPath) || !fs.statSync(realSrcPath).isDirectory()) {
      return path.join(projectPath, SRC);
    }
    return realSrcPath;
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
}