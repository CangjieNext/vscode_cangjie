/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import type {InputBoxOptions, QuickPickItem} from 'vscode';
import {window, QuickInputButtons} from 'vscode';
import {
  buildMagicNum,
  numOfcjpmTest,
  numOfModuleJson,
  delay10,
  delay100, PACKAGE_CONFIGURATION, PACKAGE, PROFILE, CUSTOMIZED_OPTION, WORKSPACE, TARGET, testMultiSteps
} from '../util/constant-num';
import {Utility} from '../util/utils';
import type {InputStep} from './multi-step-choose';
import {MultiStepChoose} from './multi-step-choose';
import * as os from 'os';
import type {CustomTomlTypes} from '../util/toml/toml-types';


export interface State {
  compileType: QuickPickItem | string;
  extraPickedParams: string;
  pickedParams: string[];
  curStep: number;
  specifiePath: string;
  testCommand: string;
}

export interface PickItemStruct extends QuickPickItem {
  label: string;
  target: string;
}

export interface PickTestItemStruct extends QuickPickItem {
  label: string;
  testItem: string;
  testCommand: string;
}

const pickTestItemsContent: PickTestItemStruct[] = [
  {label: 'Specify the test paths', testItem: 'paths', testCommand: ''},
  {label: 'Specify the test modules', testItem: 'modules', testCommand: '--module'},
];

let crossComopleOpts = [];
let conditionChooseOpts = [];

function getConditionOpts(moduleJson: CustomTomlTypes): boolean {
  let hasSinglePkgConditionOpt: boolean = false;
  let singlePackages = [];
  const packageConfigurations = Utility.getTomlValueByTreeKeys([PACKAGE, PACKAGE_CONFIGURATION], moduleJson);
  if (Utility.checkIsValid(packageConfigurations)) {
    singlePackages = Object.keys(packageConfigurations);
  }
  // condition_option of package_configuration field
  singlePackages.forEach((pkg) => {
    if (Object.prototype.hasOwnProperty.call(packageConfigurations[pkg], CUSTOMIZED_OPTION) === true) {
      const conditionOpts = packageConfigurations[pkg][CUSTOMIZED_OPTION];
      for (let singleCnd of Object.keys(conditionOpts)) {
        conditionChooseOpts.push(
          {label: singleCnd, target: singleCnd, description: `package ${pkg} ${conditionOpts[singleCnd]}`});
      }
    }
  });
  if (conditionChooseOpts.length > 0) {
    hasSinglePkgConditionOpt = true;
  }
  let conditionOpts = [];
  const customizedOptions = Utility.getTomlValueByTreeKeys([PROFILE, CUSTOMIZED_OPTION], moduleJson);
  if (Utility.checkIsValid(customizedOptions)) {
    conditionOpts = Object.keys(customizedOptions);
  }
  let singleSetted = conditionChooseOpts.reduce((item, cur) => {
    item.push(cur.label);
    return item;
  }, []);
  for (let cnd of conditionOpts) {
    if (singleSetted.includes(cnd)) {
      window.showWarningMessage(
        `There is conflict between ${CUSTOMIZED_OPTION} of ${PACKAGE_CONFIGURATION} and global ${CUSTOMIZED_OPTION}, please fix it first`);
      hasSinglePkgConditionOpt = false;
      conditionChooseOpts = [];
      return hasSinglePkgConditionOpt;
    }
    conditionChooseOpts.push({label: cnd, target: cnd, description: customizedOptions[cnd]});
  }
  if (conditionOpts.length > 0) {
    hasSinglePkgConditionOpt = true;
  }
  return hasSinglePkgConditionOpt;
}

async function getExtraParams(constructedParams: PickItemStruct[], isBuild = 'build'): Promise<QuickPickItem[]> {
  await new Promise((resolve) => {
    setTimeout(resolve, delay10);
  });
  const sdkOption = Utility.getSdkOption();
  const coverage = {label: `cjpm ${isBuild} --coverage`, target: '--coverage'};
  if (sdkOption === 'CJNative') {
    constructedParams.push(coverage);
  }
  conditionChooseOpts = [];
  crossComopleOpts = [];
  const tomlContent = Utility.getTomlContent();
  if (Utility.checkIsValid(tomlContent)) {
    const crossCompile = {label: `cjpm ${isBuild} --target=<name>`, target: '--target'};
    // is cross-compile-configuration setted
    if (Utility.checkIsValid(tomlContent[TARGET])) {
      crossComopleOpts = Object.keys(tomlContent[TARGET]);
    }
    if (crossComopleOpts.length > 0 && sdkOption !== 'CJVM') {
      constructedParams.push(crossCompile);
    }

    // is customized-option setted
    const condition = {label: `cjpm ${isBuild} --<customized-option>`, target: '--customizedOption'};
    if (getConditionOpts(tomlContent)) {
      constructedParams.push(condition);
    }
  }
  return constructedParams.map((items) => ({label: items.label, target: items.target, picked: true}));
}

