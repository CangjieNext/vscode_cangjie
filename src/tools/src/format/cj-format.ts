/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as path from 'path';
import { OutputHelper } from '../util/output-helper';
import { Utility } from '../util/utils';

export class CjFormat {
  static async formatFunc(currentEdit: vscode.Uri): Promise<unknown> {
    const platform = os.platform();
    const isWindows = platform === 'win32';
    let cjfmtPath: string;
    let formatedPath: string;
    let pathSdk: string;
    let filePath: string;
    let stat: fs.Stats;
    filePath = Utility.checkIsValid(currentEdit) ? currentEdit.fsPath : vscode.window.activeTextEditor.document.fileName;
    if (filePath === undefined || filePath.indexOf('..') >= 0 || !fs.existsSync(filePath)) {
      return false;
    }
    pathSdk = Utility.getCangjieHome();
    if (!Utility.checkIsValid(pathSdk)) {
      vscode.window.showErrorMessage('Please check sdk path');
      return false;
    }
    let cjfmtNme = 'cjfmt';
    if (isWindows) {
      cjfmtNme = 'cjfmt.exe';
    }
    cjfmtPath = path.join(pathSdk, ...['tools', 'bin', cjfmtNme]);
    formatedPath = path.join(pathSdk, ...['tools', 'bin']);
    if (!fs.existsSync(cjfmtPath)) {
      vscode.window.showErrorMessage('Format failed, no cjfmt tool');
      return false;
    }
    if (!fs.existsSync(formatedPath)) {
      vscode.window.showErrorMessage('Format failed, no bin directory in cangjie sdk');
      return false;
    }
    try {
      stat = fs.lstatSync(filePath);
    } catch (error) {
      vscode.window.showErrorMessage(error.message);
      return false;
    }
    const isDirectory = stat.isDirectory();
    if (!isDirectory && path.extname(filePath) !== '.cj') {
      vscode.window.showErrorMessage('The plugin only can format Cangjie source code file');
      return false;
    }
    const option = isDirectory ? '-d' : '-f';
    let cmd = `cjfmt ${option} '${filePath}'`;
    if (process.platform === 'win32') {
      // the "" is used to handle path with space in windows
      cmd = `cjfmt ${option} "${filePath}"`;
    }
    try {
      cp.exec(Utility.getExecCmd(cmd), { cwd: formatedPath }, (_error, _stdout, stderr) => {
        if (Utility.checkIsValid(stderr)) {
          OutputHelper.appendLine(`cjfmt check message: ${stderr}`);
        }
      });
    } catch (err) {
      vscode.window.showErrorMessage(`Format failed ${err}`);
      return err;
    }
    return true;
  }
}
