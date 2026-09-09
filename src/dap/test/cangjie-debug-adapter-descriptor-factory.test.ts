/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import {CangjieDebugAdapterDescriptorFactory} from '../src/cangjie-debug-adapter-descriptor-factory';
import {responseData, vscode} from '../src/__mocks__/vscode';
import {cangjieConfig} from '../src/__mocks__/mockCommon';
import {CangjieSocketDebugAdapter} from '../src/cangjie-socket-debug-adapter';
import {mockDapServerDispose, protocolRequestMap} from '../src/__mocks__/mockDapServer';
import * as utils from '../src/common-utils';
import {mockActiveExtensions} from '../src/__mocks__/mockCommon';

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn().mockReturnValue(true),
    chmodSync: jest.fn(),
  };
});

jest.mock('../src/common-utils', () => {
  const actualUtils = jest.requireActual('../src/common-utils');
  return {
    ...actualUtils,
    setExecPermission: jest.fn(),
    createDisposable: jest.fn().mockImplementation(() => {
      return {
        dispose: jest.fn(),
      }
    }),
  };
});

describe('test CangjieDebugAdapterDescriptorFactory', () => {
  vscode.debug.activeDebugSession.customRequest = jest.fn().mockImplementation((identity: any, args?: any) => {
    if (identity === 'debugInConsole' && !utils.isEmpty(args) && args.debugCommand === 'locals') {
      const evaluateResponse = '&"locals\\n"\n~"num1 = 5\\n"\n~"num2 = 10\\n"\n~"result = 503\\n"\n^done\n';
      return Promise.resolve({output: evaluateResponse});
    }
    return Promise.resolve({});
  });

  afterAll(() => {
    mockDapServerDispose();
    jest.clearAllMocks();
  });

  afterEach(() => {
    vscode.window.terminals.length = 0;
  });

  test('test createDebugAdapterDescriptor', async () => {
    await mockActiveExtensions();

    try {
      const factory = new CangjieDebugAdapterDescriptorFactory();
      await factory.createDebugAdapterDescriptor(
        new vscode.debug.DebugSession(cangjieConfig), undefined);
      expect(CangjieSocketDebugAdapter.INSTANCE).toBeDefined();
      for (let request of protocolRequestMap.values()) {
        await CangjieSocketDebugAdapter.INSTANCE.handleMessage(request);
        await utils.delay(100);
        const returnReq = !utils.isEmpty(responseData.request_seq) ? responseData.request_seq : responseData.seq;
        expect(request.seq).toBe(returnReq);
      }
      await factory.sessionTerminated();
    } finally {
      if (!utils.isEmpty(CangjieSocketDebugAdapter.INSTANCE)) {
        CangjieSocketDebugAdapter.INSTANCE.dispose();
      }
    }
  }, 15000);

  test('session termination closes only the debuggee terminal', async () => {
    const userTerminal = {
      name: 'cangjieDebug: main.exe',
      processId: Promise.resolve(1001),
      dispose: jest.fn(),
    };
    const debuggeeTerminal = {
      name: 'cangjieDebug: main.exe',
      processId: Promise.resolve(1002),
      dispose: jest.fn(),
    };
    vscode.window.terminals.push(userTerminal, debuggeeTerminal);

    const factory = new CangjieDebugAdapterDescriptorFactory();
    (factory as any).debuggeeTerminalProcessId = 1002;
    await factory.sessionTerminated();

    expect(userTerminal.dispose).not.toHaveBeenCalled();
    expect(debuggeeTerminal.dispose).toHaveBeenCalledTimes(1);
  });
});