async function enterCrsOpt(pick: MultiStepChoose, state: Partial<State>, title: string): Promise<unknown> {
  const crossIndex = state.pickedParams.indexOf('--target');
  const items = [];
  crossComopleOpts.forEach((cross) => {
    items.push({label: cross, target: cross});
  });
  const crsBuildArgs = await pick.showStepPick({
    title,
    placeholder: 'Choose a cross compile param for arg --target.',
    items,
    button: [QuickInputButtons.Back],
  });

  if (Utility.checkIsValid(crsBuildArgs)) {
    state.pickedParams[crossIndex] = `--target=${crsBuildArgs['label']}`;
    state.extraPickedParams = state.pickedParams.join(' ').trim();
  } else {
    // deal alias is an empty enter not cancel
    window.showErrorMessage('Cross-compiling with cjpm requires selecting a cross-compilation platform');
    return () => Promise.resolve();
  }

  if (state.pickedParams.includes('--customizedOption')) {
    await new Promise((resolve) => {
      setTimeout(resolve, delay10);
    });
    return (curPick: MultiStepChoose) => enterConditionOpt(curPick, state, title);
  }
  return () => Promise.resolve();
}

async function enterConditionOpt(pick: MultiStepChoose, state: Partial<State>, title: string): Promise<void> {
  const cndIndex = state.pickedParams.indexOf('--customizedOption');
  let chooseItem = conditionChooseOpts.slice(0);
  conditionChooseOpts = [];
  const buildCnd = await pick.showStepPick({
    title,
    placeholder: 'Choose one or more customized options for arg --<customized-option>.',
    items: chooseItem,
    button: [QuickInputButtons.Back],
    canPickMany: true,
  });
  if (Utility.checkIsValid(buildCnd)) {
    state.pickedParams[cndIndex] = `--${[...new Set(buildCnd as string[])].join(' --')}`;
    state.extraPickedParams = state.pickedParams.join(' ').trim();
  } else {
    // deal alias is an empty enter not cancel
    window.showErrorMessage('Customized compilation using cjpm need select the customized options');
  }
}

// Verifying Parameter Integrity
async function verifyParams(state: Partial<State>): Promise<void> {
  if (!Utility.checkIsValid(state.extraPickedParams)) {
    return;
  }
  if (state.extraPickedParams.includes('--target') && !state.extraPickedParams.includes('--target=')) {
    let conditionIndex = state.extraPickedParams.indexOf('--target');
    state.extraPickedParams = state.extraPickedParams.substring(0, conditionIndex - 1); // delete extra space
  }
}

async function enterJobs(pick: MultiStepChoose, partialState: Partial<State>, title: string): Promise<unknown> {
  let aliasIndex;
  for (let [index, param] of partialState.pickedParams.entries()) {
    if (Utility.checkIsValid(param.match(/-j/))) {
      aliasIndex = index;
      break;
    }
  }
  const cpus = os.cpus().length;
  const inputBoxOptions: InputBoxOptions = {
    prompt: `Input custom cpus. The support range is ' (0, ${cpus} * 2] '`,
    value: '',
    title,
    ignoreFocusOut: true,
  };
  let buildJobs = await pick.showEnterInput({
    inputBoxOptions,
    button: [QuickInputButtons.Back],
  });
  if (!Utility.checkIsValid(buildJobs)) {
    buildJobs = cpus.toString();
  }
  let numOfInput = parseFloat(<string>buildJobs);
  if (!isNaN(numOfInput)) {
    const maxMulti = 2;
    if (numOfInput > cpus * maxMulti || numOfInput <= 0) {
      window.showWarningMessage(
        `The input is outof support range ' (0, ${cpus} * 2] '. Will use operating system default cpus`);
      numOfInput = cpus;
    }
    partialState.pickedParams[aliasIndex] = `-j ${numOfInput}`;
    partialState.extraPickedParams = partialState.pickedParams.join(' ').trim();
  } else {
    // deal input is an empty enter not cancel
    window.showErrorMessage('Invaild input! The input should be number.');
    return () => Promise.resolve();
  }

  if (partialState.pickedParams.includes('--target')) {
    await Utility.delay(delay100);
    return (curPick: MultiStepChoose) => enterCrsOpt(curPick, partialState, title);
  }

  // choose -o --customizedOption no --target
  if (partialState.pickedParams.includes('--customizedOption')) {
    await Utility.delay(delay100);
    return (curPick: MultiStepChoose) => enterConditionOpt(curPick, partialState, title);
  }
  return () => Promise.resolve();
}

