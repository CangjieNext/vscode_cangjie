/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import type {DebugAdapter, DebugProtocolMessage, Disposable, Event} from 'vscode';
import {EventEmitter, window} from 'vscode';
import type {Socket} from 'net';
import * as Net from 'net';
import type {DebugProtocol} from '@vscode/debugprotocol';
import * as utils from './common-utils';
import type {DapMessageIdentity, DapMessageType} from './types';
import type {CangjieDebugConfiguration} from './cangjie-debug-configuration';
import {DapMessageFilter} from './dap-message-filter';
import {DapMessageListener} from './dap-message-listener';
import {startUpRetryInterval, startUpRetryMaxCount} from './constants';
import {CangjieDebugAdapterDescriptorFactory} from './cangjie-debug-adapter-descriptor-factory';
import {createDisposable} from './common-utils';

export class CangjieSocketDebugAdapter implements DebugAdapter {
  public static INSTANCE: CangjieSocketDebugAdapter | undefined = undefined;
  private static readonly TWO_CRLF = '\r\n\r\n';
  private static readonly HEADER_LINE_SEPARATOR = /\r?\n/;
  private static readonly HEADER_FIELD_SEPARATOR = /: */;
  private static readonly INSTANCE_CREATED_CALLBACK: Set<(i: CangjieSocketDebugAdapter) => void> = new Set();
  private static curId = 0;
  public readonly id = CangjieSocketDebugAdapter.curId++;

  public serverMsgEventEmitter = new EventEmitter();

  readonly onDidSendMessage: Event<DebugProtocolMessage> = this.serverMsgEventEmitter.event;

  private readonly port: number;
  private socket: Socket;
  private rawData = Buffer.allocUnsafe(0);
  private contentSize = -1;
  private _socketConnect: boolean = false;

  private filterMap = new Map<string, DapMessageFilter[]>();
  private listenerMap = new Map<string, DapMessageListener[]>();

  private readonly _config: CangjieDebugConfiguration;

  private readonly destroySocketTimeMillis: number = 1000;

  private disposables: Disposable[] = [];

  constructor(port: number, config: CangjieDebugConfiguration) {
    this.port = port;
    this._config = config;
    this.addMessageListener('response', 'disconnect', () => this.destroySocket());
  }

  get socketConnect(): boolean {
    return this._socketConnect;
  }

  public static addInstanceCreatedCallback(callback: (i: CangjieSocketDebugAdapter) => void): Disposable {
    CangjieSocketDebugAdapter.INSTANCE_CREATED_CALLBACK.add(callback);
    return createDisposable(() => CangjieSocketDebugAdapter.INSTANCE_CREATED_CALLBACK.delete(callback));
  }

  private static getMapKey(msgType: DapMessageType, msgId: DapMessageIdentity): string {
    return `${msgId}-${msgType}`;
  }

  public async init(): Promise<void> {
    let count = 0;
    const showMessageIntervalTimes = 20;
    while (!this._socketConnect && CangjieDebugAdapterDescriptorFactory.dapServerStartStatus && count <
    startUpRetryMaxCount) {
      count++;
      if (count % showMessageIntervalTimes === 0) {
        window.showInformationMessage('Try to connect to the debug server, please wait.');
      }
      if (this.socket === undefined || this.socket === null || !this.socket.connecting) {
        this.socket = Net.createConnection(this.port, '127.0.0.1').
          on('data', (data: Buffer) => this.handleData(data)).
          on('connect', () => {
            CangjieSocketDebugAdapter.INSTANCE = this;
            CangjieSocketDebugAdapter.INSTANCE_CREATED_CALLBACK.forEach(c => c(this));
            this._socketConnect = true;
          }).
          on('close', () => this.terminate());
      }
      await utils.delay(startUpRetryInterval);
    }
  }

  /**
   * send a fake 'terminated' event to VSCode to stop debug session
   */
  public terminate(): void {
    const terminatedEvent: DebugProtocol.TerminatedEvent = {
      event: 'terminated', seq: Number.MAX_SAFE_INTEGER, type: 'event',
    };
    this.serverMsgEventEmitter.fire(terminatedEvent);
  }

  public addMessageFilter<T extends DebugProtocol.ProtocolMessage>(msgType: DapMessageType, msgId: DapMessageIdentity,
    filter: (msg: T) => (T | undefined)): Disposable {
    const key = CangjieSocketDebugAdapter.getMapKey(msgType, msgId);
    if (!this.filterMap.has(key)) {
      this.filterMap.set(key, []);
    }
    const msgFilter = new DapMessageFilter(msg => filter(msg as T));
    this.filterMap.get(key).push(msgFilter);
    return msgFilter.disposable;
  }

