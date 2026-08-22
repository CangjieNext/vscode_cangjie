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

interface CrossMessage {
  targetLanguage: string;
  functionName: string;
  functionParameters: string[];
  retType: string;
}

interface ExtendLocation extends vscodelc.Location {
  crossMessage: CrossMessage[];
}

const DefinitionRequestEnhance = {
  type: new vscodelc.RequestType<vscodelc.DefinitionParams, ExtendLocation | vscodelc.Definition | vscodelc.LocationLink[] | null, void>(
    'textDocument/definition',
  ),
};

let crossDefinitionCangjie2C = async function (
  result: ExtendLocation | vscodelc.Definition | vscodelc.LocationLink[],
  token: CancellationToken,
  message: CrossMessage,
): Promise<vscode.Definition | vscode.DefinitionLink[] | undefined> {
  const CppDirectory = vscode.workspace.getConfiguration('CrossLanguage').get('CppDirectory');
  if (CppDirectory === '') {
    vscode.window.showInformationMessage('Please enter the C++ source code directory first.');
    return cangjieContextInstance.client?.protocol2CodeConverter.asDefinitionResult(result, token);
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
      return cangjieContextInstance.client?.protocol2CodeConverter.asDefinitionResult(result, token);
    }
  } catch (error) {
    return cangjieContextInstance.client?.protocol2CodeConverter.asDefinitionResult(result, token);
  }
};

function cangjieDefinition(
  document: TextDocument,
  position: VPosition,
  token: CancellationToken,
): Promise<vscode.Definition | vscode.DefinitionLink[] | undefined | null> {
  return cangjieContextInstance.client
    ?.sendRequest(DefinitionRequestEnhance.type, cangjieContextInstance.client?.code2ProtocolConverter.asTextDocumentPositionParams(document, position), token)
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
        return cangjieContextInstance.client?.protocol2CodeConverter.asDefinitionResult(result, token);
      },
      (error) => {
        return cangjieContextInstance.client?.handleFailedRequest(DefinitionRequestEnhance.type, token, error, null);
      },
    );
}

export const definitionMidware = function (
  this: void,
  document: TextDocument,
  position: VPosition,
  token: CancellationToken,
  next: ProvideDefinitionSignature,
): ProviderResult<VDefinition | VDefinitionLink[]> {
  const provideDefinition = (
    innerDocument: TextDocument,
    innerPosition: VPosition,
    innerToken: CancellationToken,
  ): ProviderResult<VDefinition | VDefinitionLink[]> => {
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