export async function multiParamsBuild(): Promise<string> {
  const pickItemsContent: PickItemStruct[] = [
    {label: 'cjpm build -V | --verbose', target: '-V'},
    {label: 'cjpm build -g', target: '-g'},
    {label: 'cjpm build -i | --incremental', target: '-i'},
    {label: 'cjpm build -l | --lint', target: '--lint'},
    {label: 'cjpm build -o <name> | --output=<name>', target: '-o'},
    {label: 'cjpm build -j <cpus> | --jobs=<cpus>', target: '-j'},
  ];
  const title: string = 'mutiple params build';
  const state = {} as Partial<State>;
  await MultiStepChoose.run(
    (pick) => <Thenable<void | InputStep>>pickExtraParams(pick, state, pickItemsContent, title));
  if (!Utility.checkIsValid(state) || state.extraPickedParams === void 0) {
    return '';
  }
  verifyParams(state);
  return `cjpm build ${state.extraPickedParams}`;
}

async function pickExtraParams(pick: MultiStepChoose,
  state: Partial<State>, pickItemsContent: PickItemStruct[], title: string): Promise<(curPick: MultiStepChoose) => Promise<unknown>> {
  const extraParams = await getExtraParams([...pickItemsContent]);
  const pickedParams = <string[]> await pick.showStepPick({
    title,
    step: state.curStep,
    totalSteps: buildMagicNum.mutilPickTotalSteps,
    placeholder: 'Pick one or more compilation parameters',
    items: extraParams,
    canPickMany: true,
  });
  state.pickedParams = pickedParams;
  if (pickedParams.includes('-o')) {
    return (curPick: MultiStepChoose) => enterAlias(curPick, state, title);
  }
  if (pickedParams.includes('-j')) {
    return (curPick: MultiStepChoose) => enterJobs(curPick, state, title);
  }
  // only choose target
  if (state.pickedParams.includes('--target')) {
    return (curPick: MultiStepChoose) => enterCrsOpt(curPick, state, title);
  }
  // only choose --customizedOption
  if (state.pickedParams.includes('--customizedOption')) {
    return (curPick: MultiStepChoose) => enterConditionOpt(curPick, state, title);
  }

  state.extraPickedParams = pickedParams.join(' ');
  return () => Promise.resolve();
}

async function enterAlias(pick: MultiStepChoose, state: Partial<State>, title: string): Promise<unknown> {
  let aliasIndex;
  for (let [index, param] of state.pickedParams.entries()) {
    if (Utility.checkIsValid(param.match(/-o/))) {
      aliasIndex = index;
      break;
    }
  }
  const inputBoxOptions: InputBoxOptions = {
    prompt: 'Input a custom output name for arg -o.',
    value: '',
    title,
    ignoreFocusOut: true,
  };
  const buildAlias = await pick.showEnterInput({
    inputBoxOptions,
    button: [QuickInputButtons.Back],
  });
  if (Utility.checkIsValid(buildAlias)) {
    state.pickedParams[aliasIndex] = `-o ${buildAlias}`;
    state.extraPickedParams = state.pickedParams.join(' ').trim();
  } else {
    // deal alias is an empty enter not cancel
    window.showErrorMessage('cjpm build arg -o need an alias');
    return () => Promise.resolve();
  }

  if (state.pickedParams.includes('-j')) {
    await Utility.delay(delay100);
    return (curPick: MultiStepChoose) => enterJobs(curPick, state, title);
  }

  if (state.pickedParams.includes('--target')) {
    await Utility.delay(delay100);
    return (curPick: MultiStepChoose) => enterCrsOpt(curPick, state, title);
  }

  // choose -o --customizedOption no --target
  if (state.pickedParams.includes('--customizedOption')) {
    await Utility.delay(delay100);
    return (curPick: MultiStepChoose) => enterConditionOpt(curPick, state, title);
  }
  return () => Promise.resolve();
}

