/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import { ALWAYS_ENABLED_FEATURES, EXPERIMENTAL, LSP_COMMON_SPECIFIC_PATHS, PACKAGE, PROFILE, SOURCE_SET, SRC_DIR } from './constantNums';
import { CommonSpecificPath, SourceSet } from './cjpm-config-data';
import { Utility } from './utils';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class CommonSpecificUtility {
  static isCrossPlatformModule(cjpmContent: JSON): boolean {
    if (!Utility.checkIsValid(cjpmContent)) {
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(cjpmContent, PROFILE) ||
        !Object.prototype.hasOwnProperty.call(cjpmContent, SOURCE_SET)) {
      return false;
    }
    const profileValue = cjpmContent[PROFILE];
    if (!Utility.checkIsValid(profileValue)) {
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(profileValue, EXPERIMENTAL)) {
      return false;
    }
    const experimentalFlag = profileValue[EXPERIMENTAL];
    return Utility.checkIsValid(experimentalFlag);
  }
  
  static getSrcPath(memberPath: string, curModuleData: Record<string, unknown>, 
                    cjpmContent: JSON, baseTargetFeatures: string[]): void {
    if (!Utility.checkIsValid(cjpmContent)) {
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(cjpmContent, SOURCE_SET) ||
        !Object.prototype.hasOwnProperty.call(cjpmContent, PACKAGE)) {
      return;
    }
    const packageConfig = cjpmContent[PACKAGE];
    const moduleName = Utility.getModuleName(packageConfig);
    const sourceSets: SourceSet[] = cjpmContent[SOURCE_SET];
    if (!Utility.checkIsValid(sourceSets) || sourceSets.length < 1) {
      vscode.window.showWarningMessage(`The ${moduleName} module source-set count is less than one, please configure it correctly`);
      return;
    }
    let hasCommon: boolean = false;
    const specificPaths: CommonSpecificPath[] = [];
    let commonPaths: CommonSpecificPath;
    for (const source of sourceSets) {
      if (!Utility.checkIsValid(source)) {
        continue;
      }
      let srcPath: string = source[SRC_DIR];
      const realPath = path.resolve(memberPath, srcPath).normalize();
      if (!Utility.isSubPath(memberPath, realPath)) {
        vscode.window.showWarningMessage(`The ${moduleName} module src-dir path should be under the toml path.`);
        return;
      }
      if (!fs.existsSync(realPath) || !fs.statSync(realPath).isDirectory()) {
        vscode.window.showWarningMessage(`The ${moduleName} module src-dir path '${realPath}' does not exist.`);
        return;
      }
      srcPath = vscode.Uri.file(realPath).toString();
      const name: string = source.name;
      const features: string[] = source.features;
      const type = features.length === 0 ? 'common' : 'specific';
      if (features.length === 0) {
        if (hasCommon) {
          vscode.window.showWarningMessage(`The ${moduleName} module has more than one common package, will only parse the first common package`);
          continue;
        }
        commonPaths = {type, name, features, path: srcPath};
        hasCommon = true;
        continue;
      }
      specificPaths.push({type, name, features, path: srcPath});
    }
    const targetFeatures: string[] = [];
    targetFeatures.push(...baseTargetFeatures);
    if (Object.prototype.hasOwnProperty.call(packageConfig, ALWAYS_ENABLED_FEATURES)) {
      const moduleBaseFeatures = packageConfig[ALWAYS_ENABLED_FEATURES] as string[];
      if (Utility.checkIsValid(moduleBaseFeatures)) {
        targetFeatures.push(...moduleBaseFeatures);
      }
    }
    const resultPaths: CommonSpecificPath[] = 
      CommonSpecificUtility.getCommonSpecificPaths(commonPaths, specificPaths, targetFeatures);
    CommonSpecificUtility.removeFinalAstCache(resultPaths);
    curModuleData[LSP_COMMON_SPECIFIC_PATHS] = resultPaths;
  }

  static getCommonSpecificPaths(sourceCommonPaths: CommonSpecificPath,
                                sourceSpecificPaths: CommonSpecificPath[],
                                targetFeatures: string[]): CommonSpecificPath[] {
    const commonSpecificPaths: CommonSpecificPath[] = [];
    commonSpecificPaths.push(sourceCommonPaths);
    const specificPaths: CommonSpecificPath[] = 
      CommonSpecificUtility.filterAndSortSpecificPaths(sourceSpecificPaths, targetFeatures);
    commonSpecificPaths.push(...specificPaths);
    return CommonSpecificUtility.removeSamePath(commonSpecificPaths);
  }

  static filterAndSortSpecificPaths(source: CommonSpecificPath[], baseFeatures: string[]): CommonSpecificPath[] {
    const inputSet = new Set(baseFeatures);
    // 1. 筛选：只保留 conditions 是 input 子集的对象（保留原始索引）
    const valid = source
      .map((obj, index) => ({ obj, index }))
      .filter(({ obj }) => 
        obj.features.every(item => inputSet.has(item))
      );
    // 2. 排序：
    //    - 先按 conditions 长度升序（相似度低 → 高）
    //    - 长度相同按原始索引升序（保持原顺序）
    valid.sort((a, b) => {
      const lenA = a.obj.features.length;
      const lenB = b.obj.features.length;
      if (lenA !== lenB) {
        return lenA - lenB;
      }
      return a.index - b.index;
    });
    // 3. 提取对象返回
    return valid.map(item => item.obj);
  }

  static removeSamePath(source: CommonSpecificPath[]): CommonSpecificPath[] {
    if (source.length < 2) {
      return source;
    }
    const result: CommonSpecificPath[] = [];
    result.push(...source);
    const pathSet: Set<string> = new Set();
    const nameSet: Set<string> = new Set();
    // input common info first
    pathSet.add(source[0].path);
    nameSet.add(source[0].name);

    for (let i = result.length - 1; i >= 1; i--) {
      const item = result[i];
      if (pathSet.has(item.path) || nameSet.has(item.name)) {
        result.splice(i, 1);
        continue;
      }
      pathSet.add(item.path);
      nameSet.add(item.name);
    }
    return result;
  }

  static async removeFinalAstCache(paths: CommonSpecificPath[]): Promise<void> {
    if (paths.length < 2) {
      return;
    }
    const workspaceFolder = Utility.getWorkspaceFolders();
    const astCachePath = path.resolve(workspaceFolder, '.cache', 'astdata').normalize();
    if (!fs.existsSync(astCachePath)) {
      return;
    }
    const files = fs.readdirSync(astCachePath);
    if (files.length === 0) {
      return;
    }
    let hasDelete = false;
    for (let i = paths.length - 1; i >= 1; i--) {
      const targetPath: CommonSpecificPath = paths[i];
      if (!Utility.checkIsValid(targetPath)) {
        continue;
      }
      const targetName = targetPath.name;
      if (!Utility.checkIsValid(targetName)) {
        continue;
      }
      for (const file of files) {
        if (!file.startsWith(`${targetName}-`) || !file.endsWith('.ast')) {
          continue;
        }
        const filePath = path.join(astCachePath, file);
        try {
          await fs.promises.unlink(filePath); 
        } catch (e) {
          continue;
        }
        hasDelete = true;
      }
      if (hasDelete) {
        break;
      }
    }
  }
}
