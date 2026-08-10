/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient/node';
import * as path from 'path';
import * as os from 'os';
import * as config from './config';
import {
  didOpenMidware,
  completionMidware,
  documentLinkMidware,
  definitionMidware,
  codeLensMidware,
} from './middle-ware';
import { Utility } from './utils/utils';
import * as breakpoints from './break-points';
import * as checkhealthy from './check-healthy';
import * as fs from 'fs';
import { MAX_RESTART_COUNT, State, delay100 } from './utils/constantNums';
import * as serverStatus from './server-status';

export const cangjieDocumentSelector = [
  { scheme: 'file', language: 'c' },
  { scheme: 'file', language: 'cpp' },
  { scheme: 'file', language: 'cuda-cpp' },
  { scheme: 'file', language: 'objective-c' },
  { scheme: 'file', language: 'objective-cpp' },
];
export function isClangdDocument(document: vscode.TextDocument): number {
  return vscode.languages.match(cangjieDocumentSelector, document);
}

export interface EnvInfo {
  isSdkServer: boolean;
  sdkVersion: string;
  serverVersion: string;
  platform: string;
  arch: string;
}
let client: CangjieLanguageClient | null;

class CangjieLanguageClient extends vscodelc.LanguageClient {
  static restartCount = 0;
  handleFailedRequest<T>(type: vscodelc.MessageSignature, error: any, token: vscode.CancellationToken | undefined, defaultValue: T): T {
    if (error instanceof vscodelc.ResponseError && type.method === 'workspace/executeCommand') {
      vscode.window.showErrorMessage(error.message);
    }

    return super.handleFailedRequest(type, token, error, defaultValue);
  }

  error(message: string, data?: any, showNotification?: boolean | 'force'): void {
    if (showNotification === 'force') {
      return;
    }
    this.outputChannel.appendLine(`[Error - ${new Date().toLocaleTimeString()}] ${message}`);
    if (data !== null && data !== undefined) {
      this.outputChannel.appendLine(this.dataToString(data));
    }
  }

  handleCrashData(): void {}

  resetRestartCount(): void {
    CangjieLanguageClient.restartCount = 0;
  }

  protected async handleConnectionClosed(): Promise<void> {
    vscode.commands.executeCommand('cangjie.lsp.updateState', { state: State.Stopped });
    super.handleConnectionClosed();
    const telemetryOption = vscode.workspace.getConfiguration('CangjieLog').get('Telemetry');
    if (typeof telemetryOption === 'boolean' && telemetryOption) {
      Utility.handleErrorFile(ChangjieContext.envInfo);
    }
    await Utility.removeAstData();
    Utility.delay(delay100);
    if (CangjieLanguageClient.restartCount >= MAX_RESTART_COUNT) {
      this.error(`The Cangjie Language Server crashed ${MAX_RESTART_COUNT + 1} times in the last 3 minutes. The server will not be restarted.\n\n`);
      const configJsonExists = await vscode.commands.executeCommand('cangjie.configJson.exists', 'feedbackUrl');
      if (configJsonExists) {
        const goTo = await vscode.window.showErrorMessage(
          'The Cangjie Language Server crashed! You can report the issues on the community website.',
          'Go To Community Website',
        );
        if (goTo === 'Go To Community Website') {
          vscode.commands.executeCommand('cangjie.lsp.feedback');
        }
      }
      return;
    }
    CangjieLanguageClient.restartCount++;
    this.error(`The Cangjie Language Server crash, try to restart ${CangjieLanguageClient.restartCount} times.`);
    vscode.commands.executeCommand('cangjie.lsp.reLaunch', true);
  }

  private dataToString(data: any): string {
    if (data instanceof vscodelc.ResponseError) {
      const responseError = data;
      return `  Message: ${responseError.message}\n  Code: ${responseError.code} ${responseError.data ? `'\n'${responseError.data.toString()}` : ''}`;
    }
    if (data instanceof Error) {
      if (typeof data.stack === 'string') {
        return data.stack;
      }
      return data.message;
    }
    if (typeof data === 'string') {
      return data;
    }
    return data.toString();
  }
}

