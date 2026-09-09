/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import * as vscode from 'vscode';
import type { TaskExecution } from 'vscode';
import type { ShellExecutionOptions } from 'vscode';
import {
  DebugAdapterInlineImplementation,
  ShellExecution,
  TaskRevealKind,
  TaskScope
} from 'vscode';
import * as fs from 'fs';
import * as child_process from 'child_process';
import {
  debugType,
  delay100,
  enableDAPCommunicationLogSettingsName,
  lastStoppedEvent,
  logSettingsPrefix,
  maximumNumberOfDataBreakpoint,
  portHigherBound,
  portLowerBound,
  reverseBreakpointLogMsg,
  reverseDebugConfigName,
  serverLogEnableArgPrefix,
  serverLogPathArgPrefix,
  serverPortArgPrefix
} from './constants';
import * as utils from './common-utils';
import { CangjieSocketDebugAdapter } from './cangjie-socket-debug-adapter';
import type { DebugProtocol } from '@vscode/debugprotocol';
import type { CangjieDebugConfiguration } from './cangjie-debug-configuration';
import type { CacheDataConfigArguments } from './reverseDebug/cangjie-reverse-debug';
import { CangjieReverseDebug } from './reverseDebug/cangjie-reverse-debug';
import { ReverseDebugConfigProperty } from './reverseDebug/reverse-debug-config-property';
import { CangjieEnvConfiguration } from './cangjie-env-configuration';
import {checkIsValid, getOs, getSdkPath, getVmParams, isEmpty} from './common-utils';
import {CangjieDependencyBuilder} from './config/cangjie-dependency-builder';
import {PythonRuntimeValidator} from './pythonEnvironment/python-version-validator';

