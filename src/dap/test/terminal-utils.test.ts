/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

jest.mock('vscode', () => jest.requireActual('../src/__mocks__/vscode'));
jest.mock('child_process', () => ({exec: jest.fn()}));

import {exec} from 'child_process';
import {TerminalUtils} from '../src/TerminalUtils';

const mockedExec = exec as jest.MockedFunction<typeof exec>;

function mockCommandResult(error: Error | null, stdout: string, stderr: string): void {
  mockedExec.mockImplementationOnce((command, options, callback) => {
    callback(error, stdout, stderr);
    return undefined;
  });
}

describe('TerminalUtils.executeCommand', () => {
  beforeEach(() => {
    jest.spyOn(TerminalUtils, 'getExecCmd').mockImplementation(command => command);
    jest.spyOn(TerminalUtils, 'appendLine').mockImplementation(() => undefined);
  });

  test('resolves successfully when the command produces no output', async () => {
    mockCommandResult(null, '', '');

    await expect(TerminalUtils.executeCommand('cjpm test')).resolves.toEqual({
      success: true,
      msg: '',
    });
  });

  test('resolves successfully when the command only writes to stderr', async () => {
    mockCommandResult(null, '', 'warning');

    await expect(TerminalUtils.executeCommand('cjpm test')).resolves.toEqual({
      success: true,
      msg: '',
    });
    expect(TerminalUtils.appendLine).toHaveBeenCalledWith('warning', true);
  });

  test('resolves with the process error when the command fails', async () => {
    const error = new Error('command failed');
    mockCommandResult(error, '', 'failure details');

    await expect(TerminalUtils.executeCommand('cjpm test')).resolves.toEqual({
      success: false,
      msg: 'command failed',
    });
  });
});
