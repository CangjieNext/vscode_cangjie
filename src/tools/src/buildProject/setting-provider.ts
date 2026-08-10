/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

'use strict';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { ViewProvider } from './view-provider';
import { Utility } from '../util/utils';
import { OutputHelper } from '../util/output-helper';
import {
  CUSTOMIZED_OPTION,
  MODULEJSONARGS, CJPM_TOML, OUTPUT_TYPE,
  PACKAGE,
  PACKAGE_CONFIGURATION, PROFILE, COMPILE_OPTION, TARGET
} from '../util/constant-num';
import type { CjpmBuildArgs } from '../util/cjpm-config-data';
import type { ConfigSetMessage } from '../util/message-data';
import * as path from 'path';
import type {CustomTomlTypes} from '../util/toml/toml-types';
import {stringify} from '../util/toml/toml-export';

export class SettingsProvider extends ViewProvider {
  static existWebView: boolean = false;

  public initialized: boolean = false;

  constructor(context: vscode.ExtensionContext) {
    super(context);
    this.viewType = 'SettingsProvider';
    this.title = 'Cangjie Configurations';
  }

  public getcjpmBuildArgs(): CjpmBuildArgs {
    this.cjpmBuildArgs = Utility.getCjpmBuildArgsContent(this.cjpmbuildPath);
    return this.cjpmBuildArgs;
  }

  public getCjpmContent(): CustomTomlTypes {
    this.cjpmContent = Utility.getMergedTomlContentForWebview();
    return this.cjpmContent;
  }

  public updateWebview(cjpmBuildArgs: unknown, tomlContent: unknown): void {
    if (!Utility.checkIsValid(this.panel)) {
      return;
    }
    if (Utility.checkIsValid(tomlContent)) {
      this.panel.webview.postMessage({ command: 'settedModuleJson', config: tomlContent });
    }
    if (Utility.checkIsValid(cjpmBuildArgs)) {
      this.panel.webview.postMessage({ command: 'settedcjpmBuildArgs', config: cjpmBuildArgs });
    }
    return;
  }

  protected onPanelDisposed(): void {
    SettingsProvider.existWebView = false;
    if (Utility.checkIsValid(this.disposablesPanel)) {
      this.disposablesPanel.dispose();
      this.panel = undefined;
    }
  }

  protected onMessageReceived(message: ConfigSetMessage): void {
    super.onMessageReceived(message);
    switch (message.command) {
      case 'change': {
        if (Utility.getSdkOption() === 'CJVM' && message.key === 'coverage') {
          vscode.window.showWarningMessage('the coverage is only setted up in CJNative path');
          break;
        }
        this.updateConfig(message);
        break;
      }
      case 'initialized': {
        this.initialized = true;
        this.settingsProviderActivated.fire();
        this.updateWebview(this.getcjpmBuildArgs(), this.getCjpmContent());
        break;
      }
      case 'addConfig': {
        if (Utility.getSdkOption() === 'CJVM' && message.field === TARGET) {
          vscode.window.showWarningMessage(`the ${TARGET} is only setted up in CJNative path`);
          break;
        }
        this.updateCrsCmpConfig(message, 'add');
        break;
      }
      case 'delConfig': {
        if (Utility.getSdkOption() === 'CJVM' && message.field === TARGET) {
          vscode.window.showWarningMessage(`the ${TARGET} is only setted up in CJNative path`);
          break;
        }
        this.updateCrsCmpConfig(message, 'delete');
        break;
      }
      case 'errorAdd': {
        vscode.window.showErrorMessage(<string>message.value);
        break;
      }
      default: {
        break;
      }
    }
  }

  private updateConfig(message: ConfigSetMessage): void {
    if (!MODULEJSONARGS.includes(message.key)) {
      this.updateJsonConfig(message.key, this.cjpmbuildPath, message.value);
    } else {
      this.updateJsonConfig(message.key, this.cjpmTomlPath, message.value);
    }
  }

  private updateJsonConfig(key: string, targetPath: string, replaceContent: unknown): void {
    let contentStr;
    let targetRootPath;
    if (targetPath === this.cjpmbuildPath) {
      targetRootPath = Utility.getWorkspaceFolders();
      let jsonContent: CjpmBuildArgs = Utility.getCjpmBuildArgsContent(targetPath);
      jsonContent[key] = replaceContent;
      contentStr = JSON.stringify(jsonContent, null, '\t');
    } else {
      targetRootPath = Utility.getCjRootProjectPath();
      let tomlContent = Utility.getTomlContent();
      if (!Utility.checkIsValid(tomlContent)) {
        tomlContent[PACKAGE] = {};
      }
      tomlContent[PACKAGE][key] = replaceContent;
      contentStr = stringify(tomlContent);
    }
    try {
      const writePath = path.join(targetRootPath, targetPath);
      fs.writeFileSync(writePath, contentStr);
    } catch (e) {
      OutputHelper.appendLine(e);
    }
  }

  private getFieldContent(updateKey: string, jsonContent: CustomTomlTypes): CustomTomlTypes {
    let content = {};
    if (updateKey === 'package-configuration' || updateKey === 'single-condition-option') {
      content = Utility.getTomlValueByTreeKeys([PACKAGE, PACKAGE_CONFIGURATION], jsonContent, false);
    } else if (updateKey === 'target') {
      content = Utility.getTomlValueByTreeKeys([TARGET], jsonContent, false);
    } else if (updateKey === 'customized-option') {
      content = Utility.getTomlValueByTreeKeys([PROFILE, CUSTOMIZED_OPTION], jsonContent, false);
    } else {
      content = Utility.getTomlValueByTreeKeys([PACKAGE], jsonContent, false);
    }
    return content;
  }

