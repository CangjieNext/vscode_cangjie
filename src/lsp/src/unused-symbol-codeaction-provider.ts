/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as vscode from 'vscode';

interface ServerTextEdit {
  range: vscode.Range;
  newText: string;
}

interface ServerCodeAction {
  title: string;
  kind?: string;
  edit?: {
    changes?: {
      [uri: string]: ServerTextEdit[];
    };
  };
}

interface LSPDiagnostic extends vscode.Diagnostic {
  data?: {
    codeActions?: ServerCodeAction[];
  };
}

const REMOVE_UNUSED_IMPORT_CMD = 'cangjie.removeUnusedImport';
const REMOVE_ALL_UNUSED_IMPORTS_CMD = 'cangjie.removeAllUnusedImports';

function isUnusedImportDiagnostic(diagnostic: vscode.Diagnostic): boolean {
  const lspDiagnostic = diagnostic as LSPDiagnostic;
  const title = lspDiagnostic.data?.codeActions?.[0]?.title || '';
  return /import/i.test(title);
}

function extractImportName(title: string): string {
  const match = title.match(/import\s+['"](?<importPath>[^'"]+)['"]/i);

  if (match?.groups?.importPath) {
    return match.groups.importPath;
  }

  return title
      .replace(/^.*import\s*/i, '')
      .replace(/['"]/g, '')
      .trim();
}

function getLocalizedButtons(): { ok: string; cancel: string } {
  const isZh = vscode.env.language.startsWith('zh');
  return {
    ok: isZh ? '确定' : 'OK',
    cancel: isZh ? '取消' : 'Cancel',
  };
}

async function cleanEmptyImportLines(uri: vscode.Uri): Promise<void> {
  const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
  if (!doc) {
    return;
  }

  // 1. 清理空的导入语句块（单行或多行）
  await removeEmptyImports(uri, doc);

  // 2. 清理连续的空行
  await mergeEmptyLines(uri, doc);
}

/**
 * 检测并移除空白的导入语句（单行如 `import a.{};` 或多行包裹的 `import a.{ ... }`）
 */
async function removeEmptyImports(uri: vscode.Uri, doc: vscode.TextDocument): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  const rangesToDelete: vscode.Range[] = [];

  // Step 1: 收集所有潜在的“空导入块”的起始行
  const potentialBlocks: number[] = [];
  for (let i = 0; i < doc.lineCount; i++) {
    const lineText = doc.lineAt(i).text;

    // 单行空导入（支持 import {} 和 import module.{}）
    if (/^\s*import\s+[\w.]*\.?\s*\{\s*\}\s*$/.test(lineText)) {
      potentialBlocks.push(i);
      continue;
    }

    // 多行空导入的开始（支持 import {} 和 import module.{}）
    const multiLineMatch = lineText.match(/^(?:\s*import\s+[\w.]*\.?)\s*\{\s*$/);
    if (multiLineMatch) {
      potentialBlocks.push(i);
    }
  }

  // Step 2: 处理每一个潜在块
  for (const startLine of potentialBlocks) {
    const lineText = doc.lineAt(startLine).text;

    // 情况 A: 单行空导入
    if (/^\s*import\s+[\w.]*\.?\s*\{\s*\}\s*$/.test(lineText)) {
      rangesToDelete.push(doc.lineAt(startLine).rangeIncludingLineBreak);
      continue;
    }

    // 情况 B: 多行空导入
    const closeBraceLine = findCloseBrace(doc, startLine);
    if (closeBraceLine === -1) {
      continue;
    }

    const hasContent = hasContentBetween(doc, startLine, closeBraceLine);
    if (!hasContent) {
      rangesToDelete.push(
          new vscode.Range(
              doc.lineAt(startLine).range.start,
              doc.lineAt(closeBraceLine).rangeIncludingLineBreak.end
          )
      );
    }
  }

  // 批量应用删除
  for (const range of rangesToDelete) {
    edit.delete(doc.uri, range);
  }

  if (edit.size > 0) {
    await vscode.workspace.applyEdit(edit);
  }
}

/**
 * 寻找多行导入的结束大括号行号
 */
function findCloseBrace(doc: vscode.TextDocument, startLine: number): number {
  for (let j = startLine + 1; j < doc.lineCount; j++) {
    const nextLine = doc.lineAt(j).text;
    // 检查是否结束 (单独的 } 或 },)
    if (/^\s*\}\s*$/.test(nextLine) || /^\s*\}\s*,?\s*$/.test(nextLine)) {
      return j;
    }
    if (nextLine.trim().length > 0 && !/^\s*$/.test(nextLine)) {
      break;
    }
  }
  return -1;
}

