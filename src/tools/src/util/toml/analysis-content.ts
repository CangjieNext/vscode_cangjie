/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import {
  getNewlineIndex,
  getStringEnd, isEmpty, isNewLineOrSpace,
  removeCommentTrimEnd,
  skipComment,
  skipUnusedCharacters,
  skipVoidChar
} from './toml-util';
import CustomTomlError from './custom-toml-error';
import CustomTomlDate from './custom-toml-date';
import type {CustomTomlTypes, MetaRecord, MetaState, TableRecord} from './toml-types';
import {
  ESCAPE_REGEX,
  ESCAPE_SYMBOL_MAP,
  FLOAT_REGEX,
  INT_REGEX,
  KEY_PART_REGEX,
  LEADING_ZERO_REGEX, LOWER_CHARACTER_LENGTH, TWO_POS_OFFSET, UPPER_CHARACTER_LENGTH
} from './toml-constants';
import {ObjType} from './toml-enum';

export interface ContentDetailRes {
  startPos: number;
  parsedRes: string;
  sliceStart: number;
  isEscape: boolean;
  tempPosition: number;
}

function checkInvalidUnicodeEscape(code: string, content: string, tempPosition: number): void {
  if (!ESCAPE_REGEX.test(code)) {
    throw new CustomTomlError('invalid unicode escape', content, tempPosition);
  }
}

function checkEscape(content: string, startPos: number, tempPosition: number): void {
  if (content[startPos] !== '\n' && content[startPos] !== '\r') {
    throw new CustomTomlError('invalid escape: only line-ending whitespace may be escaped', content,
      tempPosition);
  }
}

function checkAllowContent(notAllow: boolean, content: string, startPos: number, lineContent: string): void {
  if (notAllow) {
    throw new CustomTomlError('newlines are not allowed in strings', content, startPos - 1);
  } else if ((lineContent < '\x20' && lineContent !== '\t') || lineContent === '\x7f') {
    throw new CustomTomlError('control characters are not allowed in strings', content, startPos - 1);
  } else {
    // do nothing
  }
}

function splitContent(content: string, isMultiline: boolean, isLiteral: boolean,
  detail: ContentDetailRes): ContentDetailRes {
  let {startPos, parsedRes, sliceStart, isEscape, tempPosition} = detail;
  const lineContent = content[startPos++];
  const notAllow = (lineContent === '\n' || (lineContent === '\r' && content[startPos] === '\n')) && !isMultiline;
  checkAllowContent(notAllow, content, startPos, lineContent);
  if (isEscape) {
    isEscape = false;
    if (lineContent === 'u' || lineContent === 'U') {
      // Unicode escape
      const code = content.slice(startPos,
        (startPos += (lineContent === 'u' ? LOWER_CHARACTER_LENGTH : UPPER_CHARACTER_LENGTH)));
      checkInvalidUnicodeEscape(code, content, tempPosition);
      parsedRes += String.fromCodePoint(parseInt(code, 16));
    } else if (isMultiline && isNewLineOrSpace(lineContent)) {
      startPos = skipVoidChar(content, startPos - 1, true);
      checkEscape(content, startPos, tempPosition);
      startPos = skipVoidChar(content, startPos);
    } else if (lineContent in ESCAPE_SYMBOL_MAP) {
      parsedRes += ESCAPE_SYMBOL_MAP[lineContent as keyof typeof ESCAPE_SYMBOL_MAP];
    } else {
      throw new CustomTomlError('unrecognized escape sequence', content, tempPosition);
    }
    sliceStart = startPos;
  } else if (!isLiteral && lineContent === '\\') {
    tempPosition = startPos - 1;
    isEscape = true;
    parsedRes += content.slice(sliceStart, tempPosition);
  } else {
    // do nothing
  }
  return {startPos, parsedRes, sliceStart, isEscape, tempPosition};
}

function doParseContent(startPosParam: number, endPos: number, content: string, isMultiline: boolean,
  isLiteral: boolean): string {
  let startPos = startPosParam;
  let tempPosition = 0;
  let isEscape = false;
  let parsedRes = '';
  let sliceStart = startPos;
  while (startPos < endPos - 1) {
    const retObj = splitContent(content, isMultiline, isLiteral,
      {startPos, parsedRes, sliceStart, isEscape, tempPosition});
    ({startPos, parsedRes, sliceStart, isEscape, tempPosition} = retObj);
  }
  return parsedRes + content.slice(sliceStart, endPos - 1);
}

