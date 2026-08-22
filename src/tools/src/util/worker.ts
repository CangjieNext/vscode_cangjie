/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as childProcess from 'child_process';
import { workerData, parentPort } from 'worker_threads';

let cjpmExe = false;
doWorker();

function doWorker(): void {
  const processId = workerData;
  cjpmExe = false;
  while (checkcjpmProcess(processId)) {
    // Wait for all child cjpm processes to exit.
  }
  parentPort.postMessage(true);
}

function checkcjpmProcess(processId: number): boolean {
  if (process.platform === 'linux') {
    let cmd = `ps -ef | grep cjpm | grep ${processId.toString()}`;
    let str = childProcess.execSync(cmd);
    return (str.toString().indexOf('cjpm run') !== -1 || str.toString().indexOf('cjpm build') !== -1);
  }
  if (process.platform === 'win32') {
    let cmd = `wmic process where (ParentProcessId=${processId.toString()}) get Name`;
    try {
      let str = childProcess.execSync(cmd);
      return str.toString().indexOf('cjpm.exe') !== -1;
    } catch (error) {
      return false;
    }
  }
  if (process.platform === 'darwin') {
    let cmd = `ps -ef | grep cjpm | grep ${processId.toString()}`;
    let str = childProcess.execSync(cmd);
    if (!cjpmExe) {
      cjpmExe = (str.toString().indexOf('cjpm run') !== -1 || str.toString().indexOf('cjpm build') !== -1);
      return true;
    }
    return (str.toString().indexOf('cjpm run') !== -1 || str.toString().indexOf('cjpm build') !== -1) && cjpmExe;
  }
  return false;
}
