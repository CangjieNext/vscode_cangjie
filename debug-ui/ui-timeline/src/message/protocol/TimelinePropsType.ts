// Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
// This source file is part of the Cangjie project, licensed under Apache-2.0
// with Runtime Library Exception.
//
// See https://cangjie-lang.cn/pages/LICENSE for license information.

import {RecordProps} from './AllRecordsType';
import {RequestResponseType} from '@bitfun-dap/ui-common';

export const TimelinePropsType = new RequestResponseType<undefined, TimeLinePropsTypeProps>('TimelineProps');

export interface TimeLinePropsTypeProps {
  initialRecords: RecordProps[];

  isThemeDark: boolean;
}