export function parseContent(content: string, startPosParam = 0, endPosParam = content.length): string {
  let startPos = startPosParam;
  let endPos = endPosParam;
  const isLiteral = content[startPos] === '\'';
  const isMultiline = content[startPos++] === content[startPos] && content[startPos] === content[startPos + 1];

  if (isMultiline) {
    endPos -= TWO_POS_OFFSET;
    if (content[startPos += TWO_POS_OFFSET] === '\r') {
      startPos++;
    }
    if (content[startPos] === '\n') {
      startPos++;
    }
  }
  return doParseContent(startPos, endPos, content, isMultiline, isLiteral);
}

export function parseValue(value: string, content: string, position: number): boolean | number | CustomTomlDate {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value === '-inf') {
    return -Infinity;
  }
  if (value === 'inf' || value === '+inf') {
    return Infinity;
  }
  if (value === 'nan' || value === '+nan' || value === '-nan') {
    return NaN;
  }
  if (value === '-0') {
    return 0;
  }

  const isInt = INT_REGEX.test(value);
  if (isInt || FLOAT_REGEX.test(value)) {
    if (LEADING_ZERO_REGEX.test(value)) {
      throw new CustomTomlError('leading zeros are not allowed', content, position);
    }

    const numeric = +Number(value.replace(/_/g, ''));
    checkValidNum(numeric, content, position, isInt);
    return numeric;
  }

  const customTomlDate = CustomTomlDate.createCustomTomlDate(value);
  if (!customTomlDate.isValid()) {
    throw new CustomTomlError('invalid value', content, position);
  }
  return customTomlDate;
}

function extractStringValue(content: string, startPosition: number, endCharacter?: string): [CustomTomlTypes, number] {
  let endPosition = getStringEnd(content, startPosition);
  const parsed = parseContent(content, startPosition, endPosition);
  if (endCharacter !== undefined && endCharacter !== null && endCharacter !== '') {
    endPosition = skipVoidChar(content, endPosition, endCharacter !== ']');
    const isUnexpectedCharacter = !isEmpty(content[endPosition]) && content[endPosition] !== ',' &&
      content[endPosition] !== endCharacter && content[endPosition] !== '\n' && content[endPosition] !== '\r';
    if (isUnexpectedCharacter) {
      throw new CustomTomlError('unexpected character encountered', content, endPosition);
    }
    endPosition += (+Number(content[endPosition] === ','));
  }
  return [parsed, endPosition];
}

export function extractValue(content: string, startPosition: number, endCharacter?: string): [CustomTomlTypes, number] {
  const character = content[startPosition];
  if (character === '[' || character === '{') {
    const [value, endPos] = character === '[' ? parseArray(content, startPosition) :
      parseInlineTable(content, startPosition);
    const newPosition = skipUnusedCharacters(content, endPos, ',', endCharacter);
    if (endCharacter === '}') {
      const nextNewLine = getNewlineIndex(content, endPos, newPosition);
      if (nextNewLine > -1) {
        throw new CustomTomlError('newlines are not allowed in inline tables', content, nextNewLine);
      }
    }
    return [value, newPosition];
  }

  if (character === '"' || character === '\'') {
    return extractStringValue(content, startPosition, endCharacter);
  }

  let endPosition = skipUnusedCharacters(content, startPosition, ',', endCharacter);
  const slice = removeCommentTrimEnd(content, startPosition, endPosition - (+Number(content[endPosition - 1] === ',')),
    endCharacter === ']');
  if (isEmpty(slice[0])) {
    throw new CustomTomlError('unspecified values are invalid', content, startPosition);
  }
  const isEmptyChar = endCharacter !== undefined && endCharacter !== null && endCharacter !== '';
  if (isEmptyChar && slice[1] > -1) {
    endPosition = skipVoidChar(content, startPosition + slice[1]);
    endPosition += +Number(content[endPosition] === ',');
  }
  return [
    parseValue(slice[0], content, startPosition),
    endPosition,
  ];
}

export interface ParseKeyReq {
  character: string;
  contentStr: string;
  startPos: number;
  endPos: number;
  endCharacter: string;
}

export interface ParseKeyRes {
  dotPos: number;
  endPos: number;
}

