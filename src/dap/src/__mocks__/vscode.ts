/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import {
  scopeTypeSettingsName,
  stackTraceNumberSettingsName,
  variablesNumberSettingsName,
  threadNumberSettingsName,
  variablesLayerSettingsName,
  enableReverseDebugSettingsName,
  extensionId,
  reverseDebugSettingsPrefix
} from '../constants';
import {mockDapServer} from './mockDapServer';

const mockSettingsMap = new Map();
mockSettingsMap.set(reverseDebugSettingsPrefix + enableReverseDebugSettingsName, true);
mockSettingsMap.set(reverseDebugSettingsPrefix + threadNumberSettingsName, 1);
mockSettingsMap.set(reverseDebugSettingsPrefix + stackTraceNumberSettingsName, 0);
mockSettingsMap.set(reverseDebugSettingsPrefix + scopeTypeSettingsName, 9);
mockSettingsMap.set(reverseDebugSettingsPrefix + variablesLayerSettingsName, 1);
mockSettingsMap.set(reverseDebugSettingsPrefix + variablesNumberSettingsName, 100);
mockSettingsMap.set('CangjieSdkPathllvmBackend', 'cangjie');
mockSettingsMap.set('CangjieSdkPathcjvmBackend', 'cangjie');
mockSettingsMap.set('CangjieSdkPathCJNativeBackend', 'cangjie');
mockSettingsMap.set('CangjieSdkPathCJVMBackend', 'cangjie');

export let responseData: any;

export const extensions = {
  getExtension: jest.fn()
};

export const window = {
  createTerminal: jest.fn(),
  terminals: [] as any[],
  showErrorMessage: jest.fn(),
  showInformationMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showInputBox: jest.fn(),
  showQuickPick: jest.fn().mockImplementation((items: any[]) => {
    return items[1];
  }),
  showSaveDialog: jest.fn(),
  showOpenDialog: jest.fn(),
  onDidChangeWindowState: jest.fn(),
  onDidChangeTextEditorSelection: jest.fn(),
  onDidChangeTextEditorVisibleRanges: jest.fn(),
  onDidChangeActiveTextEditor: jest.fn(),
  onDidChangeTextEditorOptions: jest.fn(),
  onDidChangeTextEditorViewColumn: jest.fn(),
  activeTextEditor: {
    document: {
      fileName: 'main.cj'
    }
  },
  createOutputChannel: jest.fn(),
  registerWebviewViewProvider: jest.fn(),
  withProgress: (options: any, task: any, token: any) => {
    return Promise.resolve(0);
  }
};

export const Uri = {
  file: jest.fn(),
  parse: jest.fn(),
  joinPath: jest.fn(),
  from: jest.fn(),
  with: jest.fn(),
  toJSON: jest.fn(),
  scheme: '',
  authority: '',
  path: '',
  query: '',
  fragment: '',
  fsPath: __dirname,
};

export const workspace = {
  getConfiguration: (groupName: string) => {
    return {
      get: (settingName: string) => {
        return mockSettingsMap.get(groupName + settingName);
      },
      update: jest.fn(),
      inspect: jest.fn(),
    };
  },
  onDidChangeConfiguration: jest.fn(),
  workspaceFolders: [{uri: Uri}],
  onDidChangeWorkspaceFolders: jest.fn(),
  onDidCreateFiles: jest.fn(),
  onDidDeleteFiles: jest.fn(),
  onDidRenameFiles: jest.fn(),
  onDidSaveTextDocument: jest.fn(),
  getWorkspaceFolder: jest.fn(),
  saveAll: jest.fn(),
};

