/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  BIN_DEPENDENCIES,
  C,
  CJPM_TOML_NAME,
  DEPENDENCIES,
  DEV_DEPENDENCIES,
  SCRIPT_DEPENDENCIES,
  FFI,
  GIT,
  GIT_COMMIT_ID,
  NAME,
  OUTPUT_TYPE,
  PACKAGE,
  PATH, PATH_OPTION,
  TARGET,
  TARGET_DIR
} from './cjpm-toml-constans';
import {tomlParser} from '../command';
import {checkFieldNotBlank, checkIsValid, getSdkPath, isEmpty} from '../common-utils';
import {cjpmDefaultPath} from "../constants";
import {SystemTriple} from "./SystemTriple";
import {ProjectType} from "../types";

export class CangjieDependency {
  private workspacePaths: string[] = [];

  private _dependencyModuleSet: Set<string> = new Set<string>();

  private targetDir = null;

  get dependencyModuleSet(): Set<string> {
    return this._dependencyModuleSet;
  }

  set dependencyModuleSet(value: Set<string>) {
    this._dependencyModuleSet = value;
  }

  public static async getPathByLockFile(workspacePath: string, moduleName: string): Promise<string> {
    const cjpmConfigPath = CangjieDependency.getCjpmConfigPath('git');
    const cjpmLockPath = path.join(workspacePath, 'cjpm.lock');
    try {
      fs.accessSync(cjpmLockPath, fs.constants.R_OK);
    } catch (err) {
      return '';
    }
    let moduleLockData = {} as any;
    try {
      moduleLockData = await CangjieDependency.parseTomlData(cjpmLockPath);
    } catch (e: any) {
      // do nothing
    }
    if (Object.prototype.hasOwnProperty.call(moduleLockData, DEPENDENCIES) &&
      Object.prototype.hasOwnProperty.call(moduleLockData[DEPENDENCIES], moduleName) &&
      checkIsValid(moduleLockData[DEPENDENCIES][moduleName][GIT_COMMIT_ID])) {
      return path.join(cjpmConfigPath, moduleName, moduleLockData[DEPENDENCIES][moduleName][GIT_COMMIT_ID]);
    }
    return '';
  }

  public static async getTomlData(workspacePath: string): Promise<any> {
    let tomlPath = CangjieDependency.getCjpmTomlFilePath(workspacePath);
    if (!checkFieldNotBlank(tomlPath)) {
      return;
    }
    return CangjieDependency.parseTomlData(tomlPath);
  }

  public static getCjpmConfigPath(type: string): string {
    if (checkIsValid(process.env.CJPM_CONFIG)) {
      return path.join(process.env.CJPM_CONFIG, type);
    }
    if (os.platform() === 'win32') {
      return path.join(process.env.USERPROFILE, cjpmDefaultPath, type);
    }
    return path.join(process.env.HOME, cjpmDefaultPath, type);
  }

  public static getCjpmTomlFilePath(workSpace: string): string {
    if (checkFieldNotBlank(workSpace) && fs.existsSync(workSpace)) {
      let tomlPath = path.join(workSpace, CJPM_TOML_NAME);
      return fs.existsSync(tomlPath) ? tomlPath : null;
    }
    return null;
  }

  public static async isExecutable(): Promise<boolean> {
    let tomlData  = await CangjieDependency.getTomlData(vscode.workspace.workspaceFolders[0].uri.fsPath);
    if (tomlData === null || tomlData === undefined) {
      return false;
    }
    return tomlData[PACKAGE][OUTPUT_TYPE] === ProjectType.EXECUTABLE;
  }

  public static getTargetPlatForm(targetData: any): string {
    return Object.keys(targetData).find(SystemTriple.isMatching);
  }

  private static getToolsBinPath() {
    return path.join(getSdkPath(), 'tools', 'bin');
  }

  private static parseTomlData(tomlFilePath: string): Thenable<any> {
    return vscode.commands.executeCommand(tomlParser, tomlFilePath);
  }

  public async getAllDependencies(isUnitTest = false): Promise<void> {
    this.addWorkspacePath(vscode.workspace.workspaceFolders[0].uri.fsPath);
    await this.doFindAllDependencies();
    // handle runtime path
    this.targetDir = null;
    if (isUnitTest) {
      await this.getUnittestDependency();
    }
    if (isUnitTest) {
      this.dependencyModuleSet.add(CangjieDependency.getToolsBinPath());
    }
  }

  public async doFindAllDependencies(): Promise<void> {
    if (this.workspacePaths.length <= 0) {
      return;
    }
    let workspacePath = this.workspacePaths.pop();
    let tomlData = await CangjieDependency.getTomlData(workspacePath);
    if (tomlData === null || tomlData === undefined) {
      return;
    }
    if (this.targetDir === null && checkFieldNotBlank(tomlData[PACKAGE][TARGET_DIR])) {
      this.targetDir = tomlData[PACKAGE][TARGET_DIR];
    }
    // parse dependencies config
    await this.getDependencies(tomlData, workspacePath, false, false);
    // parse dev-dependencies config
    await this.getDependencies(tomlData, workspacePath, true, false);
    // parse script-dependencies config
    await this.getDependencies(tomlData, workspacePath, false, true);
    // parse target config
    await this.getTargetRequires(tomlData, workspacePath, []);
    // parse ffi.c config
    this.getForeignCRequires(tomlData, workspacePath);
    await this.doFindAllDependencies();
  }