/**
 * 检查两行之间是否有实际内容
 */
function hasContentBetween(doc: vscode.TextDocument, startLine: number, endLine: number): boolean {
  for (let j = startLine + 1; j < endLine; j++) {
    const between = doc.lineAt(j).text.trim();
    if (between.length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * 合并连续的空行（保留一个）
 */
async function mergeEmptyLines(uri: vscode.Uri, doc: vscode.TextDocument): Promise<void> {
  const blankEdit = new vscode.WorkspaceEdit();
  let prevBlank = false;

  const updatedDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
  if (!updatedDoc) {
    return;
  }

  for (let i = 0; i < updatedDoc.lineCount; i++) {
    const isBlank = updatedDoc.lineAt(i).isEmptyOrWhitespace;

    if (isBlank && prevBlank) {
      // 如果当前是空行且上一行也是空行，标记删除当前行
      blankEdit.delete(updatedDoc.uri, updatedDoc.lineAt(i).rangeIncludingLineBreak);
    } else {
      prevBlank = isBlank;
    }
  }

  if (blankEdit.size > 0) {
    await vscode.workspace.applyEdit(blankEdit);
  }
}

export class UnusedSymbolCodeActionProvider implements vscode.CodeActionProvider {
  private static instance: UnusedSymbolCodeActionProvider;

  public static getInstance(): UnusedSymbolCodeActionProvider {
    if (!UnusedSymbolCodeActionProvider.instance) {
      UnusedSymbolCodeActionProvider.instance = new UnusedSymbolCodeActionProvider();
    }
    return UnusedSymbolCodeActionProvider.instance;
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];
    const unusedImportDiagnostics: vscode.Diagnostic[] = [];

    for (const diagnostic of context.diagnostics) {
      if (!diagnostic.tags?.includes(vscode.DiagnosticTag.Unnecessary)) {
        continue;
      }
      if (!diagnostic.range.intersection(range)) {
        continue;
      }

      if (isUnusedImportDiagnostic(diagnostic)) {
        unusedImportDiagnostics.push(diagnostic);
        const singleAction = this.createRemoveImportAction(document, diagnostic);
        if (singleAction) {
          actions.push(singleAction);
        }
      } else {
        const action = this.createRemoveAction(document, diagnostic);
        if (action) {
          actions.push(action);
        }
      }
    }

    const allDiagnostics = vscode.languages.getDiagnostics(document.uri);
    const allUnusedImportDiagnostics = allDiagnostics.filter(
      d => d.tags?.includes(vscode.DiagnosticTag.Unnecessary) && isUnusedImportDiagnostic(d)
    );

    if (unusedImportDiagnostics.length >= 1 && allUnusedImportDiagnostics.length >= 1) {
      const batchAction = this.createRemoveAllImportsAction(document, allUnusedImportDiagnostics);
      if (batchAction) {
        actions.push(batchAction);
      }
    }

    return actions;
  }

  private createRemoveImportAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction | null {
    const lspDiagnostic = diagnostic as LSPDiagnostic;
    const serverAction = lspDiagnostic.data?.codeActions?.[0];
    const title = serverAction?.title || 'Remove unused import';
    const workspaceEdit = this.createWorkspaceEdit(serverAction);
    const importName = extractImportName(title);

    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    action.command = {
      title,
      command: REMOVE_UNUSED_IMPORT_CMD,
      arguments: [document.uri, workspaceEdit, importName],
    };

    return action;
  }

  private createRemoveAllImportsAction(
    document: vscode.TextDocument,
    diagnostics: vscode.Diagnostic[]
  ): vscode.CodeAction | null {
    const mergedEdit = new vscode.WorkspaceEdit();

    for (const diagnostic of diagnostics) {
      const lspDiagnostic = diagnostic as LSPDiagnostic;
      const serverAction = lspDiagnostic.data?.codeActions?.[0];
      if (!serverAction?.edit?.changes) {
        continue;
      }
      for (const [uri, textEdits] of Object.entries(serverAction.edit.changes)) {
        for (const textEdit of textEdits) {
          mergedEdit.delete(vscode.Uri.parse(uri), textEdit.range);
        }
      }
    }

    if (mergedEdit.size === 0) {
      return null;
    }

    const action = new vscode.CodeAction(
      `Remove all unused imports`,
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = diagnostics;
    action.command = {
      title: `Remove all unused imports`,
      command: REMOVE_ALL_UNUSED_IMPORTS_CMD,
      arguments: [document.uri, mergedEdit],
    };

    return action;
  }

  private createRemoveAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction | null {
    const lspDiagnostic = diagnostic as LSPDiagnostic;
    const serverAction = lspDiagnostic.data?.codeActions?.[0];
    const title = serverAction?.title || 'Remove unused symbol';
    const edit = this.createWorkspaceEdit(serverAction);

    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    action.edit = edit;

    return action;
  }

  private createWorkspaceEdit(serverAction: ServerCodeAction | undefined): vscode.WorkspaceEdit | null {
    if (!serverAction?.edit?.changes) {
      return null;
    }

    const edit = new vscode.WorkspaceEdit();
    for (const [uri, textEdits] of Object.entries(serverAction.edit.changes)) {
      for (const textEdit of textEdits) {
        edit.delete(vscode.Uri.parse(uri), textEdit.range);
      }
    }
    return edit;
  }
}

export function registerUnusedSymbolCodeActionProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const provider = UnusedSymbolCodeActionProvider.getInstance();

  const removeSingleDisposable = vscode.commands.registerCommand(
    REMOVE_UNUSED_IMPORT_CMD,
    async (uri: vscode.Uri, edit: vscode.WorkspaceEdit, importName: string) => {
      const buttons = getLocalizedButtons();
      const confirm = await vscode.window.showWarningMessage(
        `Confirm delete ''import ${importName}''`,
        { modal: true, detail: `Removing this declaration may cause semantic changes:\n 1. It will result in skipping the initialization of the ''${importName}'' package and its dependencies.\n 2. If symbols are used by reflection, removing the reference may lead to runtime exceptions.\n Please exercise caution when removing these declarations.` },
        buttons.ok
      );
      if (confirm === buttons.ok) {
        await vscode.workspace.applyEdit(edit);
        await cleanEmptyImportLines(uri);
      }
    }
  );

  const removeAllDisposable = vscode.commands.registerCommand(
    REMOVE_ALL_UNUSED_IMPORTS_CMD,
    async (uri: vscode.Uri, edit: vscode.WorkspaceEdit) => {
      const buttons = getLocalizedButtons();
      const confirm = await vscode.window.showWarningMessage(
        `Confirm delete ''import unused imports''`,
        { modal: true, detail: `Removing this declaration may cause semantic changes:\n 1. It will result in skipping the initialization of the ''unused imports'' package and its dependencies.\n 2. If symbols are used by reflection, removing the reference may lead to runtime exceptions.\n Please exercise caution when removing these declarations.` },
        buttons.ok
      );
      if (confirm === buttons.ok) {
        await vscode.workspace.applyEdit(edit);
        await cleanEmptyImportLines(uri);
      }
    }
  );

  const providerDisposable = vscode.languages.registerCodeActionsProvider(
    { language: 'Cangjie', scheme: 'file' },
    provider,
    {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }
  );

  context.subscriptions.push(removeSingleDisposable, removeAllDisposable);

  return vscode.Disposable.from(providerDisposable, removeSingleDisposable, removeAllDisposable);
}