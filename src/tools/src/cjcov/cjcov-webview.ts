/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { Utility } from '../util/utils';
import { OutputHelper } from '../util/output-helper';
import { Webview } from '../util/webview';
import * as util from 'util';

export enum Commands {
  CJPM_UPDATE = 'cjpm update',
  CJPM_COVERAGE = 'cjpm build --coverage',
  CJCOV = 'cjcov -o output --html-details -i ',
  CJPM_CLEAN = 'cjpm clean',
  CJPM_RUN = 'cjpm run --skip-build',
}

export class CjcovWebview extends Webview {
  private disposable: vscode.Disposable;
  private disposableFolder: vscode.Disposable;
  private panelArray: vscode.WebviewPanel[] = [];

  constructor() {
    super();
    this.disposable = vscode.Disposable.from(
      vscode.commands.registerCommand('cangjie.cjcov', async (currentEdit: vscode.Uri) => {
        this.init(currentEdit);
      })
    );
    this.disposableFolder = vscode.Disposable.from(
      vscode.commands.registerCommand('cangjie.cjcovFloder', async (currentEdit: vscode.Uri) => {
        this.init(currentEdit);
      })
    );
  }

  static html(templatePath: string): string {
    const htmlPath = path.join(Utility.getCjRootProjectPath(), 'output', templatePath);
    let html = fs.readFileSync(htmlPath, 'utf-8');
    let script = `
    <script>
    const vscode = acquireVsCodeApi();
    let elementA = document.getElementsByTagName('a');
    for (let a of elementA) {
      a.addEventListener('click', function () {
        vscode.postMessage({
          path: a.title
        });
      });
    }
    </script> \n`;
    html = html.replace(/(?<id><\/html>)/g, (m) => {
      return script + m;
    });
    return html;
  }

  dispose(): void {
    this.disposable.dispose();
    this.disposableFolder.dispose();
  }

  async init(currentEdit: vscode.Uri): Promise<void> {
    if (process.platform !== 'linux' && process.platform !== 'win32' && process.platform !== 'darwin') {
      vscode.window.showInformationMessage('This command applies only to Linux, Windows and Mac.');
      return;
    }
    if (this.panelArray.length > 0) {
      for (const panel of this.panelArray) {
        panel.dispose();
      }
      this.panelArray.length = 0;
    }
    let filePath = Utility.rightClickPath(currentEdit);
    let workspacePath = Utility.getCjRootProjectPath();
    const isSuccess = await this.execfunc(Commands.CJPM_UPDATE, workspacePath);
    if (!isSuccess) {return;}
    const isBuildSuccess = await this.execfunc(Commands.CJPM_COVERAGE, workspacePath);
    if (!isBuildSuccess) {return;}
    const isRunSuccess = await this.execfunc(Commands.CJPM_RUN, workspacePath);
    if (!isRunSuccess) {return;}
    const isCjcovSuccess = await this.execfunc(Commands.CJCOV, workspacePath, filePath);
    if (!isCjcovSuccess) {return;}

    super.newPanel('cjcovWebview', 'index.html');
    this.panel.webview.html = CjcovWebview.html('./index.html');
    this.panelArray.push(this.panel);
    this.panel.webview.onDidReceiveMessage(message => {
      super.newPanel('cjcovhtml', message.path);
      this.panel.webview.html = CjcovWebview.html(message.path);
      this.panelArray.push(this.panel);
    });

    this.execfunc(Commands.CJPM_CLEAN, Utility.getCjRootProjectPath());
  }

  async execfunc(cmd: string, cwdPath?: string, filePath?: string): Promise<boolean> {
    const newCmd = filePath === undefined ? cmd : cmd + filePath;
    const exec = util.promisify(cp.exec);
    try {
      const { stdout } = await exec(Utility.getExecCmd(newCmd), { cwd: cwdPath, encoding: 'binary' });
      if (newCmd !== Commands.CJPM_RUN && newCmd !== Commands.CJPM_CLEAN) {
        OutputHelper.appendLine(stdout);
      }
      return true;
    } catch (error) {
      OutputHelper.appendLine(Utility.translateMessage(error.stderr));
      if (newCmd === Commands.CJPM_COVERAGE) {
        this.execfunc(Commands.CJPM_CLEAN, Utility.getCjRootProjectPath());
        return false;
      }
      return false;
    }
  }
}
