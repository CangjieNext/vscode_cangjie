// Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
// This source file is part of the Cangjie project, licensed under Apache-2.0
// with Runtime Library Exception.
//
// See https://cangjie-lang.cn/pages/LICENSE for license information.

import {EventType} from '@bitfun-dap/ui-common';

export const AllRecordsType = new EventType<RecordProps[]>('AllRecords');

export interface RecordProps {
  dateTimeStamp: number;

  id: number;

  threadId: number;

  threadName: string;

  type: string;
}