export async function multiParamsTest(): Promise<string> {
  const pickItemsContent: PickItemStruct[] = [
    {label: 'cjpm test -V | --verbose', target: '-V'},
    {label: 'cjpm test --filter=<value>', target: '--filter'},
    {label: 'cjpm test --no-run', target: '--no-run'},
    {label: 'cjpm test --skip-build', target: '--skip-build'},
    {label: 'cjpm test -j <cpus> | --jobs=<cpus>', target: '-j'},
    {label: 'cjpm test -i | --incremental', target: '-i'},
  ];
  const title = 'multiple params Test';
  const state = {} as Partial<State>;
  await MultiStepChoose.run((pick) => <Thenable<void | InputStep>>specifyOneTest(pick, state, pickItemsContent, title));
  if (!Utility.checkIsValid(state)) {
    return '';
  }
  await verifyParams(state);
  let testParams = '';
  if (Utility.checkIsValid(state.specifiePath)) {
    testParams = Utility.checkIsValid(state.testCommand) ? ` ${state.testCommand} "${state.specifiePath}"` :
      ` ${state.specifiePath}`;
  }
  return `cjpm test${testParams} ${state.extraPickedParams}`;
}

async function specifyOneTest(pick: MultiStepChoose, state: Partial<State>, pickItemsContent: PickItemStruct[],
  title: string): Promise<unknown> {
  const tomlContent = Utility.getTomlContent();
  if (!Utility.checkIsValid(tomlContent)) {
    return '';
  }
  const tomlConfigError = (Object.prototype.hasOwnProperty.call(tomlContent, WORKSPACE) &&
      Object.prototype.hasOwnProperty.call(tomlContent, PACKAGE)) ||
    (!Object.prototype.hasOwnProperty.call(tomlContent, WORKSPACE) &&
      !Object.prototype.hasOwnProperty.call(tomlContent, PACKAGE));
  if (tomlConfigError) {
    window.showErrorMessage('Only one of workspace or package fields can exist at cjpm.toml.');
    return '';
  }
  const pickTestItems = [...pickTestItemsContent];
  if (Object.prototype.hasOwnProperty.call(tomlContent, WORKSPACE)) {
    pickTestItems.push({label: 'Specify a test member', testItem: 'member', testCommand: '--member'});
  }
  const pickedParam = <PickTestItemStruct> await pick.showStepPick({
    title,
    step: testMultiSteps.pickStep,
    totalSteps: testMultiSteps.totalSteps,
    placeholder: 'Select an option to test',
    items: pickTestItems,
  });
  if (Utility.checkIsValid(pickedParam)) {
    state.testCommand = pickedParam.testCommand;
  } else {
    return '';
  }
  if (pickedParam.testItem === 'modules') {
    return (curPick: MultiStepChoose) => specifyModule(curPick, state, pickItemsContent, title);
  } else if (pickedParam.testItem === 'member') {
    return (curPick: MultiStepChoose) => specifyOneMember(curPick, state, pickItemsContent, title);
  } else {
    return (curPick: MultiStepChoose) => specifyPath(curPick, state, pickItemsContent, title);
  }
}

async function specifyPath(pick: MultiStepChoose, state: Partial<State>, pickItemsContent: PickItemStruct[],
  title: string): Promise<unknown> {
  const inputBoxOptions: InputBoxOptions = {
    prompt: 'Specify the test paths, or press Enter directly for module-level unit tests',
    value: '',
    title,
    ignoreFocusOut: true,
  };
  const specifiePath = await pick.showEnterInput({
    inputBoxOptions,
    step: testMultiSteps.enterStep,
    totalSteps: testMultiSteps.totalSteps,
    button: [QuickInputButtons.Back],
  });
  if (Utility.checkIsValid(specifiePath)) {
    state.specifiePath = `${specifiePath}`;
  } else {
    state.specifiePath = '';
  }
  return (curPick: MultiStepChoose) => pickMultiTestParams(curPick, state, pickItemsContent, title);
}