class EnableEditsNearCursorFeature implements vscodelc.StaticFeature {
  initialize(): void {}

  fillClientCapabilities(capabilities: vscodelc.ClientCapabilities): void {
    const extendedCompletionCapabilities: any = capabilities.textDocument?.completion;
    extendedCompletionCapabilities.editsNearCursor = true;
  }

  getState(): vscodelc.FeatureState {
    return { kind: 'static' };
  }

  clear(): void {}
}

let cangjieInitializationFailedHandler: (error: vscodelc.ResponseError<vscodelc.InitializeError> | Error | any) => boolean;
cangjieInitializationFailedHandler = function (error: vscodelc.ResponseError<vscodelc.InitializeError> | Error | any): boolean {
  if (Utility.checkIsValid(error) && 'message' in error) {
    if (client) {
      client.error(error.message);
    }
  }
  return false;
};

export class ChangjieContext implements vscode.Disposable {
  public static envInfo: EnvInfo = {} as EnvInfo;
  private static cwd: string;
  private static env: any;
  private static modulesHome: string;

  subscriptions: vscode.Disposable[] = [];
  client!: CangjieLanguageClient | null;
  traceOutput: vscode.OutputChannel;
  // 用于 semanticTokens 请求防抖的定时器
  private semanticTokensDebounceTimer: NodeJS.Timeout | null = null;

  get visibleClangdEditors(): vscode.TextEditor[] {
    return vscode.window.visibleTextEditors.filter((e) => isClangdDocument(e.document));
  }

  public static getDefaultServerPath(): string {
    const isWindows = os.platform() === 'win32';
    const execFile = isWindows ? 'LSPServer.exe' : 'LSPServer';
    // it was modify every time it was published default path: default path is the plugin install directory
    const sdkPath = Utility.getCangjieHome() || '';
    let serverPath = path.resolve(path.join(sdkPath, 'tools', 'bin', execFile));
    this.modulesHome = path.resolve(sdkPath);
    ChangjieContext.envInfo.isSdkServer = true;
    serverPath = serverPath.trim();
    return serverPath;
  }

  static getStdLibPath(): string {
    const sdkPath = Utility.getCangjieHome() || '';
    let stdLibPath = path.resolve(path.join(sdkPath, 'lib', 'src'));
    if (!fs.existsSync(stdLibPath)) {
      stdLibPath = path.join(ChangjieContext.cwd, 'lib');
    }
    return stdLibPath;
  }

  static async setEnv(cangjieServerPath: string): Promise<void> {
    const serverDir = path.dirname(cangjieServerPath);
    if (process.platform === 'linux') {
      ChangjieContext.env = await Utility.getLinuxNeedEnv(serverDir);
    } else if (process.platform === 'darwin') {
      ChangjieContext.env = await Utility.getMacNeedEnv(serverDir);
    } else {
      ChangjieContext.env = await Utility.getWindowsNeedEnv(serverDir);
    }
  }

  static async setEnvInfo(initializationOptions: any, context: vscode.ExtensionContext): Promise<void> {
    initializationOptions.modulesHomeOption = ChangjieContext.modulesHome;
    initializationOptions.stdLibPathOption = ChangjieContext.getStdLibPath();
    initializationOptions.telemetryOption = vscode.workspace.getConfiguration('CangjieLog').get('Telemetry');
    initializationOptions.extensionPath = context.extensionPath;
    ChangjieContext.envInfo.sdkVersion = await Utility.getSdkVersion();
    const extension = vscode.extensions.getExtension('IDE-Innovation-Lab.Cangjie');
    let extensionVersion: string = '';
    if (Utility.checkIsValid(extension) && Utility.checkIsValid(extension.packageJSON)) {
      extensionVersion = extension.packageJSON.version;
    }
    ChangjieContext.envInfo.serverVersion = ChangjieContext.envInfo.isSdkServer ? ChangjieContext.envInfo.sdkVersion : extensionVersion;
    ChangjieContext.envInfo.platform = process.platform;
    ChangjieContext.envInfo.arch = process.arch;
  }

