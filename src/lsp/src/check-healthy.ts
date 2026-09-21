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
  const feature = new CheckHealthyFeature(context);
  context.client.registerFeature(feature);
}

/**
 * 多文件夹工作区：为单个语言服务客户端注册 check-healthy feature。
 * 每个客户端独立监听 checkHealthy 通知；cangjie.lsp.stop 命令会停止全部客户端。
 */
export function activateForClient(client: any, context: ChangjieContext): void {
  const feature = new CheckHealthyFeature(context);
  client.registerFeature(feature);
}

class CheckHealthyFeature implements vscodelc.StaticFeature {
  private context: ChangjieContext;
  constructor(context: ChangjieContext) {
    this.context = context;
    context.client?.onNotification('textDocument/checkHealthy', (response) => {
      if (!Utility.checkIsValid(response.message)) {
        return;
      }
      let errMsg: string = response.message;
      const regex = /'(?<content>[^']*)'/g;
      let match: RegExpExecArray | null;
      const results: string[] = [];
      while ((match = regex.exec(errMsg)) != null) {
        if (match.groups?.content) {
          results.push(match.groups?.content);
        }
      }
      if (results.length === 3) {
        vscode.window.showErrorMessage(`Incompatible cjo file version! Package ${results[0]} is ${results[1]} but current sdk is ${results[2]}.`);
      } else {
        vscode.window.showErrorMessage(`Incompatible cjo file version! ${errMsg}`);
      }
      vscode.commands.executeCommand('cangjie.lsp.stop');
    });
  }

  fillInitializeParams(params: vscodelc.InitializeParams): void {}

  fillClientCapabilities(capabilities: vscodelc.ClientCapabilities): void {}

  initialize(capabilities: vscodelc.ServerCapabilities<any>, documentSelector: vscodelc.DocumentSelector): void {}

  getState(): vscodelc.FeatureState {
    return { kind: 'static' };
  }

  clear(): void {}
}