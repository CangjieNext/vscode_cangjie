/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import type { RequiresTreeMessage } from '../util/message-data';

interface VsCodeApi {
  postMessage: (msg: Record<string, unknown>) => void;
  setState: (state: Record<string, unknown>) => void;
  getState: () => unknown;
}

interface WebviewWindow extends Window {
  acquireVsCodeApi: () => VsCodeApi;
}

declare const window: WebviewWindow;

const vsCodeApi = window.acquireVsCodeApi();

const element: { [key: string]: string } = {
  addDependenciesBtn: 'add_dependencies',
  addDevDependencies: 'add_dev_dependencies',
  addScriptDependencies: 'add_script_dependencies',
  addPackageBtn: 'add_package_option',
  addPackagePathBtn: 'add_path_option',
  addFFiBtn: 'add_ffi',
  dependencies: 'dependencies',
  devDependencies: 'dev-dependencies',
  scriptDependencies: 'script-dependencies',
  packageRequires: 'package-option',
  packagePathRequires: 'path-option',
  ffi: 'ffi',
};

const dependenciesKeyArray = ['version', 'path'];

const DEPENDENCIES = 'dependencies';
const DEV_DEPENDENCIES = 'dev-dependencies';
const SCRIPT_DEPENDENCIES = 'script-dependencies';

const PACKAGE_REQUIRES = 'package-requires';
const BIN_DEPENDENCIES = 'bin-dependencies';
const PATH_OPTION = 'path-option';
const PACKAGE_OPTION = 'package-option';

const FFI = 'ffi';
const C = 'c';
const JAVA = 'java';

class RequireTreeByUi {
  private requireCategory = ['dependencies', 'bin-dependencies', 'ffi', 'dev-dependencies', 'script-dependencies'];
  private delIconPath;

  constructor() {
    window.addEventListener('message', this.didReceivedMessage.bind(this));
    this.addEventToAddBotton();

    vsCodeApi.postMessage({
      command: 'initialRequireUI',
    });
  }

  private didReceivedMessage(e: MessageEvent): void {
    const message: RequiresTreeMessage = e.data;
    if (message.command === 'settedRequire') {
      if (message.uri !== null && message.uri !== undefined) {
        this.delIconPath = message.uri;
      }
      this.settedRequire(message);
    }
  }

  private addEventToAddBotton(): void {
    document.getElementById(element.addDependenciesBtn).addEventListener('click', this.openFileDialog.bind(this, element.dependencies));
    document.getElementById(element.addDevDependencies).addEventListener('click', this.openFileDialog.bind(this, element.devDependencies));
    document.getElementById(element.addScriptDependencies).addEventListener('click', this.openFileDialog.bind(this, element.scriptDependencies));
    document.getElementById(element.addPackageBtn).addEventListener('click', this.openFileDialog.bind(this, element.packageRequires));
    document.getElementById(element.addPackagePathBtn).addEventListener('click', this.openFileDialog.bind(this, element.packagePathRequires));
    document.getElementById(element.addFFiBtn).addEventListener('click', this.openFileDialog.bind(this, element.ffi));
  }

  // notify vscode to open file dialog
  private openFileDialog(requireType: string): void {
    vsCodeApi.postMessage({
      command: 'addRequire',
      requireType,
    });
  }

  private settedRequire(message: RequiresTreeMessage): void {
    const { requireType } = message;
    if (requireType === 'all') {
      for (let item of this.requireCategory) {
        if (item === FFI) {
          this.requiresLib(message.requireLibs[item]?.c, item);
        } else {
          this.requiresLib(message.requireLibs[item], item);
        }
      }
    } else {
      if (requireType === FFI) {
        this.requiresLib(message.requireLibs[C] || {}, requireType);
      } else {
        this.requiresLib(message.requireLibs, requireType);
      }
    }
  }

  private clearChildNodes(parentNode: HTMLElement): void {
    if (parentNode !== null && parentNode !== undefined && parentNode.childNodes.length > 0) {
      let child = parentNode.lastChild;
      while (child !== null && child !== undefined) {
        parentNode.removeChild(child);
        child = parentNode.lastChild;
      }
    }
  }

  private createHtmlFragment(type: string, parentNode: HTMLElement, keyNames: string[], content?: object | string[]): void {
    let curKeyNames = keyNames;
    if (curKeyNames === undefined) {
      curKeyNames = [];
    }
    for (let name of curKeyNames) {
      let singleRequire = document.createElement('tr');
      singleRequire.id = `${type}-main`;
      singleRequire.className = `${type}-title`;
      // require name
      let requireName = document.createElement('td');
      requireName.className = `${type}-field`;
      requireName.innerHTML = name;
      singleRequire.appendChild(requireName);

      if (typeof content?.[name] === 'string' && content[name] !== undefined && content[name] !== '') {
        let requireValue = document.createElement('td');
        requireValue.className = `${type}-field`;
        requireValue.innerHTML = content[name];
        singleRequire.appendChild(requireValue);
      }

      if ((content?.[name] !== null && content?.[name] !== undefined) && content[name] instanceof Object) {
        let objNames = Object.keys(content[name]);
        if (type === DEPENDENCIES || type === DEV_DEPENDENCIES || type === SCRIPT_DEPENDENCIES) {
          objNames = dependenciesKeyArray;
        }
        for (let field of objNames) {
          let requireInner = document.createElement('td');
          requireInner.className = `${type}-field`;
          requireInner.innerHTML = content[name][field] !== undefined ? content[name][field] : '';
          singleRequire.appendChild(requireInner);
        }
      }

      let iconTd = document.createElement('td');
      let delIcon = document.createElement('span');
      delIcon.id = 'del_path_option';
      delIcon.className = 'delIcon';
      delIcon.textContent = '✖';
      const tow = 2;
      delIcon.addEventListener('click', (event) => {
        const elementsArray = event['path'] || event.composedPath();
        vsCodeApi.postMessage({
          command: 'delRequire',
          requireType: type,
          requireName: elementsArray[tow].firstChild.innerHTML,
        });
      });
      iconTd.appendChild(delIcon);

      singleRequire.appendChild(iconTd);

      parentNode.appendChild(singleRequire);
    }
  }

  private requiresLib(content: object, type: string): void {
    if (content === null || content === undefined) {
      return;
    }
    if (type === BIN_DEPENDENCIES || type === PATH_OPTION || type === PACKAGE_OPTION) {
      let requiresPathparent = document.getElementById('path-option');
      this.clearChildNodes(requiresPathparent);
      this.createHtmlFragment('path-option', requiresPathparent, content[PATH_OPTION]);

      let requirePkgParent = document.getElementById(PACKAGE_OPTION);
      this.clearChildNodes(requirePkgParent);
      let packageName: string[] = [];
      if (content[PACKAGE_OPTION] !== null && content[PACKAGE_OPTION] !== undefined) {
        packageName = Object.keys(content[PACKAGE_OPTION]);
      }
      this.createHtmlFragment('package-option', requirePkgParent, packageName, content[PACKAGE_OPTION]);
    } else {
      let requiresparent = document.getElementById(type);
      // clear children
      this.clearChildNodes(requiresparent);
      const keys = Object.keys(content);
      this.createHtmlFragment(type, requiresparent, keys, content);
    }
  }
}

const tree: RequireTreeByUi = new RequireTreeByUi();
