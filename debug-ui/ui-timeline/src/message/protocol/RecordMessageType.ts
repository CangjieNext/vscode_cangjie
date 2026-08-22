// Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
// This source file is part of the Cangjie project, licensed under Apache-2.0
// with Runtime Library Exception.
//
// See https://cangjie-lang.cn/pages/LICENSE for license information.

import {RequestResponseType} from '@bitfun-dap/ui-common';

export const RecordMessageRequestType =
  new RequestResponseType<RecordMessageRequestProps, RecordMessageResponseProps>('RecordMessage');

export interface RecordMessageRequestProps {
  recordPointIds: number[];

  requireThread?: boolean;

  requireStackFrame?: boolean;

  requireLocalVariables?: boolean;

  requireGlobalVariables?: boolean;

  requireStaticVariables?: boolean;

  monitorVariables?: MonitorVariable[];
}

export interface MonitorVariable {
  id: number;

  name?: string;

  scopeName?: string;

  type?: string;

  value?: string;
}

export interface RecordMessageProps {
  recordPointId: number;

  threadId?: number;

  sourcePath?: string;

  line?: number;

  monitorVariables?: MonitorVariable[];
}

export interface RecordMessageResponseProps {
  recordMessages: RecordMessageProps[];
}
