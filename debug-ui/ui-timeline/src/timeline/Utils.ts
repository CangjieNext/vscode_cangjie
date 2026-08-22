// Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
// This source file is part of the Cangjie project, licensed under Apache-2.0
// with Runtime Library Exception.
//
// See https://cangjie-lang.cn/pages/LICENSE for license information.

import {RecordProps} from '../message/protocol/AllRecordsType';
import {IdeType} from '@bitfun-dap/ui-common';

export function getRecordLineLabelWidth(records: RecordProps[], totalPixelWidth: number, ideType: IdeType): number {
  let width = ideType === 'VSCode' ? totalPixelWidth * 0.08 : totalPixelWidth * 0.15;
  return Math.max(60, width);
}

export function getThreadGroup(records: RecordProps[]): Map<number, [number, string]> {
  let threadsMap = new Map<number, string>();
  records.forEach(record => threadsMap.set(record.threadId, record.threadName));
  // [threadId, threadName][]
  const threads = Array.from(threadsMap.entries());
  threads.sort((record1, record2) => record1[0] - record2[0]);
  let result = new Map<number, [number, string]>();
  for (let i = 0; i < threads.length; i++) {
    result.set(threads[i][0], [i, threads[i][1]]);
  }
  return result;
}
