/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as vscode from 'vscode';
import { LibTreeDataProvider } from './lib-tree-data-provider';
import type { NodeData } from './explorer-node';

export class LibTreeView implements vscode.Disposable {
  static _instance: LibTreeView;

  treeViewInstance: LibTreeDataProvider;

  private _viewer: vscode.TreeView<NodeData>;

  constructor(context: vscode.ExtensionContext) {
    this.treeViewInstance = new LibTreeDataProvider(context);
    this._viewer = vscode.window.createTreeView('cangjieLibrary', {
      treeDataProvider: this.treeViewInstance,
      showCollapseAll: true,
    });
    context.subscriptions.push(this._viewer);

    // update tree view when add require info in cjpm.toml file
    context.subscriptions.push(
      this._viewer.onDidExpandElement((_e: vscode.TreeViewExpansionEvent<NodeData>) => {
        this.treeViewInstance.refresh(_e.element);
      })
    );
  }
  
  updateTreeView(mode: string, element: NodeData): void {
    switch (mode) {
      case 'add': {
        this.treeViewInstance.getChildren(element);
        this.treeViewInstance.refresh(element);
        break;
      }
      case 'delete': {
        this.treeViewInstance.getChildren(element?.parent);
        this.treeViewInstance.refresh(element?.parent);
        break;
      }
      default: {
        break;
      }
    }
  }

  dispose(): void {
    LibTreeView._instance = null;
    this.treeViewInstance = null;
  }
}
