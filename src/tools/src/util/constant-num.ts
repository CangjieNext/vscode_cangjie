/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

export const buildMagicNum = {
  mutilPickTotalSteps: 2, // two steps to finish muti-params build from commandPalette
  firstPick: 1, // the first step of pick
  secondPick: 2, // the second step of pick
  enterAlias: 3, // the third step of pick
  extraStep: 1, // the extra step of pick
};

export const cjpmBuildArgs = {
  debug: false,
  verbose: false,
  coverage: false,
  increment: false,
  codeCheck: false,
  alias: '',
  cross: '',
  condition: '',
  job: '',
  features: '',
};

export const cjpmBuildReplace = {
  debug: '-g',
  verbose: '-V',
  coverage: '--coverage',
  codeCheck: '--lint',
  alias: '-o',
  cross: '--target',
  increment: '-i',
  condition: ' --',
  job: '-j',
  features: '--enable-features',
};

export const MODULEJSONARGS = [
  'compile-option',
  'cjc-version',
  'description',
  'version',
  'target-dir',
  'organization',
  'name',
  'output-type',
  'link-option',
  'cross-compile-configuration',
  'package-configuration',
  'customized-option',
];

export const MUSTKEYOFMODULEJSON = [
  'cjc-version',
  'name',
  'version',
  'output-type',
];

export const KEYOFMODULEJSON = [
  'cjc_version',
  'organization',
  'name',
  'description',
  'version',
  'build_dir',
  'requires',
  'dev_requires',
  'package_requires',
  'foreign_requires',
  'output_type',
  'command_option',
  'condition_option',
  'link_option',
  'cross_compile_configuration',
  'package_configuration',
  'workspace',
];

export const CJVMKEYOFMODULEJSON = [
  'cjc_version',
  'organization',
  'name',
  'description',
  'version',
  'build_dir',
  'requires',
  'dev_requires',
  'package_requires',
  'output_type',
  'command_option',
  'condition_option',
  'link_option',
  'package_configuration',
];

export class CustomAction {
  static back = new CustomAction();
  static cancel = new CustomAction();
  static resume = new CustomAction();
}

export const envPathName = {
  CANGJIE_HOME: 'CANGJIE_HOME',
  PATH: 'PATH',
  LD_LIBRARY_PATH: 'LD_LIBRARY_PATH',
  JET_JRE_HOME: 'JET_JRE_HOME',
  DYLD_FALLBACK_LIBRARY_PATH: 'DYLD_FALLBACK_LIBRARY_PATH',
  DYLD_LIBRARY_PATH: 'DYLD_LIBRARY_PATH',
};

export const testMultiSteps = {
  totalSteps: 3,
  pickStep: 1,
  enterStep: 2,
  extraStep: 3,
};

export const delay100: number = 100;

export const delay10: number = 10;

export const numOfModuleJson: number = 6;

export const numOfcjpmTest: number = 7;

export const requireCategory = ['dependencies', 'dev-dependencies', 'script-dependencies', 'bin-dependencies', 'ffi'];

export const packageRequieChild = ['path-option', 'package-option'];

export const requireCategoryNew = ['dependencies', 'dev-dependencies', 'script-dependencies', 'package-option', 'path-option', 'bin-dependencies', 'ffi'];

export const CJPM_TOML: string = '/cjpm.toml';

export const cjpmBuildArgExtname: string = '/.vscode/cjpm_build_args.json';

export const moduleNameKeyInModuleJson: string = 'name';

export const modulePathKeyInModuleJson: string = 'path';

export const testCangjieFile: string = 'testCangjie.cj';

export const conditionArrayNum: number = 2;

export const firstPosition: number = 0;

export const secondPosition: number = 1;

export const builtinConditions = new Set(['os', 'backend', 'debug', 'cjc-version']);

export const HTTP_STATUS_CODE_OK: number = 200;

export const CJLINT_WAIT_TIME = 2000;

export const CJLINT_CONFIG_NAME = 'cjlintignore.cfg';

export const PACKAGE = 'package';
export const NAME = 'name';
export const VERSION = 'version';
export const SRC_DIR = 'src-dir';
export const DESCRIPTION = 'description';
export const COMPILE_OPTION = 'compile-option';
export const OUTPUT_TYPE = 'output-type';
export const TARGET_DIR = 'target-dir';
export const LINK_OPTION = 'link-option';
export const PACKAGE_CONFIGURATION = 'package-configuration';

export const DEPENDENCIES = 'dependencies';
export const DEV_DEPENDENCIES = 'dev-dependencies';
export const SCRIPT_DEPENDENCIES = 'script-dependencies';

export const PACKAGE_REQUIRES = 'package-requires';
export const BIN_DEPENDENCIES = 'bin-dependencies';
export const PATH_OPTION = 'path-option';
export const PACKAGE_OPTION = 'package-option';

export const PROFILE = 'profile';
export const CUSTOMIZED_OPTION = 'customized-option';
export const SOURCE_SET = 'source-set';

export const FFI = 'ffi';
export const C = 'c';
export const JAVA = 'java';

export const TARGET = 'target';
export const WORKSPACE = 'workspace';
export const MEMBERS = 'members';

export const SRC = 'src';