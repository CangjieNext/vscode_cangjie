/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import {OutputChannel, window} from 'vscode';
import {checkIsValid, getSdkPath} from './common-utils';
import {exec} from 'child_process';

export interface CommandResult {
  success: boolean;
  msg?: string;
}

export class TerminalUtils {
  private static outputChannel: OutputChannel;

  private static readonly CJPM_TEST_SUCCESS_FLAG = 'cjpm test success';

  private static readonly CJPM_TEST_EXECUTABLE_FILES_PREFIX = 'Executable files at';

  static appendLine(content: string, showTime?: boolean): void {
    if (!checkIsValid(this.outputChannel)) {
      this.outputChannel = window.createOutputChannel('Cangjie Project Related Trace');
    }
    if (!showTime) {
      this.outputChannel.appendLine(`[Execute Time - ${new Date().toLocaleString()}]`);
    }
    this.outputChannel.show();
    this.outputChannel.appendLine(content);
  }

  /**
   * execute command
   *
   * @param command command
   * @param cwd cwd
   *
   * @returns Promise<CommandResult> command result
   */
  public static executeCommand(command: string, cwd?: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      exec(TerminalUtils.getExecCmd(command), { cwd: cwd, encoding: 'utf8'}, (err, stdout, stderr) => {
        if (checkIsValid(stderr)) {
          TerminalUtils.appendLine(stderr, true);
        }
        if (checkIsValid(stdout)) {
          TerminalUtils.appendLine(stdout);
        }
        if (checkIsValid(err)) {
          TerminalUtils.appendLine(err?.stack, true);
          resolve({success: false, msg: err.message});
          return;
        }
        resolve({success: true, msg: stdout ?? ''});
      });
    });
  }

  public static parseCjpmTestCommandResult(result: CommandResult): string {
    if (!checkIsValid(result) || !result.success) {
      return '';
    }
    let msg = result.msg;
    if (!checkIsValid(msg) || !msg.includes(TerminalUtils.CJPM_TEST_SUCCESS_FLAG)) {
      return '';
    }
    const lines = msg.split('\n');
    let pathRegexp = /Executable files at ['"](.*)['"]|Executable files at (.*)/;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.includes(TerminalUtils.CJPM_TEST_EXECUTABLE_FILES_PREFIX)) {
        const pathMatch = line.match(pathRegexp);
        if (pathMatch) {
          return (pathMatch[1] || pathMatch[2]).replace(/`/g, '');
        }
      }
    }
    return '';
  }

  static getExecCmd(baseExecCmd: string): string {
    const cangjieHome: string = getSdkPath();
    let cmdResult: string = baseExecCmd;
    if (process.platform === 'win32') {
      // the "" is used to handle path with space
      const envsetupPath: string = `"${cangjieHome}"\\envsetup.bat`;
      cmdResult = `${envsetupPath}&&${baseExecCmd}`;
    }
    if (process.platform === 'linux' || process.platform === 'darwin') {
      // the '' is used to handle path with space
      const envsetupPath: string = `'${cangjieHome}'/envsetup.sh`;
      cmdResult = `bash -c "source ${envsetupPath}&&${baseExecCmd}"`;
    }
    return cmdResult;
  }
}