  public async getTargetRequires(tomlData: any, workspacePath: string, excludeFiles: string[]): Promise<void> {
    if (!Object.prototype.hasOwnProperty.call(tomlData, TARGET)) {
      return;
    }
    const targetPlatform = CangjieDependency.getTargetPlatForm(tomlData[TARGET]);
    if (isEmpty(targetPlatform)) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(tomlData[TARGET][targetPlatform], BIN_DEPENDENCIES)) {
      this.getRequires(tomlData[TARGET][targetPlatform][BIN_DEPENDENCIES], excludeFiles, workspacePath, tomlData);
    }
    await this.getDependencies(tomlData[TARGET][targetPlatform], workspacePath, false, false);
  }

  private getRequires(packageRequires: any, excludeFiles: string[], workspacePath: string, moduleData: any): void {
    if (Object.prototype.hasOwnProperty.call(packageRequires, PATH_OPTION)) {
      const pathOptions = packageRequires[PATH_OPTION];
      for (let i = 0; i < pathOptions.length; i++) {
        let pathOption = pathOptions[i];
        if (excludeFiles.some(excludeFile => path.resolve(pathOption).startsWith(path.resolve(excludeFile)))) {
          continue;
        }
        const normalizePath = path.normalize(pathOption);
        if (!path.isAbsolute(normalizePath)) {
          pathOption = path.join(workspacePath, normalizePath);
        }
        if (pathOption[pathOption.length - 1] === path.sep) {
          pathOption = pathOption.substring(0, pathOption.length - 1);
        }
        pathOption = path.normalize(pathOption);
        if (fs.existsSync(pathOption)) {
          this.addDependencies(path.join(moduleData[PACKAGE][NAME], PATH_OPTION), pathOption);
        }
      }
    }
  }

  private addDependencies(key: string, value: string): void {
    this.dependencyModuleSet.add(value);
  }

  public getForeignCRequires(tomlData: any, workspacePath: string): void {
    if (!Object.prototype.hasOwnProperty.call(tomlData, FFI) ||
      !Object.prototype.hasOwnProperty.call(tomlData[FFI], C)) {
      return;
    }
    const foreignRequires = tomlData[FFI][C];
    for (const requireItem in foreignRequires) {
      if (!Object.prototype.hasOwnProperty.call(foreignRequires, requireItem)) {
        continue;
      }
      const foreignRequireObj = foreignRequires[requireItem];
      if (!Object.prototype.hasOwnProperty.call(foreignRequireObj, PATH)) {
        continue;
      }
      let pathModule = foreignRequireObj[PATH];
      const normalizePath = path.normalize(pathModule);
      if (!path.isAbsolute(normalizePath)) {
        pathModule = path.join(workspacePath, normalizePath);
      }
      pathModule = path.normalize(pathModule);
      if (pathModule.toString().length === 0) {
        continue;
      }
      this.dependencyModuleSet.add(pathModule);
    }
  }

  private async getDependencies(tomlData: any, workspacePath: string, dev: boolean, script: boolean): Promise<void> {
    let property = script ? SCRIPT_DEPENDENCIES : (dev ? DEV_DEPENDENCIES : DEPENDENCIES);
    if (!Object.prototype.hasOwnProperty.call(tomlData, property)) {
      return;
    }
    for (const requireItem in tomlData[property]) {
      if (!Object.prototype.hasOwnProperty.call(tomlData[property], requireItem)) {
        continue;
      }
      this.dependencyModuleSet.add(this.getTargetPath(requireItem));
      const requireItems = tomlData[property][requireItem];
      if (Object.prototype.hasOwnProperty.call(requireItems, PATH)) {
        let pathModule = requireItems[PATH];
        pathModule = path.normalize(pathModule);
        if (!path.isAbsolute(pathModule)) {
          pathModule = path.normalize(path.join(workspacePath, pathModule));
        }
        this.addWorkspacePath(pathModule);
      } else if (Object.prototype.hasOwnProperty.call(requireItems, GIT)) {
        const pathModule = await CangjieDependency.getPathByLockFile(workspacePath, requireItem);
        if (checkIsValid(pathModule)) {
          this.addWorkspacePath(pathModule);
        }
      } else {
        const cjpmConfigPath = CangjieDependency.getCjpmConfigPath('repository');
        const pathModule = path.join(cjpmConfigPath, `${requireItem}-${requireItems}`);
        if (checkIsValid(pathModule)) {
          this.addWorkspacePath(pathModule);
        }
      }
    }
  }

  private getTargetPath(moduleName: string): string {
    if (checkFieldNotBlank(this.targetDir)) {
      return path.join(this.targetDir, 'debug', moduleName);
    }
    return path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'target', 'debug', moduleName);
  }

  private addWorkspacePath(workspacePath: string): void {
    if (!this.workspacePaths.includes(workspacePath)) {
      this.workspacePaths.push(workspacePath);
    }
  }

  private async getUnittestDependency(): Promise<void> {
    let tomlData  = await CangjieDependency.getTomlData(vscode.workspace.workspaceFolders[0].uri.fsPath);
    if (tomlData === null || tomlData === undefined) {
      return;
    }
    if (!await CangjieDependency.isExecutable()) {
      this.dependencyModuleSet.add(this.getTargetPath(tomlData[PACKAGE][NAME]));
    }
  }
}