  public addMessageListener<T extends DebugProtocol.ProtocolMessage>(msgType: DapMessageType, msgId: DapMessageIdentity,
    listener: (msg: T) => void): Disposable {
    const key = CangjieSocketDebugAdapter.getMapKey(msgType, msgId);
    if (!this.listenerMap.has(key)) {
      this.listenerMap.set(key, []);
    }
    const msgListener = new DapMessageListener(msg => listener(msg as T));
    this.listenerMap.get(key).push(msgListener);
    return msgListener.disposable;
  }

  public fireStoppedEvent(stoppedEvent: DebugProtocol.StoppedEvent): void {
    this.serverMsgEventEmitter.fire(stoppedEvent);
  }

  dispose(): any {
    CangjieSocketDebugAdapter.INSTANCE = undefined;
    setTimeout(() => this.destroySocket(), this.destroySocketTimeMillis);
    this.disposables.forEach(d => d.dispose());
  }

  public addDisposable(disposable: Disposable): void {
    this.disposables.push(disposable);
  }

  handleMessage(message: DebugProtocol.ProtocolMessage): void {
    const filtered = this.preHandleMessage(message);
    if (filtered) {
      if (this.socket) {
        const json = JSON.stringify(filtered);
        this.socket.write(
          `Content-Length: ${Buffer.byteLength(json, 'utf8')}${CangjieSocketDebugAdapter.TWO_CRLF}${json}`, 'utf8');
      } else {
        utils.getOutputChannel().appendLine('error: sending message before socket established');
      }
    }
  }

  private destroySocket(): void {
    if (this.socket !== null && !this.socket.destroyed) {
      this.socket.destroy();
    }
  }

  private handleData(data: Buffer): void {
    this.rawData = Buffer.concat([this.rawData, data]);
    let doHandleData = true;
    while (doHandleData) {
      if (this.contentSize >= 0) {
        if (this.rawData.length >= this.contentSize) {
          const messageData = this.rawData.toString('utf8', 0, this.contentSize);
          this.rawData = this.rawData.slice(this.contentSize);
          this.contentSize = -1;
          if (messageData.length > 0) {
            this.handleServerMessage(<DebugProtocol.ProtocolMessage>JSON.parse(messageData));
          }
          continue;
        }
      } else {
        const idx = this.rawData.indexOf(CangjieSocketDebugAdapter.TWO_CRLF);
        if (idx !== -1) {
          this.getContentSize(idx);
          this.rawData = this.rawData.slice(idx + CangjieSocketDebugAdapter.TWO_CRLF.length);
          continue;
        }
      }
      break;
    }
  }

  private getContentSize(idx: number): void {
    const header = this.rawData.toString('utf8', 0, idx);
    const lines = header.split(CangjieSocketDebugAdapter.HEADER_LINE_SEPARATOR);
    for (const h of lines) {
      const kvPair = h.split(CangjieSocketDebugAdapter.HEADER_FIELD_SEPARATOR);
      if (kvPair[0] === 'Content-Length') {
        this.contentSize = Number(kvPair[1]);
      }
    }
  }

  private preHandleMessage(message: DebugProtocol.ProtocolMessage): DebugProtocol.ProtocolMessage | undefined {
    let identity;
    switch (message.type) {
      case 'request':
      case 'response': {
        if ('command' in message) {
          identity = message.command;
        }
        break;
      }
      case 'event': {
        if ('event' in message) {
          identity = message.event;
        }
        break;
      }
      default:
        break;
    }
    const msgType = <DapMessageType>message.type;
    const msgIdentity = <DapMessageIdentity>identity;
    const mapKey = CangjieSocketDebugAdapter.getMapKey(msgType, msgIdentity);
    let filters = this.filterMap.get(mapKey);
    let msg = message;
    if (filters) {
      filters = filters.filter(filter => {
        if (!filter.disposable.disposed && msg) {
          msg = filter.filterFunction(msg);
        }
        return !filter.disposable.disposed;
      });
      this.filterMap.set(mapKey, filters);
    }
    let listeners = this.listenerMap.get(mapKey);
    if (listeners) {
      listeners = listeners.filter(listener => {
        if (!listener.disposable.disposed && msg) {
          listener.listenerFunction(msg);
        }
        return !listener.disposable.disposed;
      });
      this.listenerMap.set(mapKey, listeners);
    }
    return msg;
  }

  private handleServerMessage(message: DebugProtocol.ProtocolMessage): void {
    const filtered = this.preHandleMessage(message);
    if (filtered) {
      this.serverMsgEventEmitter.fire(filtered);
    }
  }
}
