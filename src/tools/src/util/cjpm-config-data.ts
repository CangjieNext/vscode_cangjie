/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

export interface Toml {
  package: Package;
  dependencies: Map<string, Require>;
  dev_dependencies: Map<string, Require>;
  script_dependencies: Map<string, Require>;
  package_requires: PackageRequires;
  ffi: FFIs;
  cross_compile_configuration: JSON;
  profile: Profile;
}

export interface Package {
  cjc_version: string;
  organization: string;
  name: string;
  description: string;
  version: string;
  output_type: string;
  link_option: string;
  src_dir: string;
  target_dir: string;
  command_option: string;
  package_configuration: Map<string, PackageConfiguration>;
}

interface Dependency {
  version: string;
}

interface FFIs {
  c: Map<string, ForeignRequires>;
  java: Map<string, ForeignRequires>;
}

interface Profile {
  lto: string;
}

export interface ModuleJson {
  cjc_version: string;
  organization: string;
  name: string;
  description: string;
  version: string;
  requires: Map<string, Require>;
  package_requires: PackageRequires;
  foreign_requires: Map<string, ForeignRequires>;
  output_type: string;
  command_option: string;
  link_option: string;
  cross_compile_configuration: JSON;
  package_configuration: Map<string, PackageConfiguration>;
  condition_option: Map<string, string>;
  build_dir: string;
}

interface Require {
  organization: string;
  version: string;
  path: string;
}

export interface PackageRequires {
  path_option: string[];
  package_option: JSON;
}

interface ForeignRequires {
  path: string;
  exports: Array<string | number>;
}

interface PackageConfiguration {
  output_type: string;
  command_option: string;
  condition_option: Map<string, string>;
}

export interface CjpmBuildArgs {
  debug: boolean;
  verbose: boolean;
  coverage: boolean;
  increment: boolean;
  codeCheck: boolean;
  alias: string;
  cross: string;
  condition: string;
  job: string;
  features: string;
  compatVersion: string;
}

export class ModuleJsonImpl implements ModuleJson {
  cjc_version: string;
  command_option: string;
  condition_option: Map<string, string>;
  cross_compile_configuration: JSON;
  description: string;
  foreign_requires: Map<string, ForeignRequires>;
  link_option: string;
  name: string;
  organization: string;
  output_type: string;
  package_configuration: Map<string, PackageConfiguration>;
  package_requires: PackageRequires;
  requires: Map<string, Require>;
  version: string;
  build_dir: string;
}