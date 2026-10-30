/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as path from 'path';

const WORKSPACE_FOLDER_PLACEHOLDER = '${workspaceFolder}';
const WORKSPACE_PLACEHOLDER = '${workspace}';
const WORKSPACE_PLACEHOLDER_PATTERN = /\$\{workspaceFolder\}|\$\{workspace\}/g;

export function expandWorkspacePlaceholders(configuredPath: string, workspacePath?: string): string {
  if (!configuredPath || !workspacePath ||
      (!configuredPath.includes(WORKSPACE_FOLDER_PLACEHOLDER) &&
       !configuredPath.includes(WORKSPACE_PLACEHOLDER))) {
    return configuredPath;
  }
  return path.normalize(configuredPath.replace(WORKSPACE_PLACEHOLDER_PATTERN, () => workspacePath));
}
