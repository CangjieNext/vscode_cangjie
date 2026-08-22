// Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
// This source file is part of the Cangjie project, licensed under Apache-2.0
// with Runtime Library Exception.
//
// See https://cangjie-lang.cn/pages/LICENSE for license information.

import {createShowErrorMessage, getIdeType, MessageManager, RequestResponseType} from '@bitfun-dap/ui-common';

export const GotoRecordPointRequestType = new RequestResponseType<GotoRecordPointProps, undefined>('GotoRecordPoint');

export interface GotoRecordPointProps {
  recordPointId?: number;
}

export function sendGotoRecordPointRequest(props: GotoRecordPointProps, setSelectedRecordId: (recordId: number | undefined) => void): void {
  const {recordPointId} = props;
  if (recordPointId === undefined || getIdeType() === 'Standalone') {
    setSelectedRecordId(recordPointId);
    return;
  }
  MessageManager.instance().sendRequest(GotoRecordPointRequestType, props).then(
    () => setSelectedRecordId(props.recordPointId)
  ).catch(
    reason => MessageManager.instance().sendEvent(createShowErrorMessage(reason))
  );
}
