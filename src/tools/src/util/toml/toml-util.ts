/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import CustomTomlError from './custom-toml-error';
import {LINE_SPLITTER_REGEX, TWO_POS_OFFSET} from './toml-constants';

export function getNewlineIndex(str: string, startPos = 0, endPos = str.length): number {
  let index = str.indexOf('\n', startPos);
  if (str[index - 1] === '\r') {
    index--;
  }
  return index <= endPos ? index : -1;
}

export function skipComment(str: string, position: number): number {
  for (let i = position; i < str.length; i++) {
    const character = str[i];
    if (character === '\n') {
      return i;
    }
    if (character === '\r' && str[i + 1] === '\n') {
      return i + 1;
    }
    if ((character < '\x20' && character !== '\t') || character === '\x7f') {
      throw new CustomTomlError('control characters are not allowed in comments', str, position);
    }
  }
  return str.length;
}

export function skipVoidChar(str: string, positionParam: number, notSkipNewLines?: boolean): number {
  let position = positionParam;
  while ((str[position]) === ' ' || isVoid(str, position, notSkipNewLines)) {
    position++;
  }
  return position;
}

function isVoid(str: string, position: number, notSkipNewLines?: boolean): boolean {
  const character = str[position];
  return character === '\t' ||
    (!notSkipNewLines && (character === '\n' || (character === '\r' && str[position + 1] === '\n')));
}

function isNewLine(character: string, str: string, i: number): boolean {
  return character === '\n' || (character === '\r' && str[i + 1] === '\n');
}

export function skipUnusedCharacters(str: string, positionParam: number, separator: string, endCharacter?: string,
  notSkipNewLines = false): number {
  let position = positionParam;
  if (endCharacter === undefined || endCharacter === null || endCharacter === '') {
    position = getNewlineIndex(str, position);
    return position < 0 ? str.length : position;
  }
  for (let i = position; i < str.length; i++) {
    const character = str[i];
    if (character === '#') {
      i = getNewlineIndex(str, i);
    } else if (character === separator) {
      return i + 1;
    } else if (character === endCharacter) {
      return i;
    } else if (notSkipNewLines && isNewLine(character, str, i)) {
      return i;
    } else {
      // do nothing
    }
  }
  throw new CustomTomlError('cannot find end of structure', str, position);
}

export function getStringEnd(str: string, seekPositionParam: number): number {
  let seekPosition = seekPositionParam;
  const first = str[seekPosition];
  const threeOffset = 2;
  const target = first === str[seekPosition + 1] && str[seekPosition + 1] === str[seekPosition + TWO_POS_OFFSET] ?
    str.slice(seekPosition, seekPosition + threeOffset) : first;
  seekPosition += target.length - 1;
  const notSingleDot = first !== '\'';
  do {
    seekPosition = str.indexOf(target, seekPosition + 1);
  } while (seekPosition > -1 && notSingleDot && str[seekPosition - 1] === '\\' &&
  str[seekPosition - TWO_POS_OFFSET] !== '\\');
  if (seekPosition > -1) {
    seekPosition += target.length;
    if (target.length > 1) {
      if (str[seekPosition] === first) {
        seekPosition++;
      }
      if (str[seekPosition] === first) {
        seekPosition++;
      }
    }
  }

  return seekPosition;
}

export function removeCommentTrimEnd(str: string, startPosition: number, endPosition: number,
  allowNewLines?: boolean): [string, number] {
  let sliceStr = str.slice(startPosition, endPosition);
  const commentIdx = sliceStr.indexOf('#');
  if (commentIdx > -1) {
    skipComment(str, commentIdx);
    sliceStr = sliceStr.slice(0, commentIdx);
  }
  const result = sliceStr.trimEnd();
  if (!allowNewLines) {
    const newlineIndex = sliceStr.indexOf('\n', result.length);
    if (newlineIndex > -1) {
      throw new CustomTomlError('newlines are not allowed in inline tables', str, startPosition + newlineIndex);
    }
  }
  return [result, commentIdx];
}

export function isNewLineOrSpace(lineContent: string): boolean {
  return lineContent === '\n' || lineContent === ' ' || lineContent === '\t' || lineContent === '\r';
}

export function isEmpty(str: string): boolean {
  return str === undefined || str === null || str === '';
}

export function getLineColFromPos(string: string, startPos: number): [number, number] {
  const lines = string.slice(0, startPos).split(LINE_SPLITTER_REGEX);
  const colStr = lines.pop();
  return [lines.length + 1, colStr === undefined ? 1 : colStr.length + 1];
}
