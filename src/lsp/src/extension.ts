/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as vscode from 'vscode';
import {OutputChannel, Uri} from 'vscode';
import * as path from 'path';
import {delay500, fileExtension, LSP_SRC_PATH, State} from './utils/constantNums';
import {Utility} from './utils/utils';
import * as fs from 'fs';
import {ChangjieContext, context as cangjieContextInstance} from './cangjie-context';
import {TrackCompletionParams} from './track-completion';
import {registerUnusedSymbolCodeActionProvider} from './unused-symbol-codeaction-provider';
import {registerAddImportCodeActionProvider} from './add-import-codeaction-provider';

function registerCjpmTomlModifyWatcher(context: vscode.ExtensionContext, cangjieContext: ChangjieContext, outputChannel: OutputChannel): void {
  // Skip cjpm.toml monitoring in single file mode or when no workspace
  if (!vscode.workspace.workspaceFolders?.[0] || Utility.getIsSingleFileMode()) {
    return;
  }
  // 多文件夹工作区：对每个工作区文件夹分别建 watcher（原实现只监听第一个文件夹）
  for (const folder of vscode.workspace.workspaceFolders) {
    const multiCjpmWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '**/cjpm.toml'));
    context.subscriptions.push(
      multiCjpmWatcher.onDidChange(async (e) => {
        const allKeysUri = Utility.getAllKeys();
        const curModuleUri = path.dirname(e.toString());
        if (!allKeysUri.includes(curModuleUri)) {
          return;
        }
        const quickPickOptions: vscode.QuickPickOptions = {
          title: 'cjpm.toml is modified!',
          placeHolder: 'The cjpm.toml file has been modified, do you want to restart the LSPServer to active modifications?',
        };
        let fsWait = false;
        if (fsWait) {
          return;
        }
        fsWait = true;

        const select = await vscode.window.showQuickPick(['Yes', 'No'], quickPickOptions);
        if (select === 'Yes') {
          Utility.clearMultiModuleOption();
          await cangjieContext.dispose();
          await Utility.delay(delay500);
          const initializationOptions = await Utility.getInitializationOptions();
          await cangjieContext.activate(context.globalStoragePath, outputChannel, context.workspaceState, context, initializationOptions);
        }
        setTimeout(() => {
          fsWait = false;
        }, 100);
      }),
    );
  }
}

async function clearAndClangdActivate(cangjieContext: ChangjieContext, context: vscode.ExtensionContext, outputChannel: OutputChannel): Promise<void> {
  Utility.clearMultiModuleOption();
  await cangjieContext.dispose();
  Utility.delay(delay500);
  const initializationOptions = await Utility.getInitializationOptions();
  await cangjieContext.activate(context.globalStoragePath, outputChannel, context.workspaceState, context, initializationOptions);
}

function registerCjpmLockCreateWatcher(context: vscode.ExtensionContext, cangjieContext: ChangjieContext, outputChannel: OutputChannel): void {
  // Skip cjpm.lock monitoring in single file mode or when no workspace
  if (!vscode.workspace.workspaceFolders?.[0] || Utility.getIsSingleFileMode()) {
    return;
  }
  // 多文件夹工作区：对每个工作区文件夹分别建 watcher（原实现只监听第一个文件夹）
  for (const folder of vscode.workspace.workspaceFolders) {
    const moduleLockCreateWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '**/cjpm.lock'));
    context.subscriptions.push(
      moduleLockCreateWatcher.onDidCreate(async (e) => {
        if (!cangjieContext.getLspState()) {
          return;
        }
        await clearAndClangdActivate(cangjieContext, context, outputChannel);
      }),
    );

    const moduleLockChangeWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '**/cjpm.lock'));
    context.subscriptions.push(
      moduleLockChangeWatcher.onDidChange(async (e) => {
        if (!cangjieContext.getLspState()) {
          return;
        }
        await clearAndClangdActivate(cangjieContext, context, outputChannel);
      }),
    );
  }
}

