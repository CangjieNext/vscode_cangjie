/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import type { CjpmBuildArgs } from '../util/cjpm-config-data';

export const PACKAGE = 'package';
export const NAME = 'name';
export const DESCRIPTION = 'description';
export const COMPILE_OPTION = 'compile-option';
export const OUTPUT_TYPE = 'output-type';
export const TARGET_DIR = 'target-dir';
export const LINK_OPTION = 'link-option';
export const PACKAGE_CONFIGURATION = 'package-configuration';
export const PROFILE = 'profile';
export const CUSTOMIZED_OPTION = 'customized-option';
export const EXPERIMENTAL = 'experimental';
export const FEATURE = 'feature';
export const FEATURES = 'features';
export const SOURCE_SET = 'source-set';
export const PRODUCT = 'product';

interface VsCodeApi {
  postMessage: (msg: Record<string, unknown>) => void;
  setState: (state: Record<string, unknown>) => void;
  getState: () => unknown;
}

interface WebviewWindow extends Window {
  acquireVsCodeApi: () => VsCodeApi;
}

declare const window: WebviewWindow;

interface CodeTemplateStruct {
  moduleJsonField: string;
  cfgValueType: string;
  outLayerName: string;
  inputMasterName: string;
  inputsElement: Array<HTMLInputElement | HTMLSelectElement>;
  inputsClassName: string[];
  settedInputValue: object;
  placeholder: string[];
  buttonMasterName: string;
  submitBtnName: string;
  deleteBtnName: string;
  oldValue: string[];
}

interface SelectOptsInfo {
  key: string;
  value: string;
}

interface ConditionOptionInfo {
  condition: string;
  configuration: string;
}

interface PkgConfigInfo {
  key: string;
  output_type: string;
  compile_option: string;
}

interface SinglePkgConditionInfo {
  packageName: string;
  condition: string;
  configuration: string;
}

const indexOfSubmitBtn: number = 2;
const fitstChild: number = 0;
const secondChild: number = 1;
const thirdChild: number = 2;

const elementId: { [key: string]: string } = {
  // Basic settings
  name: 'name',
  description: 'description',
  target_dir: 'target-dir',
  requires: 'requires',
  package_requires: 'package-requires',
  foreign_requires: 'foreign-requires',
  output_type: 'output-type',
  compile_option: 'compile-option',
  link_option: 'link-option',
  target: 'target',
  package_configuration: 'package-configuration',
  customized_option: 'customized-option',

  // checkbox settings
  debug: 'debug',
  verbose: 'verbose',
  coverage: 'coverage',
  codeCheck: 'codeCheck',
  alias: 'alias',
  cross: 'cross',
  job: 'job',
  features: 'features',
  increment: 'increment',
  crossbtn: 'crossCompile',
  crossOpts: 'crossOpts',
  pkgConfig: 'pkgConfig',
  pkgCfg: 'pkgCfg',
  cndCfg: 'cndCfg',
  cndConfig: 'cndConfig',
};

const pkgItem: CodeTemplateStruct = {
  moduleJsonField: 'package-configuration',
  cfgValueType: 'object',
  outLayerName: 'pkg-item',
  inputMasterName: 'pkg-input',
  inputsElement: [],
  inputsClassName: ['pkg-input-key', 'pkg-input-output-type', 'pkg-input-compile-option'],
  settedInputValue: {},
  placeholder: ['key', 'output-type', 'compile-option'],
  buttonMasterName: 'pkg-btn',
  submitBtnName: 'pkg-sub-btn',
  deleteBtnName: 'pkg-del-btn',
  oldValue: [undefined, undefined, undefined],
};

const singleCndItem: CodeTemplateStruct = {
  moduleJsonField: 'single-condition-option',
  cfgValueType: 'object',
  outLayerName: 'single-cnd-item',
  inputMasterName: 'single-cnd-input',
  inputsElement: [],
  inputsClassName: ['single-cnd-input-key', 'single-cnd-input-condition', 'single-cnd-input-configuration'],
  settedInputValue: {},
  placeholder: ['packageName', 'condition', 'configuration'],
  buttonMasterName: 'single-cnd-btn',
  submitBtnName: 'single-cnd-sub-btn',
  deleteBtnName: 'single-cnd-del-btn',
  oldValue: [undefined, undefined, undefined],
};