export const debug = {
  onDidTerminateDebugSession: jest.fn(),
  onDidReceiveDebugSessionCustomEvent: jest.fn(),
  startDebugging: jest.fn(),
  addBreakpoints: jest.fn(),
  removeBreakpoints: jest.fn(),
  activeDebugSession: {
    customRequest: (identity: any, args?: any) => {
      return Promise.resolve({});
    },
    configuration: {
      cangjieReverseDebug: {
        isCangjieReverseDebugMode: false
      },
    },
  },
  breakpoint: {
    create: jest.fn(),
  },
  DebugAdapterExecutable: jest.fn(),
  DebugAdapterServer: jest.fn(),
  DebugAdapterInlineImplementation: jest.fn(),
  DebugAdapterExecutableOptions: jest.fn(),
  DebugAdapterServerOptions: jest.fn(),
  DebugAdapterNamedPipeServerOptions: jest.fn(),
  DebugAdapterSocketServerOptions: jest.fn(),
  DebugAdapterDescriptor: jest.fn(),
  DebugAdapterInlineImplementationDescriptor: jest.fn(),
  DebugAdapterExecutableOptionsOrFactory: jest.fn(),
  DebugAdapterServerOptionsOrFactory: jest.fn(),
  DebugAdapterNamedPipeServerOptionsOrFactory: jest.fn(),
  DebugAdapterSocketServerOptionsOrFactory: jest.fn(),
  DebugAdapterExecutableFactory: jest.fn(),
  DebugAdapterServerFactory: jest.fn(),
  DebugAdapterNamedPipeServerFactory: jest.fn(),
  DebugAdapterSocketServerFactory: jest.fn(),
  DebugAdapterExecutableProvider: jest.fn(),
  DebugAdapterServerProvider: jest.fn(),
  DebugAdapterNamedPipeServerProvider: jest.fn(),
  DebugAdapterSocketServerProvider: jest.fn(),
  DebugConfigurationProvider: jest.fn(),
  DebugConfigurationProviderTriggerKind: jest.fn(),
  DebugSession: jest.fn().mockImplementation((config: any) => {
    return {
      customRequest: jest.fn(),
      getDebugProtocolBreakpoint: jest.fn(),
      configuration: config,
    };
  }),
  Breakpoint: jest.fn(),
  DebugAdapter: jest.fn(),
  DebugAdapterDescriptorFactory: jest.fn(),
  DebugAdapterDescriptorHandle: jest.fn(),
  registerDebugConfigurationProvider: jest.fn(),
  registerDebugAdapterTrackerFactory: jest.fn(),
  registerDebugAdapterDescriptorFactory: jest.fn(),
};

export const commands = {
  executeCommand: (args: any) => {
    return true;
  },
  registerCommand: jest.fn(),
  getCommands: (args: any) => {
    if (args === true) {
      return Promise.resolve(['cangjie.build.incrementWithDebug']);
    }
    return Promise.resolve([]);
  },
};

export const tasks = {
  registerTaskProvider: jest.fn(),
  executeTask: (task: Task) => {
    mockDapServer(task);
    return Promise.resolve({
      task: task,
      terminate: jest.fn(),
    });
  },
  onDidEndTaskProcess: jest.fn(),
  onDidEndTask: jest.fn(),
};

export const disposable = {
  from: jest.fn(),
  dispose: jest.fn(),
};
export const Memento = {
  keys: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
};

export const ExtensionContext = {
  extensionPath: __dirname,
  subscriptions: [disposable],
  workspaceState: Memento,
  globalState: {
    keys: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    setKeysForSync: jest.fn(),
  },
  secrets: {
    get: jest.fn(),
    store: jest.fn(),
    delete: jest.fn(),
    onDidChange: jest.fn(),
  },
  extensionUri: Uri,
  environmentVariableCollection: {
    persistent: false,
    description: '',
    replace: jest.fn(),
    append: jest.fn(),
    prepend: jest.fn(),
    get: jest.fn(),
    forEach: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    [Symbol.iterator]: jest.fn(),
},
  asAbsolutePath: jest.fn(),
  storageUri: Uri,
  storagePath: __dirname,
  globalStorageUri: Uri,
  globalStoragePath: __dirname,
  logUri: Uri,
  logPath: __dirname,
  extensionMode: 3,
  extension: {
    id: extensionId,
    extensionUri: Uri,
    extensionPath: __dirname,
    isActive: false,
    packageJSON: {},
    extensionKind: 1,
    exports: {},
    activate: jest.fn(),
  },
};

export const languages = {
  getLanguages: jest.fn(async () => ['cj', 'json',]),
  match: jest.fn(),
  registerCompletionItemProvider: jest.fn(),
};

export enum TaskScope {
  Global = 1,
  Workspace = 2
}

export enum TaskRevealKind {
  Always = 1,
  Silent = 2,
  Never = 3
}

export enum TaskPanelKind {
  Shared = 1,
  Dedicated = 2,
  New = 3
}

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15
}

