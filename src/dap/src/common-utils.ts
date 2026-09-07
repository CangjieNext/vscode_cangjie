/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as path from 'path';
import type {
  CustomExecution,
  Event,
  OpenDialogOptions,
  OutputChannel,
  ProcessExecution,
  ShellExecution,
  Task,
  Uri
} from 'vscode';
import * as vscode from 'vscode';
import {ConfigurationTarget, Disposable, workspace} from 'vscode';
import {
  cjpmIncrementalCompilationCommand,
  cjpmTomlName,
  dapServerNameBase,
  debugMacroCommandOption, delay100,
  executableFolder,
  extensionId,
  launcherNameBase,
  maxFieldLength,
  moduleJsonName,
  serverLogPathSubFolder
} from './constants';
import * as fs from 'fs';
import type {Arch, CangjieBackendType, DapRequestIdentity, OS} from './types';
import {CjpmFileType} from './types';
import * as os from 'os';
import * as net from 'net';
import * as childProcess from 'child_process';
import {randomBytes} from 'crypto';
import type {CangjieDebugConfiguration} from './cangjie-debug-configuration';
import {tomlParser, tomlStringify} from './command';
import { exec } from 'child_process';
import { CangjieDependencyBuilder } from './config/cangjie-dependency-builder';
import {expandWorkspacePlaceholders} from './sdk-path-utils';

let extensionPath: string;

let logger: OutputChannel;

let extensionUri: Uri;

export const packageJson: any = vscode.extensions.getExtension(extensionId)?.packageJSON;

export const envPathName = {
  CANGJIE_HOME: 'CANGJIE_HOME',
  PATH: 'PATH',
  LD_LIBRARY_PATH: 'LD_LIBRARY_PATH',
};

export function getOs(): OS {
  switch (os.platform()) {
    case 'win32':
      return 'win';
    case 'darwin':
      return 'mac';
    default:
      return 'linux';
  }
}

export class GlobalNlCharacter {
  private static nlMap = new Map([
    ['win', '\r\n'],
    ['linux', '\n'],
    ['mac', '\n'],
  ]);

  public static getNlCharacter(): string {
    const nlCharacter = GlobalNlCharacter.nlMap.get(getOs());
    return nlCharacter ? nlCharacter : '\n';
  }
}

/**
 * TO_DO differentiate 64? 32?
 */
export function getArch(): Arch {
  switch (os.arch()) {
    case 'arm':
    case 'arm64':
      return 'arm';
    case 'x32':
    case 'x64':
    case 'ia32':
      return 'x86';
    default:
      return 'x86';
  }
}

/**
 * TO_DO missing arm, mac
 */
export function getExecFileSuffix(): string {
  switch (getOs()) {
    case 'win':
      return '.exe';
    case 'linux':
      switch (getArch()) {
        case 'arm':
          return '-linux_aarch64';
        case 'x86':
          return '-linux_x64';
        default:
          return '';
      }
    case 'mac':
      switch (getArch()) {
        case 'arm':
          return '-macos_aarch64';
        case 'x86':
          return '-macos_x64';
        default:
          return '';
      }
    default:
      return '';
  }
}

export function getDapServerName(vmMode: boolean = false): string {
  if (vmMode === true) {
    return `${dapServerNameBase + getExecFileSuffix()}-cjvm`;
  }
  return dapServerNameBase + getExecFileSuffix();
}

export function getLauncherName(): string {
  return launcherNameBase + getExecFileSuffix();
}

export function getDapServerPath(vmMode: boolean = false): string {
  return path.join(extensionPath, executableFolder, getDapServerName(vmMode));
}

export function getLauncherPath(): string {
  return path.join(extensionPath, executableFolder, getLauncherName());
}

export function getServerLogPath(): string {
  return path.join(os.homedir(), serverLogPathSubFolder);
}

function getChildFilePath(children: fs.Dirent[], name: string, result: string[], folder: string): void {
  for (const child of children) {
    try {
      if (child.isFile() && path.basename(child.name) === name) {
        result.push(path.join(folder, child.name));
      }
    } catch (e) {
      // ignore io exception
    }
  }
}