function doParseKey(parseKeyReq: ParseKeyReq, keys: any[]): ParseKeyRes {
  const {character, contentStr, startPos, endCharacter} = parseKeyReq;
  let {endPos} = parseKeyReq;
  let dotPos: number;
  if (character === '"' || character === '\'') {
    if (character === contentStr[startPos + 1] && character === contentStr[startPos + TWO_POS_OFFSET]) {
      throw new CustomTomlError('multiline strings are not allowed in keys', contentStr, startPos);
    }
    const strEndPos = getStringEnd(contentStr, startPos);
    if (strEndPos < 0) {
      throw new CustomTomlError('unfinished string encountered', contentStr, startPos);
    }
    dotPos = contentStr.indexOf('.', strEndPos);
    const strEnd = contentStr.slice(strEndPos, dotPos < 0 || dotPos > endPos ? endPos : dotPos);
    const newLine = getNewlineIndex(strEnd);
    if (newLine > -1) {
      throw new CustomTomlError('newlines are not allowed in keys', contentStr, startPos + dotPos + newLine);
    }
    if (!isEmpty(strEnd.trimStart())) {
      throw new CustomTomlError('found extra tokens after the string part', contentStr, strEndPos);
    }
    if (endPos < strEndPos) {
      endPos = contentStr.indexOf(endCharacter, strEndPos);
      if (endPos < 0) {
        throw new CustomTomlError('incomplete key-value: cannot find end of key', contentStr, startPos);
      }
    }
    keys.push(parseContent(contentStr, startPos, strEndPos));
  } else {
    dotPos = contentStr.indexOf('.', startPos);
    const part = contentStr.slice(startPos, dotPos < 0 || dotPos > endPos ? endPos : dotPos);
    if (!KEY_PART_REGEX.test(part)) {
      throw new CustomTomlError('only ASCII letters, ASCII digits, underscores and dashes are allowed in keys',
        contentStr, startPos);
    }
    keys.push(part.trimEnd());
  }
  return {dotPos, endPos};
}

export function parseKey(contentStr: string, startPosParam: number, endCharacter = '='): [string[], number] {
  let startPos = startPosParam;
  let dotPos = startPos - 1;
  const keys: string[] = [];

  let endPos = contentStr.indexOf(endCharacter, startPos);
  if (endPos < 0) {
    throw new CustomTomlError('incomplete key-value: cannot find end of key', contentStr, startPos);
  }

  do {
    const character = contentStr[startPos = ++dotPos];
    if (character === ' ' || character === '\t') {
      continue;
    }
    const retObj = doParseKey({character, contentStr, startPos, endPos, endCharacter}, keys);
    ({dotPos, endPos} = retObj);
  } while (dotPos + 1 && dotPos < endPos);
  return [keys, skipVoidChar(contentStr, endPos + 1, true)];
}

export interface InlineTableRes {
  position: number;
  comma: number;
}

function doParseInlineTable(res: Record<string, string | number | boolean |
    CustomTomlDate | { [p: string]: CustomTomlTypes } | CustomTomlTypes[]>, str: string, positionParam: number,
seen: Set<any>, commaParam: number): InlineTableRes {
  let position = positionParam;
  let comma = commaParam;
  let key = '';
  let obj: any = res;
  let hasProperty = false;
  const [keys, keyEndPosition] = parseKey(str, position - 1);
  for (let i = 0; i < keys.length; i++) {
    if (i > 0) {
      obj = hasProperty ? obj[key] : (obj[key] = {});
    }
    key = keys[i];
    if ((hasProperty = Object.prototype.hasOwnProperty.call(obj, key)) &&
      (typeof obj[key] !== 'object' || seen.has(obj[key]))) {
      throw new CustomTomlError('repeatedly defined key', str, position);
    }

    if (!hasProperty && key === '__proto__') {
      Object.defineProperty(obj, key, {enumerable: true, configurable: true, writable: true});
    }
  }

  if (hasProperty) {
    throw new CustomTomlError('repeatedly defined value', str, position);
  }
  const [value, valueEndPosition] = extractValue(str, keyEndPosition, '}');
  seen.add(value);
  obj[key] = value;
  position = valueEndPosition;
  comma = str[position - 1] === ',' ? position - 1 : 0;
  return {position, comma};
}

export function parseInlineTable(str: string, positionParam: number): [Record<string, CustomTomlTypes>, number] {
  const res: Record<string, CustomTomlTypes> = {};
  const seen = new Set();
  let character: string;
  let comma = 0;
  let position = positionParam;
  position++;
  while ((character = str[position++]) !== '}' && !isEmpty(character)) {
    if (character === '\n') {
      throw new CustomTomlError('newlines are not allowed in inline tables', str, position - 1);
    } else if (character === '#') {
      throw new CustomTomlError('inline tables cannot contain comments', str, position - 1);
    } else if (character === ',') {
      throw new CustomTomlError('expected key-value, found comma', str, position - 1);
    } else if (character !== ' ' && character !== '\t') {
      const retObj = doParseInlineTable(res, str, position, seen, comma);
      ({position, comma} = retObj);
    } else {
      // do nothing
    }
  }
  if (comma) {
    throw new CustomTomlError('trailing commas are not allowed in inline tables', str, comma);
  }
  if (isEmpty(character)) {
    throw new CustomTomlError('unfinished table encountered', str, position);
  }
  return [res, position];
}

