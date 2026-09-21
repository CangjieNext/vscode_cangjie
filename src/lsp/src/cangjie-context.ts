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
import { MAX_RESTART_COUNT, State, delay100, delay500 } from './utils/constantNums';
import * as serverStatus from './server-status';
import {
  CangjieProject,
  discoverWorkspaceProjects,
  getCachedProjects,
  onProjectsChanged,
  routeProject,
} from './utils/project-discovery';

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
    // Suppress crash recovery during intentional stop (dispose → client.stop)
    if (ChangjieContext.isStopping) {
      return;
    }
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
  // Flag to suppress crash recovery (handleConnectionClosed) during intentional stop
  public static isStopping = false;

  subscriptions: vscode.Disposable[] = [];
  client!: CangjieLanguageClient | null;
  traceOutput: vscode.OutputChannel;
  // 用于 semanticTokens 请求防抖的定时器
  private semanticTokensDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** 多文件夹工作区：每个仓颉工程一个语言服务客户端（key = 工程根目录绝对路径） */
  private clients = new Map<string, CangjieLanguageClient>();
  /** 当前工作区发现到的仓颉工程列表 */
  private projects: CangjieProject[] = [];

  get visibleClangdEditors(): vscode.TextEditor[] {
    return vscode.window.visibleTextEditors.filter((e) => isClangdDocument(e.document));
  }

  /** 是否处于多工程模式（≥2 个仓颉工程） */
  get isMultiProject(): boolean {
    return this.clients.size >= 2;
  }

  /**
   * 文档 -> 语言服务客户端 路由（最长前缀优先，嵌套工程取最内层）。
   * 单客户端/单文件模式直接返回该客户端；无命中返回 null。
   */
  getClientForDocument(document: vscode.TextDocument): CangjieLanguageClient | null {
    if (this.clients.size === 0) {
      return this.client;
    }
    const proj = routeProject(document.uri.fsPath, this.projects);
    if (!proj) {
      return this.client ?? (this.clients.values().next().value ?? null);
    }
    return this.clients.get(proj.root) ?? null;
  }

  /** 当前所有运行中的客户端（状态栏/调试聚合用） */
  getAllClients(): CangjieLanguageClient[] {
    return Array.from(this.clients.values());
  }

  /** 工程列表（状态提示用） */
  getProjects(): CangjieProject[] {
    return this.projects;
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

    // ---- 多文件夹工作区：发现全部仓颉工程，逐工程启动独立语言服务 ----
    const discovered = discoverWorkspaceProjects();
    if (discovered.length > 1) {
      outputChannel.appendLine(`[multi-folder] discovered ${discovered.length} Cangjie projects: ${discovered.map((p) => path.basename(p.root)).join(', ')}`);
      this.projects = discovered;
      await this.startMultiProjectClients(cangjieServerPath, lspArgs, context, outputChannel);
      // 工作区文件夹增删后重新发现（工程增删是低频操作，直接全量重启）
      this.subscriptions.push(
        onProjectsChanged((projects) => {
          if (JSON.stringify(projects.map((p) => p.root)) !== JSON.stringify(this.projects.map((p) => p.root))) {
            outputChannel.appendLine('[multi-folder] workspace folders changed, re-discovering projects...');
            void vscode.commands.executeCommand('cangjie.lsp.reLaunch');
          }
        }),
      );
      return;
    }

    // ---- 单工程 / 单文件：保持原单客户端行为 ----
    this.projects = discovered;

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

      // 监听文件重命名，强制 LSP Server 对改名后的文件重新分析并回推诊断
      this.registerFileRenameListener();

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

  /**
   * 多文件夹工作区：为每个仓颉工程创建独立语言服务客户端。
   * 路由隔离依赖：
   *  - documentSelector 的 GlobPattern 限定到该工程目录（含 workspace members），
   *    vscode-languageclient 的 isMatchedDocument 据此把 didOpen/didChange 只发给归属客户端；
   *  - server 进程 cwd = 工程根目录，LSPServer 按 cwd 定位 cjpm.toml（与原单工程行为一致）；
   *  - middleware 内显式 getClientForDocument 兜底（覆盖 definition 等直接 sendRequest 路径）。
   */
  private async startMultiProjectClients(
    cangjieServerPath: string,
    baseLspArgs: string[],
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel,
  ): Promise<void> {
    if (!fs.existsSync(cangjieServerPath)) {
      outputChannel.appendLine('[multi-folder] The Cangjie SDK path has not been configured properly. Please configure it first.');
    }
    if (!this.traceOutput) {
      this.traceOutput = vscode.window.createOutputChannel('Cangjie Language Server Trace');
      this.traceOutput.show();
    }
    serverStatus.activate(this);

    for (const proj of this.projects) {
      const name = path.basename(proj.root);
      const clientName = `Cangjie Language Server [${name}]`;
      // 文档过滤器：仅匹配本工程（root 或任一 member）下的文件
      const patterns = [proj.root, ...proj.memberDirs].map((d) => path.normalize(d).replace(/\\/g, '/'));
      const globPattern = patterns.join(',') + '/**/*';
      // 按该工程根独立构建 initializationOptions（multiModuleOption/targetLib 等不跨工程串号）
      const projectInitializationOptions = await this.buildProjectInitializationOptions(proj, context);
      const clientOptions: vscodelc.LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'Cangjie', pattern: globPattern }],
        progressOnInitialization: false, // 仅首实例显示进度，避免多个进度条
        outputChannelName: 'Cangjie Language Server Trace',
        stdioEncoding: 'utf8',
        initializationOptions: projectInitializationOptions,
        outputChannel: this.traceOutput,
        revealOutputChannelOn: vscodelc.RevealOutputChannelOn.Never,
        synchronize: {
          // 仅监听本工程目录内的文件变更（缩小范围，避免跨工程误通知）
          fileEvents: vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(proj.root, '**/*'),
            false,
            true,
            false,
          ),
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
      const client = new CangjieLanguageClient(
        clientName,
        clientName,
        {
          command: cangjieServerPath,
          args: baseLspArgs,
          options: { cwd: proj.root, env: ChangjieContext.env },
        } as vscodelc.Executable,
        clientOptions,
      );
      client.clientOptions.errorHandler = client.createDefaultErrorHandler(0);
      client.registerFeature(new EnableEditsNearCursorFeature());
      breakpoints.activateForClient(client, this);
      checkhealthy.activateForClient(client, this);
      this.clients.set(proj.root, client);
      outputChannel.appendLine(`[multi-folder] starting ${clientName} (cwd=${proj.root})`);
      try {
        await client.start();
        outputChannel.appendLine(`[multi-folder] ${clientName} running=${client.isRunning()}`);
      } catch (error) {
        outputChannel.appendLine(
          `[multi-folder] ${clientName} start failed: ${Utility.checkIsValid(error) ? (error as Error)?.message : error}`,
        );
      }
    }

    // 监听文本编辑，优先刷新当前编辑器，其他可见编辑器延迟刷新
    this.registerTextChangeListener();

    // 监听文件重命名，强制 LSP Server 对改名后的文件重新分析并回推诊断
    this.registerFileRenameListener();

    vscode.commands.executeCommand('cangjie.lsp.updateState', {
      state: State.Running,
      serverVersion: ChangjieContext.envInfo.serverVersion,
      isSdkServer: ChangjieContext.envInfo.isSdkServer,
    });
    Utility.serverRun = true;
  }

  /**
   * 为单工程构造 initializationOptions：走 Utility 的参数化管线
   * （multiModuleOption/条件编译/targetLib 等按该工程根计算），
   * 再附加多工程标识字段供 server 端区分。
   */
  private async buildProjectInitializationOptions(proj: CangjieProject, context: vscode.ExtensionContext): Promise<any> {
    // 每个工程独立重建模块状态，避免跨工程串号
    Utility.clearMultiModuleOption();
    Utility.clearConditionOption();
    const folderRoot = this.findFolderRoot(proj.root);
    const options = await Utility.buildInitializationOptions(proj.root, folderRoot ?? proj.root);
    const base = (options && typeof options === 'object' ? options : {}) as Record<string, unknown>;
    return {
      ...base,
      projectRoot: proj.root,
      projectCjpmToml: proj.cjpmToml,
      projectIsWorkspace: proj.isWorkspace,
      projectMemberDirs: proj.memberDirs,
      extensionPath: context.extensionPath,
    };
  }

  /** 工程根所在的工作区文件夹根（.vscode/cjpm_build_args.json 等按文件夹根取） */
  private findFolderRoot(projRoot: string): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      return undefined;
    }
    const p = projRoot.replace(/\\/g, '/');
    for (const f of folders) {
      const fr = f.uri.fsPath.replace(/\\/g, '/');
      if (p === fr || p.startsWith(fr + '/')) {
        return f.uri.fsPath;
      }
    }
    return undefined;
  }

  async dispose(): Promise<undefined> {
    vscode.commands.executeCommand('cangjie.lsp.updateState', { state: State.Stopped });
    this.subscriptions.forEach((d) => {
      d.dispose();
    });
    // 多工程模式：停止全部客户端
    ChangjieContext.isStopping = true;
    for (const client of this.clients.values()) {
      try {
        await client.stop();
      } catch (err) {
        // ignore err
      }
    }
    this.clients.clear();
    this.projects = [];
    if (!this.client) {
      ChangjieContext.isStopping = false;
      return undefined;
    }
    try {
      await this.client.stop();
    } catch (err) {
      // ignore err
    }
    this.client = null;
    this.subscriptions = [];
    ChangjieContext.isStopping = false;
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

  private registerFileRenameListener(): void {
    const renameListener = vscode.workspace.onDidRenameFiles((event) => {
      for (const rename of event.files) {
        const uri = rename.newUri;
        if (!uri.toString().endsWith('.cj')) {
          continue;
        }
        // 延迟等待改名后的文档完成 didOpen，避免与 didChange 竞争
        setTimeout(async () => {
          try {
            const editor = vscode.window.visibleTextEditors.find(
                e => e.document.uri.toString() === uri.toString() && this.isCangjieDocument(e.document),
            );
            if (!editor) {
              return;
            }
            const doc = editor.document;
            // 在第 0 行末尾插入/删除一个空格，规避文件尾换行语义的歧义
            const insertPos = new vscode.Position(0, doc.lineAt(0).text.length);
            const prevSelection = editor.selection;
            // 触发真实 didChange
            const inserted = await editor.edit(
                builder => builder.insert(insertPos, ' '),
                { undoStopBefore: true, undoStopAfter: false },
            );
            if (!inserted) {
              return;
            }
            const deleteRange = new vscode.Range(insertPos, new vscode.Position(0, insertPos.character + 1));
            await editor.edit(
                builder => builder.delete(deleteRange),
                { undoStopBefore: false, undoStopAfter: true },
            );
            editor.selection = prevSelection;
          } catch {
            // 忽略编辑过程中的异常，避免影响重命名流程
          }
        }, delay500);
      }
    });
    this.subscriptions.push(renameListener);
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

      // 清除之前的定时器，实现防抖
      if (this.semanticTokensDebounceTimer) {
        clearTimeout(this.semanticTokensDebounceTimer);
      }

      // 延迟发送，确保 didChange 先到达 LSP
      this.semanticTokensDebounceTimer = setTimeout(() => {
        for (const editor of vscode.window.visibleTextEditors) {
          // 过滤掉触发编辑的文件
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