function getWinFilePath(name: string): string[] {
  const pathEnvVar = process.env.Path;
  if (!pathEnvVar) {
    return [];
  }
  const folders = pathEnvVar.split(';');
  let result: string[] = [];
  for (const folder of folders) {
    let children: fs.Dirent[];
    try {
      children = fs.readdirSync(folder, {withFileTypes: true});
    } catch (e) {
      // ignore io exception
      continue;
    }
    if (!children) {
      continue;
    }
    getChildFilePath(children, name, result, folder);
  }
  return result;
}

export async function findPathInSystemEnv(name: string): Promise<string[]> {
  if (getOs() === 'win') {
    return getWinFilePath(name);
  }
  const whichResult = await execNativeCommand(`which ${name}`);
  if (whichResult && whichResult.length > 0) {
    return [trimSpacesAndLineBreaks(whichResult)];
  }
  return [];
}

function searchFolder(folder: string, result: string[]): void {
  let children: fs.Dirent[];
  try {
    children = fs.readdirSync(folder, {withFileTypes: true});
  } catch (e) {
    // ignore io exception
    return;
  }
  if (!children) {
    return;
  }
  for (const child of children) {
    let fullPath = path.join(folder, child.name);
    if (fs.statSync(fullPath).isDirectory()) {
      searchFolder(fullPath, result);
    } else if (fs.statSync(fullPath).isFile() && isCjSourceFile(child.name)) {
      result.push(fullPath);
    } else {
      // do nothing
    }
  }
}

export function searchCangjieSourceFile(folder: string): string[] {
  if (fs.statSync(folder).isFile() && isCjSourceFile(folder)) {
    return [folder];
  }
  let result: string[] = [];
  if (fs.statSync(folder).isDirectory()) {
    searchFolder(folder, result);
  }
  return result;
}

export function setExtensionPath(filePath: string): void {
  extensionPath = filePath;
}

export function setExtensionUri(uri: Uri): void {
  extensionUri = uri;
}

export function getOutputChannel(): OutputChannel {
  return logger;
}

export function setOutputChannel(channel: OutputChannel): void {
  logger = channel;
}

export function unifySlashOfPath(filePath: string): string {
  let resultPath: string = filePath;
  if (path.sep === '\\') {
    resultPath = resultPath.replace(/\\/g, '/');
  }
  return resultPath;
}

export async function selectFileFromWorkspace(workspaceFolder: vscode.WorkspaceFolder, suffixFilters: string[] = [])
  : Promise<string | undefined> {
  const select = await vscode.window.showQuickPick(['Open File Chooser', 'Cancel'],
    {placeHolder: 'Select Target Program File'});
  if (select === 'Cancel') {
    return undefined;
  }
  const options: OpenDialogOptions = {
    canSelectMany: false,
    canSelectFolders: false,
    canSelectFiles: true,
    defaultUri: workspaceFolder.uri,
  };
  if (suffixFilters.length > 0) {
    options.filters = {
      suffix: suffixFilters,
    };
  }
  const files = await vscode.window.showOpenDialog(options);
  if (!files || files.length === 0) {
    return undefined;
  }
  return files[0].fsPath;
}

export function onTaskEnded(execution: ProcessExecution | ShellExecution | CustomExecution, callback: () => void)
  : void {
  const disposable = vscode.tasks.onDidEndTask(e => {
    if (e.execution === execution) {
      callback();
      disposable.dispose();
    }
  });
}

export function onTaskProcessEnded(execution: ProcessExecution | ShellExecution | CustomExecution,
  callback: (endEvent: vscode.TaskProcessEndEvent) => void): void {
  const disposable = vscode.tasks.onDidEndTaskProcess(e => {
    if (e.execution === execution) {
      callback(e);
      disposable.dispose();
    }
  });
}

