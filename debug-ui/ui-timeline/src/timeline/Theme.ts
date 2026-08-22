// Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
// This source file is part of the Cangjie project, licensed under Apache-2.0
// with Runtime Library Exception.
//
// See https://cangjie-lang.cn/pages/LICENSE for license information.

import {getBackgroundTheme, TEXT_FONT_FAMILY, IdeType} from '@bitfun-dap/ui-common';

export function getMainTimelineTheme(isDarkTheme: boolean): MainTimelineTheme {
  return isDarkTheme ? MAIN_TIMELINE_DARK_THEME : MAIN_TIMELINE_LIGHT_THEME;
}

export function getRecordsLineTheme(isDarkTheme: boolean, ideType: IdeType): RecordsLineTheme {
  let recordsLineTheme : RecordsLineTheme = isDarkTheme ? RECORDS_LINE_DARK_THEME : RECORDS_LINE_LIGHT_THEME;
  recordsLineTheme.selectedRecord = getBackgroundTheme(ideType, isDarkTheme);
  return recordsLineTheme;
}

export function getTooltipTheme(isDarkTheme: boolean): TooltipTheme {
  return isDarkTheme ? TOOLTIP_DARK_THEME : TOOLTIP_LIGHT_THEME;
}

export interface MainTimelineTheme {
  scaleLine: string;
  selectedInterval: string;
  selectedIntervalHighLight: string;
  scalePointer: string;
  scalePointerHighlight: string;
  fontFamily: string;
}

const MAIN_TIMELINE_LIGHT_THEME: MainTimelineTheme = {
  scaleLine: '#616161',
  selectedInterval: '#B2B2B2',
  selectedIntervalHighLight: '#494949',
  scalePointer: '#007ACC',
  scalePointerHighlight: '#021c83',
  fontFamily: TEXT_FONT_FAMILY,
};

const MAIN_TIMELINE_DARK_THEME: MainTimelineTheme = {
  scaleLine: '#CCCCCC',
  selectedInterval: '#B2B2B2',
  selectedIntervalHighLight: '#F8F6F6E8',
  scalePointer: '#0090F1',
  scalePointerHighlight: '#51c0fa',
  fontFamily: TEXT_FONT_FAMILY,
};

export interface RecordsLineTheme {
  line: string;
  record: string;
  recordStroke: string;
  selectedRecord: string;
  font: string;
  fontSize: number;
  fontFamily: string;
}

const RECORDS_LINE_DARK_THEME: RecordsLineTheme = {
  line: '#E7E7E7',
  font: '#CCCCCC',
  record: '#E51400',
  recordStroke:'#E51400',
  selectedRecord: '#E51400',
  fontSize: 12,
  fontFamily: TEXT_FONT_FAMILY,
};

const RECORDS_LINE_LIGHT_THEME: RecordsLineTheme = {
  line: '#444444',
  font: '#616161',
  record: '#E51400',
  recordStroke: '#E51400',
  selectedRecord: '#E51400',
  fontSize: 12,
  fontFamily: TEXT_FONT_FAMILY,
};

export interface TooltipTheme {
  stroke: string;
  fill: string;
  font: string;
  fontSize: number;
  fontFamily: string;
}

const TOOLTIP_LIGHT_THEME: TooltipTheme = {
  fill: '#f5f4f4',
  font: '#616161',
  fontFamily: TEXT_FONT_FAMILY,
  fontSize: 12,
  stroke: '#919191',
};

const TOOLTIP_DARK_THEME: TooltipTheme = {
  fill: '#3C3C3C',
  font: '#CCCCCC',
  fontFamily: TEXT_FONT_FAMILY,
  fontSize: 12,
  stroke: '#919191',
};
