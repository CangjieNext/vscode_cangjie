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
import { Utility } from '../util/utils';
import { OutputHelper } from '../util/output-helper';
import { Commands } from './command';
import { CreateProjectUtils } from './create-project-utils';
import {expandWorkspacePlaceholders} from '../util/sdk-path-utils';
import {workspace} from 'vscode';

export class ViewController {
  private disposable: vscode.Disposable;

  constructor(readonly context: vscode.ExtensionContext) {
    this.disposable = vscode.Disposable.from(
      vscode.commands.registerCommand(Commands.CANGJIE_PROJECT_CREATE_VIEW, () => {
        if (process.platform !== 'linux' && process.platform !== 'win32' && process.platform !== 'darwin') {
          vscode.window.showInformationMessage('This command applies only to Linux, Windows and Mac.');
          return;
        }
        Utility.isExistSdk('cjpm').then((data: string) => {
          this.init(context.extensionPath, data);
        }).catch((error) => {
          OutputHelper.appendLine(error);
        });
      })
    );
  }

  dispose(): void {
    this.disposable.dispose();
  }

  async init(extensionPath: string, pathSdk: string): Promise<void> {
    if (Utility.checkIsValid(CreateProjectUtils.panel)) {
      const columnToShowIn = Utility.checkIsValid(vscode.window.activeTextEditor) ? vscode.window.activeTextEditor.viewColumn : undefined;
      CreateProjectUtils.panel.reveal(columnToShowIn);
      return;
    }
    CreateProjectUtils.panel = vscode.window.createWebviewPanel(
      'cangjieWebview',
      'CreateNewCangjieProject',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );
    CreateProjectUtils.panel.webview.onDidReceiveMessage((message) => {
      let curPathSdk = pathSdk;
      switch (message.command) {
        case 'selectPath':
          CreateProjectUtils.selectPath().then((projectDir) => {
            if (Utility.checkIsValid(projectDir)) {
              CreateProjectUtils.panel.webview.postMessage({ command: 'showPath', text: projectDir });
            }
          });
          return;
        case 'cancelSetting':
          CreateProjectUtils.closePanel();
          return;
        case 'finishSetting':
          if (message.compileBackend === 'CJNative') {
            curPathSdk = <string>vscode.workspace.getConfiguration('CangjieSdkPath').get('CJNativeBackend');
          } else {
            curPathSdk = <string>vscode.workspace.getConfiguration('CangjieSdkPath').get('CJVMBackend');
          }
          curPathSdk = expandWorkspacePlaceholders(curPathSdk, workspace.workspaceFolders?.[0]?.uri.fsPath);
          this.finishSetting(message, curPathSdk, CreateProjectUtils.panel);
          return;
        default:
          return;
      }
    });
    CreateProjectUtils.panel.onDidDispose(CreateProjectUtils.closePanel);
    const htmlPath = path.join(extensionPath, 'html', 'createProject.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    const createJsUri: vscode.Uri = CreateProjectUtils.panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(extensionPath, 'media', 'createProject', 'createSetting.js'))
    );
    const createCssUri: vscode.Uri = CreateProjectUtils.panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(extensionPath, 'media', 'createProject', 'createSetting.css'))
    );
    html = html.replace(/{{creat_js_uri}}/g, createJsUri.toString());
    html = html.replace(/{{creat_css_uri}}/g, createCssUri.toString());
    CreateProjectUtils.panel.webview.html = html;
  }

  /**
   * the basic settings of 'finish' and project create
   * @param message : get message from the webview component
   */
  finishSetting(message, pathSdk: string, panel: vscode.WebviewPanel): void {
    const basePathAllFoldersArr = Utility.getBasePathAllFolders(message.projectDir);
    if (basePathAllFoldersArr.includes(message.projectName)) {
      panel.webview.postMessage({ command: 'repeatsName', text: true });
      return;
    }
    Utility.isCreatedProject = true;
    Utility.outputType = message.outputType;
    CreateProjectUtils.createProject(message.outputType, message.projectDir, 
      message.projectName, pathSdk, message.compileBackend);
  }
}