const crossItem: CodeTemplateStruct = {
  moduleJsonField: 'target',
  cfgValueType: 'string',
  outLayerName: 'cross-item',
  inputMasterName: 'input-main',
  inputsElement: [],
  inputsClassName: ['cross-input-key', 'cross-input-value'],
  settedInputValue: {},
  placeholder: ['key', 'value'],
  buttonMasterName: 'sub-btn',
  submitBtnName: 'add-sub-btn',
  deleteBtnName: 'can-sub-btn',
  oldValue: [undefined, undefined],
};

const cndItem: CodeTemplateStruct = {
  moduleJsonField: 'customized-option',
  cfgValueType: 'string',
  outLayerName: 'cnd-item',
  inputMasterName: 'cnd-input',
  inputsElement: [],
  inputsClassName: ['cnd-input-cnd', 'cnd-input-cfg'],
  settedInputValue: {},
  placeholder: ['condition', 'configuration'],
  buttonMasterName: 'cnd-btn',
  submitBtnName: 'cnd-sub-btn',
  deleteBtnName: 'cnd-del-btn',
  oldValue: [undefined, undefined],
};

const vsCodeApi = window.acquireVsCodeApi();

class SettingByUi {
  private updating: boolean = false;
  private chooseNum: string[] = ['null', 'executable', 'static', 'dynamic'];
  private featuresItems: Set<string> = new Set();

  constructor() {
    // webview
    window.addEventListener('message', this.onMessageReceived.bind(this));

    // Add event listeners to UI elements
    this.addEventsToInputValues();

    vsCodeApi.postMessage({
      command: 'initialized',
    });
  }

  private addEventsToInputValues(): void {
    const elements: NodeListOf<HTMLElement> = document.getElementsByName('inputValue');
    elements.forEach((el) => {
      el.addEventListener('change', this.onChanged.bind(this, el.id));
    });

    // Special case for checkbox elements
    document.getElementById(elementId.debug).addEventListener('change', this.onChangedCheckbox.bind(this, elementId.debug));
    document.getElementById(elementId.verbose).addEventListener('change', this.onChangedCheckbox.bind(this, elementId.verbose));
    document.getElementById(elementId.coverage).addEventListener('change', this.onChangedCheckbox.bind(this, elementId.coverage));
    document.getElementById(elementId.increment).addEventListener('change', this.onChangedCheckbox.bind(this, elementId.increment));
    document.getElementById(elementId.codeCheck).addEventListener('change', this.onChangedCheckbox.bind(this, elementId.codeCheck));
    document.getElementById(elementId.features).addEventListener('change', this.onChanged.bind(this, elementId.features));

    document.getElementById(elementId.crossbtn).addEventListener('click',
      this.addConfigByBtn.bind(this, elementId.crossOpts, JSON.parse(JSON.stringify(crossItem))));

    document.getElementById(elementId.pkgConfig).addEventListener('click',
      this.addConfigByBtn.bind(this, elementId.pkgCfg, JSON.parse(JSON.stringify(pkgItem))));

    document.getElementById(elementId.cndConfig).addEventListener('click',
      this.addConfigByBtn.bind(this, elementId.cndCfg, JSON.parse(JSON.stringify(cndItem))));
  }

  private onChangedCheckbox(id: string): void {
    if (this.updating) {
      return;
    }

    const el: HTMLInputElement = <HTMLInputElement>document.getElementById(id);
    vsCodeApi.postMessage({
      command: 'change',
      key: id,
      value: el.checked,
    });
  }

  private onChanged(id: string): void {
    if (this.updating) {
      return;
    }

    const el: HTMLInputElement = <HTMLInputElement>document.getElementById(id);
    vsCodeApi.postMessage({
      command: 'change',
      key: id,
      value: el.value,
    });
  }

  private onMessageReceived(e: MessageEvent): void {
    const { command, config } = e.data; // The json data that the extension sent
    if (config === null || config === undefined) {
      return;
    }
    switch (command) {
      case 'settedModuleJson':
        this.updateSettedModuleJson(config);
        break;
      case 'settedcjpmBuildArgs':
        this.updatedsettedcjpmBuildArgs(config);
        break;
      default:
        break;
    }
  }

  private addConfigByBtn(id: string, codeSnip: CodeTemplateStruct): void {
    let inputsEle = [];
    for (let i = 0; i < codeSnip.inputsClassName.length; i++) {
      inputsEle.push(document.createElement('input'));
    }
    codeSnip.inputsElement = inputsEle;
    codeSnip.settedInputValue = {};
    let template = this.getTemplate(true, codeSnip);
    const optEl = document.getElementById(id);
    optEl.appendChild(template);
  }

