/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import type {Extension, ExtensionContext, QuickPickItem} from 'vscode';
import * as vscode from 'vscode';
import {commands, Disposable, extensions, window} from 'vscode';
import {Commands} from './command';
import {Utility} from '../util/utils';
import {OutputHelper} from '../util/output-helper';
import type {
  CjCompileBackendMetadata,
  CjProjectTypeQuickPick,
  ProjectType
} from './project-controller-type';
import type {CjCompileBackendTypeQuickPick} from './project-controller-type';
import {
  CompileBackendType,
  compileBackendTypes,
  projectTypes
} from './project-controller-type';
import {CreateProjectUtils} from './create-project-utils';

export class ProjectController implements Disposable {
  private disposable: Disposable;

  constructor(readonly context: ExtensionContext) {
    this.disposable = Disposable.from(
      commands.registerCommand(Commands.CANGJIE_PROJECT_CREATE, () => {
        if (process.platform !== 'linux' && process.platform !== 'win32' && process.platform !== 'darwin') {
          window.showInformationMessage('This command applies only to Linux, Windows and Mac.');
          return;
        }
        Utility.isExistSdk('cjpm').then(() => {
          this.createCangjieProject();
        }).catch((error) => {
          OutputHelper.appendLine(error);
        });
      })
    );
  }

  dispose(): void {
    this.disposable.dispose();
  }

  async createCangjieProject(): Promise<void> {
    const items: CjCompileBackendTypeQuickPick[] = compileBackendTypes.map(toQuickPickItem);
    const choice = await window.showQuickPick(items, {
      ignoreFocusOut: true,
      placeHolder: 'Select the compile backend',
    });
    if (!Utility.checkIsValid(choice) || !(await ensureExtension(choice.label, choice.metadata))) {
      return;
    }
    const backendSetting = choice.metadata.type === CompileBackendType.CJVM ? 'CJVMBackend' : 'CJNativeBackend';
    const curPathSdk = vscode.workspace.getConfiguration('CangjieSdkPath').get<string>(backendSetting, '');
    if (!Utility.checkIsValid(curPathSdk)) {
      window.showErrorMessage(`The ${choice.metadata.type} SDK path has not been configured properly.`);
      return;
    }
    await chooseOutputType(choice.metadata.type, curPathSdk);
  }
}

async function chooseOutputType(compileBackend: CompileBackendType, pathSdk: string): Promise<void> {
  const items: CjProjectTypeQuickPick[] = projectTypes.map(toQuickPickItem);
  const choice = await window.showQuickPick(items, {
    ignoreFocusOut: true,
    placeHolder: 'Select the output type',
  });
  if (!Utility.checkIsValid(choice)) {
    return;
  }
  await createProject(choice.metadata.type, compileBackend, pathSdk);
}

function toQuickPickItem<T>(type: {
  displayName: string;
  description?: string;
  detail?: string;
  metadata: T & {extensionName: string};
}): QuickPickItem & {metadata: T} {
  return {
    label: type.displayName,
    description: type.description,
    detail: Utility.checkIsValid(type.metadata.extensionName) ?
      `Provided by $(extensions) ${type.metadata.extensionName}` : type.detail,
    metadata: type.metadata,
  };
}

async function ensureExtension(typeName: string, metaData: CjCompileBackendMetadata): Promise<boolean> {
  if (!Utility.checkIsValid(metaData.extensionId)) {
    return true;
  }

  const extension: Extension<unknown> | undefined = extensions.getExtension(metaData.extensionId);
  if (extension === undefined) {
    return false;
  }

  await extension.activate();
  return true;
}

async function createProject(productType: ProjectType, compileBackend: CompileBackendType, pathSdk: string): Promise<void> {
  let projectPath = await CreateProjectUtils.selectPath();
  const basePath: string = projectPath;
  const basePathAllFoldersArr = Utility.getBasePathAllFolders(basePath);
  const projectName: string | undefined = await window.showInputBox({
    prompt: 'Input a Cangjie project name.',
    ignoreFocusOut: true,
    validateInput: async (name: string): Promise<string> => {
      if (name === '' || (!name?.match(/^[^*~/\\]+$/))) {
        return 'Please input a valid project name.';
      }
      if (basePathAllFoldersArr.includes(name)) {
        return 'Repeats file name.';
      }
      return '';
    },
  });
  await CreateProjectUtils.createProject(productType, basePath, projectName, pathSdk, compileBackend);
}