function registerRestartLspServer(context: vscode.ExtensionContext, cangjieContext: ChangjieContext, outputChannel: OutputChannel): void {
  // run lsp server when server stop
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (event) => {
      if (!Utility.serverRun && event?.document?.fileName?.slice(fileExtension) === '.cj') {
        // Set file path in single file mode
        if (!vscode.workspace.workspaceFolders?.[0]) {
          Utility.setSingleFileMode(event.document.fileName);
        }
        const initializationOptions = await Utility.getInitializationOptions();
        cangjieContext.activate(context.globalStoragePath, outputChannel, context.workspaceState, context, initializationOptions);
      }
    }),
  );
}

function registerFeedbackAction(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cangjie.lsp.feedback', async () => {
      const configPath = path.join(context.extensionPath, 'config.json');
      if (!fs.existsSync(configPath)) {
        return;
      }
      const configContent = fs.readFileSync(configPath, 'utf8');
      const configJson = JSON.parse(configContent) || '';
      if (!('feedbackUrl' in configJson)) {
        return;
      }
      const feedbackUrl = configJson.feedbackUrl;

      // Validate URL protocol (only allow https)
      try {
        const url = new URL(feedbackUrl);
        if (url.protocol !== 'https:') {
          vscode.window.showErrorMessage('The feedback url must use the HTTPS protocol.');
          return;
        }

        // Domain whitelist validation
        const allowedDomains = ['gitcode.com'];
        if (!allowedDomains.includes(url.hostname)) {
          const confirm = await vscode.window.showWarningMessage(
            `You are about to open an external link: ${url.hostname}. Do you want to continue?`,
            { modal: true },
            'open',
            'cancel'
          );
          if (confirm !== 'open') {
            return;
          }
        }
        vscode.env.openExternal(vscode.Uri.parse(feedbackUrl));
      } catch (error) {
        vscode.window.showErrorMessage('Invalid feedback url');
      }
    }),
  );
}

function registerTrackCompletion(context: vscode.ExtensionContext, cangjieContext: ChangjieContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cangjie.lsp.trackCompletion', (item: vscode.CompletionItem) => {
      const params: TrackCompletionParams = {
        label: item.label,
      };
      // 多文件夹工作区：按当前活动编辑器文档路由到归属语言服务客户端
      const doc = vscode.window.activeTextEditor?.document;
      const target = (doc ? cangjieContext.getClientForDocument(doc) : null) ?? cangjieContext.client;
      target?.sendNotification('textDocument/trackCompletion', params);
    }),
  );
}

async function activateClangd(cangjieContext: ChangjieContext, context: vscode.ExtensionContext, outputChannel: OutputChannel): Promise<void> {
  const initializationOptions = await Utility.getInitializationOptions();
  await cangjieContext.activate(context.globalStoragePath, outputChannel, context.workspaceState, context, initializationOptions);
}

function registerConfigJsonReadCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cangjie.configJson.exists', (val) => {
      const configPath = path.join(context.extensionPath, 'config.json');
      if (!fs.existsSync(configPath)) {
        return false;
      }
      const configContent = fs.readFileSync(configPath, 'utf8');
      const configJson = JSON.parse(configContent) || '';
      if (val in configJson) {
        return true;
      }
      return false;
    }),
  );
}

function registerCustomRootCjpm(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cangjie.root.project', () => {
      vscode.window.showOpenDialog({
        defaultUri: vscode.workspace.workspaceFolders[0].uri,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: 'Choose project root cjpm.toml',
      }).then((cjpmTomlPath) => {
        if (cjpmTomlPath.length !== 1) {
          vscode.window.showWarningMessage('Please select the cjpm.toml file.');
          return;
        }
        const filePath = cjpmTomlPath[0].fsPath;
        if (!filePath.endsWith('cjpm.toml')) {
          vscode.window.showWarningMessage('Please select the cjpm.toml file.');
          return;
        }
        vscode.workspace.getConfiguration('Cangjie').update('Root.Cjpm.Path', filePath);
      });
    }),
  );
}

