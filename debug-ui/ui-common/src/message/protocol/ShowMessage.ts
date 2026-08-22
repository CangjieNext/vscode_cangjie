// Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
// This source file is part of the Cangjie project, licensed under Apache-2.0
// with Runtime Library Exception.
//
// See https://cangjie-lang.cn/pages/LICENSE for license information.

import {Event, EventType} from '../event/Event';

export const ShowMessageType = new EventType<ShowMessageTypeProps>('ShowMessage');

export function createShowMessage(reason: string, level: MessageLevelEnum = MessageLevelEnum.ERROR): Event<ShowMessageTypeProps> {
  return ShowMessageType.createEvent({level, message: reason});
}

export enum MessageLevelEnum {
  INFO = 0,
  WARN = 1,
  ERROR = 2,
}

export interface ShowMessageTypeProps {
  level: MessageLevelEnum;
  message: string;
}
