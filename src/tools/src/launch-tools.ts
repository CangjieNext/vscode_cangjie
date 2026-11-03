/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { UpdateSdk } from './sdkManager/update-sdk';
import { ProjectController } from './createProject/project-controller';
import { CjFormat } from './format/cj-format';
import { Utility } from './util/utils';
import { CjpmBuildCollection } from './buildProject/cjpm-build-collection';
import { ViewController } from './createProject/view-controller';
import { CjlintWebview } from './cjlint/cjlint-webview';
import { RequiresActionController } from './buildProject/require-action-controller';
import { LibTreeView } from './buildProject/require-lib-tree-view';
import { CjcovWebview } from './cjcov/cjcov-webview';
import { TerminalHelper } from './util/ternimal-helper';
import { CheckConfig } from './util/check-json';
import { CustomBuildTaskProvider } from './buildProject/build-task';
import * as fs from 'fs';
import { CjlintDiagnostic } from './cjlint/cjlint-dignostic';
import { CjlintOnSave } from './cjlint/cjlint-on-save';
import * as toml from './util/toml/toml-export';
import * as cp from 'child_process';
import * as os from 'os';
import { CjpmInstallCollection } from './buildProject/cjpm-install-collection';
import {SdkConfigurationView} from './sdkManager/sdk-configuration-view';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  if (!Utility.tomlRegister) {
    registerTomlUtil();
  }

  registerCangjieProjectContext(context);

  Utility.removeSdkAttributes();

  context.subscriptions.push(new ProjectController(context));
  // Visibility create project
  context.subscriptions.push(new ViewController(context));

  try {
    const moduleJson = path.join(Utility.getCjRootProjectPath(), 'module.json');
    if (fs.existsSync(moduleJson)) {
      cp.execSync(Utility.getExecCmd('cjpm check'), { cwd: Utility.getCjRootProjectPath() });
    }
  } catch (e) {
    // do nothing
  }

  // register formant
  registerCjFormant(context);

  // check json struct
  if (!CheckConfig.checkCjpmKey()) {
    return;
  }

  // set terminal cjpm env
  Utility.configTerminalcjpmEnv();

  // generate cjpmBuildArgs.json in .vscode folder
  Utility.gencjpmBuildArgsJSON();

  // set CJVM command
  if (Utility.getSdkOption() === 'CJVM') {
    vscode.commands.executeCommand('setContext', 'cangjieSdk.CJVM', true);
  }

  new CjpmBuildCollection(context);
  new CjpmInstallCollection(context);

  TerminalHelper.setContext(context);

  if (!Utility.checkIsValid(CjpmBuildCollection.requireConfigure)) {
    Utility.setTargetOs();
    RequiresActionController.instace = new RequiresActionController(context);
    CjpmBuildCollection.requireConfigure = RequiresActionController.instace;
  }
  context.subscriptions.push(RequiresActionController.instace);

  LibTreeView._instance = new LibTreeView(context);

  // register json watcher, to upload dependency view
  registerJsonWatcher(context);

  // listen sdk config
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      UpdateSdk.listenSdkPath(event);
      UpdateSdk.listenSdkOption(event);
      if (event.affectsConfiguration('Cangjie.CodeCheckOnSave') === true) {
        CjlintOnSave.mkdirCjlintIgnoreCfg();
      }
    })
  );

  // register codecheck
  registerCjlint(context);
  context.subscriptions.push(new CjcovWebview());

  // Visibility sdk configuration
  context.subscriptions.push(new SdkConfigurationView(context));
}

function registerCangjieProjectContext(context: vscode.ExtensionContext): void {
  const updateContext = (): Thenable<unknown> => vscode.commands.executeCommand(
    'setContext',
    'cangjie.isCangjieProject',
    Boolean(vscode.workspace.workspaceFolders?.length) && Utility.isCangjieProject()
  );

  updateContext();

  const cjpmWatcher = vscode.workspace.createFileSystemWatcher('**/cjpm.toml');
  context.subscriptions.push(
    cjpmWatcher,
    cjpmWatcher.onDidCreate(updateContext),
    cjpmWatcher.onDidDelete(updateContext),
    vscode.workspace.onDidChangeWorkspaceFolders(updateContext),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('Cangjie.Root.Cjpm.Path')) {
        updateContext();
      }
    })
  );
}