export class CangjieDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
  static dapServerStartStatus: boolean = true;

  private currentServerExecution: TaskExecution = null;
  private cjvmExecution: TaskExecution = null;
  private currentWorkspacePath: string;
  private shellProcessId: number;
  private debuggeeTerminalProcessId: number;

  private readonly serverTerminateTimeMillis: number = 500;

  private readonly taskExecuteCount: number = 20;

  private readonly taskWaitTimeMillis = 50;

  createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined)
    : vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return this.createDebugAdapterImplementation(session, executable);
  }

  public async sessionTerminated(): Promise<void> {
    CangjieReverseDebug.instance = null;
    if (this.currentServerExecution !== null) {
      vscode.commands.executeCommand('setContext', 'enableCangjieReverseDebug', false);
      this.currentServerExecution.terminate();
    }
    if (this.cjvmExecution !== null) {
      vscode.commands.executeCommand('setContext', 'enableCangjieReverseDebug', false);
      this.cjvmExecution.terminate();
    }
    if (checkIsValid(this.debuggeeTerminalProcessId)) {
      const processId = this.debuggeeTerminalProcessId;
      this.debuggeeTerminalProcessId = undefined;
      await this.disposeTerminalByProcessId(processId);
    }
  }

  private async disposeTerminalByProcessId(processId: number): Promise<void> {
    for (const terminal of vscode.window.terminals) {
      if ((await terminal.processId) === processId) {
        terminal.dispose();
        return;
      }
    }
  }

  private async createDebugAdapterImplementation(session: vscode.DebugSession,
    executable: vscode.DebugAdapterExecutable | undefined): Promise<vscode.DebugAdapterDescriptor> {
    if (session.workspaceFolder !== undefined) {
      this.currentWorkspacePath = session.workspaceFolder.uri.path;
    }
    await this.checkCurrentExecution();
    const config = <CangjieDebugConfiguration>session.configuration;
    if (config === null) {
      throw new Error('debug configuration not found');
    }
    let pythonPath = PythonRuntimeValidator.ensurePythonRuntime();
    await this.setReverseDebugStatus(config);
    await this.buildBeforeLaunch(config);
    let envConfInstance = new CangjieEnvConfiguration(config.vmMode ? 'CJVM' : 'CJNative');
    if (checkIsValid(pythonPath)) {
      envConfInstance.pythonPath = pythonPath;
    }
    if (config.vmMode === true && config.remote !== true) {
      await this.startCjvmDebug(envConfInstance, config);
    }
    let port = await this.startDapServer(envConfInstance, config);
    const debugAdapter = await this.createDebugAdapter(port, config);
    if (debugAdapter.socketConnect) {
      return new DebugAdapterInlineImplementation(debugAdapter);
    }
    this.currentServerExecution?.terminate();
    if (!CangjieDebugAdapterDescriptorFactory.dapServerStartStatus) {
      throw new Error('Debug server failed to start');
    }
    throw new Error(`server socket on ${port} not established`);
  }

  private async buildBeforeLaunch(config: CangjieDebugConfiguration): Promise<void> {
    const isBuildBeforeLaunch = config.preLaunchTask === undefined && config.request === 'launch' &&
      checkIsValid(config.buildBeforeLaunch);
    if (isBuildBeforeLaunch && utils.isCangjieProject() && utils.isBuildCommandAvailable()) {
      await vscode.workspace.saveAll(false);
      await utils.buildCangjieProject();
    }
  }

  private async setReverseDebugStatus(config: CangjieDebugConfiguration): Promise<void> {
    const enableCangjieReverseDebug = CangjieReverseDebug.supportReverseDebug(config.vmMode);
    await vscode.commands.executeCommand('setContext', 'enableCangjieReverseDebug', enableCangjieReverseDebug);
    CangjieReverseDebug.instance = new CangjieReverseDebug();
    if (enableCangjieReverseDebug) {
      vscode.commands.executeCommand('setContext', 'isCangjieReverseDebugMode', false);
      config[reverseDebugConfigName] = CangjieReverseDebug.instance;
    }
    ReverseDebugConfigProperty.instance = new ReverseDebugConfigProperty();
  }

  private async startDapServer(envConfInstance: CangjieEnvConfiguration, config: CangjieDebugConfiguration): Promise<number> {
    const serverLogPath = utils.getServerLogPath();
    if (!fs.existsSync(serverLogPath)) {
      fs.mkdirSync(serverLogPath, { recursive: true });
    }
    let dapServerPath = utils.getDapServerPath(config.vmMode);
    if (utils.getOs() !== 'win') {
      // Linux 和 Mac 上为 dap_server 赋权，权限550
      utils.setExecPermission(dapServerPath);
    }
    let options: ShellExecutionOptions = Object.assign({}, {env: envConfInstance.getEnvConfig()},
      envConfInstance.executableOptions);
    // 查找可用端口
    const port = await utils.findAPortNotInUse(portLowerBound, portHigherBound);
    const multiCmd = await this.generateDapServerStartCommand(envConfInstance, config, port, serverLogPath);
    const task = new vscode.Task({
      type: `${debugType}-${Date.now()}`,
    }, TaskScope.Workspace, 'dap_server', debugType, new ShellExecution(multiCmd, [], options));
    task.isBackground = true;
    task.presentationOptions = {
      reveal: TaskRevealKind.Never,
      focus: false,
    };
    CangjieDebugAdapterDescriptorFactory.dapServerStartStatus = true;
    const execution = await utils.toPromise(vscode.tasks.executeTask(task));
    this.currentServerExecution = execution;
    utils.onTaskProcessEnded(execution, (endEvent: vscode.TaskProcessEndEvent) => {
      this.currentServerExecution = null;
      if (endEvent.exitCode !== 0) {
        CangjieDebugAdapterDescriptorFactory.dapServerStartStatus = false;
      }
    });
    return port;
  }

  private async generateDapServerStartCommand(envConfInstance: CangjieEnvConfiguration,
    config: CangjieDebugConfiguration, port: number, serverLogPath: string): Promise<string> {
    const cmd = utils.getDapServerPath(config.vmMode);
    const args: string[] = [
      serverPortArgPrefix + port
    ];
    let logEnable = <boolean>vscode.workspace.getConfiguration(logSettingsPrefix).
      get(enableDAPCommunicationLogSettingsName);
    if (logEnable) {
      args.push(serverLogPathArgPrefix + utils.unifySlashOfPath(serverLogPath));
    } else {
      args.push(serverLogEnableArgPrefix + 0);
    }
    let multiCmd = `"${cmd}" ${args.join(' ')}`;
    switch (getOs()) {
      case 'win': {
        const pythonBinPath = checkIsValid(envConfInstance.pythonPath)
          ? PythonRuntimeValidator.getPythonExecutableDirectory(envConfInstance.pythonPath) : '';
        multiCmd = [pythonBinPath ? `set "PATH=${pythonBinPath};%PATH%"` : '',
          `call "${envConfInstance.envSetupCommand}"`,
          `${multiCmd}`].filter(Boolean).join(' && ');
        break;
      }
      case 'linux': {
        const pythonLibraryPaths = checkIsValid(envConfInstance.pythonPath)
          ? PythonRuntimeValidator.getPythonLibraryPaths(envConfInstance.pythonPath) : [];
        const ldPath = [...pythonLibraryPaths,
          `${getSdkPath()}/third_party/llvm/lib`].filter(Boolean).join(':');
        multiCmd = `export LD_LIBRARY_PATH="${ldPath}:\${LD_LIBRARY_PATH}";${multiCmd}`;
        break;
      }
      case 'mac': {
        const pythonLibraryPaths = checkIsValid(envConfInstance.pythonPath)
          ? PythonRuntimeValidator.getPythonLibraryPaths(envConfInstance.pythonPath) : [];
        const ldPath = [...pythonLibraryPaths,
          `${getSdkPath()}/third_party/llvm/lib`, `${getSdkPath()}/tools/lib`].filter(Boolean).join(':');
        multiCmd = `export DYLD_LIBRARY_PATH="${ldPath}:\${DYLD_LIBRARY_PATH}";${multiCmd}`;
        break;
      }
      default:
        break;
    }
    return multiCmd;
  }

  private async startCjvmDebug(envConfInstance: CangjieEnvConfiguration, config: CangjieDebugConfiguration): Promise<void> {
    const args = await getVmParams(config);
    let options: ShellExecutionOptions = Object.assign({}, {env: envConfInstance.getEnvConfig()},
      envConfInstance.executableOptions);
    options.env['JETVMPROP'] = `-Djet.cjti.startServer -Djet.cjti.remotePort=${config.vmPort} -Xint`;
    let consoleTitle = 'cangjieDebug';
    if (config.program !== undefined) {
      consoleTitle = config.program;
      if (consoleTitle.lastIndexOf('/') !== -1) {
        consoleTitle = consoleTitle.substring(consoleTitle.lastIndexOf('/') + 1);
      }
    }
    const cjvmMultiCmd = `${envConfInstance.envSetupCommand + envConfInstance.commandSeparator
      + envConfInstance.getCjPath()} ${args.join(' ')}`;
    const cjvmShell = new vscode.Task({
      type: `${debugType}-${Date.now()}`,
    }, TaskScope.Workspace, consoleTitle, debugType, new ShellExecution(cjvmMultiCmd, [], options));
    cjvmShell.isBackground = true;
    cjvmShell.presentationOptions = {
      reveal: TaskRevealKind.Always,
      echo: true,
      focus: true,
      showReuseMessage: false,
      clear: true,
    };
    const shellExecution = await utils.toPromise(vscode.tasks.executeTask(cjvmShell));
    await utils.delay(delay100);
    utils.onTaskEnded(shellExecution, () => this.cjvmExecution = null);
    this.cjvmExecution = shellExecution;
  }

  private async checkCurrentExecution(): Promise<void> {
    try {
      await utils.executeScheduledTask(() => {
        if (this.currentServerExecution === null) {
          throw new Error('last execution finished');
        }
      }, this.taskWaitTimeMillis, this.taskExecuteCount);
    } catch (e) {
      // ignore error
    }
    if (this.currentServerExecution !== null) {
      throw new Error(`${utils.getDapServerName()} is still running, please stop current debugging`);
    }
  }

  private async createDebugAdapter(port: number,
    config: CangjieDebugConfiguration): Promise<CangjieSocketDebugAdapter> {
    const debugAdapter = new CangjieSocketDebugAdapter(port, config);
    await debugAdapter.init();
    // terminate when step out of main method
    debugAdapter.addMessageListener('response', 'stepOut', msg => {
      const response = <DebugProtocol.StepOutResponse>msg;
      if (!response.success && response.message.indexOf('not meaningful in the outermost frame.') >= 0) {
        debugAdapter.terminate();
      }
    });
    // handle debuggee exited with error
    debugAdapter.addMessageListener('event', 'exited', msg => {
      const exited = <DebugProtocol.ExitedEvent>msg;
      if (exited.body.exitCode !== 0) {
        vscode.window.showErrorMessage(`target program exited with code ${exited.body.exitCode}`);
      }
    });
    // set the default number of variable views
    debugAdapter.addMessageFilter('request', 'variables', msg => {
      const request = <DebugProtocol.VariablesRequest>msg;
      if (request.arguments.start === undefined) {
        request.arguments.start = 0;
        request.arguments.count = 1000;
      }
      return request;
    });
    // handle server failed to exit when disconnecting, should be removed when server is fixed
    debugAdapter.addMessageListener('request', 'disconnect', () => {
      const cachedExecution = this.currentServerExecution;
      const cangjieExecution = this.cjvmExecution;
      setTimeout(() => {
        if (!config.vmMode && config.request === 'launch' && getOs() !== 'win' && checkIsValid(this.shellProcessId)) {
          try {
            child_process.execSync(`kill -9 ${this.shellProcessId}`, { stdio: 'ignore' });
          } catch (e) {
            // do nothing
          }
        }
        if (cachedExecution) {
          cachedExecution.terminate();
        }
        if (cangjieExecution) {
          cangjieExecution.terminate();
        }
      }, this.serverTerminateTimeMillis);
    });
    // do not need breakpoint event now.
    debugAdapter.addMessageFilter('event', 'breakpoint', msg => {
      return null;
    });
    // get pid of the shell that started the debuggee
    debugAdapter.addMessageFilter('response', 'runInTerminal', msg => {
      const response = <DebugProtocol.RunInTerminalResponse>msg;
      this.shellProcessId = response.body.shellProcessId;
      this.debuggeeTerminalProcessId = response.body.shellProcessId;
      return response;
    });
    // support debug in console.
    debugAdapter.addMessageFilter('request', 'evaluate', msg => {
      const request = <DebugProtocol.EvaluateRequest>msg;
      if (request.arguments.context !== 'repl') {
        return request;
      }
      let debugCommand = request.arguments.expression;
      if (!utils.isFieldLengthRight(debugCommand, 'command')) {
        return null;
      }
      const commandPrefix = '-exec';
      if (debugCommand.indexOf(commandPrefix) !== 0) {
        return request;
      }
      debugCommand = utils.trimAllStartSpace(debugCommand.substring(commandPrefix.length));
      const match = /[a-z]|-/;
      if (match.test(debugCommand.charAt(0))) {
        const args = {
          debugCommand,
        };
        utils.sendRequest('debugInConsole', args).then(debugInConsoleResponseBody => {
          const outputMsg = utils.standardDebugReplyMsg(debugInConsoleResponseBody.output);
          const outputEvent = {
            body: {
              category: 'stdout',
              output: outputMsg,
            },
            event: 'output',
            seq: 0,
            type: 'event',
          };
          debugAdapter.serverMsgEventEmitter.fire(outputEvent);
        });
      } else {
        const outputEvent = {
          body: {
            category: 'stderr',
            output: 'illegal command: The command must start with a lowercase letter or \'-\'.',
          },
          event: 'output',
          seq: 0,
          type: 'event',
        };
        debugAdapter.serverMsgEventEmitter.fire(outputEvent);
      }
      return null;
    });
    // Do not catch SIGSEGV signal by default.
    debugAdapter.addMessageListener('response', 'configurationDone', msg => {
      const args = {
        debugCommand: 'process handle -p true -s false -n false SIGSEGV',
      };
      utils.sendRequest('debugInConsole', args);
      if (getOs() === 'mac') {
        const args = {
          debugCommand: 'process handle -p true -s false SIGBUS SIGABRT',
        };
        utils.sendRequest('debugInConsole', args);
      }
    });
    // configure Cangjie environment variables for remote launch
    debugAdapter.addMessageListener('request', 'launch', msg => {
      const request = <DebugProtocol.LaunchRequest>msg;
      request.arguments['env'] = CangjieDependencyBuilder.appendRuntimePath(request.arguments['env']);
      if (config.vmMode === true) {
        if (!request.arguments['scriptCommands']) {
          request.arguments['scriptCommands'] = [];
        }
        let javaRootPath = this.currentWorkspacePath;
        if (config.javaRootPath !== undefined) {
          ({javaRootPath} = config);
        }
        request.arguments['scriptCommands'].push(`settings set target.source-map ./=${javaRootPath}/`);
      }
      if (request.arguments['remote'] && config.vmMode !== true) {
        const cangjieHome = request.arguments['remoteCangjieSdkPath'];
        if (!request.arguments['scriptCommands']) {
          request.arguments['scriptCommands'] = [];
        }
        request.arguments['scriptCommands'].push(`env PATH=${cangjieHome}/bin:${cangjieHome}/tools/bin::$PATH`);
        request.arguments['scriptCommands'].push(
          `env LD_LIBRARY_PATH=${cangjieHome}/lib/linux_x86_64_cjnative:$\{LD_LIBRARY_PATH}`);
      }
      request.arguments['showStaticGlobalVars'] = true;
      return request;
    });
    debugAdapter.addMessageListener('request', 'attach', msg => {
      const request = <DebugProtocol.AttachRequest>msg;
      request.arguments['showStaticGlobalVars'] = true;
      return request;
    });
    // Limit the creation of data breakpoints to a maximum of 4
    debugAdapter.addMessageFilter('request', 'setDataBreakpoints', msg => {
      const request = <DebugProtocol.SetDataBreakpointsRequest>msg;
      if (request.arguments.breakpoints.length > maximumNumberOfDataBreakpoint) {
        vscode.window.showErrorMessage('The number of dataBreakpoints is not allowed to exceed four.');
        return null;
      }
      return request;
    });
    // Combined display of global variables and static variables
    debugAdapter.addMessageListener('response', 'scopes', msg => {
      const response = <DebugProtocol.ScopesResponse>msg;
      if (config.vmMode === true) {
        for (let i = 0; i < response.body.scopes.length; i++) {
          if (response.body.scopes[i].name === 'Globals') {
            response.body.scopes[i].name = 'Globals & Statics';
          } else if (response.body.scopes[i].name === 'Statics') {
            response.body.scopes.splice(i, 1);
            i--;
          } else {
            // do nothing
          }
        }
      }
      return response;
    });
    debugAdapter.addMessageFilter('request', 'setBreakpoints', msg => {
      const request = <DebugProtocol.SetBreakpointsRequest>msg;
      if (request.arguments.breakpoints.length > 0) {
        if (getOs() === 'win') {
          request.arguments.source.path = request.arguments.source.path.toLowerCase();
        }
        for (let i = 0; i < request.arguments.breakpoints.length; i++) {
          if (!utils.isFieldLengthRight(request.arguments.breakpoints[i].condition, 'breakpoint condition')) {
            request.arguments.breakpoints[i].condition = '';
          }
          if (!utils.isFieldLengthRight(request.arguments.breakpoints[i].hitCondition, 'breakpoint hitCondition')) {
            request.arguments.breakpoints[i].hitCondition = '';
          }
          if (!utils.isFieldLengthRight(request.arguments.breakpoints[i].logMessage, 'breakpoint logMessage')) {
            request.arguments.breakpoints[i].logMessage = '';
          }
        }
      }
      return request;
    });
    debugAdapter.addMessageFilter('request', 'setFunctionBreakpoints', msg => {
      const request = <DebugProtocol.SetFunctionBreakpointsRequest>msg;
      if (request.arguments.breakpoints.length > 0) {
        let functionBreakpoints: DebugProtocol.FunctionBreakpoint[] = [];
        for (let i = 0; i < request.arguments.breakpoints.length; i++) {
          if (!utils.isFieldLengthRight(request.arguments.breakpoints[i].condition, 'breakpoint condition')) {
            request.arguments.breakpoints[i].condition = '';
          }
          if (!utils.isFieldLengthRight(request.arguments.breakpoints[i].hitCondition, 'breakpoint hitCondition')) {
            request.arguments.breakpoints[i].hitCondition = '';
          }
          if (!utils.isFieldLengthRight(request.arguments.breakpoints[i].name, 'breakpoint name')) {
            continue;
          }
          functionBreakpoints.push(request.arguments.breakpoints[i]);
        }
        request.arguments.breakpoints = functionBreakpoints;
      }
      return request;
    });
    debugAdapter.addMessageFilter('request', 'configurationDone', msg => {
      let cacheDataConfigArguments: CacheDataConfigArguments = CangjieReverseDebug.getCacheDataConfig();
      utils.sendRequest('cacheDataConfig', cacheDataConfigArguments);
      return msg;
    });
    debugAdapter.addMessageFilter('response', 'cacheDataConfig', msg => {
      const response = <DebugProtocol.Response>msg;
      if (!response.success) {
        vscode.window.showErrorMessage(response.message);
      }
      return response;
    });

    debugAdapter.addMessageFilter('event', 'output', msg => {
      let event = <DebugProtocol.OutputEvent>msg;
      if (event.body?.category === 'stdout') {
        if (event.body.output && event.body.output === reverseBreakpointLogMsg + '\n') {
          return null;
        }
        if (!event.body.output.endsWith('\n')) {
          event.body.output += '\n';
        }
      }
      return msg;
    });

    if (CangjieReverseDebug.supportReverseDebug(config.vmMode)) {
      debugAdapter.addMessageFilter('response', 'undo', msg => {
        const response = <DebugProtocol.Response>msg;
        if (response.success) {
          let { isCangjieReverseDebugMode } = CangjieReverseDebug.getReverseDebug();
          vscode.commands.executeCommand('setContext', 'isCangjieReverseDebugMode', !isCangjieReverseDebugMode);
          CangjieReverseDebug.getReverseDebug().isCangjieReverseDebugMode = !isCangjieReverseDebugMode;
          if (isCangjieReverseDebugMode && config[lastStoppedEvent] !== undefined &&
            config[lastStoppedEvent] !== null) {
            debugAdapter.fireStoppedEvent(config[lastStoppedEvent]);
          }
        } else {
          vscode.window.showErrorMessage(response.message);
        }
        return response;
      });
      debugAdapter.addMessageFilter('response', 'reverseStep', msg => {
        const response = <DebugProtocol.Response>msg;
        if (!response.success) {
          vscode.window.showErrorMessage(response.message);
        }
        return response;
      });
      debugAdapter.addMessageFilter('response', 'reverseContinue', msg => {
        const response = <DebugProtocol.Response>msg;
        if (!response.success) {
          vscode.window.showErrorMessage(response.message);
        }
        return response;
      });
      debugAdapter.addMessageFilter('response', 'continueInReverse', msg => {
        const response = <DebugProtocol.Response>msg;
        if (!response.success) {
          vscode.window.showErrorMessage(response.message);
        }
        return response;
      });
      debugAdapter.addMessageFilter('response', 'stepInReverse', msg => {
        const response = <DebugProtocol.Response>msg;
        if (!response.success) {
          vscode.window.showErrorMessage(response.message);
        }
        return response;
      });
      debugAdapter.addMessageFilter('event', 'stopped', msg => {
        if (CangjieReverseDebug.supportReverseDebug(config.vmMode) && !config[reverseDebugConfigName].isCangjieReverseDebugMode) {
          config[lastStoppedEvent] = msg;
        }
        return msg;
      });
    }

    if (config.vmMode === true) {
      // in CJVM mode, variable view needs to be refreshed after setVariable because the returned value of the setVariable is incorrect.
      debugAdapter.addMessageListener('response', 'setVariable', msg => {
        if ((msg as any).success === true && (msg as any).body.value === 'Incorrect value') {
          (msg as any).success = false;
          (msg as any).message = 'Incorrect value';
          (msg as any).body.value = '';
        }
        if ((msg as any).success === true) {
          const invalidatedEvent = {
            body: {
              areas: 'variables',
            },
            event: 'invalidated',
            seq: 0,
            type: 'event',
          };
          debugAdapter.serverMsgEventEmitter.fire(invalidatedEvent);
        }
      });
    }

    debugAdapter.addMessageListener('response', 'variables', msg => {
      const response = <DebugProtocol.VariablesResponse>msg;
      if (isEmpty(response.body) || isEmpty(response.body.variables)) {
        return response;
      }
      response.body.variables.forEach( variable => {
        if (config.vmMode === true && variable.type === 'Char') {
          // change char to escape character
          let {value} = variable;
          if (value.length <= 2) {
            value = '\\0';
          } else {
            value = utils.changeToEscapeCharacter(value.substring(1, 2));
          }
          variable.value = `'${value}'`;
        }
        if (variable.value !== null) {
          // delete '\n' of var value to display var in one line, avoid error when setVariables use its origin value
          variable.value = variable.value.replace(/\n/g, '');
        }
      });
      return response;
    });

    // Adjusting the Capability of CJVM
    debugAdapter.addMessageListener('response', 'initialize', msg => {
      let response = <DebugProtocol.InitializeResponse>msg;
      if (config.vmMode === true) {
        response.body.supportSuspendDebuggee = false;
        response.body.supportsDataBreakpoints = false;
        response.body.supportsDisassembleRequest = false;
        response.body.supportsInstructionBreakpoints = false;
        response.body.supportsReadMemoryRequest = false;
        response.body.supportsWriteMemoryRequest = false;
        response.body.supportsConditionalBreakpoints = false;
        response.body.supportsHitConditionalBreakpoints = false;
        response.body.supportsSteppingGranularity = false;
        response['body']['supportsTimeTravelDebugging'] = false;
      }
      return response;
    });

    return debugAdapter;
  }
}
