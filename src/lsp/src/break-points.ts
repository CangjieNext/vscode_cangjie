/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient/node';

import { ChangjieContext } from './cangjie-context';
import { Utility } from './utils/utils';

export function activate(context: ChangjieContext): void {
  const feature = new BreakpointsFeature(context);
  context.client?.registerFeature(feature);
}

/**
 * 多文件夹工作区：为单个语言服务客户端注册 breakpoints feature。
 * 命令只注册一次（BreakpointsFeature 构造时），breakpoint 请求按文档路由到归属客户端。
 */
export function activateForClient(client: vscodelc.LanguageClient, context: ChangjieContext): void {
  const feature = new BreakpointsFeature(context);
  client.registerFeature(feature);
}

export interface Breakpoints {
  breakpointLocation: vscode.Location[];
}

export interface BreakpointsParams {
  textDocument: vscodelc.TextDocumentIdentifier;
}

const BreakpointsRequest = {
  type: new vscodelc.RequestType<BreakpointsParams, Breakpoints, void>('textDocument/breakpoints'),
};

class BreakpointsFeature implements vscodelc.StaticFeature {
  preInitialize?: ((capabilities: vscodelc.ServerCapabilities, documentSelector: vscodelc.DocumentSelector | undefined) => void) | undefined;

  private context: ChangjieContext;

  constructor(context: ChangjieContext) {
    this.context = context;
    this.context.subscriptions.push(
      vscode.commands.registerCommand('cangjie.location.entryAndExit', async (uris: vscode.Uri[]) => {
        let results: vscode.Location[] = [];
        for (let uri of uris) {
          if (!uri.path.endsWith('.cj')) {
            continue;
          }
          const param: BreakpointsParams = {
            textDocument: { uri: uri.toString() },
          };
          let response = await this.context.client?.sendRequest(BreakpointsRequest.type, param);
          if (!Utility.checkIsValid(response?.breakpointLocation)) {
            continue;
          }
          response?.breakpointLocation.forEach((location) => {
            location.uri = vscode.Uri.file(uri.path.toString());
            results.push(location);
          });
        }
        return results;
      }),
    );
  }

  clear(): void {}

  fillClientCapabilities(capabilities: vscodelc.ClientCapabilities): void {}

  initialize(capabilities: vscodelc.ServerCapabilities<any>, documentSelector: vscodelc.DocumentSelector): void {
    vscode.commands.executeCommand('setContext', 'cangjie.location.entryAndExit.statue', 'breakpointsProvider' in capabilities);
  }

  getState(): vscodelc.FeatureState {
    return { kind: 'static' };
  }
}