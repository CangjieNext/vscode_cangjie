/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as vscode from 'vscode';
import {CjProjectBuildProvider} from './build-project';
import {Utility} from '../util/utils';
import {TerminalHelper} from '../util/ternimal-helper';
import * as path from 'path';
import {SettingsProvider} from './setting-provider';
import {
  CJPM_TOML,
  cjpmBuildArgExtname,
  cjpmBuildReplace,
  COMPILE_OPTION,
  delay100,
  OUTPUT_TYPE,
  PACKAGE, TARGET,
  TARGET_DIR
} from '../util/constant-num';
import {RequiresActionController} from './require-action-controller';
import * as fs from 'fs';
import {OutputHelper} from '../util/output-helper';
import * as os from 'os';
import * as toml from '../util/toml/toml-export';
import {stringify} from '../util/toml/toml-export';

export enum BuildArgsCollection {
  BUILD_HELPER = 'cjpm build -h',
  BUILD_WITH_ALIAS = 'cjpm build -o',
  BUILD_WITH_OUTPUTDIR = 'cjpm build --target-dir',
  PARALLELLED_COMPILE = 'cjpm build',
  RUN_FOR_VERBOSE = 'cjpm build -V',
  RUN_FOR_COVERAGE = 'cjpm build --coverage',
  RUN_FOR_DEBUG = 'cjpm build -g',
  CJPM_TEST = 'cjpm test',
  CJPM_TEST_NO_RUN = 'cjpm test --no-run',
  CJPM_TEST_SKIP_BUILD = 'cjpm test --skip-build',
  CJPM_UPDATE = 'cjpm update',
  CJPM_CLEAN = 'cjpm clean',
  CJPM_CHECK = 'cjpm check',
  BUILD_WITH_CROSS = 'cjpm build --target=',
  INCREMENT = 'cjpm build -i',
  INCREMENT_WITH_DEBUG = 'cjpm build -i -g',
  BUILD_WITH_JOBS = 'cjpm build -j',
  BUILD_WITH_CODECHECK = 'cjpm build --lint'
}

export class CjpmBuildCollection {
  static configSetting: SettingsProvider;
  static requireConfigure: RequiresActionController;
  public context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;

    // register cangjie run
    this.registerRun();

    // register cangjie build button
    this.registerBuildButton();

    // register cangjie config
    this.registerConfig();

    // register cangjie build
    this.registerBuild();

    // register cangjie build condition
    this.registerBuildCondition();

