/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as vscode from 'vscode';
import { Utility } from '../util/utils';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { CJLINT_CONFIG_NAME, CJLINT_WAIT_TIME } from '../util/constant-num';
import { OutputHelper } from '../util/output-helper';

export class CjlintOnSave {
  static inOnSave: boolean = false;

  static status: vscode.StatusBarItem;

  static cjlintPorcess: cp.ChildProcessWithoutNullStreams;

  static action = CjlintOnSave.debounce(CjlintOnSave.doCjlintAction, CJLINT_WAIT_TIME);

  static registerCodecheckOnSave(): void {
    CjlintOnSave.mkdirCjlintIgnoreCfg();

    vscode.workspace.onDidChangeTextDocument(async (event) => {
      const isCodecheckOnSave = vscode.workspace.getConfiguration('Cangjie').get('CodeCheckOnSave');
      if (!event.document.fileName.endsWith('.cj') || !(typeof isCodecheckOnSave === 'boolean' && isCodecheckOnSave)) {
        return;
      }
      const changes = event.contentChanges;
      if (changes.length > 0) {
        // edit event
        CjlintOnSave.inOnSave = false;
      } else {
        // save event
        // avoid save many times
        if (CjlintOnSave.inOnSave) {
          return;
        }
        CjlintOnSave.inOnSave = true;
        CjlintOnSave.action(event.document);
      }
    });
    vscode.window.onDidChangeActiveTextEditor(async (event) => {
      const isCodeCheckOnSave = vscode.workspace.getConfiguration('Cangjie').get('CodeCheckOnSave');
      const fileName = event?.document?.fileName;
      const isNotNeedCodeCheck = !Utility.checkIsValid(fileName) || fileName.endsWith('.cj') === false ||
        !(typeof isCodeCheckOnSave === 'boolean' && isCodeCheckOnSave === true);
      if (isNotNeedCodeCheck) {
        return;
      }
      CjlintOnSave.inOnSave = true;
      CjlintOnSave.action(event.document);
    });
    const isCodeCheckOnSave = vscode.workspace.getConfiguration('Cangjie').get('CodeCheckOnSave');
    const defaultOpenFileName = vscode.window.activeTextEditor?.document?.fileName;
    const isNotDoCodeCheck = !Utility.checkIsValid(defaultOpenFileName) || defaultOpenFileName.endsWith('.cj') ===
      false || !(typeof isCodeCheckOnSave === 'boolean' && isCodeCheckOnSave === true);
    if (isNotDoCodeCheck) {
      return;
    }
    // save event
    // avoid save many times
    CjlintOnSave.inOnSave = true;
    CjlintOnSave.action(vscode.window.activeTextEditor.document);
  }

  static mkdirCjlintIgnoreCfg(): void {
    const isCodeCheckOnSave = vscode.workspace.getConfiguration('Cangjie').get('CodeCheckOnSave');
    const cjlintExcludePath = path.join(Utility.getCjRootProjectPath(), CJLINT_CONFIG_NAME);
    if (typeof isCodeCheckOnSave === 'boolean' && isCodeCheckOnSave === true && fs.existsSync(cjlintExcludePath) ===
      false) {
      try {
        fs.writeFileSync(cjlintExcludePath, '');
      } catch (error) {
        OutputHelper.appendLine(error);
      }
    }
  }

  static debounce(func: (document: vscode.TextDocument) => void, delay: number): (this: unknown, ...args: unknown[]) => void {
    let timer: ReturnType<typeof setTimeout>;
    return function (this: unknown, ...args: unknown[]) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        func.apply(this, args);
      }, delay);
    };
  }

  static doCjlintAction(document: vscode.TextDocument): void {
    const folderPath = path.dirname(document.uri.fsPath);
    if (!fs.existsSync(folderPath) || Utility.checkIsValid(CjlintOnSave.cjlintPorcess)) {
      return;
    }
    let envConfig = 'env.windows';
    if (process.platform === 'linux') {
      envConfig = 'env.linux';
    } else if (process.platform === 'darwin') {
      envConfig = 'env.osx';
    }
    const env = vscode.workspace.getConfiguration('terminal.integrated').get(envConfig) as NodeJS.ProcessEnv;
    const outputFolder = Utility.getCjRootProjectPath();
    const outputPath = path.join(outputFolder, 'report'); // cjCodeCheckReport
    const cjlintExcludePath = path.join(outputFolder, CJLINT_CONFIG_NAME);
    let cjlintCommand = ['cjlint', '-f', folderPath, '-o', outputPath];
    if (fs.existsSync(cjlintExcludePath) === true) {
      cjlintCommand.push('-e');
      cjlintCommand.push(path.relative(folderPath, cjlintExcludePath));
    }
    CjlintOnSave.cjlintPorcess = cp.exec(Utility.getExecCmd(cjlintCommand.join(' ')), { cwd: folderPath, encoding: 'utf8' });
    CjlintOnSave.initStatus();

    // listen variable change, edit action trigger cancel cjlintPorcess
    setInterval(() => {
      if (!CjlintOnSave.inOnSave && Utility.checkIsValid(CjlintOnSave.cjlintPorcess)) {
        CjlintOnSave.deleteReportFile(outputFolder);
        CjlintOnSave.cjlintPorcess.kill('SIGTERM');
        CjlintOnSave.inOnSave = false;
      }
    });

    CjlintOnSave.cjlintPorcess.on('error', (error) => {
      CjlintOnSave.inOnSave = false;
    });
    CjlintOnSave.cjlintPorcess.on('close', async (code, signal) => {
      const jsonPath = path.join(outputFolder, './report.json');
      try {
        if (code === 0 && fs.existsSync(jsonPath)) {
          const result = fs.readFileSync(jsonPath, 'utf-8');
          const resultJson = JSON.parse(result);
          await vscode.commands.executeCommand('cangjie.codecheck.diagnostic', resultJson);
        }
      } finally {
        CjlintOnSave.cleanStatus();
        CjlintOnSave.deleteReportFile(outputFolder);
        CjlintOnSave.inOnSave = false;
        CjlintOnSave.cjlintPorcess = undefined;
      }
    });
  }

  static initStatus(): void {
    if (Utility.checkIsValid(CjlintOnSave.status)) {
      return;
    }
    CjlintOnSave.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    CjlintOnSave.status.text = '$(sync~spin) Cangjie-CodeChecking...';
    CjlintOnSave.status.show();
  }

  static cleanStatus(): void {
    if (!Utility.checkIsValid(CjlintOnSave.status)) {
      return;
    }
    CjlintOnSave.status.dispose();
  }

  static deleteReportFile(outputFolder: string): void {
    const report = path.join(outputFolder, 'report.json');
    if (fs.existsSync(report)) {
      fs.rmSync(report);
    }
  }
}