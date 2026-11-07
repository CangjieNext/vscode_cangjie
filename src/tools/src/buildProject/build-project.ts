/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { multiParamsBuild, multiParamsTest } from './multi-step-select';
import { Utility } from '../util/utils';
import { OutputHelper } from '../util/output-helper';
import { TerminalHelper } from '../util/ternimal-helper';
import {CJPM_TOML, cjpmBuildArgExtname, COMPILE_OPTION, PACKAGE} from '../util/constant-num';
import * as path from 'path';
import * as fs from 'fs';
import {stringify} from '../util/toml/toml-export';
import {workspace} from 'vscode';

export class CjProjectBuildProvider {
  static async executeCmd(cmd: string, isDebug: boolean = false): Promise<boolean> | undefined {
    let execCmd = cmd;
    if (process.platform !== 'linux' && process.platform !== 'win32' && process.platform !== 'darwin') {
      vscode.window.showInformationMessage('Only support linux, windows and mac now');
      return false;
    }
    if (!Utility.checkIsValid(execCmd)) {
      return false;
    }
    // pass the configured compatibility target to cjpm build/run/test, and block an unsupported selection
    const compatCmd = Utility.appendCompatVersion(execCmd);
    if (compatCmd.error !== '') {
      vscode.window.showErrorMessage(compatCmd.error);
      return false;
    }
    execCmd = compatCmd.cmd;
    const modulePath = Utility.getCjRootProjectPath();
    if (!Utility.checkIsValid(modulePath)) {
      vscode.window.showErrorMessage('Project is not exist');
      return false;
    }
    // no cjpm.toml
    if (!Utility.isCangjieProject()) {
      vscode.window.showErrorMessage('Can not use cjpm to build project which without a cjpm.toml file');
      OutputHelper.appendLine(`[stop]: ${execCmd} \n`, true);
      return false;
    }

    // build for debug
    if (isDebug) {
      let osSystem = Utility.getOsSystem();
      let envConfig = {};
      if (osSystem === 'osx') {
        let settingsEnvConf =
          JSON.parse(JSON.stringify(workspace.getConfiguration('terminal.integrated.env').get(osSystem)));
        delete settingsEnvConf.PATH;
        envConfig = {
          ...process.env,
          ...settingsEnvConf,
        };
      } else if (osSystem === 'linux') {
        envConfig['HOME'] = process.env.HOME;
      }
      return OutputHelper.execCommand(Utility.getExecCmd(execCmd), modulePath, envConfig);
    }

    // unified output file alias
    const cjpmBuildArgs = Utility.getCjpmBuildArgsContent(cjpmBuildArgExtname);
    if (execCmd.includes('-o')) {
      const cmdArray = execCmd.split(' ');
      const aliasInd = cmdArray.indexOf('-o');
      cjpmBuildArgs.alias = cmdArray[aliasInd + 1];
      Utility.gencjpmBuildArgsJSON(cjpmBuildArgs);
    } else if (cjpmBuildArgs.alias !== '') {
      cjpmBuildArgs.alias = '';
      Utility.gencjpmBuildArgsJSON(cjpmBuildArgs);
    } else {
      cjpmBuildArgs.alias = '';
    }

    // add compile-option
    const tomlContent = Utility.getTomlContent();
    let compileOptions = Utility.getTomlValueByTreeKeys([PACKAGE, COMPILE_OPTION], tomlContent) as string;
    if (Utility.checkIsValid(compileOptions) && !(compileOptions.includes('--diagnostic-format=noColor'))) {
      compileOptions += ' --diagnostic-format=noColor';
      tomlContent[PACKAGE][COMPILE_OPTION] = compileOptions.trim();
      const jsonFilePath = path.join(Utility.getCjRootProjectPath(), CJPM_TOML);
      fs.writeFileSync(jsonFilePath, stringify(tomlContent));
    }

    try {
      // update cjpm.toml
      const resolveJsonPath = path.join(Utility.getCjRootProjectPath(), '/module-resolve.json');
      if (fs.existsSync(resolveJsonPath)) {
        execSync(Utility.getExecCmd('cjpm update'), { cwd: modulePath, encoding: 'utf8' });
      }
      TerminalHelper.execCommand(execCmd);
      return undefined;
    } catch (error) {
      vscode.window.showErrorMessage(error.message);
      return false;
    }
  }

  static multi(): void {
    const params: string = '';
    multiParamsBuild().then((buildParams: string) => {
      params.concat(buildParams);
      if (Utility.checkIsValid(buildParams)) {
        this.executeCmd(buildParams);
      }
    });
  }

  static multiTest(): void {
    multiParamsTest().then((testParams: string) => {
      if (Utility.checkIsValid(testParams)) {
        this.executeCmd(testParams);
      }
    });
  }
}