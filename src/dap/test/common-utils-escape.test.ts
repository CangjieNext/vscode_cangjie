/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import {changeToEscapeCharacter} from '../src/common-utils';

jest.mock('vscode', () => jest.requireActual('../src/__mocks__/vscode'));

describe('changeToEscapeCharacter', () => {
  test.each([
    ['o', 'o'],
    ['hello', 'hello'],
    ['abc', 'abc'],
    ['line\nfeed', 'line\\nfeed'],
  ])('converts %p to %p', (input, expected) => {
    expect(changeToEscapeCharacter(input)).toBe(expected);
  });
});