export function getIncrementalName(base: string, existingNames: string[]): string {
  const nums = existingNames.map(s => {
    if (s.startsWith(base)) {
      if (s === base) {
        return 0;
      }
      try {
        const numStr = s.substr(base.length + 1);
        return parseInt(numStr);
      } catch (e) {
        return null;
      }
    }
    return null;
  }).filter(num => num !== null);
  if (nums.length === 0) {
    return base;
  }
  const max = Math.max(...nums);
  return `${base} ${max + 1}`;
}

export function toPromise<T>(thenable: Thenable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    thenable.then(value => resolve(value), reason => reject(reason));
  });
}

export async function delay(ms: number): Promise<void> {
  await new Promise(resolve => {
    setTimeout(resolve, ms);
  });
  return;
}

export function isExistingFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  return fs.lstatSync(filePath).isFile();
}

export function sendRequest(identity: DapRequestIdentity, args?: any): Promise<any> {
  if (vscode.debug.activeDebugSession) {
    return toPromise(vscode.debug.activeDebugSession.customRequest(identity, args));
  }
  return Promise.reject(new Error(`error: try send ${identity} request when there is no active session`));
}

export async function executeProcessTaskSync(task: Task, cancelEvent?: Event<any>): Promise<number> {
  const execution = await vscode.tasks.executeTask(task);
  if (cancelEvent) {
    cancelEvent(_ => execution.terminate());
  }
  return new Promise((resolve) => {
    const disposable = vscode.tasks.onDidEndTaskProcess(e => {
      if (e.execution === execution) {
        disposable.dispose();
        resolve(e.exitCode);
      }
    });
  });
}

export function setExecPermission(execPath: string): void {
  fs.stat(execPath, (err, stats) => {
    if (err) {
      throw err;
    }
    let permissions = Array.from(stats.mode.toString(2));
    // -r-xr-x---
    const hasPermission = permissions[7] === '1' && permissions[9] === '1' && permissions[10] === '1' && permissions[12] === '1';
    if (hasPermission) {
      return;
    }
    fs.chmodSync(execPath, '550');
  });
}

export function createDisposable(func: () => any): Disposable {
  return Disposable.from({
    dispose: func,
  });
}

export async function executeScheduledTask(task: () => void, interval: number, count: number): Promise<void> {
  let times = 0;
  let doExecuteScheduledTask = true;
  while (doExecuteScheduledTask) {
    times++;
    task();
    if (times === count) {
      break;
    }
    await delay(interval);
  }
}

export function randomStr(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);
  const charactersLength = characters.length;
  const result = new Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = characters[bytes[i] % charactersLength];
  }
  return result.join('');
}

export function isCjSourceFile(file: string): boolean {
  return file.endsWith('.cj');
}

export function firstToUpperCase(s: string): string {
  if (s.length === 0) {
    return s;
  }
  return s.charAt(0).toUpperCase() + s.substring(1);
}

export function getNumberOfCores(): number {
  return os.cpus().length;
}

export function execNativeCommand(cmd: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    childProcess.exec(cmd, (error: any, stdout: string | PromiseLike<string>, stderr: string | any[]) => {
      if (error) {
        reject(error);
        return;
      }
      if (stderr && stderr.length > 0) {
        reject(stderr);
        return;
      }
      resolve(stdout);
    });
  });
}

export function execNativeProcess(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const cp = childProcess.spawn(cmd, args);
    cp.on('error', err => {
      reject(err);
    });
    cp.on('exit', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(code);
      }
    });
  });
}

export function trimSpacesAndLineBreaks(str: string): string {
  return str.replace(/^\s+|\s+$/g, '');
}

export function trimAllStartSpace(str: string): string {
  let result: string = str;
  while (result.charAt(0) === ' ') {
    result = result.substring(1);
  }
  return result;
}

export function standardDebugReplyMsg(msg: string): string {
  const strSpilit = msg.split(GlobalNlCharacter.getNlCharacter());
  let res: string = '';
  for (let str of strSpilit) {
    if (str.length === 0) {
      continue;
    }
    if (str.charAt(0) === '@' || str.charAt(0) === '~' || str.charAt(0) === '&') {
      str = str.substring(1);
      if (str.charAt(0) === '\"') {
        str = str.substring(1);
      }
      if (str.charAt(str.length - 1) === '\"') {
        str = str.substring(0, str.length - 1);
      }
      res = res + replaceEscapeCharacter(str);
    } else {
      res = `${res + str}\n`;
    }
  }
  return res;
}

