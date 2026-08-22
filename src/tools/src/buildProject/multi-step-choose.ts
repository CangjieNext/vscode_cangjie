/*
 * Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 * This source file is part of the Cangjie project, licensed under Apache-2.0
 * with Runtime Library Exception.
 *
 * See https://cangjie-lang.cn/pages/LICENSE for license information.
 */

import type { QuickPickItem, Disposable, QuickInput, InputBoxOptions, QuickInputButton } from 'vscode';
import { window, QuickInputButtons } from 'vscode';
import { CustomAction } from '../util/constant-num';
import { Utility } from '../util/utils';

export type InputStep = (input: MultiStepChoose) => Thenable<InputStep | void>;

interface StepPickParameters<T extends QuickPickItem> {
  title: string;
  step?: number;
  totalSteps?: number;
  items: T[];
  activeItem?: T;
  placeholder: string;
  canPickMany?: boolean;
  button?: QuickInputButtons[];
  ignoreFocusOut?: boolean;
}

interface InputBoxParameters {
  inputBoxOptions: InputBoxOptions;
  button?: QuickInputButtons[];
  step?: number;
  totalSteps?: number;
}

function createButtonHandler(resolve: (value: unknown) => void, reject: (reason?: unknown) => void):
  (item: QuickInputButton) => void {
  return (item: QuickInputButton): void => {
    if (item === QuickInputButtons.Back) {
      reject(CustomAction.back);
    } else {
      resolve(item);
    }
  };
}

export class MultiStepChoose {
  private current?: QuickInput;
  private steps: InputStep[] = [];

  static async run<T>(start: InputStep): Promise<void> {
    const choose = new MultiStepChoose();
    return choose.stepThrough(start);
  }

  async showStepPick<T extends QuickPickItem, P extends StepPickParameters<T>>({
    title,
    step,
    totalSteps,
    items,
    placeholder,
    button,
    canPickMany,
    ignoreFocusOut,
  }: P): Promise<unknown> {
    const disposables: Disposable[] = [];
    try {
      return await new Promise<unknown>(
        (resolve, reject) => {
          const pickStep = window.createQuickPick<T>();
          pickStep.title = (step !== null && step !== undefined && step !== 0) ? `${title} (${step}/${totalSteps})` : title;
          pickStep.items = items;
          pickStep.placeholder = placeholder;
          pickStep.buttons = [...(Utility.checkIsValid(button) ? [QuickInputButtons.Back] : [])];
          pickStep.ignoreFocusOut = true;
          if (!ignoreFocusOut) {
            pickStep.ignoreFocusOut = false;
          }
          if (canPickMany) {
            pickStep.canSelectMany = true;
          }
          disposables.push(
            pickStep.onDidTriggerButton(createButtonHandler(resolve, reject)),
            pickStep.onDidHide(() => {
              reject(CustomAction.cancel);
            }),
            pickStep.onDidChangeSelection((changeSelectionItems) => {
              if (Utility.checkIsValid(changeSelectionItems[0]) && !pickStep.canSelectMany) {
                resolve(changeSelectionItems[0]);
              }
            }),
            pickStep.onDidAccept(async () => {
              if (pickStep.canSelectMany) {
                const selectedParams: string[] = [];
                pickStep.selectedItems.forEach((item) => {
                  selectedParams.push(item['target']);
                });
                resolve(selectedParams);
              }
            })
          );
          if (Utility.checkIsValid(this.current)) {
            this.current.dispose();
          }
          this.current = pickStep;
          this.current.show();
        }
      );
    } finally {
      disposables.forEach((d) => d.dispose());
    }
  }

  async showEnterInput<P extends InputBoxParameters>({
    inputBoxOptions,
    button,
    step,
    totalSteps,
  }: P): Promise<unknown> {
    const disposables: Disposable[] = [];
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const input = window.createInputBox();
        input.placeholder = inputBoxOptions.placeHolder;
        input.ignoreFocusOut = inputBoxOptions.ignoreFocusOut;
        input.value = inputBoxOptions.value || undefined;
        input.prompt = inputBoxOptions.prompt;
        input.title = (step !== null && step !== undefined && step !== 0) ? `${inputBoxOptions.title} (${step}/${totalSteps})` : inputBoxOptions.title;
        input.buttons = [...(Utility.checkIsValid(button) ? [QuickInputButtons.Back] : [])];
        disposables.push(
          input.onDidTriggerButton(createButtonHandler(resolve, reject)),
          input.onDidAccept(async () => {
            const didAcceptValue = input.value;
            input.enabled = false;
            input.busy = true;
            resolve(didAcceptValue);
            input.enabled = true;
            input.busy = false;
          }),
          input.onDidHide(() => {
            reject(CustomAction.cancel);
          })
        );
        if (Utility.checkIsValid(this.current)) {
          this.current.dispose();
        }
        this.current = input;
        this.current.show();
      });
    } finally {
      disposables.forEach((d) => d.dispose());
    }
  }

  private async stepThrough<T>(start: InputStep): Promise<void> {
    let step: InputStep | void = start;
    while (step) {
      this.steps.push(step);
      if (Utility.checkIsValid(this.current)) {
        this.current.enabled = false;
        this.current.busy = true;
      }
      try {
        step = await step(this);
      } catch (err) {
        if (err === CustomAction.back) {
          this.steps.pop();
          step = this.steps.pop();
        } else if (err === CustomAction.resume) {
          step = this.steps.pop();
        } else if (err === CustomAction.cancel) {
          step = undefined;
        } else {
          throw err;
        }
      }
    }
    if (Utility.checkIsValid(this.current)) {
      this.current.dispose();
    }
  }
}