/**
 *  This method is called when the extension is activated. The extension is
 *  activated the very first time a command is executed.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('cangjie');
  context.subscriptions.push(outputChannel);

  const cangjieContext = cangjieContextInstance;
  context.subscriptions.push(cangjieContext);
  // Make sure refrence is not triggered at the definition
  vscode.workspace.getConfiguration('editor').update('gotoLocation.alternativeDeclarationCommand', 'editor.action.revealDefinition');
  vscode.workspace.getConfiguration('editor').update('gotoLocation.alternativeDefinitionCommand', 'editor.action.revealDefinition');
  vscode.workspace.getConfiguration('editor').update('gotoLocation.alternativeTypeDefinitionCommand', 'editor.action.revealDefinition');
  // We ban the vscode selectionHighlight feature so as not to cover original selection highlight
  vscode.workspace.getConfiguration('editor').update('selectionHighlight', false);
  // We enable autoSave and choose `onFocusChange` mode
  vscode.workspace.getConfiguration('files').update('autoSave', 'onFocusChange');
  // Enable complementing during snippet
  vscode.workspace.getConfiguration('editor').update('suggest.snippetsPreventQuickSuggestions', false);
  // Enables quickSuggestions in strings.
  vscode.workspace.getConfiguration('editor').update('quickSuggestions', {
    other: 'on',
    comments: 'off',
    strings: 'on',
  });
  registerFeedbackAction(context);
  registerConfigJsonReadCommand(context);

  // register create cangjie file
  registerCreateFile(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('cangjie.insert.templateContent', async (fileUri: vscode.Uri) => {
      await doWriteTemplateContent(fileUri);
    }),
  );
  // An empty place holder for the activate command, otherwise we'll get an
  // "command is not registered" error.
  context.subscriptions.push(vscode.commands.registerCommand('cangjie.activate', async () => {}));
  context.subscriptions.push(
    vscode.commands.registerCommand('cangjie.restart', async () => {
      await cangjieContext.dispose();
      await Utility.delay(delay500);
      await cangjieContext.activate(context.globalStoragePath, outputChannel, context.workspaceState, context);
    }),
  );

  registerLspAction(context, cangjieContext, outputChannel);
  vscode.window.showInformationMessage('Cangjie Language Server is now active!');
  await activateClangd(cangjieContext, context, outputChannel);
  registerCjpmTomlModifyWatcher(context, cangjieContext, outputChannel);
  registerCjpmLockCreateWatcher(context, cangjieContext, outputChannel);

  // run lsp server when server stop
  registerRestartLspServer(context, cangjieContext, outputChannel);
  // track the completion item usage
  registerTrackCompletion(context, cangjieContext);
  registerCustomRootCjpm(context);
  // register unused symbol code action provider for quick fix
  registerUnusedSymbolCodeActionProvider(context);
  // register add import code action provider for quick fix
  registerAddImportCodeActionProvider(context);
}

// Re-entrancy guard: prevents concurrent reLaunch calls from interfering
// (e.g., handleConnectionClosed triggering reLaunch while a manual reLaunch is in progress)
let reLaunchInProgress = false;

function registerLspAction(context: vscode.ExtensionContext, cangjieContext: ChangjieContext, outputChannel: vscode.OutputChannel): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cangjie.lsp.condition', async () => {
      Utility.conditionBuild(context, cangjieContext, outputChannel);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cangjie.lsp.reLaunch', async (isCrashReLaunch: boolean = false) => {
      if (reLaunchInProgress) {
        return;
      }
      reLaunchInProgress = true;
      try {
        Utility.clearMultiModuleOption();
        if (isCrashReLaunch) {
          cangjieContext.client = null;
          // 多文件夹工作区：逐个重置各工程客户端的重启计数
          for (const c of cangjieContext.getAllClients()) {
            c.resetRestartCount();
          }
        } else {
          cangjieContext.client?.resetRestartCount();
          for (const c of cangjieContext.getAllClients()) {
            c.resetRestartCount();
          }
        }
        await cangjieContext.dispose();
        await Utility.delay(delay500);
        const initializationOptions = await Utility.getInitializationOptions();
        await cangjieContext.activate(context.globalStoragePath, outputChannel, context.workspaceState, context, initializationOptions);
      } finally {
        reLaunchInProgress = false;
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cangjie.lsp.state', () => {
      return cangjieContext.getLspState();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cangjie.lsp.stop', () => {
      cangjieContext.stopLspServer();
      vscode.commands.executeCommand('cangjie.lsp.updateState', { state: State.Stopped });
    }),
  );
}

async function inputFileName(targetDir: string): Promise<string> {
  return vscode.window.showInputBox({
    placeHolder: 'Input the Cangjie file name, e.g.: demo',
    validateInput: async (input: string) => {
      if (!Utility.checkIsValid(input) || input.trim() === '') {
        return 'The file name cannot be empty.';
      }
      const tempFileName = input.endsWith('.cj') ? input : `${input}.cj`;
      const tempFileUri = vscode.Uri.file(path.join(targetDir, tempFileName));
      try {
        await vscode.workspace.fs.stat(tempFileUri);
        return `'${tempFileName}' already exists.`;
      } catch (e: any) {
        if (e.code === 'FileNotFound' || e.code === 'ENOENT') {
          return undefined;
        }
        return `Failed to check whether the file exists: ${e.message}`;
      }
    },
  });
}

function registerCreateFile(context: vscode.ExtensionContext): void {
  let fileDisposable = vscode.commands.registerCommand('cangjie.file.create', async (uri?: vscode.Uri) => {
    let targetDir: string | undefined;
    const pathPackageMap = processPathPackageMap(Utility.getAllInitializationOptions().multiModuleOption);
    if (uri?.fsPath) {
      const stat = await vscode.workspace.fs.stat(uri);
      targetDir = (stat.type === vscode.FileType.Directory) ? uri.fsPath : path.dirname(uri.fsPath);
    } else {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && activeEditor.document.uri.scheme === 'file') {
        targetDir = path.dirname(activeEditor.document.uri.fsPath);
        const sourceRoot = findMatchingSourceRoot(targetDir, pathPackageMap);
        if (!Utility.checkIsValid(sourceRoot)) {
          targetDir = '';
        }
      }
    }
    if (!Utility.checkIsValid(targetDir) || !fs.existsSync(targetDir)) {
      const folderUris = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
      });
      if (folderUris !== undefined && folderUris.length > 0) {
        targetDir = folderUris[0].fsPath;
      } else {
        return;
      }
    }
    if (!Utility.checkIsValid(targetDir) || !fs.existsSync(targetDir)) {
      vscode.window.showErrorMessage('Could not determine an effective target folder.');
      return;
    }
    const fileName = await inputFileName(targetDir);
    if (!Utility.checkIsValid(fileName)) {
      return;
    }
    await doCreateFile(fileName, targetDir, pathPackageMap);
  });
  context.subscriptions.push(fileDisposable);
}

async function doCreateFile(fileName: string, targetDir: string, pathPackageMap: Map<string, string>): Promise<void> {
  const finalFileName = fileName.endsWith('.cj') ? fileName : `${fileName}.cj`;
  const fileUri = vscode.Uri.file(path.join(targetDir, finalFileName));
  try {
    try {
      await vscode.workspace.fs.stat(fileUri);
      vscode.window.showErrorMessage(`The file '${finalFileName}' already exists.`);
      return;
    } catch (e) {
      // do nothing
    }
    await doWriteTemplateContent(fileUri, pathPackageMap);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to create the Cangjie file: ${error.message}`);
  }
}

async function doWriteTemplateContent(fileUri: vscode.Uri,
  pathPackageMapParam: Map<string, string> = null): Promise<void> {
  let pathPackageMap = pathPackageMapParam;
  if (pathPackageMap === null) {
    pathPackageMap = processPathPackageMap(Utility.getAllInitializationOptions().multiModuleOption);
  }
  const fsPath = fileUri.fsPath;
  const targetDir = path.dirname(fsPath);
  const sourcePath = findNearestParentPath(pathPackageMap, targetDir);
  let initialContent = Buffer.from('');
  if (Utility.checkIsValid(sourcePath)) {
    const rootPackage = pathPackageMap.get(sourcePath);
    const fullPackageTemplateContent = getFullPackageTemplate(rootPackage, sourcePath, targetDir);
    initialContent = Buffer.from(fullPackageTemplateContent, 'utf8');
  }
  await vscode.workspace.fs.writeFile(fileUri, initialContent);
  const document = await vscode.workspace.openTextDocument(fileUri);
  const editor = await vscode.window.showTextDocument(document);
  const lastLine = editor.document.lineCount - 1;
  const lastLineTextLength = editor.document.lineAt(lastLine).text.length;
  const position = new vscode.Position(lastLine, lastLineTextLength);
  editor.selection = new vscode.Selection(position, position);
}

function processPathPackageMap(multiModuleOption: unknown): Map<string, string> {
  const sourcePathPackageMap = new Map<string, string>();
  if (typeof multiModuleOption !== 'object' || multiModuleOption === null) {
    return sourcePathPackageMap;
  }
  for (const uriKey in multiModuleOption) {
    if (!Object.prototype.hasOwnProperty.call(multiModuleOption, uriKey)) {
      continue;
    }
    const pkg = multiModuleOption[uriKey];
    let srcPath = '';
    if (Object.prototype.hasOwnProperty.call(pkg, LSP_SRC_PATH)) {
      srcPath = pkg[LSP_SRC_PATH];
    }
    let rawPathKey: string;
    if (Utility.checkIsValid(srcPath)) {
      const srcUri = Uri.parse(srcPath);
      rawPathKey = srcUri.fsPath;
    } else {
      const originalUri = Uri.parse(uriKey);
      const originalFsPath = originalUri.fsPath;
      rawPathKey = path.join(originalFsPath, 'src');
    }
    sourcePathPackageMap.set(path.normalize(rawPathKey), pkg.name);
  }
  return sourcePathPackageMap;
}

function findNearestParentPath(sourcePathPackageMap: Map<string, string>, targetFilePath: string): string {
  let currentPath = path.normalize(targetFilePath);
  let previousPath: string | undefined;
  while (currentPath !== previousPath) {
    if (sourcePathPackageMap.has(currentPath)) {
      return currentPath;
    }
    previousPath = currentPath;
    currentPath = path.dirname(currentPath);
  }
  return '';
}

function getFullPackageTemplate(rootPackage: string, sourcePath: string, childPackagePath: string): string {
  const normalizedSourcePath = path.normalize(sourcePath).replace(/[\\/]$/, '');
  const normalizedChildPackagePath = path.normalize(childPackagePath).replace(/[\\/]$/, '');
  if (normalizedChildPackagePath !== normalizedSourcePath &&
    !normalizedChildPackagePath.startsWith(normalizedSourcePath + path.sep)) {
    return '';
  }
  const relativePath = path.relative(normalizedSourcePath, normalizedChildPackagePath);
  const childPackage = relativePath.replace(/\\|\//g, '.');
  if (childPackage === '') {
    return `package ${rootPackage}\n\n`;
  } else {
    return `package ${rootPackage}.${childPackage}\n\n`;
  }
}

function findMatchingSourceRoot(targetDir: string, pathPackageMap: Map<string, any>): string {
  const normalizedTargetDir = path.normalize(targetDir);
  for (const sourcePath of pathPackageMap.keys()) {
    const normalizedKey = path.normalize(sourcePath);
    if (normalizedTargetDir === normalizedKey) {
      return sourcePath;
    }
    if (normalizedTargetDir.startsWith(normalizedKey + path.sep)) {
      return sourcePath;
    }
  }
  return '';
}