    // register cangjie test
    this.registerTest();

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.helper', () => {
      CjProjectBuildProvider.executeCmd(BuildArgsCollection.BUILD_HELPER);
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.debug', async () => {
      let execResult = false;
      await CjProjectBuildProvider.executeCmd(BuildArgsCollection.RUN_FOR_DEBUG, true).then((result) => {
        execResult = result;
      });
      return execResult;
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.update', () => {
      CjProjectBuildProvider.executeCmd(BuildArgsCollection.CJPM_UPDATE);
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.clean', () => {
      CjProjectBuildProvider.executeCmd(BuildArgsCollection.CJPM_CLEAN);
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.check', () => {
      CjProjectBuildProvider.executeCmd(BuildArgsCollection.CJPM_CHECK);
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.incrementWithDebug', async () => {
      let execResult = false;
      await CjProjectBuildProvider.executeCmd(BuildArgsCollection.INCREMENT_WITH_DEBUG, true).then((result) => {
        execResult = result;
      });
      return execResult;
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.multiArgsCheck', () => {
      CjProjectBuildProvider.multiTest();
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('Cangjie.BuildArg.Json.Edit', () => {
      // open file cjpm_build_args.json
      const cjpmBuildUri = vscode.Uri.file(path.join(Utility.getWorkspaceFolders(), '.vscode', 'cjpm_build_args.json'));
      vscode.commands.executeCommand('vscode.open', cjpmBuildUri);
    }));
  }

  private registerBuild(): void {
    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.parallel', () => {
      CjProjectBuildProvider.executeCmd(BuildArgsCollection.PARALLELLED_COMPILE);
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.verbose', () => {
      CjProjectBuildProvider.executeCmd(BuildArgsCollection.RUN_FOR_VERBOSE);
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.coverage', () => {
      CjProjectBuildProvider.executeCmd(BuildArgsCollection.RUN_FOR_COVERAGE);
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.alias', async () => {
      const buildAlias = await vscode.window.showInputBox({
        prompt: 'Input a custom output name.',
      });
      if (buildAlias === undefined || buildAlias === '') {
        CjProjectBuildProvider.executeCmd(BuildArgsCollection.PARALLELLED_COMPILE);
      } else {
        CjProjectBuildProvider.executeCmd(`${BuildArgsCollection.BUILD_WITH_ALIAS} ${buildAlias}`);
      }
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.multiParameter', () => {
      CjProjectBuildProvider.multi();
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.increment', () => {
      CjProjectBuildProvider.executeCmd(BuildArgsCollection.INCREMENT);
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.codeCheck', () => {
      CjProjectBuildProvider.executeCmd(BuildArgsCollection.BUILD_WITH_CODECHECK);
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.cross', async () => {
      let tomlContent = Utility.getTomlContent();
      if (!Utility.checkIsValid(tomlContent) ||
        Object.prototype.hasOwnProperty.call(tomlContent, TARGET) === false) {
        vscode.window.showWarningMessage(
          `The ${TARGET} content of the cjpm.toml file is missing, please fill it out`);
        return;
      }
      let crossOpts = Object.keys(tomlContent[TARGET]);
      if (crossOpts.length > 0) {
        await Utility.delay(delay100);
        const option = await vscode.window.showQuickPick(crossOpts, {
          placeHolder: 'choose a cross compile param',
        });
        // choose nothing
        if (!Utility.checkIsValid(option)) {
          return;
        }
        CjProjectBuildProvider.executeCmd(`${BuildArgsCollection.BUILD_WITH_CROSS}${option}`);
      } else {
        vscode.window.showWarningMessage(
          'There is no related configuration for cross-compile-configuration in cjpm.toml, please configure this parameter first');
      }
    }));

    // register BuildDir
    this.registerBuildDir();

    // register build macro for debug
    this.registerDebugMacro();

    // register buildJobs
    this.registerBuildOrTestJobs('cangjie.build.jobs');
  }

  private registerBuildOrTestJobs(command: string): void {
    let cmd = 'cjpm build -j';
    if (command === 'cangjie.test.jobs') {
      cmd = 'cjpm test -j';
    }
    this.context.subscriptions.push(vscode.commands.registerCommand(command, async () => {
      const cpus = os.cpus().length;
      let buildJobs = await vscode.window.showInputBox({
        prompt: `Input custom cpus. The support range is ' (0, ${cpus} * 2] '`,
      });
      if (!Utility.checkIsValid(buildJobs)) {
        buildJobs = cpus.toString();
      }
      let numOfInput = parseFloat(buildJobs);
      if (isNaN(numOfInput)) {
        vscode.window.showErrorMessage('Invaild input! The input should be number.');
        return;
      }
      const maxMulti = 2;
      if (numOfInput > cpus * maxMulti || numOfInput <= 0) {
        vscode.window.showWarningMessage(
          `The input is outof support range ' (0, ${cpus} * 2] '. Will use operating system default cpus`);
        numOfInput = cpus;
      }
      CjProjectBuildProvider.executeCmd(`${cmd} ${numOfInput}`);
    }));
  }

  private registerDebugMacro(): void {
    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.debugMacro', async () => {
      const tomlContent = Utility.getTomlContent();
      if (!Utility.checkIsValid(tomlContent)) {
        vscode.window.showErrorMessage('There is no cjpm.toml!');
        return;
      }
      let packageObj = Utility.getTomlValueByTreeKeys([PACKAGE], tomlContent, false);
      if (Object.prototype.hasOwnProperty.call(packageObj, COMPILE_OPTION) === false) {
        vscode.window.showErrorMessage(`There is no ${COMPILE_OPTION} field in cjpm.toml!`);
        return;
      }
      try {
        let compileOption = packageObj[COMPILE_OPTION];
        if (compileOption.includes('--debug-macro') === false) {
          compileOption = `${compileOption} --debug-macro`;
          packageObj[COMPILE_OPTION] = compileOption;
          let writePath = Utility.getCjRootProjectPath() + CJPM_TOML;
          fs.writeFileSync(writePath, stringify(tomlContent));
        }
        vscode.commands.executeCommand('cangjie.build.debug');
      } catch (e) {
        OutputHelper.appendLine(e);
      }
    }));
  }

  private registerBuildDir(): void {
    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.targetDir', async () => {
      const tomlContent = Utility.getTomlContent();
      if (!Utility.checkIsValid(tomlContent)) {
        vscode.window.showErrorMessage('There is no cjpm.toml!');
        return;
      }
      const packageObj = Utility.getTomlValueByTreeKeys([PACKAGE], tomlContent, false);
      if (Object.prototype.hasOwnProperty.call(packageObj, TARGET_DIR) === false) {
        vscode.window.showErrorMessage(`There is no ${TARGET_DIR} field in cjpm.toml!`);
        return;
      }
      const jsonBuildDdir: string = packageObj[TARGET_DIR] as string;
      let inputBuildDdir = await vscode.window.showInputBox({
        prompt: 'Input a custom output directory path.',
        value: jsonBuildDdir,
      });
      if (inputBuildDdir === undefined) {
        inputBuildDdir = jsonBuildDdir;
      }
      if (inputBuildDdir !== jsonBuildDdir) {
        const quickPickOptions: vscode.QuickPickOptions = {
          title: 'The input directory path is different!',
          placeHolder: 'input differs from target-dir in cjpm.toml, do you want to overwrite the target-dir in cjpm.toml?',
        };
        const select = await vscode.window.showQuickPick(['Yes', 'No'], quickPickOptions);
        if (select === 'Yes') {
          packageObj[TARGET_DIR] = inputBuildDdir;
          try {
            let writePath = Utility.getCjRootProjectPath() + CJPM_TOML;
            fs.writeFileSync(writePath, toml.stringify(tomlContent));
          } catch (e) {
            OutputHelper.appendLine(e);
          }
        }
      }
      if (inputBuildDdir === '') {
        CjProjectBuildProvider.executeCmd(BuildArgsCollection.PARALLELLED_COMPILE);
      } else {
        CjProjectBuildProvider.executeCmd(`${BuildArgsCollection.BUILD_WITH_OUTPUTDIR} ${inputBuildDdir}`);
      }
    }));
  }

  private registerBuildCondition(): void {
    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.condition', async () => {
      const optionStr: string = await Utility.getCustomizedOptions();
      if (!Utility.checkIsValid(optionStr)) {
        return;
      }
      CjProjectBuildProvider.executeCmd(
        `${BuildArgsCollection.PARALLELLED_COMPILE} --${[...new Set(optionStr.split(', '))].join(' --')}`);
    }));
  }

  private registerTest(): void {
    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build.test', () => {
      CjProjectBuildProvider.executeCmd(BuildArgsCollection.CJPM_TEST);
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.test.noRun', () => {
      CjProjectBuildProvider.executeCmd(BuildArgsCollection.CJPM_TEST_NO_RUN);
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.test.skipBuild', () => {
      CjProjectBuildProvider.executeCmd(BuildArgsCollection.CJPM_TEST_SKIP_BUILD);
    }));

    this.context.subscriptions.push(
      vscode.commands.registerCommand('cangjie.test.execCommand', async (command: string, isDebug = false) => {
        let execResult = false;
        await CjProjectBuildProvider.executeCmd(command, isDebug).then((result) => {
          execResult = result;
        });
        return execResult;
      }));

    // register testJobs
    this.registerBuildOrTestJobs('cangjie.test.jobs');
  }

  private registerConfig(): void {
    this.context.subscriptions.push(vscode.commands.registerCommand('cangjieBuild.editBuildConfiguration', () => {
      if (!Utility.isCangjieProject()) {
        vscode.window.showWarningMessage('The project can not find cjpm.toml file. you can use cjpm init to create');
        return;
      }
      if (!Utility.checkIsValid(CjpmBuildCollection.configSetting)) {
        CjpmBuildCollection.configSetting = new SettingsProvider(this.context);
      }
      CjpmBuildCollection.configSetting.createOrShow('html/setting.html', 'configSetByUI.js', 'configSet.css');
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.require.uiSetting', () => {
      if (!Utility.isCangjieProject()) {
        vscode.window.showWarningMessage('The project can not find cjpm.toml file. you can use cjpm init to create');
        return;
      }
      if (!Utility.checkIsValid(CjpmBuildCollection.requireConfigure)) {
        CjpmBuildCollection.requireConfigure = new RequiresActionController(this.context);
      }
      CjpmBuildCollection.requireConfigure.createOrShow('html/requireTree.html', 'requireTreeByUI.js',
        'requireSet.css');
    }));

    this.context.subscriptions.push(vscode.commands.registerCommand('Cangjie.Cjpm.Toml.Edit', () => {
      // open file cjpm.toml
      const tomlUri = vscode.Uri.file(path.join(Utility.getCjRootProjectPath(), CJPM_TOML));
      vscode.commands.executeCommand('vscode.open', tomlUri);
    }));
  }

  private registerRun(): void {
    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.run', async () => {
      // auto save current file
      await vscode.workspace.saveAll(false);
      if (process.platform !== 'linux' && process.platform !== 'win32' && process.platform !== 'darwin') {
        vscode.window.showInformationMessage('Only support linux, windows and mac now');
        return;
      }
      // whether execute binary
      let outputType = Utility.getTomlValueByTreeKeys([PACKAGE, OUTPUT_TYPE]) as string;
      if (outputType === 'executable') {
        this.execBuildCommand(this.getCjpmRunCmd());
      } else {
        this.execBuildCommand(this.getCjpmBuildCmd());
      }
    }));
    vscode.commands.executeCommand('setContext', 'cangjie.run.state', true);
  }

  private registerBuildButton(): void {
    this.context.subscriptions.push(vscode.commands.registerCommand('cangjie.build', async () => {
      this.execBuildCommand(this.getCjpmBuildCmd());
    }));
  }

  private execBuildCommand(cjpmCmd: string): void {
    // append the compatibility target configured in the build configuration UI
    const compatCmd = Utility.appendCompatVersion(cjpmCmd);
    if (compatCmd.error !== '') {
      vscode.window.showErrorMessage(compatCmd.error);
      return;
    }
    TerminalHelper.execCommand(compatCmd.cmd);
  }

  private getCjpmBuildCmd(): string {
    let cjpmBuildCmd = 'cjpm build';
    let buildArgs = this.getBuildArgs();
    if (Utility.checkIsValid(buildArgs)) {
      cjpmBuildCmd += ` ${buildArgs}`;
    }
    return cjpmBuildCmd;
  }

  private getCjpmRunCmd(): string {
    let cjpmRunCmd = 'cjpm run';
    let buildArgs = this.getBuildArgs();
    let nameArg = '';
    let debugArg = '';
    // Geting bulid-args from cjpm_build_args.json pass to cjpm run command
    const cjpmBuildArgs = Utility.getCjpmBuildArgsContent(cjpmBuildArgExtname);
    Object.keys(cjpmBuildArgs).forEach((arg) => {
      if (arg === 'alias' && cjpmBuildArgs[arg] !== '') {
        nameArg += ` --name=${cjpmBuildArgs[arg]}`;
      }
      if (arg === 'debug' && cjpmBuildArgs[arg] === true) {
        debugArg += ' -g';
      }
    });
    if (Utility.checkIsValid(buildArgs)) {
      cjpmRunCmd += ` --build-args="${buildArgs}"`;
    }
    if (Utility.checkIsValid(nameArg)) {
      cjpmRunCmd += nameArg;
    }
    if (Utility.checkIsValid(debugArg)) {
      cjpmRunCmd += debugArg;
    }
    return cjpmRunCmd;
  }

  private getBuildArgs(): string {
    let buildArgs = '';
    const cjpmBuildArgs = Utility.getCjpmBuildArgsContent(cjpmBuildArgExtname);
    Object.keys(cjpmBuildArgs).forEach((arg) => {
      if ((arg === 'alias' || arg === 'cross') && cjpmBuildArgs[arg] !== '') {
        buildArgs += ` ${cjpmBuildReplace[arg]} ${cjpmBuildArgs[arg]}`;
      }
      if (arg === 'job' && cjpmBuildArgs[arg] !== '') {
        buildArgs += ` ${cjpmBuildReplace[arg]} ${cjpmBuildArgs[arg]}`;
      }
      if ((arg === 'condition') && cjpmBuildArgs[arg] !== '') {
        let cndOptions = cjpmBuildArgs[arg].split(' ').join(cjpmBuildReplace[arg]);
        buildArgs += `${cjpmBuildReplace[arg]}${cndOptions}`;
      }
      if (typeof cjpmBuildArgs[arg] === 'boolean' && cjpmBuildArgs[arg]) {
        buildArgs += ` ${cjpmBuildReplace[arg]}`;
      }
      if (arg === 'features' && cjpmBuildArgs[arg] !== undefined && cjpmBuildArgs[arg] !== '') {
        buildArgs += ` ${cjpmBuildReplace[arg]} ${cjpmBuildArgs[arg].replace(/\s+/g, '')}`;
      }
    });
    return buildArgs;
  }
}