  static getLSPArgs(mainDir: string, context: vscode.ExtensionContext): string[] {
    let lspArgs: string[] = [mainDir];
    if (vscode.workspace.getConfiguration('CangjieLog').get('Telemetry')) {
      lspArgs.push(...['-V', '--enable-log=true', `--log-path=${context.extensionPath}`]);
    } else {
      lspArgs.push('--enable-log=false');
    }
    let usrArgs: string[] = vscode.workspace.getConfiguration('CangjieLSPServer').get('Arguments') ?? [];
    lspArgs.push(...usrArgs);
    return lspArgs;
  }

  // echo cangjie runLSPServer
  async activate(
    globalStoragePath: string,
    outputChannel: vscode.OutputChannel,
    workspaceState: vscode.Memento,
    context: vscode.ExtensionContext,
    initializationOptions?: any,
  ): Promise<void> {
    let mainDir: string = 'src';
    ChangjieContext.cwd = context.extensionPath;
    const cangjieServerPath = ChangjieContext.getDefaultServerPath();
    await ChangjieContext.setEnv(cangjieServerPath);
    if (Utility.checkIsValid(initializationOptions)) {
      await ChangjieContext.setEnvInfo(initializationOptions, context);
    }
    
    let lspArgs = ChangjieContext.getLSPArgs(mainDir, context);

    // Get workspace folder path (supports single file mode)
    const workspaceFolder = Utility.getWorkspaceFolders();
    if (!workspaceFolder) {
      outputChannel.appendLine('Cannot determine workspace folder for LSP server. Please open a Cangjie file or workspace.');
      return;
    }

    const clangd: vscodelc.Executable = {
      command: cangjieServerPath,
      args: lspArgs,
      options: { cwd: workspaceFolder, env: ChangjieContext.env },
    };
    const traceFile = config.get<string>('trace');
    if (!!traceFile) {
      const trace = { CLANGD_TRACE: traceFile };
      clangd.options = { env: { ...process.env, ...trace } };
    }
    const serverOptions: vscodelc.ServerOptions = clangd;
    if (!this.traceOutput) {
      const traceOutputChannel = vscode.window.createOutputChannel('Cangjie Language Server Trace');
      this.traceOutput = traceOutputChannel;
    }
    const clientOptions: vscodelc.LanguageClientOptions = {
      // Register the server for c-family and cuda files.
      documentSelector: [{ scheme: 'file', language: 'Cangjie' }],
      progressOnInitialization: true,
      outputChannelName: 'Cangjie Language Server Trace',
      stdioEncoding: 'utf8',
      initializationOptions: initializationOptions ?? {
        clangdFileStatus: true,
        fallbackFlags: config.get<string[]>('fallbackFlags'),
      },
      outputChannel: this.traceOutput,
      // Do not switch to output window when clangd returns output.
      revealOutputChannelOn: vscodelc.RevealOutputChannelOn.Never,
      synchronize: {
        // Notify the server about file changes to '.client/src' files contained in the workspace
        fileEvents: vscode.workspace.createFileSystemWatcher('**/*', false, true, false),
      },
      initializationFailedHandler: cangjieInitializationFailedHandler,
      middleware: {
        didOpen: didOpenMidware,
        provideDocumentLinks: documentLinkMidware,
        provideDefinition: definitionMidware,
        provideCodeLenses: codeLensMidware,
        provideCompletionItem: completionMidware,
      },
    };
    if (!this.client) {
      this.client = new CangjieLanguageClient('Cangjie Language Server', 'Cangjie Language Server', serverOptions, clientOptions);
      this.client.clientOptions.errorHandler = this.client.createDefaultErrorHandler(
        // max restart count
        config.get<boolean>('restartAfterCrash') ? /* default*/ 0 : 0,
      );
      if (!fs.existsSync(cangjieServerPath)) {
        this.client.error('The Cangjie SDK path has not been configured properly. Please configure it first.');
      }
      this.client.registerFeature(new EnableEditsNearCursorFeature());
      serverStatus.activate(this);
      breakpoints.activate(this);
      checkhealthy.activate(this);

      // 监听文本编辑，优先刷新当前编辑器，其他可见编辑器延迟刷新
      this.registerTextChangeListener();

      vscode.commands.executeCommand('cangjie.lsp.updateState', {
        state: State.Stopped,
        serverVersion: ChangjieContext.envInfo.serverVersion,
        isSdkServer: ChangjieContext.envInfo.isSdkServer,
      });
    }
    client = this.client;
    // await create connetion.
    vscode.commands.executeCommand('cangjie.lsp.updateState', {
      state: State.Starting,
      serverVersion: ChangjieContext.envInfo.serverVersion,
      isSdkServer: ChangjieContext.envInfo.isSdkServer,
    });
    try {
      await this.client.start();
      if (this.client.isRunning()) {
        vscode.commands.executeCommand('cangjie.lsp.updateState', {
          state: State.Running,
          serverVersion: ChangjieContext.envInfo.serverVersion,
          isSdkServer: ChangjieContext.envInfo.isSdkServer,
        });
      }
      Utility.serverRun = true;
    } catch (error) {
      vscode.commands.executeCommand('cangjie.lsp.updateState', { state: State.Stopped });
      if (!Utility.checkIsValid(error)) {
        return;
      }
      this.client.error(error?.message ? error?.message : error);
    }
  }

