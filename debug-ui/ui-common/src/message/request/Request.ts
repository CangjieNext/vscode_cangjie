// Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
// This source file is part of the Cangjie project, licensed under Apache-2.0
// with Runtime Library Exception.
//
// See https://cangjie-lang.cn/pages/LICENSE for license information.

import {MessageType} from '../../utils/Types';

export interface Request<BODY> {
  id: number;
  command: string;
  type: MessageType;
  body: BODY;
}

export interface Response<BODY> {
  id: number;
  command: string;
  type: MessageType;
  success: boolean;
  body?: BODY;
  errMessage?: string;
}

export class RequestResponseType<REQ_BODY, RESP_BODY> {
  command: string;

  constructor(command: string) {
    this.command = command;
  }

  public createRequest(body: REQ_BODY, id: number): Request<REQ_BODY> {
    return {
      body: body, command: this.command, id: id, type: 'request',
    };
  }

  public createSuccessResponse(body: RESP_BODY, id: number): Response<RESP_BODY> {
    return {
      body: body, command: this.command, errMessage: undefined, id: id, success: true, type: 'response',
    };
  }

  public createErrorResponse(errMsg: string, id: number): Response<RESP_BODY> {
    return {
      body: undefined, command: this.command, errMessage: errMsg, id: id, success: false, type: 'response',
    };
  }
}

export class RequestHandler<REQ_BODY, RESP_BODY> {
  type: RequestResponseType<REQ_BODY, RESP_BODY>;
  handler: (req: REQ_BODY) => Promise<RESP_BODY>;

  constructor(type: RequestResponseType<REQ_BODY, RESP_BODY>, handler: (req: REQ_BODY) => Promise<RESP_BODY>) {
    this.type = type;
    this.handler = handler;
  }
}
