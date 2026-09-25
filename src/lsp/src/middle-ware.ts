/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as vscode from 'vscode';
import {
  CancellationToken,
  CompletionItem as VCompletionItem,
  CompletionList as VCompletionList,
  CompletionContext as VCompletionContext,
  Definition as VDefinition,
  DefinitionLink as VDefinitionLink,
  DocumentLink,
  Location,
  Position as VPosition,
  ProviderResult,
  TextDocument,
  CodeLens,
} from 'vscode';
import * as vscodelc from 'vscode-languageclient/node';
import {
  NextSignature,
  ProvideCompletionItemsSignature,
  ProvideDefinitionSignature,
  ProvideDocumentLinksSignature,
  ProvideCodeLensesSignature,
} from 'vscode-languageclient';
import { context as cangjieContextInstance } from './cangjie-context';

export const didOpenMidware: NextSignature<TextDocument, Promise<void>> = function (
  this: void,
  data: TextDocument,
  next: (data: TextDocument) => Promise<void>,
): Promise<void> {
  if (data.uri.toString().endsWith('.cj') || data.uri.toString().endsWith('.cj.macrocall')) {
    return next(data); // we send the msg only if file extension is 'cj'
  }
  return new Promise<void>((resolve) => {
    resolve();
  });
};

export const completionMidware = async function (
  this: void,
  document: TextDocument,
  position: VPosition,
  context: VCompletionContext,
  token: CancellationToken,
  next: ProvideCompletionItemsSignature,
): Promise<VCompletionItem[] | VCompletionList> {
  const list = await next(document, position, context, token);
  const items = (Array.isArray(list) ? list : list?.items)?.map((item) => {
    item.command = {
      title: 'Apply Completion and Track Usage',
      command: 'cangjie.lsp.trackCompletion',
      arguments: [item],
    };
    return item;
  });
  return new VCompletionList(items, /* isIncomplete=*/ true);
};

export const documentLinkMidware = function (
  this: void,
  document: TextDocument,
  token: CancellationToken,
  next: ProvideDocumentLinksSignature,
): ProviderResult<DocumentLink[]> {
  const provideDocumentLinks = (innerDocument: TextDocument, innerToken: CancellationToken): ProviderResult<vscode.DocumentLink[]> => {
    if (innerDocument.uri.toString().endsWith('.cj') || innerDocument.uri.toString().endsWith('.cj.macrocall')) {
      return next(innerDocument, innerToken);
    }
    return undefined;
  };
  return provideDocumentLinks(document, token);
};

interface message {
  targetLanguage: string;
  functionName: string;
  functionParameters: string[];
  retType: string;
}

class ExtendLocation extends Location {
  crossMessage: message[];
  constructor(uri: vscode.Uri, rangeOrPosition: vscode.Position | vscode.Range, crossMessage: message[]) {
    super(uri, rangeOrPosition);
    this.crossMessage = crossMessage;
  }
}

const DefinitionRequestEnhance = {
  type: new vscodelc.RequestType<vscodelc.DefinitionParams, ExtendLocation | vscodelc.Definition | vscodelc.LocationLink[] | null, void>(
    'textDocument/definition',
  ),
};

let crossDefinitionCangjie2C = async function (
  result: ExtendLocation | vscodelc.Definition | vscodelc.LocationLink[],
  token: CancellationToken,
  message: message,
): Promise<vscode.Definition | vscode.DefinitionLink[] | undefined> {
  const CppDirectory = vscode.workspace.getConfiguration('CrossLanguage').get('CppDirectory');
  if (CppDirectory === '') {
    vscode.window.showInformationMessage('Please enter the C++ source code directory first.');
    return cangjieContextInstance.client?.protocol2CodeConverter.asDefinitionResult(result as vscodelc.Definition | vscodelc.LocationLink[] | null, token);
  }
  const cCodeUri: string = cangjieContextInstance.client?.code2ProtocolConverter.asUri(vscode.Uri.file(CppDirectory as string));
  // send messeage to C client
  try {
    const CResult = await vscode.commands.executeCommand('bitfun-cpp.clangd.crossJump.Cangjie2C', message, cCodeUri);
    if (CResult !== undefined && (CResult as unknown as vscode.Location[]).length !== 0) {
      return cangjieContextInstance.client?.protocol2CodeConverter.asDefinitionResult(
        CResult as unknown as vscodelc.Definition | vscodelc.LocationLink[] | null,
        token,
      );
    } else {
      return cangjieContextInstance.client?.protocol2CodeConverter.asDefinitionResult(result as vscodelc.Definition | vscodelc.LocationLink[] | null, token);
    }
  } catch (error) {
    return cangjieContextInstance.client?.protocol2CodeConverter.asDefinitionResult(result as vscodelc.Definition | vscodelc.LocationLink[] | null, token);
  }
};