async function specifyModule(pick: MultiStepChoose, state: Partial<State>, pickItemsContent: PickItemStruct[],
  title: string): Promise<unknown> {
  const inputBoxOptions: InputBoxOptions = {
    prompt: 'Specify the test modules, or press Enter directly for unit tests on the current module',
    value: '',
    title,
    ignoreFocusOut: true,
  };
  const specifyModules = await pick.showEnterInput({
    inputBoxOptions,
    step: testMultiSteps.enterStep,
    totalSteps: testMultiSteps.totalSteps,
    button: [QuickInputButtons.Back],
  });
  if (Utility.checkIsValid(specifyModules)) {
    state.specifiePath = `${specifyModules}`;
  } else {
    state.specifiePath = '';
  }
  return (curPick: MultiStepChoose) => pickMultiTestParams(curPick, state, pickItemsContent, title);
}

async function specifyOneMember(pick: MultiStepChoose, state: Partial<State>, pickItemsContent: PickItemStruct[],
  title: string): Promise<unknown> {
  const inputBoxOptions: InputBoxOptions = {
    prompt: 'Specify a test member, or press Enter directly for unit tests on all members',
    value: '',
    title,
    ignoreFocusOut: true,
  };
  const specifyMember = await pick.showEnterInput({
    inputBoxOptions,
    step: testMultiSteps.enterStep,
    totalSteps: testMultiSteps.totalSteps,
    button: [QuickInputButtons.Back],
  });
  if (Utility.checkIsValid(specifyMember)) {
    state.specifiePath = `${specifyMember}`;
  } else {
    state.specifiePath = '';
  }
  return (curPick: MultiStepChoose) => pickMultiTestParams(curPick, state, pickItemsContent, title);
}

async function specifyReg(pick: MultiStepChoose, state: Partial<State>, title: string): Promise<unknown> {
  let filterParam = state.pickedParams.indexOf('--filter');
  const inputBoxOptions: InputBoxOptions = {
    prompt: 'Specify the reg',
    value: '',
    title,
    ignoreFocusOut: true,
  };
  const specifyRegTarget = await pick.showEnterInput({
    inputBoxOptions,
    button: [QuickInputButtons.Back],
  });
  if (Utility.checkIsValid(specifyRegTarget)) {
    state.pickedParams[filterParam] = `--filter=${specifyRegTarget}`;
    state.extraPickedParams = state.pickedParams.join(' ').trim();
  } else {
    // deal alias is an empty enter not cancel
    window.showErrorMessage('cjpm test arg --filter= need an regular expression');
    return () => Promise.resolve();
  }

  if (state.pickedParams.includes('-j')) {
    await Utility.delay(delay100);
    return (curPick: MultiStepChoose) => enterJobs(curPick, state, title);
  }

  if (state.pickedParams.includes('--target')) {
    return (curPick: MultiStepChoose) => enterCrsOpt(curPick, state, title);
  }

  if (state.pickedParams.includes('--customizedOption')) {
    return (curPick: MultiStepChoose) => enterConditionOpt(curPick, state, title);
  }
  return () => Promise.resolve();
}

async function pickMultiTestParams(pick: MultiStepChoose, state: Partial<State>, pickItemsContent: PickItemStruct[],
  title: string): Promise<unknown> {
  const pickItems = await getExtraParams([...pickItemsContent], 'test');
  const pickedItems = <string[]> await pick.showStepPick({
    title,
    step: testMultiSteps.extraStep,
    totalSteps: testMultiSteps.totalSteps,
    placeholder: 'Pick one or more cjpm test parameters',
    items: pickItems,
    canPickMany: true,
    button: [QuickInputButtons.Back],
  });
  state.pickedParams = pickedItems;

  if (state.pickedParams.includes('--filter')) {
    return (curPick: MultiStepChoose) => specifyReg(curPick, state, title);
  }

  if (state.pickedParams.includes('-j')) {
    return (curPick: MultiStepChoose) => enterJobs(curPick, state, title);
  }

  if (state.pickedParams.includes('--target')) {
    return (curPick: MultiStepChoose) => enterCrsOpt(curPick, state, title);
  }

  if (state.pickedParams.includes('--customizedOption')) {
    return (curPick: MultiStepChoose) => enterConditionOpt(curPick, state, title);
  }

  state.extraPickedParams = state.pickedParams.join(' ');
  return () => Promise.resolve();
}