export function replaceEscapeCharacter(str: string): string {
  let result: string = str;
  result = result.replace(/\\\\/g, '\\');
  result = result.replace(/\\n/g, '\n');
  result = result.replace(/\\t/g, '\t');
  result = result.replace(/\\o/g, '\o');
  result = result.replace(/\\r/g, '\r');
  result = result.replace(/\\v/g, '\v');
  result = result.replace(/\\b/g, '\b');
  result = result.replace(/\\f/g, '\f');
  result = result.replace(/\\"/g, '\"');
  result = result.replace(/\\'/g, '\'');
  return result;
}

export function changeToEscapeCharacter(str: string): string {
  let result: string = str;
  result = result.replace(/\\/g, '\\\\');
  result = result.replace(/\n/g, '\\n');
  result = result.replace(/\t/g, '\\t');
  result = result.replace(/\o/g, '\\o');
  result = result.replace(/\r/g, '\\r');
  result = result.replace(/\v/g, '\\v');
  result = result.replace(/[\b]/g, '\\b');
  result = result.replace(/\f/g, '\\f');
  result = result.replace(/\"/g, '\\"');
  result = result.replace(/\'/g, '\\\'');
  result = result.replace(/\0/g, '0000');
  return result;
}

export function getEndString(str: string, delimenter: string): string {
  const index = str.lastIndexOf(delimenter);
  return str.substring(index + 1);
}

export function getStartString(str: string, delimenter: string): string {
  const index = str.lastIndexOf(delimenter);
  if (index === -1) {
    return str;
  }
  return str.substring(0, index);
}

export function getDefaultBuildBinaryPath(vmMode: boolean): string {
  const currentWorkspacePath = workspace.workspaceFolders[0].uri.fsPath;
  let cjpmFileType = getCjpmFileType();
  if (cjpmFileType === CjpmFileType.TOML) {
    return path.join(currentWorkspacePath, 'target', 'debug', 'bin', `main${getExecSuffix(vmMode)}`);
  } else if (cjpmFileType === CjpmFileType.JSON) {
    return path.join(currentWorkspacePath, 'build', 'debug', 'bin', `main${getExecSuffix(vmMode)}`);
  }
  return '';
}

export function isCangjieProject(): boolean {
  if (workspace.workspaceFolders) {
    const cjProjectPath = workspace.workspaceFolders[0].uri.fsPath;
    const cjpmTomlPath = path.join(cjProjectPath, cjpmTomlName);
    if (fs.existsSync(cjpmTomlPath)) {
      return true;
    }
    const moduleJsonPath = path.join(cjProjectPath, moduleJsonName);
    return fs.existsSync(moduleJsonPath);
  }
  return false;
}

export function isBuildCommandAvailable(): boolean {
  vscode.commands.getCommands(true).then(result => {
    return result.indexOf(cjpmIncrementalCompilationCommand) !== -1;
  });
  return true;
}

export async function buildCangjieProject(): Promise<void> {
  let isExistingProcess = true;
  let count = 0;
  let processPath: string = await getBuildBinaryPath(false);
  while (isExistingProcess && count < 20) {
    try {
      let result = await checkProcessExistence(processPath);
      if (!result) {
        isExistingProcess = false;
      }
    } catch (e) {
      isExistingProcess = false;
    }
    count++;
    // Wait for the debugged program to exit before compiling
    await delay(delay100);
  }
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Window,
    title: '[Cangjie] Building...',
    cancellable: false,
  }, async (progress) => {
    progress.report({ increment: 0 });
    await vscode.workspace.saveAll(false);
    await vscode.commands.executeCommand(cjpmIncrementalCompilationCommand).then((result) => {
      if (!result) {
        throw new Error('Build failed!');
      }
    });
    vscode.window.setStatusBarMessage("$(check) Build succeeded", 3000);
    return new Promise<void>(resolve => {
      setTimeout(() => {
        resolve();
      }, delay100);
    });
  });
}

