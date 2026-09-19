/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed with Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import {changeToEscapeCharacter, replaceEscapeCharacter} from '../src/common-utils';

/**
 * Regression tests for issue #10:
 *   [Bug]: CJVM 调试 Char 变量中的普通字母 o 被错误显示为 \o
 *
 * The debug adapter renders Char values through changeToEscapeCharacter().
 * That function used to contain `result.replace(/\o/g, '\\o')`, but `\o` is not a
 * valid regex escape: the backslash is silently dropped, so the pattern behaves
 * as /o/ and rewrites every plain letter 'o'. The line has been removed.
 *
 * These tests pin down both halves of the fix: plain 'o' must survive untouched,
 * and the legitimate escapes must keep working.
 */
describe('common-utils: Char escape rendering (issue #10)', () => {
  describe('changeToEscapeCharacter must not escape the plain letter o', () => {
    test('a single plain letter o is returned unchanged', () => {
      expect(changeToEscapeCharacter('o')).toBe('o');
    });

    test('a word containing o is not partially rewritten', () => {
      expect(changeToEscapeCharacter('hello')).toBe('hello');
      expect(changeToEscapeCharacter('orange')).toBe('orange');
      expect(changeToEscapeCharacter('foo')).toBe('foo');
    });

    test('o is preserved alongside characters that do need escaping', () => {
      // newline -> \n, but the surrounding o's stay as-is
      expect(changeToEscapeCharacter('o\no')).toBe('o\\no');
      // tab -> \t, letter o untouched
      expect(changeToEscapeCharacter('o\to')).toBe('o\\to');
    });

    test('every occurrence of o is preserved, not just the first', () => {
      expect(changeToEscapeCharacter('oooo')).toBe('oooo');
    });
  });

  describe('existing escape handling must keep working', () => {
    test('newline, tab, carriage return, vertical tab, form feed', () => {
      expect(changeToEscapeCharacter('\n')).toBe('\\n');
      expect(changeToEscapeCharacter('\t')).toBe('\\t');
      expect(changeToEscapeCharacter('\r')).toBe('\\r');
      expect(changeToEscapeCharacter('\v')).toBe('\\v');
      expect(changeToEscapeCharacter('\f')).toBe('\\f');
    });

    test('backslash, double quote and single quote', () => {
      expect(changeToEscapeCharacter('\\')).toBe('\\\\');
      expect(changeToEscapeCharacter('"')).toBe('\\"');
      expect(changeToEscapeCharacter("'")).toBe("\\'");
    });

    test('null byte is rendered as 0000', () => {
      expect(changeToEscapeCharacter('\0')).toBe('0000');
    });

    test('a value with no special characters is unchanged', () => {
      expect(changeToEscapeCharacter('abc123')).toBe('abc123');
    });
  });

  describe('replaceEscapeCharacter remains the inverse for real escapes', () => {
    test('rendered escapes are converted back to their characters', () => {
      expect(replaceEscapeCharacter('\\n')).toBe('\n');
      expect(replaceEscapeCharacter('\\t')).toBe('\t');
      expect(replaceEscapeCharacter('\\r')).toBe('\r');
    });

    test('plain letters are left alone', () => {
      expect(replaceEscapeCharacter('hello')).toBe('hello');
      expect(replaceEscapeCharacter('o')).toBe('o');
    });
  });

  describe('round trip through both directions', () => {
    test('a value containing o and escapes survives render + unrender', () => {
      const original = 'foo\tbar\n';
      const rendered = changeToEscapeCharacter(original);
      expect(rendered).toBe('foo\\tbar\\n');
      expect(replaceEscapeCharacter(rendered)).toBe(original);
    });

    test('a plain o-only value survives render + unrender', () => {
      const original = 'o';
      const rendered = changeToEscapeCharacter(original);
      expect(rendered).toBe('o');
      expect(replaceEscapeCharacter(rendered)).toBe(original);
    });
  });
});