  private updateCrsCmpConfig(newContent: ConfigSetMessage, paramType: string): void {
    const updateKey = newContent.field;
    let jsonContent = Utility.getTomlContent();
    if (!this.checkIsInit(jsonContent, updateKey)) {
      return;
    }
    let fieldContent = this.getFieldContent(updateKey, jsonContent);
    let changeKey = newContent.key;
    let oldKey = newContent.oldValue?.[0];
    let changeValue = newContent.value;
    if (updateKey === 'single-condition-option' && typeof newContent.value !== 'string') {
      // wheather package exist
      if (!this.check(jsonContent, newContent, paramType)) {
        return;
      }
      oldKey = newContent.oldValue?.[1];
      changeKey = newContent.value?.condition || newContent.singleCnd;
      changeValue = newContent.value?.configuration;
    }
    switch (paramType) {
      case 'add': {
        if (updateKey === 'package-configuration' && typeof newContent.value === 'object' && !Utility.checkIsValid(newContent.value[OUTPUT_TYPE])) {
          delete newContent.value[OUTPUT_TYPE];
        }

        let conditionContent = fieldContent[oldKey]?.[CUSTOMIZED_OPTION] ||
          fieldContent[changeKey]?.[CUSTOMIZED_OPTION];
        if (updateKey === 'package-configuration' && typeof changeValue === 'object') {
          changeValue[CUSTOMIZED_OPTION] = conditionContent;
        }
        if (updateKey === 'target') {
          this.handleCrsVal(fieldContent, changeKey, changeValue);
          break;
        }
        if (Utility.checkIsValid(newContent.oldValue) && oldKey !== changeKey) {
          this.replaceOldKey(fieldContent, oldKey, changeKey);
        }
        fieldContent[changeKey] = changeValue;
        break;
      }
      case 'delete': {
        delete fieldContent[changeKey];
        break;
      }
      default: {
        break;
      }
    }
    try {
      const writePath = path.join(Utility.getCjRootProjectPath(), CJPM_TOML);
      fs.writeFileSync(writePath, stringify(jsonContent));
    } catch (e) {
      OutputHelper.appendLine(e);
    }
  }

  private handleCrsVal(fieldContent: unknown, changeKey: string, changeValue: unknown): void {
    if (fieldContent[changeKey] !== undefined && typeof fieldContent[changeKey] === 'object') {
      fieldContent[changeKey][COMPILE_OPTION] = changeValue;
    } else {
      fieldContent[changeKey] = {'compile-option': changeValue};
    }
  }

  private checkIsInit(jsonContent: CustomTomlTypes, updateKey: string): boolean {
    if (jsonContent[updateKey] === undefined) {
      if (updateKey === 'single-condition-option') {
        const pkgConfig = Utility.getTomlValueByTreeKeys([PACKAGE, PACKAGE_CONFIGURATION], jsonContent);
        if (pkgConfig === undefined) {
          vscode.window.showWarningMessage(`please fill ${PACKAGE_CONFIGURATION} field first`);
          return false;
        }
      } else if (updateKey === 'package-configuration') {
        if (!Utility.checkIsValid(jsonContent[PACKAGE])) {
          jsonContent[PACKAGE] = {};
          jsonContent[PACKAGE][PACKAGE_CONFIGURATION] = {};
        } else if (!Utility.checkIsValid(jsonContent[PACKAGE][PACKAGE_CONFIGURATION])) {
          jsonContent[PACKAGE][PACKAGE_CONFIGURATION] = {};
        }
      } else if (updateKey === 'customized-option') {
        if (!Utility.checkIsValid(jsonContent[PROFILE])) {
          jsonContent[PROFILE] = {};
          jsonContent[PROFILE][CUSTOMIZED_OPTION] = {};
        } else if (!Utility.checkIsValid(jsonContent[PROFILE][CUSTOMIZED_OPTION])) {
          jsonContent[PROFILE][CUSTOMIZED_OPTION] = {};
        } else {
          // do nothing
        }
      } else {
        jsonContent[updateKey] = {};
      }
    }
    return true;
  }

  private check(jsonContent: CustomTomlTypes, newContent: ConfigSetMessage, paramType: string): boolean {
    if (typeof newContent.value !== 'object') {
      return true;
    }
    let packageCfgObj = Utility.getTomlValueByTreeKeys([PACKAGE, PACKAGE_CONFIGURATION], jsonContent, false);
    if (!Utility.checkIsValid(packageCfgObj[newContent.key])) {
      vscode.window.showWarningMessage(`There is no setted package ${newContent.key} of package-configuration field`);
      return false;
    }
    let conditionName = newContent?.value?.condition === '' || newContent?.value?.condition === void 0;
    if (conditionName && paramType === 'add') {
      vscode.window.showWarningMessage('Condition name is not reasonable');
      return false;
    }
    return true;
  }

  // make sure the sequence of JSON field
  private replaceOldKey(content: CustomTomlTypes, oldKey: string, newKey: string): void {
    if (!Utility.checkIsValid(oldKey)) {
      return;
    }
    Object.keys(content).forEach((key) => {
      if (key === oldKey) {
        content[newKey] = content[oldKey];
        delete content[oldKey];
      } else {
        content[`_${key}`] = content[key];
        delete content[key];

        content[key] = content[`_${key}`];
        delete content[`_${key}`];
      }
    });
  }
}