export async function findAPortNotInUse(startPort: number, endPort: number): Promise<number> {
  for (let port: number = startPort; port <= endPort; port++) {
    let res: any = await checkPortIfInUse(port).catch((err) => {
      return err.code === 'ECONNREFUSED';
    });
    if (res === true) {
      return port;
    }
  }
  throw new Error(`port range of ${startPort}-${endPort} is not available to start server`);
}

function checkPortIfInUse(port: number): Promise<void> {
  const host: string = '127.0.0.1';
  const timeout = 400;

  return new Promise<void>((resolve, reject) => {
    const socket: net.Socket = new net.Socket();
    socket.connect(port, host);

    socket.on('connect', () => {
      socket.destroy();
      resolve();
    });

    socket.on('error', (err: Error) => {
      socket.destroy();
      reject(err);
    });

    socket.setTimeout(timeout);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`Timeout (${timeout}ms) occurred waiting for ${host}:${port} to be available`));
    });
  });
}

export function getCangjieBackendType(): CangjieBackendType {
  let sdkOption = getSdkOption();
  if(sdkOption === 'CJNative') {
    return 'CJNative';
  } else if (sdkOption === 'CJVM') {
    return 'CJVM';
  }
  return undefined;
}

export function getSdkOption(): string {
  let sdkOption = <string>workspace.getConfiguration('CangjieSdk').get('Option');
  if (sdkOption === 'llvm') {
    sdkOption = 'CJNative';
  } else if (sdkOption === 'cjvm') {
    sdkOption = 'CJVM';
  } else {
    return sdkOption;
  }
  const allSettings = vscode.workspace.getConfiguration('CangjieSdk').inspect('Option');
  if (allSettings === undefined) {
    return sdkOption;
  }
  if (allSettings.globalValue !== undefined) {
    vscode.workspace.getConfiguration('CangjieSdk').update('Option', sdkOption, ConfigurationTarget.Global);
  }
  if (allSettings.workspaceValue !== undefined) {
    vscode.workspace.getConfiguration('CangjieSdk').update('Option', sdkOption, ConfigurationTarget.Workspace);
  }
  return sdkOption;
}

export function checkConfigFieldLength(field: string, fieldName: string): void {
  if (field !== undefined && field !== null && field.length > maxFieldLength) {
    throw new Error(`The length of ${fieldName} is not allowed to exceed ${maxFieldLength}`);
  }
}

export function isFieldLengthRight(field: string, fieldName: string): boolean {
  if (field !== undefined && field !== null && field.length > maxFieldLength) {
    vscode.window.showErrorMessage(`The length of ${fieldName} is not allowed to exceed ${maxFieldLength}.`);
    return false;
  }
  return true;
}

export function getModuleJsonPath(): string {
  if (workspace.workspaceFolders === undefined || workspace.workspaceFolders === null ||
    workspace.workspaceFolders.length === 0) {
    return undefined;
  }
  const cjProjectPath = workspace.workspaceFolders[0].uri.fsPath;
  const cjpmTomlPath = path.join(cjProjectPath, cjpmTomlName);
  if (!fs.existsSync(cjpmTomlPath)) {
    return undefined;
  }
  return cjpmTomlPath;
}

export function getCjpmFileType(): CjpmFileType {
  if (workspace.workspaceFolders) {
    const cjProjectPath = workspace.workspaceFolders[0].uri.fsPath;
    const cjpmTomlPath = path.join(cjProjectPath, cjpmTomlName);
    if (fs.existsSync(cjpmTomlPath)) {
      return CjpmFileType.TOML;
    }
    const moduleJsonPath = path.join(cjProjectPath, moduleJsonName);
    return fs.existsSync(moduleJsonPath) ? CjpmFileType.JSON : CjpmFileType.NON_CANGJIE;
  }
  return CjpmFileType.NON_CANGJIE;
}

