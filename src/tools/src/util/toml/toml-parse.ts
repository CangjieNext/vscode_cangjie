/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import {extractValue, findTable, parseKey} from './analysis-content';
import {getLineColFromPos, skipComment, skipVoidChar} from './toml-util';
import CustomTomlError from './custom-toml-error';
import type {CustomTomlTypes} from './toml-types';
import {LocationEnum, ObjType} from './toml-enum';

export interface CommentRecord {
  comment: string;
  location: LocationEnum;
}

export function parseToml(content: string, commentMap: Map<string, CommentRecord[]>): Record<string, CustomTomlTypes> {
  const res = {};
  const metaRecord = {};
  let tableObj = res;
  let meta = metaRecord;
  let preStartPos = 0;
  let preKey = '';
  let commentArr: CommentRecord[] = [];
  let keys: string[] = [];
  for (let position = skipVoidChar(content, 0); position < content.length;) {
    if (content[position] === '[') {
      const isTableArray = content[position + 1] === '[';
      const keysPosition = parseKey(content, position + (isTableArray ? 2 : 1), ']');
      if (isTableArray && content[keysPosition[1] - 1] !== ']') {
        throw new CustomTomlError('expected end of table declaration', content, keysPosition[1] - 1);
      }
      if (isTableArray) {
        keysPosition[1]++;
      }
      const tableObject = findTable(keysPosition[0], res, metaRecord, isTableArray ? ObjType.ARRAY : ObjType.EXPLICIT);
      if (tableObject !== null) {
        tableObj = tableObject[1];
        meta = tableObject[2];
      }
      [keys, position] = keysPosition;
      preKey = '';
      addToCommentMap(commentMap, keys, commentArr);
      commentArr = [];
    } else if (content[position] === '#') {
      const commentStartPos = position;
      position = skipComment(content, position);
      const comment = content.substring(commentStartPos, position);
      if (isSameColumn(keys, content, preStartPos, position)) {
        commentArr.push({comment, location: LocationEnum.BEFORE});
      } else {
        addToCommentMap(commentMap,
          getPreKeys(preKey, keys),
          [{comment, location: LocationEnum.AFTER}]);
      }
    } else {
      const keyPosition = parseKey(content, position);
      const p = findTable(keyPosition[0], tableObj, meta, ObjType.DOT);
      if (p === undefined || p === null) {
        throw new CustomTomlError('repeatedly defined key', content, position);
      }
      [p[1][p[0]], position] = extractValue(content, keyPosition[1]);
      preKey = p[0];
      addToCommentMap(commentMap, getKeys(preKey, keys), commentArr);
      commentArr = [];
    }
    preStartPos = position;
    position = skipVoidChar(content, position);
  }
  return res;
}

function addToCommentMap(commentMap: Map<string, CommentRecord[]>, keys: string[], comments: CommentRecord[]): void {
  if (comments === undefined || comments === null || comments.length <= 0) {
    return;
  }
  const commentKey = keys.join('.');
  if (commentMap.has(commentKey)) {
    const existingComments = commentMap.get(commentKey);
    existingComments?.push(...comments);
  } else {
    commentMap.set(commentKey, [...comments]);
  }
}

function isSameColumn(keys: string[], content: string, preStartPos: number, position: number): boolean {
  return keys === undefined || getLineColFromPos(content, preStartPos)[0] !==
    getLineColFromPos(content, position)[0];
}

function getKeys(preKey: string, keys: string[]): string[] {
  return preKey === undefined ? [...keys] : [...keys, preKey];
}

function getPreKeys(preKey: string, keys: string[]): string[] {
  return (preKey !== undefined && preKey !== null && preKey !== '') ? [...keys, preKey] : keys;
}