export interface ShellQuotedString {
}

export interface ShellExecutionOptions {
}

export class ShellExecution {
  command: string | ShellQuotedString;
  args: (string | ShellQuotedString)[];

  constructor(command: string | ShellQuotedString, args: (string | ShellQuotedString)[],
    options?: ShellExecutionOptions) {
    this.command = command;
    this.args = args;
  }
}

export interface TaskDefinition {
  type: string;

  [name: string]: any;
}

export class ProcessExecution {

}

export class CustomExecution {

}

export interface WorkspaceFolder {
}

export class Task {
  definition: TaskDefinition;
  execution?: ProcessExecution | ShellExecution | CustomExecution;

  constructor(taskDefinition: TaskDefinition, scope: WorkspaceFolder | TaskScope.Global | TaskScope.Workspace,
    name: string, source: string, execution?: ProcessExecution | ShellExecution | CustomExecution,
    problemMatchers?: string | string[]) {
    this.definition = taskDefinition;
    this.execution = execution;
  }
}

export class Disposable {
  from(...disposableLikes: { dispose: () => any }[]): Disposable {
    return new Disposable(() => {
    });
  }

  constructor(callOnDispose: () => any) {
  }

  dispose(): any {
  }
}

export interface Event<T> {
  (listener: (e: T) => any, thisArgs?: any): Disposable;
}

export class EventEmitter<T> {
  event: Event<T>;

  fire(data: T): void {
    responseData = data;
  }

  dispose(): void {
  }
}

export class DebugAdapterInlineImplementation {
  constructor(implementation: any) {
  }
}

export const workspaceFolder = {
  uri: Uri,
  name: 'cangjieProject',
  index: 0,
};

export const ConfigurationTarget = {
  WorkspaceFolder: workspaceFolder
};

export const TextDocument = {
  uri: Uri,
  fileName: '',
  isUntitled: false,
  languageId: '',
  version: 20,
  isDirty: true,
  isClosed: false,
  eol: 2,
  lineCount: 21,
  save: jest.fn(),
  getText: jest.fn(),
  lineAt: jest.fn(),
  offsetAt: jest.fn(),
  positionAt: jest.fn(),
  getWordRangeAtPosition: jest.fn(),
  validateRange: jest.fn(),
  validatePosition: jest.fn(),
};

export class CompletionItem {
  constructor(label: any, kind?: any) {
  }
}

export class CompletionList<T extends CompletionItem = CompletionItem> {
  items: T[];

  constructor(items?: T[], isIncomplete?: boolean) {
    this.items = items;
  }
}

const taskDefinition = {
  type: 'type',
  name: 'task',
};

export const vscode = {
  // mock the vscode API which you use in your project. Jest will tell you which keys are missing.
  extensions,
  window,
  workspace,
  Uri,
  debug,
  commands,
  ExtensionContext,
  languages,
  tasks,
  CompletionItem: CompletionItem,
  CompletionList: CompletionList,
  Hover: jest.fn(),
  Location: jest.fn(),
  Range: jest.fn(),
  SymbolInformation: jest.fn(),
  CodeAction: jest.fn(),
  TextEdit: jest.fn(),
  FormattingOptions: jest.fn(),
  WorkspaceEdit: jest.fn(),
  Position: jest.fn(),
  SignatureHelp: jest.fn(),
  SignatureInformation: jest.fn(),
  ParameterInformation: jest.fn(),
  ReferenceContext: jest.fn(),
  ImplementationProvider: jest.fn(),
  TypeDefinitionProvider: jest.fn(),
  FoldingRange: jest.fn(),
  SelectionRange: jest.fn(),
  DocumentLink: jest.fn(),
  CallHierarchyItem: jest.fn(),
  CallHierarchyIncomingCall: jest.fn(),
  CallHierarchyOutgoingCall: jest.fn(),
  TypeHierarchyItem: jest.fn(),
  CodeLens: jest.fn(),
  Disposable,
  Task,
  TaskDefinition: taskDefinition,
  ShellExecution,
  TaskScope,
  TaskRevealKind,
  EventEmitter,
  DebugAdapterInlineImplementation,
  WorkspaceFolder: workspaceFolder,
  ConfigurationTarget,
  TextDocument,
  ProgressLocation,
};