export function getCjpmFilePath(): string {
  if (workspace.workspaceFolders === undefined || workspace.workspaceFolders === null ||
    workspace.workspaceFolders.length === 0) {
    return undefined;
  }
  let cjpmFileType = getCjpmFileType();
  const cjProjectPath = workspace.workspaceFolders[0].uri.fsPath;
  switch (cjpmFileType) {
    case CjpmFileType.TOML:
      return path.join(cjProjectPath, cjpmTomlName);
    case CjpmFileType.JSON:
      return path.join(cjProjectPath, moduleJsonName);
    default:
      return '';
  }
}

export async function getCjpmFileObject(filePath: string): Promise<any> {
  if (filePath === undefined) {
    return undefined;
  }
  const fileContent = fs.readFileSync(filePath, 'utf8');
  if (fileContent === '') {
    return undefined;
  }
  if (filePath.endsWith('toml')) {
    let cjpmFileObject = await vscode.commands.executeCommand(tomlParser);
    return cjpmFileObject;
  } else if (filePath.endsWith('json')) {
    return JSON.parse(fileContent);
  }
  return undefined;
}

export async function updateCjpmFile(cjpmFilePath: string, cjpmFileObject: any): Promise<void> {
  if (cjpmFilePath.endsWith('toml')) {
    let content: string = await vscode.commands.executeCommand(tomlStringify, cjpmFileObject);
    fs.writeFileSync(cjpmFilePath, content);
  } else if (cjpmFilePath.endsWith('json')) {
    fs.writeFileSync(cjpmFilePath, JSON.stringify(cjpmFileObject, null, '\t'));
  } else {
    // do nothing
  }
}

export async function getBuildDir(): Promise<string> {
  let cjpmFilePath = getCjpmFilePath();
  let cjpmFileObject = await getCjpmFileObject(cjpmFilePath);
  if (cjpmFileObject === undefined) {
    throw new Error('No cjpm configuration file!');
  }
  let buildDir = '';
  if (cjpmFilePath.endsWith('toml')) {
    buildDir = cjpmFileObject['package']['target-dir'];
  } else if (cjpmFilePath.endsWith('json')) {
    buildDir = cjpmFileObject['build_dir'];
  } else {
    // do nothing
  }
  if (buildDir !== undefined && buildDir !== null) {
    buildDir = trimSpacesAndLineBreaks(buildDir);
  }
  return buildDir;
}

export async function getBuildBinaryPath(vmMode: boolean): Promise<string> {
  const buildDir = await getBuildDir();
  if (buildDir === undefined || buildDir === null || buildDir === '') {
    return getDefaultBuildBinaryPath(vmMode);
  }
  return path.join(buildDir, 'debug', 'bin', `main${getExecSuffix(vmMode)}`);
}

export async function modifyCommandOption(debugMacro: boolean): Promise<void> {
  const cjpmFilePath = getCjpmFilePath();
  const cjpmFileObject = await getCjpmFileObject(cjpmFilePath);
  if (cjpmFileObject === undefined) {
    throw new Error('No cjpm configuration file!');
  }
  let commandOption;
  if (getCjpmFileType() === CjpmFileType.TOML) {
    commandOption = cjpmFileObject.package['compile-option'];
  } else {
    commandOption = cjpmFileObject.command_option;
  }
  if (commandOption === undefined) {
    if (getCjpmFileType() === CjpmFileType.TOML) {
      throw new Error('There is no compile-option field in cjpm.toml!');
    }
    throw new Error('There is no command_option field in module.json!');
  }
  const isIncludeDebugMacroOption = commandOption.includes(debugMacroCommandOption);
  let needUpdateCjpmFile = false;
  if (debugMacro && !isIncludeDebugMacroOption) {
    commandOption += ` ${debugMacroCommandOption}`;
    commandOption = commandOption.trim();
    needUpdateCjpmFile = true;
  } else if (!debugMacro && isIncludeDebugMacroOption) {
    commandOption = commandOption.replace(new RegExp(`\s*${debugMacroCommandOption}`, 'g'), '');
    commandOption = commandOption.trim();
    needUpdateCjpmFile = true;
  } else {
    // do nothing
  }
  if (needUpdateCjpmFile) {
    if (getCjpmFileType() === CjpmFileType.TOML) {
      cjpmFileObject.package['compile-option'] = commandOption;
    } else {
      cjpmFileObject.command_option = commandOption;
    }
    await updateCjpmFile(cjpmFilePath, cjpmFileObject);
  }
}