function registerJsonWatcher(context: vscode.ExtensionContext): void {
  const jsonWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], '*.json'));
  context.subscriptions.push(jsonWatcher);
  context.subscriptions.push(jsonWatcher.onDidCreate((e) => {
    if (vscode.workspace.workspaceFolders[0].uri.fsPath === path.dirname(e.fsPath)) {
      const cjpmContent = Utility.getTomlContent();
      if (!Utility.checkIsValid(cjpmContent)) {
        return;
      }
      if (CheckConfig.checkCjpmKey()) {
        LibTreeView._instance = new LibTreeView(context);
      }
    }
  }));
}

function registerCjFormant(context: vscode.ExtensionContext): void {
  // format file command
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.formatCj', async (currentEdit: vscode.Uri) => {
      CjFormat.formatFunc(currentEdit);
    })
  );

  // format folder command
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.formatCjFolder', async (currentEdit: vscode.Uri) => {
      CjFormat.formatFunc(currentEdit);
    })
  );

  vscode.tasks.registerTaskProvider('buildcangjie', new CustomBuildTaskProvider());
}

function registerCjlint(context: vscode.ExtensionContext): void {
  context.subscriptions.push(new CjlintWebview(context));

  context.subscriptions.push(
    vscode.commands.registerCommand('cangjie.codecheck.diagnostic', (result) => {
      if (!Utility.checkIsValid(CjlintDiagnostic._instance)) {
        CjlintDiagnostic._instance = new CjlintDiagnostic();
      }
      CjlintDiagnostic._instance.handleCjlintResult(result);
    })
  );

  CjlintOnSave.registerCodecheckOnSave();
}

export function registerTomlUtil(): void {
  Utility.tomlRegister = true;
  vscode.commands.registerCommand('cangjie.toml.parser', (filePath: string = '') => {
    return Utility.getTomlContent(filePath);
  });

  vscode.commands.registerCommand('cangjie.toml.stringify', (tomlContent: unknown) => {
    return toml.stringify(tomlContent);
  });
}

async function insertTemplateContent(fileStats: fs.Stats, filePath: string, uri: vscode.Uri): Promise<void> {
  if (fileStats.isFile() && filePath.endsWith('.cj')) {
    const fileContentBuffer = await vscode.workspace.fs.readFile(uri);
    const fileContent = fileContentBuffer.toString();
    if (fileContent.trim() === '') {
      await vscode.commands.executeCommand('cangjie.insert.templateContent', uri);
    }
  }
}

// On Windows, the maximum path length for a file is limited to 260 characters by default.
export function registerFileWatcher(context: vscode.ExtensionContext): void {
  const isWindows = os.platform() === 'win32';
  const MAX_PATH_LENGTH = 260;
  if (!isWindows) {
    context.subscriptions.push(vscode.workspace.onDidCreateFiles(async event => {
      for (const uri of event.files) {
        const filePath = uri.fsPath;
        const fileStats = fs.lstatSync(filePath);
        await insertTemplateContent(fileStats, filePath, uri);
      }
    }));
    return;
  }

  context.subscriptions.push(vscode.workspace.onDidCreateFiles(async event => {
    for (const uri of event.files) {
      const filePath = uri.fsPath;
      const fileStats = fs.lstatSync(filePath);
      if (filePath.length < MAX_PATH_LENGTH) {
        await insertTemplateContent(fileStats, filePath, uri);
        continue;
      }
      vscode.window.showErrorMessage('The name for the file or folder is too long. Please choose a different name.');
      if (fileStats.isDirectory()) {
        fs.rmdirSync(filePath);
      } else {
        vscode.workspace.fs.delete(uri, { useTrash: false });
      }
      break;
    }
  }));

  context.subscriptions.push(vscode.workspace.onDidRenameFiles(event => {
    for (const rename of event.files) {
      const newFilePath = rename.newUri.fsPath;
      if (newFilePath.length >= MAX_PATH_LENGTH) {
        vscode.window.showErrorMessage('The name for the file or folder is too long. Please choose a different name.');
        vscode.workspace.fs.rename(rename.newUri, rename.oldUri, { overwrite: true });
        break;
      }
      const fileStats = fs.lstatSync(newFilePath);
      if (!fileStats.isDirectory()) {
        continue;
      }
      if (!Utility.checkPathLength(newFilePath)) {
        vscode.window.showErrorMessage('The name for the file or folder is too long. Please choose a different name.');
        vscode.workspace.fs.rename(rename.newUri, rename.oldUri, { overwrite: true });
        break;
      }
    }
  }));
}

// this method is called when your extension is deactivated
export function deactivate(): void {}