/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import { UncompressBaseStream } from '../base-write-stream';
import * as yauzl from 'yauzl';
import * as stream from 'stream';
import * as uncompressUtil from '../uncompress-util';
import { Utility } from '../../utils';

const DEFAULTS = { lazyEntries: true, decodeStrings: false };
const YAUZL_CALLBACK = Symbol('ZipUncompressStream#yauzlCallback');
const STRIP_NAME = Symbol('ZipUncompressStream#stripName');

function modeFromEntry(entry): number {
  const bit = 16;
  const maxNum = 33188;
  const attr = entry.externalFileAttributes >> bit || maxNum;
  const sIrwxu = 448;
  const sIrwxg = 56;
  const sIrwxo = 7;
  const sIfmt = 61440;
  return [sIrwxu, sIrwxg, sIrwxo].
    map(mask => attr & mask).
    reduce((a, b) => a + b, attr & sIfmt);
}

export class ZipUncompressStream extends UncompressBaseStream {
  private _chunks;
  private _strip;
  private _yauzlOpts;
  private token;

  constructor(opts, token) {
    const curOpts = opts || {};
    super(curOpts);

    this.token = token;
    this._chunks = [];
    this._strip = Number(curOpts.strip) || 0;

    this[YAUZL_CALLBACK] = this[YAUZL_CALLBACK].bind(this);

    this._yauzlOpts = Object.assign({}, DEFAULTS, curOpts.yauzl);
    const yauzlOpts = this._yauzlOpts;

    yauzl.open(curOpts.source, yauzlOpts, this[YAUZL_CALLBACK]);
  }

  _write(chunk):void {
    // push to _chunks array, this will only happen once, for stream will be unpiped.
    this._chunks.push(chunk);
  }

  [YAUZL_CALLBACK](err, zipFile): void {
    if (Utility.checkIsValid(err)) {
      this.emit('error', err);
      return;
    }

    zipFile.readEntry();

    zipFile.
      on('entry', entry => {
        if (this.token.isCancellationRequested) {
          zipFile.close();
        }
        const mode = modeFromEntry(entry);
        // fileName is buffer by default because decodeStrings = false
        if (Buffer.isBuffer(entry.fileName)) {
          entry.fileName = entry.fileName.toString();
        }
        // directory file names end with '/'
        const type = /\/$/.test(entry.fileName) ? 'directory' : 'file';
        entry.fileName = this[STRIP_NAME](entry.fileName, type);
        const name = entry.fileName;

        const header = { name, type, yauzl: entry, mode };

        if (type === 'file') {
          zipFile.openReadStream(entry, (error, readStream) => {
            if (Utility.checkIsValid(error)) {
              return this.emit('error', error);
            }
            return this.emit('entry', header, readStream, next);
          });
        } else { // directory
          const placeholder = new stream.Readable({ read():void {} });
          this.emit('entry', header, placeholder, next);
          setImmediate(() => placeholder.emit('end'));
        }
      }).
      on('end', () => this.emit('finish')).
      on('error', error => this.emit('error', error));

    function next(): void {
      zipFile.readEntry();
    }
  }

  [STRIP_NAME](fileName, type): string {
    return uncompressUtil.stripFileName(this._strip, fileName, type);
  }
}

export const zipUncompress = uncompressUtil.makeUncompressFn(ZipUncompressStream);