  private updateSettedModuleJson(config: unknown): void {
    this.updating = true;
    try {
      const packageObj = this.getTomlValueByTreeKeys([PACKAGE], config);
      // Basic settings
      if (packageObj !== undefined) {
        (<HTMLInputElement>document.getElementById(elementId.name)).value = this.convertStr(packageObj[NAME]);
        (<HTMLInputElement>document.getElementById(elementId.description)).value = this.convertStr(packageObj[DESCRIPTION]);
        (<HTMLInputElement>document.getElementById(elementId.target_dir)).value = this.convertStr(packageObj[TARGET_DIR]);
        (<HTMLInputElement>document.getElementById(elementId.output_type)).value = this.convertStr(packageObj[OUTPUT_TYPE]);
        (<HTMLInputElement>document.getElementById(elementId.compile_option)).value = this.convertStr(packageObj[COMPILE_OPTION]);
        (<HTMLInputElement>document.getElementById(elementId.link_option)).value = this.convertStr(packageObj[LINK_OPTION]);
      }
      // update cross_compile_configuration`s webview
      let opts = [];
      if (config[elementId.target] !== null && config[elementId.target] !== undefined) {
        opts = Object.keys(config[elementId.target]);
      }
      if (opts.length > 0) {
        const crossOpts = <HTMLDivElement>document.getElementById(elementId.crossOpts);
        for (let optElement of opts) {
          let crossInstance = JSON.parse(JSON.stringify(crossItem));
          let value = config[elementId.target][optElement][elementId.compile_option];
          let settedInfo: SelectOptsInfo = {
            key: '',
            value: '',
          };
          settedInfo.key = optElement;
          settedInfo.value = value;
          crossInstance.settedInputValue = settedInfo;
          let optItem = this.getTemplate(false, crossInstance);
          crossOpts.appendChild(optItem);
        }
      }
      // update selected info
      this.updateSelectedInfo(config);
      // update package_configuration
      this.updatePkgConfig(config);
      // update condition_option
      this.updateConditionOption(config);
    } finally {
      this.updating = false;
    }
  }

