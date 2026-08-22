/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as path from 'path';
import * as fs from 'fs';
import type { WebviewPanel } from 'vscode';
import { Uri, window, commands } from 'vscode';
import { OutputHelper} from '../util/output-helper';
import { Utility } from '../util/utils';
import { Commands } from './command';
import { exec } from 'child_process';
import { ProjectType } from './project-controller-type';

export class CreateProjectUtils {
  static panel: WebviewPanel;

  static selectPath(): Promise<string> {
    return new Promise((resolve) => {
      const workspaceFolder = Utility.getDefaultWorkspaceFolder();
      let workspaceFolderUp: Uri;
      if (Utility.checkIsValid(workspaceFolder)) {
        workspaceFolderUp = Uri.parse(
          path.resolve(workspaceFolder.uri.path, '..')
        );
        if (process.platform === 'win32') {
          workspaceFolderUp = Uri.file(
            path.resolve(workspaceFolder.uri.fsPath, '..')
          );
        }
      }
      let location: Uri[] | undefined;
      window.showOpenDialog({
        defaultUri: workspaceFolder && workspaceFolderUp,
        canSelectFiles: false,
        canSelectFolders: true,
        openLabel: 'Select the project location',
      }).then((data) => {
        location = data;
        let selectPath: string;
        if (!Utility.checkIsValid(location) || location.length === 0) {
          return;
        }
        if (process.platform === 'win32') {
          selectPath = location[0].fsPath;
        } else {
          selectPath = location[0].path;
        }
        resolve(selectPath);
      });
    });
  }

  /**
   * create cangjie project
   *
   * @param productType product Type
   * @param basePath create a local path.
   * @param projectName creat cangjie project name
   * @param pathSdk sdk path
   * @param compileBackend compile backend
   * @returns
   */
  static async createProject(
    productType: ProjectType,
    basePath,
    projectName,
    pathSdk,
    compileBackend
  ): Promise<void> {
    const projectRoot: string = path.join(basePath, projectName);
    // create file
    try {
      fs.mkdirSync(projectRoot);
      const option = { cwd: projectRoot };
      let cmdStr = Utility.getExecCmd(`cjpm init --name ${projectName}`, pathSdk);
      if (productType !== ProjectType.EXECUTABLE) {
        const srcPath = path.join(projectRoot, 'src');
        fs.mkdirSync(srcPath);
        fs.writeFileSync(path.join(srcPath, 'demo.cj'), `package ${projectName}\n\n// You can write Cangjie code here.`);
        cmdStr = Utility.getExecCmd(`cjpm init --type=${productType} --name ${projectName}`, pathSdk);
      }
      Utility.isCreatedProject = false;
      Utility.outputType = 'executable';
      // linux
      exec(cmdStr, option, async (error, stdout, stderr) => {
        if (Utility.checkIsValid(error)) {
          OutputHelper.appendLine(stderr);
          if (projectRoot.indexOf('..') < 0 && fs.existsSync(projectRoot)) {
            fs.rmdir(projectRoot, () => {});
          }
          window.showErrorMessage('Failed to create the file. Please try again');
          return;
        }
        if (!Utility.checkIsValid(stdout)) {
          return;
        }
        // open file
        try {
          await commands.executeCommand(Commands.VSCODE_OPEN_FOLDER, Uri.file(projectRoot), true);
          let settingsPath = path.join(projectRoot, '.vscode', 'settings.json');
          if (!fs.existsSync(path.join(projectRoot, '.vscode'))) {
            fs.mkdirSync(path.join(projectRoot, '.vscode'));
          }
          if (!fs.existsSync(settingsPath)) {
            fs.writeFileSync(settingsPath, '{}');
          }
          let settingsJson = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          settingsJson['CangjieSdk.Option'] = compileBackend;
          fs.writeFileSync(settingsPath, JSON.stringify(settingsJson, null, '\t'));
          this.closePanel();
          window.showInformationMessage('Created successfully');
        } catch (err) {
          window.showErrorMessage('Failed to open the file. Please open the file again');
          return;
        }
      });
    } catch (error) {
      window.showErrorMessage('Failed to create the file. Please try again');
      return;
    }
  }

  static closePanel(): void {
    if (Utility.checkIsValid(CreateProjectUtils.panel)) {
      CreateProjectUtils.panel.dispose();
      CreateProjectUtils.panel = undefined;
    }
  }
}