  async dispose(): Promise<undefined> {
    vscode.commands.executeCommand('cangjie.lsp.updateState', { state: State.Stopped });
    this.subscriptions.forEach((d) => {
      d.dispose();
    });
    if (!this.client) {
      return undefined;
    }
    try {
      await this.client.stop();
    } catch (err) {
      // ignore err
    }
    this.client = null;
    this.subscriptions = [];
    return undefined;
  }

  getLspState(): boolean {
    return Utility.checkIsValid(this.client) && this.client.state === vscodelc.State.Running;
  }

  stopLspServer(): void {
    if (this.client) {
      this.client.dispose();
    }
  }

  // 发送 semanticTokens 请求到 LSP
  private requestSemanticTokens(document: vscode.TextDocument): void {
    if (!this.client) {
      return;
    }
    // 检查是否为 Cangjie 语言的文档
    const isCangjieDoc = vscode.languages.match({ scheme: 'file', language: 'Cangjie' }, document);
    if (!isCangjieDoc) {
      return;
    }
    this.client.sendRequest('textDocument/semanticTokens/full', {
      textDocument: this.client.code2ProtocolConverter.asTextDocumentIdentifier(document),
    });
  }

  // 判断是否为 Cangjie 文档
  private isCangjieDocument(document: vscode.TextDocument): boolean {
    return vscode.languages.match({ scheme: 'file', language: 'Cangjie' }, document) > 0;
  }

  // 监听文本变化，当发生编辑时，对其他打开的 Cangjie 编辑器发送 semanticTokens 请求
  // 添加延迟确保 didChange 先到达 LSP，过滤触发编辑的文件避免重复请求，使用防抖避免频繁触发
  private registerTextChangeListener(): void {
    const textChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
      // 过滤掉保存操作（保存不会产生 contentChanges）
      if (event.contentChanges.length === 0) {
        return;
      }

      const editedDocument = event.document;
      if (!this.isCangjieDocument(editedDocument)) {
        return;
      }

      const editedUri = editedDocument.uri.toString();

      // 清楚之前的定时器，实现防抖
      if (this.semanticTokensDebounceTimer) {
        clearTimeout(this.semanticTokensDebounceTimer);
      }

      // 延迟发送，确保 didChange 先到达 LSP
      this.semanticTokensDebounceTimer = setTimeout(() => {
        for ( const editor of vscode.window.visibleTextEditors) {
          // 过滤掉出发编辑的文件
          if (this.isCangjieDocument(editor.document) && editor.document.uri.toString() !== editedUri) {
            this.requestSemanticTokens(editor.document);
          }
        }
      }, 400);
    });
    this.subscriptions.push(textChangeListener);
  }
}

export const context = new ChangjieContext();