export function getExecSuffix(vmMode: boolean = false): string {
  if (vmMode === true) {
    return '.cbc';
  } else if (getOs() === 'win') {
    return '.exe';
  }
  return '';
}

export function checkFieldNotBlank(fieldValue: string): boolean {
  return checkFieldNotEmpty(fieldValue) && trimSpacesAndLineBreaks(fieldValue) !== '';
}

export function checkFieldNotEmpty(fieldValue: string): boolean {
  return !isEmpty(fieldValue);
}

export function isEmpty(arg: any): boolean {
  return arg === undefined || arg === null;
}

export function checkIsValid(val: unknown): boolean {
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

export async function getVmParams(config: CangjieDebugConfiguration): Promise<string[]> {
  let params: string[] = [];
  const isSingleFileDebug = config.preLaunchTask !== undefined && config.request === 'launch';
  if (isSingleFileDebug) {
    params.push(config.program);
    return params;
  }
  if (!checkIsValid(config.vmParam) || config.vmParam.length === 0) {
    let defaultCbcPath = `--cbc-path ${await getCbcPath()}`;
    let cdb = new CangjieDependencyBuilder(config.vmMode);
    let configs = await cdb.builder();
    if (configs !== '') {
      defaultCbcPath += `:${configs}`;
    }
    params.push(defaultCbcPath);
    params.push(config.program);
    return params;
  }
  for (let e of config.vmParam) {
    if (e.startsWith('--cbc-path')) {
      let defaultCbcPath = await getCbcPath();
      if (e.indexOf(defaultCbcPath) < 0) {
        e += ` ${defaultCbcPath}`;
      }
    }
    params.push(e);
  }
  params.push(config.program);
  return params;
}

export async function getCbcPath(): Promise<string> {
  const buildDir = await getBuildDir();
  const cjpmFilePath = getCjpmFilePath();
  const cjpmFileObject = await getCjpmFileObject(cjpmFilePath);
  if (cjpmFileObject === undefined) {
    throw new Error('No cjpm configuration file!');
  }
  let name = cjpmFileObject.package.name;
  if (buildDir === undefined || buildDir === null || buildDir === '') {
    const currentWorkspacePath = workspace.workspaceFolders[0].uri.fsPath;
    return path.join(currentWorkspacePath, 'target', 'debug', `${name}`);
  }
  return path.join(buildDir, 'debug', `${name}`);
}

export function replaceWithEnv(param: string): string {
  if (!checkIsValid(param)) {
    return '';
  }
  return param.replace(/\${(?<envVar>\w+)}/g, (match, envVar) => {
    const envPath = process.env[envVar]?.replace(/\\/g, '/');
    return envPath === undefined ? '' : envPath;
  });
}

export function getExtensionPath(): string {
  return extensionPath;
}

export function getExtensionUri(): Uri {
  return extensionUri;
}

function checkProcessExistence(processPath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      const executablePath = processPath.replace(/\\/g, '\\\\');
      const command = `wmic process where "ExecutablePath='${executablePath}'" get ProcessId`;
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.includes('ProcessId'));
      });
    } else {
      const command = `pgrep -f "${processPath}"`;
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.trim().length > 0);
      });
    }
  });
}
export function getSdkPath(): string {
  let sdkOption = getSdkOption();
  let backendType = sdkOption === 'CJNative' ? 'CJNativeBackend' : 'CJVMBackend';
  let sdkPath: string = <string>workspace.getConfiguration('CangjieSdkPath').get(backendType);
  sdkPath = expandWorkspacePlaceholders(sdkPath, workspace.workspaceFolders?.[0]?.uri.fsPath);
  if (!sdkPath || !fs.existsSync(sdkPath)) {
    throw Error('The Cangjie SDK path has not been configured properly. Please configure it first.');
  }
  return sdkPath;
}