export function parseArray(str: string, positionParam: number): [CustomTomlTypes[], number] {
  let position = positionParam;
  const res: CustomTomlTypes[] = [];
  let character;
  position++;
  while ((character = str[position++]) !== ']' && !isEmpty(character)) {
    if (character === ',') {
      throw new CustomTomlError('expected value, found comma', str, position - 1);
    } else if (character === '#') {
      position = skipComment(str, position);
    } else if (!isNewLineOrSpace(character)) {
      const [value, valuePosition] = extractValue(str, position - 1, ']');
      res.push(value);
      position = valuePosition;
    } else {
      // do nothing
    }
  }
  if (isEmpty(character)) {
    throw new CustomTomlError('unfinished array encountered', str, position);
  }
  return [res, position];
}

export interface DefinePropertiesReq {
  hasProperty: boolean;
  propertyKey: string;
  i: number;
  keys: string[];
  objType: ObjType;
}

function defineProperties(table: any, meta: MetaRecord, req: DefinePropertiesReq): void {
  const {hasProperty, propertyKey, i, keys, objType} = req;
  if (!hasProperty) {
    if (propertyKey === '__proto__') {
      Object.defineProperty(table, propertyKey, {enumerable: true, configurable: true, writable: true});
      Object.defineProperty(meta, propertyKey, {enumerable: true, configurable: true, writable: true});
    }
    meta[propertyKey] = {
      objType: i < keys.length - 1 && objType === ObjType.ARRAY ? ObjType.ARRAY_DOT : objType,
      undo: false,
      index: 0,
      record: {},
    };
  }
}

export interface ArrayObjRes {
  state: MetaState;
  table: any;
}

function dealArray(objType: ObjType, stateParam: MetaState, tableParam: any,
  propertyKey: string): ArrayObjRes {
  let state = stateParam;
  let table = tableParam;
  if (objType === ObjType.ARRAY) {
    if (!state.undo) {
      state.undo = true;
      stateParam.undo = true;
      table[propertyKey] = [];
      tableParam[propertyKey] = [];
    }
    table[propertyKey].push(table = {});
    state.record[state.index++] = (state = {objType: ObjType.EXPLICIT, undo: false, index: 0, record: {}});
  } else {
    // do nothing
  }
  return {state, table};
}

export function findTable(keys: string[], tableRecord: Record<string, CustomTomlTypes>, metaRecord: MetaRecord,
  objType: ObjType): TableRecord {
  let table: any = tableRecord;
  let meta = metaRecord;
  let propertyKey = '';
  let hasProperty = false;
  let state: MetaState;

  for (let i = 0; i < keys.length; i++) {
    if (i > 0) {
      table = hasProperty ? table[propertyKey] : (table[propertyKey] = {});
      meta = (state = meta[propertyKey]).record;
      if (isDotArr(objType, state)) {
        return null;
      }
      if (state.objType === ObjType.ARRAY) {
        const l = table.length - 1;
        table = table[l];
        meta = meta[l].record;
      }
    }
    propertyKey = keys[i];
    if ((hasProperty = Object.prototype.hasOwnProperty.call(table, propertyKey)) && isDotUndo(meta, propertyKey)) {
      return null;
    }
    defineProperties(table, meta, {hasProperty, propertyKey, i, keys, objType});
  }
  state = meta[propertyKey];
  if (isSameType(state, objType)) {
    return null;
  }
  const retObj = dealArray(objType, state, table, propertyKey);
  ({state, table} = retObj);
  if (state.undo) {
    return null;
  }
  state.undo = true;
  if (objType === ObjType.EXPLICIT) {
    table = hasProperty ? table[propertyKey] : (table[propertyKey] = {});
  } else if (objType === ObjType.DOT && hasProperty) {
    return null;
  } else {
    // do nothing
  }
  return [propertyKey, table, state.record];
}

function isDotArr(objType: ObjType, state: MetaState): boolean {
  return objType === ObjType.DOT && (state.objType === ObjType.EXPLICIT || state.objType === ObjType.ARRAY);
}

function isSameType(state: MetaState, objType: ObjType): boolean {
  return state.objType !== objType && !(objType === ObjType.EXPLICIT && state.objType === ObjType.ARRAY_DOT);
}

function checkValidNum(numeric: number, content: string, position: number, isInt: boolean): void {
  if (isNaN(numeric)) {
    throw new CustomTomlError('invalid number', content, position);
  }

  if (isInt && !Number.isSafeInteger(numeric)) {
    throw new CustomTomlError('integer value cannot be represented losslessly', content, position);
  }
}

function isDotUndo(meta: MetaRecord, propertyKey: string): boolean {
  return meta[propertyKey]?.objType === ObjType.DOT && meta[propertyKey]?.undo;
}