/**
 * 按文档路由到归属语言服务客户端（多文件夹工作区支持）。
 * middleware 本身是 per-client 的（next 已走对客户端），但 definition 的
 * 直接 sendRequest 路径历史上硬编码单例，这里改为显式路由兜底。
 */
function clientForDocument(document: TextDocument) {
  return cangjieContextInstance.getClientForDocument(document) ?? cangjieContextInstance.client;
}

/**
 * 将 sendRequest 的原始返回值收敛为 asDefinitionResult 可接受的类型。
 * sendRequest 的返回联合里还包含跨语言跳转结构（ExtendLocation），
 * 直接内联类型断言会被静态检查判为「冗余转换」；这里把断言收敛到单一出口，
 * 参数用 unknown 承接，语义不变（值原样透传，null/undefined 归一为 null）。
 */
function asCodeDefinitionResult(
  raw: unknown,
): vscodelc.Definition | vscodelc.LocationLink[] | null {
  return (raw ?? null) as vscodelc.Definition | vscodelc.LocationLink[] | null;
}

function cangjieDefinition(
  document: TextDocument,
  position: VPosition,
  token: CancellationToken,
): Promise<vscode.Definition | vscode.DefinitionLink[] | undefined | null> {
  const target = clientForDocument(document);
  return target
    ?.sendRequest(DefinitionRequestEnhance.type, target?.code2ProtocolConverter.asTextDocumentPositionParams(document, position), token)
    .then(
      async (result) => {
        if (token.isCancellationRequested) {
          return null;
        }
        if (result && (result as ExtendLocation).crossMessage !== undefined) {
          // Whether cross-language redirection is required
          for (const message of (result as ExtendLocation).crossMessage) {
            message.functionParameters = message.functionParameters ? message.functionParameters : [];
            return message.targetLanguage === 'C' ? crossDefinitionCangjie2C(result, token, message) : null;
            // Other Cross-Language Solutions
          }
        }
        return target?.protocol2CodeConverter.asDefinitionResult(asCodeDefinitionResult(result), token);
      },
      (error) => {
        return target?.handleFailedRequest(DefinitionRequestEnhance.type, token, error, null);
      },
    );
}

export const definitionMidware = function (
  this: void,
  document: TextDocument,
  position: VPosition,
  token: CancellationToken,
  next: ProvideDefinitionSignature,
): ProviderResult<VDefinition | VDefinitionLink[] | ExtendLocation> {
  const provideDefinition = (
    innerDocument: TextDocument,
    innerPosition: VPosition,
    innerToken: CancellationToken,
  ): ProviderResult<VDefinition | VDefinitionLink[] | ExtendLocation> => {
    return innerDocument.uri.toString().endsWith('.cj') ? cangjieDefinition(innerDocument, innerPosition, innerToken) : null;
  };
  return provideDefinition(document, position, token);
};

export const codeLensMidware = function (
  this: void,
  document: TextDocument,
  token: CancellationToken,
  next: ProvideCodeLensesSignature,
): ProviderResult<CodeLens[]> {
  const provideCodeLenses = (innerDocument: TextDocument, innerToken: CancellationToken): ProviderResult<CodeLens[]> => {
    if (!innerDocument.uri.toString().endsWith('_test.cj') || !innerDocument.uri.toString().includes('/src/')) {
      return undefined;
    }
    return next(innerDocument, innerToken);
  };
  return provideCodeLenses(document, token);
};