  private updateSelectedInfo(config: unknown): void {
    const profileValue = this.getTomlValueByTreeKeys([PROFILE], config);
    const featuresElement = document.getElementById('features') as HTMLSelectElement;
    this.featuresItems.clear();
    if (!this.checkIsValid(profileValue)) {
      featuresElement.disabled = true;
      this.doShowInlayInfo(featuresElement, 'Please set the experimental option to true in cjpm.toml.');
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(profileValue, EXPERIMENTAL)) {
      featuresElement.disabled = true;
      this.doShowInlayInfo(featuresElement, 'Please set the experimental option to true in cjpm.toml.');
      return;
    }
    const experimentalFlag = profileValue[EXPERIMENTAL];
    if (!this.checkIsValid(experimentalFlag)) {
      featuresElement.disabled = true;
      this.doShowInlayInfo(featuresElement, 'Please set the experimental option to true in cjpm.toml.');
      return;
    }
    const sourceSets = this.getTomlValueByTreeKeys([SOURCE_SET], config) as unknown[];
    if (!this.checkIsValid(sourceSets)) {
      return;
    }
    for (const soure of sourceSets) {
      const sourceFeatures = this.getTomlValueByTreeKeys([FEATURES], soure) as string[];
      if (!this.checkIsValid(sourceFeatures) || sourceFeatures.length === 0) {
        continue;
      }
      const value = sourceFeatures.join(', ');
      if (!this.checkIsValid(value)) {
        continue;
      }
      this.featuresItems.add(value);
    }
    this.featuresItems.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item;
      opt.textContent = item;
      featuresElement.appendChild(opt);
    });
  }

  private doShowInlayInfo(element: HTMLElement, info: string): void {
    const tipOption = document.createElement('option');
    tipOption.value = '';
    tipOption.textContent = info;
    tipOption.disabled = true;
    tipOption.selected = true;

    element.innerHTML = '';
    element.appendChild(tipOption);
    element.style.color = 'gray';
  }

  private updateConditionOption(config: unknown): void {
    let cndOpts = [];
    const profileObj = this.getTomlValueByTreeKeys([PROFILE], config);
    if (!this.checkIsValid(profileObj)) {
      return;
    }
    if (profileObj[elementId.customized_option] !== null && profileObj[elementId.customized_option] !== undefined) {
      cndOpts = Object.keys(profileObj[elementId.customized_option]);
    }
    if (cndOpts.length > 0) {
      const conditionOptsNode = <HTMLDivElement>document.getElementById(elementId.cndCfg);
      for (let optElement of cndOpts) {
        let cndInstance = JSON.parse(JSON.stringify(cndItem));
        let value = profileObj[elementId.customized_option][optElement];
        let settedInfo: ConditionOptionInfo = {
          condition: '',
          configuration: '',
        };
        settedInfo.condition = optElement;
        settedInfo.configuration = value;
        cndInstance.settedInputValue = settedInfo;
        let optItem = this.getTemplate(false, cndInstance);
        conditionOptsNode.appendChild(optItem);
      }
    }
  }

  private updatePkgConfig(config: unknown): void {
    let packageConfigurationObj = this.getTomlValueByTreeKeys([PACKAGE, PACKAGE_CONFIGURATION], config);
    if (packageConfigurationObj === undefined) {
      packageConfigurationObj = {};
      if (!Object.prototype.hasOwnProperty.call(config, PACKAGE)) {
        config[PACKAGE] = {};
      }
      config[PACKAGE][PACKAGE_CONFIGURATION] = packageConfigurationObj;
    }
    let pkgOpts = Object.keys(packageConfigurationObj);
    if (pkgOpts.length > 0) {
      const pkgCfgNodes = <HTMLDivElement>document.getElementById(elementId.pkgCfg);
      for (let optElement of pkgOpts) {
        let pkgInstance = JSON.parse(JSON.stringify(pkgItem));
        let value = packageConfigurationObj[optElement];
        let settedInfo = {
          key: '',
          'output-type': '',
          'compile-option': '',
        };
        settedInfo.key = optElement;
        settedInfo[OUTPUT_TYPE] = value[OUTPUT_TYPE];
        settedInfo[COMPILE_OPTION] = value[COMPILE_OPTION];
        pkgInstance.settedInputValue = settedInfo;
        let optItem = this.getTemplate(false, pkgInstance);
        pkgCfgNodes.appendChild(optItem);
      }
    }
  }

  // updated setted cjpmBuildArgs of UI
  private updatedsettedcjpmBuildArgs(config: CjpmBuildArgs): void {
    const cjpmBuildElements = Array.from(document.getElementsByClassName('cjpmBuildArg'));
    const aliasElement = document.getElementById('alias') as HTMLInputElement;
    const crossElement = document.getElementById('cross') as HTMLInputElement;
    const conditionElement = document.getElementById('condition') as HTMLInputElement;
    const jobElement = document.getElementById('job') as HTMLInputElement;
    const featuresElement = document.getElementById('features') as HTMLSelectElement;
    let cjpmBuildObj = {};
    cjpmBuildElements.forEach((element) => {
      cjpmBuildObj[element.id] = element;
    });
    Object.keys(config).forEach((item) => {
      if (config[item] === true) {
        cjpmBuildObj[item].checked = true;
      }
    });
    if (config.alias !== '') {
      aliasElement.value = config.alias;
    }
    if (config.cross !== '') {
      crossElement.value = config.cross;
    }
    if (config.condition !== '') {
      conditionElement.value = config.condition;
    }
    if (config.job !== '') {
      jobElement.value = config.job;
    }
    if (config.features !== '' && this.featuresItems.has(config.features)) {
      featuresElement.value = config.features;
    }
  }

  private getTemplate(show: boolean, snipInfo?: CodeTemplateStruct): HTMLDivElement {
    let curTime = new Date().getTime();
    let outLayer = document.createElement('div');
    outLayer.className = snipInfo.outLayerName;
    // input
    let inputAll = document.createElement('div');
    inputAll.className = snipInfo.inputMasterName;
    const inputNum = snipInfo.inputsClassName.length;
    let inputForKey = document.createElement('input');
    for (let i = 0; i < inputNum; i++) {
      i === 0 ? snipInfo.inputsElement.push(inputForKey) :
        snipInfo.inputsElement.push(document.createElement('input'));
      snipInfo.inputsElement[i].className = `${snipInfo.inputsClassName[i]} ${snipInfo.inputsClassName[i]}-${curTime}`;
      (snipInfo.inputsElement[i] as HTMLInputElement).placeholder = snipInfo.placeholder[i];
      (snipInfo.inputsElement[i] as HTMLInputElement).type = 'text';
      if (this.checkIsValid(snipInfo.settedInputValue[snipInfo.placeholder[i]])) {
        (snipInfo.inputsElement[i] as HTMLInputElement).value = snipInfo.settedInputValue[snipInfo.placeholder[i]];
        snipInfo.oldValue[i] = snipInfo.settedInputValue[snipInfo.placeholder[i]];
      }
      snipInfo.inputsElement[i].addEventListener('keydown', (event: Event) => {
        this.enterPost.bind(this, event, snipInfo, inputNum)();
      });
      if (snipInfo.placeholder[i] === 'packageName' && this.checkIsValid(snipInfo.inputsElement[i].value)) {
        snipInfo.inputsElement[i]['readOnly'] = true;
      }
      inputAll.appendChild(snipInfo.inputsElement[i]);
    }

    if (snipInfo.inputsClassName.includes('pkg-input-output-type')) {
      let settedValue = this.checkIsValid(snipInfo.settedInputValue['output-type']) ? snipInfo.settedInputValue['output-type'] : 'null';
      this.changeSelect(inputAll, snipInfo.inputsElement, settedValue);
    }

    // button
    let buttonAll = document.createElement('div');
    buttonAll.className = snipInfo.buttonMasterName;
    if (show) {
      let buttonSub = document.createElement('button');
      buttonSub.className = `${snipInfo.submitBtnName} ${snipInfo.submitBtnName}-${curTime}`;
      buttonSub.innerHTML = '&#x2714;';
      buttonSub.addEventListener('click', this.btnPost.bind(this, snipInfo, inputNum, buttonSub));
      buttonAll.appendChild(buttonSub);
    }

    let buttonCal = document.createElement('button');
    buttonCal.className = `${snipInfo.deleteBtnName} ${snipInfo.deleteBtnName}-${curTime}`;
    buttonCal.innerHTML = '&#xd7;';
    buttonCal.addEventListener('click', (event) => {
      this.delBtnPost.bind(this, event, snipInfo.moduleJsonField)();
    });
    buttonAll.appendChild(buttonCal);

    outLayer.appendChild(inputAll);
    outLayer.appendChild(buttonAll);
    return outLayer;
  }

  private addConfigPostBase(snipInfo: CodeTemplateStruct, inputNum: number, changgePgkName?: boolean): boolean {
    let postValue: string | object;
    if (snipInfo.cfgValueType === 'string') {
      postValue = snipInfo.inputsElement[inputNum - 1].value;
    }
    if (snipInfo.cfgValueType === 'object') {
      postValue = {};
      for (let j = 1; j < inputNum; j++) {
        postValue[snipInfo.placeholder[j]] = snipInfo.inputsElement[j].value.toString();
      }
    }
    let infoKey = snipInfo.inputsElement[0].value;
    if (this.checkIsValid(infoKey)) {
      vsCodeApi.postMessage({
        command: 'addConfig',
        field: snipInfo.moduleJsonField,
        key: infoKey,
        value: postValue,
        oldValue: snipInfo.oldValue,
      });
      let valueArr = typeof postValue === 'object' ? Object.values(postValue) : postValue;
      snipInfo.oldValue = [infoKey].concat(valueArr);
      return true;
    }
    this.postErrorInfo();
    return false;
  }

  private enterPost(event: Event, snipInfo: CodeTemplateStruct, inputNum: number): void {
    if (event instanceof KeyboardEvent && event.key === 'Enter') {
      let changePackageName: boolean = false;
      if (snipInfo.moduleJsonField === 'package-configuration' && event.target?.['placeholder'] === 'key' &&
        event.target['value'] !== snipInfo.oldValue[0]) {
        changePackageName = true;
      }
      let postResult = this.addConfigPostBase(snipInfo, inputNum, changePackageName);
      (event.target as HTMLInputElement).blur();
      if (snipInfo.placeholder[0] === 'packageName') {
        snipInfo.inputsElement[0]['readOnly'] = true;
      }
      // hide submit button if its exist
      if (postResult && event['path'][indexOfSubmitBtn].lastChild.firstChild.innerHTML === '\u2714') {
        event['path'][indexOfSubmitBtn].lastChild.firstChild.style.display = 'none';
      }
    }
  }

  private btnPost(snipInfo: CodeTemplateStruct, inputNum: number, btn: HTMLButtonElement): void {
    let postResult = this.addConfigPostBase(snipInfo, inputNum);
    if (btn.parentElement?.previousElementSibling?.firstChild?.['placeholder'] === 'packageName') {
      btn.parentElement.previousElementSibling.firstChild['readOnly'] = true;
    }
    // hide submit button if its exist
    if (postResult) {
      btn.style.display = 'none';
    }
  }

  private delBtnPost(event, field: string): void {
    // del the element
    const elementsArray = event['path'] || event.composedPath();
    elementsArray[indexOfSubmitBtn].remove();
    let delKey = elementsArray[indexOfSubmitBtn].firstChild.firstChild.value;
    if (field === 'package-configuration') {
      const pkgConfigCndNum = 6;
      let [, packageCnds] = elementsArray[pkgConfigCndNum].lastElementChild.children[0].children;
      let nodeCount = packageCnds.childElementCount;
      while (this.checkIsValid(nodeCount)) {
        let cndName = packageCnds.children[nodeCount - 1].children[0].children[1].value;
        let cndPkg = packageCnds.children[nodeCount - 1].children[0].children[0].value;
        if (cndPkg === delKey && this.checkIsValid(cndName)) {
          packageCnds.children[nodeCount - 1].remove();
        }
        nodeCount--;
      }
    }
    // notice module.json to delete relative opt
    vsCodeApi.postMessage({
      command: 'delConfig',
      field,
      key: delKey,
      singleCnd: elementsArray[indexOfSubmitBtn]?.firstChild?.childNodes?.[1].value,
    });
  }

  private changeSelect(parentNode: HTMLDivElement, elementArray: Array<HTMLInputElement | HTMLSelectElement>, value?: string): void {
    let selectTag = document.createElement('select');
    selectTag.name = 'selectType';
    selectTag.id = 'conditionType';
    this.appendSelectOptions(selectTag, value);
    selectTag.addEventListener('mousedown', () => {
      selectTag.innerHTML = '';
      this.appendSelectOptions(selectTag, value);
    });
    selectTag.addEventListener('change', () => {
      let postValue = {
        'output-type': selectTag.value,
        'compile-option': elementArray[thirdChild].value,
      };
      let infoKey = elementArray[fitstChild].value;
      if (this.checkIsValid(infoKey)) {
        vsCodeApi.postMessage({
          command: 'addConfig',
          field: 'package-configuration',
          key: infoKey,
          value: postValue,
        });
        return true;
      }
      this.postErrorInfo();
      return false;
    });
    let inputEle = parentNode.childNodes[secondChild];
    inputEle.replaceWith(selectTag);
    elementArray[secondChild] = selectTag;
  }

  private appendSelectOptions(selectTag: HTMLSelectElement, value?: string): void {
    this.chooseNum.forEach((item: string) => {
      let option = document.createElement('option');
      option.value = item;
      option.className = 'conditionSelectType';
      option.innerHTML = item;
      if (value === item) {
        option.selected = true;
      }
      selectTag.appendChild(option);
    });
  }

  private postErrorInfo(): void {
    vsCodeApi.postMessage({
      command: 'errorAdd',
      value: 'the first field is empty or undefined, please fill it first',
    });
  }

  private checkIsValid(val: unknown): boolean {
    if (val === null || val === undefined) {
      return false;
    }
    if (typeof val === 'boolean') {
      return val;
    }
    if (typeof val === 'string' && val === '') {
      return false;
    }
    if (typeof val === 'number' && val === 0) {
      return false;
    }
    return true;
  }

  private getTomlValueByTreeKeys(treeKeys: string[], tomlContentParam?: unknown,
    returnUndefined: boolean = true): unknown {
    if (!this.checkIsValid(treeKeys)) {
      return returnUndefined === true ? undefined : {};
    }
    if (!this.checkIsValid(tomlContentParam)) {
      return returnUndefined === true ? undefined : {};
    }
    return this.getValueByKeys(treeKeys, tomlContentParam, returnUndefined);
  }

  private getValueByKeys(keys: string[], obj: unknown, returnUndefined: boolean): unknown {
    if (!this.checkIsValid(obj)) {
      return returnUndefined === true ? undefined : {};
    }
    if (!this.checkIsValid(keys) || keys.length === 0) {
      return obj;
    }
    const key = keys.shift();
    if (Object.prototype.hasOwnProperty.call(obj, key) === false) {
      return returnUndefined === true ? undefined : {};
    }
    return this.getValueByKeys(keys, obj[key], returnUndefined);
  }

  private convertStr(str: unknown): string {
    return (str === undefined || str === null) ? '' : str as string;
  }
}

const app: SettingByUi = new SettingByUi();
