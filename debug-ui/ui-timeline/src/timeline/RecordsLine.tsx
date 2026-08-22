// Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
// This source file is part of the Cangjie project, licensed under Apache-2.0
// with Runtime Library Exception.
//
// See https://cangjie-lang.cn/pages/LICENSE for license information.

import {Circle, Group, Label, Line, Rect, Tag, Text} from '../konva/react-konva';
import React, {useContext, useEffect, useState} from 'react';
import Konva from 'konva';
import {IsThemeDark, SelectedRecordId} from './Contexts';
import {
  RECORD_ICON_RADIUS,
  RECORD_POINTS_LINE_SPACING,
  RECORD_TOOLTIP_BACKGROUND_DARK_THEME,
  RECORD_TOOLTIP_BACKGROUND_LIGHT_THEME,
  RECORD_TOOLTIP_FONT_COLOR_LIGHT_THEME,
  RECORD_TOOLTIP_STROKE_COLOR,
  TEXT_FONT_COLOR_DARK_THEME,
  TEXT_FONT_FAMILY,
} from './Constants';
import {getRecordsLineTheme, getTooltipTheme, RecordsLineTheme} from './Theme';
import {Tooltip} from './Tooltip';
import {RecordMessageRequestProps, RecordMessageRequestType} from '../message/protocol/RecordMessageType';
import {sendGotoRecordPointRequest} from '../message/protocol/GotoRecordPointType';
import {RecordProps} from '../message/protocol/AllRecordsType';
import {getRecordLineLabelWidth} from './Utils';
import {createShowErrorMessage, getIdeType, MessageManager} from '@bitfun-dap/ui-common';

const LINE_LABEL_HEIGHT = 10;

interface RecordsLineProps {
  records: RecordProps[];

  groups: Map<number, [number, string]>;

  timeSelection: [number, number];

  myTotalPixelWidth: number;

  windowHeight: number;

  windowWidth: number;

  scrollLayerY: number;
}

interface RecordIconProps {
  pos: [number, number];

  record: RecordProps;

  window: [number, number];

  scrollLayerY: number;
}

interface RecordTooltipProps {
  type: string;

  line?: number;

  file?: string;
}

interface RecordTipPos {
  labelX: number;

  labelY: number;

  points: number[];
}

const RecordIcon =
    (props: { isSelected: boolean; showRecord: RecordIconProps; recordsLineTheme: RecordsLineTheme}): JSX.Element => {
  const {isSelected, showRecord, recordsLineTheme} = props;
  let [posX, posY] = showRecord.pos;

  return (
    <Circle
      fill={isSelected ? recordsLineTheme.selectedRecord : recordsLineTheme.record}
      radius={RECORD_ICON_RADIUS}
      stroke={recordsLineTheme.record}
      strokeWidth={isSelected ? 3 : 0}
      x={posX}
      y={posY}
    />
  );
};

const RecordTooltip = (props: { recordShowProps: RecordIconProps; recordTipData: RecordTooltipProps }): JSX.Element => {
  const {recordShowProps, recordTipData} = props;
  let isDark = useContext(IsThemeDark);
  let [windowWidth, windowHeight] = recordShowProps.window;
  let [x, y] = recordShowProps.pos;
  let scrollLayerY = recordShowProps.scrollLayerY;
  let message = `Type:    ${recordTipData.type}\n
  Line:    ${(recordTipData.line === undefined ? '' : recordTipData.line)}\n
  File:    ${(recordTipData.file === undefined ? '' : recordTipData.file)}`;
  let tipHeight = getRecordTipHeight(message);
  // horizontal compare: if the left width of record greater than right width of record,
  // the recordTip is displayed on the left. Conversely, it's displayed on the right.
  let changPosOnRight = x > (windowWidth - x);
  // vertical compare: if the top width of record greater than bottom width of record,
  // the recordTip is displayed on the top. Conversely, it's displayed on the bottom.(scrollLayerY <= 0)
  let changPosOnBottom = y + scrollLayerY > (windowHeight - scrollLayerY - y);
  let recordTipPos = getRecordTipPos(changPosOnRight, changPosOnBottom, tipHeight, [x, y]);

  return (
    <>
      <Line
        closed={true}
        fill={isDark ? RECORD_TOOLTIP_BACKGROUND_DARK_THEME : RECORD_TOOLTIP_BACKGROUND_LIGHT_THEME}
        opacity={1}
        points={recordTipPos.points}
        rotation={0}
        stroke={RECORD_TOOLTIP_STROKE_COLOR}
        strokeWidth={0.3}
        x={x}
        y={y + 15}
      />
      <Label
        x={recordTipPos.labelX}
        y={recordTipPos.labelY}
      >
        <Tag/>
        <Text
          fill={isDark ? TEXT_FONT_COLOR_DARK_THEME : RECORD_TOOLTIP_FONT_COLOR_LIGHT_THEME}
          fontFamily={TEXT_FONT_FAMILY}
          fontSize={12}
          opacity={0.9}
          padding={4}
          text={message}
          width={240}
        />
      </Label>
    </>
  );
};

const RecordMask = (props: { isSelected: boolean; pos: [number, number] }): JSX.Element => {
  const {isSelected, pos} = props;
  let [x, y] = pos;

  return (
    <>
      <Rect
        height={isSelected ? 16 : 14}
        opacity={0}
        width={isSelected ? 16 : 14}
        x={isSelected ? x - 8 : x - 7}
        y={isSelected ? y - 8 : y - 7}
      />
    </>
  );
};

export const RecordsLine = (props: RecordsLineProps): JSX.Element => {
  const {records, timeSelection, myTotalPixelWidth, windowHeight, windowWidth, groups, scrollLayerY} = props;
  const isThemeDark = useContext(IsThemeDark);
  const ideType = getIdeType();
  const recordsLineTheme: RecordsLineTheme = getRecordsLineTheme(isThemeDark, ideType);
  const tooltipTheme = getTooltipTheme(isThemeDark);
  const labelWidth = getRecordLineLabelWidth(records, windowWidth, ideType);

  let [showLineLabelTooltipId, setShowLineLabelTooltipId] = useState<number>(-1);

  let [showTipId, setShowTipId] = useState<number>(-1);
  let [isShowTip, setIsShowTip] = useState<boolean>(false);
  let globalSelectedRecordId = useContext(SelectedRecordId);
  let [selectedRecordId, setSelectedRecordId] = useState<undefined | number>(globalSelectedRecordId);
  let [recordTipData, setRecordTipData] = useState<RecordTooltipProps>({
    type: '',
    line: undefined,
    file: undefined,
  });
  useEffect(() => {
    setSelectedRecordId(globalSelectedRecordId);
  }, [globalSelectedRecordId]);

  let totalPixelWidth = myTotalPixelWidth;
  let window: [number, number] = [windowWidth, windowHeight];

  let showRecords: RecordIconProps[] = records.filter(r => isShowRecord(r, timeSelection)).map(
    record => {
      let x;
      if (timeSelection[0] === timeSelection[1]) {
        x = totalPixelWidth >> 1;
      } else {
        x = (record.dateTimeStamp - timeSelection[0]) * totalPixelWidth / (timeSelection[1] - timeSelection[0]);
      }
      x += labelWidth;
      let lineMsg = groups.get(record.threadId);
      let y = lineMsg === undefined ? 0 : lineMsg[0] * RECORD_POINTS_LINE_SPACING;
      return {record: record, window: window, pos: [x, y], scrollLayerY};
    }
  );

  useEffect(() => {
    if (showTipId === -1) {
      setRecordTipData({
        type: '',
        line: undefined,
        file: undefined,
      });
      setIsShowTip(false);
      return;
    }
    let recordMessageProps: RecordMessageRequestProps = {
      recordPointIds: [showTipId],
      requireStackFrame: true,
    };
    for (let i = 0; i < showRecords.length; i++) {
      if (showRecords[i].record.id === showTipId) {
        if (getIdeType() === 'Standalone') {
          setRecordTipData({
            type: showRecords[i].record.type,
            line: undefined,
            file: undefined,
          });
          setIsShowTip(showTipId !== -1);
          return;
        }
        MessageManager.instance().sendRequest(RecordMessageRequestType, recordMessageProps).then(response => {
          setRecordTipData({
            type: showRecords[i].record.type,
            line: response.recordMessages[0].line,
            file: response.recordMessages[0].sourcePath,
          });
          setIsShowTip(showTipId !== -1);
        }).catch(
          reason => MessageManager.instance().sendEvent(createShowErrorMessage(reason))
        );
      }
    }
  }, [showTipId]);

  function gotoRecordPoint(gotoRecordId: number): void {
    if (gotoRecordId === undefined) {
      return;
    }
    if (selectedRecordId !== gotoRecordId) {
      sendGotoRecordPointRequest({recordPointId: gotoRecordId}, setSelectedRecordId);
    }
  }

  return (
    <>
      {Array.from(groups.entries()).map(entry => (
        <Group
          key={entry[0]}
        >
          <Group
            key={`${entry[0]}-label`}
            onMouseEnter={(): void => setShowLineLabelTooltipId(entry[0])}
            onMouseLeave={(): void => setShowLineLabelTooltipId(-1)}
          >
            <Label
              height={LINE_LABEL_HEIGHT}
              width={labelWidth}
              y={entry[1][0] * RECORD_POINTS_LINE_SPACING - LINE_LABEL_HEIGHT / 2}
            >
              <Text
                fill={recordsLineTheme.font}
                fontFamily={recordsLineTheme.fontFamily}
                text={getAbbrLabelContent(entry[1][1], labelWidth)}
                fontSize={12}
              />
            </Label>
          </Group>
          <Rect
            fill={recordsLineTheme.line}
            height={1}
            width={totalPixelWidth}
            x={labelWidth}
            y={entry[1][0] * RECORD_POINTS_LINE_SPACING}
            opacity={0.5}
          />
        </Group>
      ))}
      {showRecords.map(record => (
        <Group
          key={record.record.id}
          onMouseDown={(): void => gotoRecordPoint(record.record.id)}
          onMouseEnter={(): void => setShowTipId(record.record.id)}
          onMouseLeave={(): void => setShowTipId(-1)}
        >
          <RecordIcon
            isSelected={record.record.id === selectedRecordId}
            showRecord={record}
            recordsLineTheme={recordsLineTheme}
          />
          <RecordMask
            isSelected={record.record.id === selectedRecordId}
            pos={record.pos}
          />
        </Group>
      ))}
      {Array.from(groups.entries()).filter(entry =>
          entry[0] === showLineLabelTooltipId &&
          getAbbrLabelContent(entry[1][1], labelWidth) !== entry[1][1]).map(entry => (
        <Group
          key={entry[0]}
        >
          <Tooltip
            heightRange={[0, windowHeight]}
            maxTooltipWidth={windowWidth}
            targetHeight={LINE_LABEL_HEIGHT}
            message={entry[1][1]}
            startPos={[labelWidth / 3, entry[1][0] * RECORD_POINTS_LINE_SPACING + LINE_LABEL_HEIGHT / 2]}
            theme={tooltipTheme}
            widthRange={[0, windowWidth]}
          />
        </Group>
      ))}
      {showRecords.filter(r => r.record.id === showTipId && isShowTip).map(tip => {
        return (
          <Group
            key={tip.record.id}
          >
            <RecordTooltip
              recordShowProps={tip}
              recordTipData={recordTipData}
            />
          </Group>
        );
      })}
    </>
  );
};

function isShowRecord(record: RecordProps, timeSelection: [number, number]): boolean {
  return record.dateTimeStamp >= timeSelection[0] && record.dateTimeStamp <= timeSelection[1];
}

function getRecordTipPos(changPosOnRight: boolean, changPosOnBottom: boolean, tipHeight: number, pos:
  [number, number]): RecordTipPos {
  let [x, y] = pos;
  let recordTipPos: RecordTipPos;
  if (!changPosOnRight && !changPosOnBottom) {
    recordTipPos = {
      points: [0, -4, 6, 6, 230, 6, 230, tipHeight + 14, -20, tipHeight + 14, -20, 6, -6, 6],
      labelX: x - 15,
      labelY: y + 26,
    };
  } else if (changPosOnRight && !changPosOnBottom) {
    recordTipPos = {
      points: [0, -4, -6, 6, -230, 6, -230, tipHeight + 14, 20, tipHeight + 14, 20, 6, 6, 6],
      labelX: x - 225,
      labelY: y + 26,
    };
  } else if (!changPosOnRight && changPosOnBottom) {
    recordTipPos = {
      points: [0, -24, 6, -34, 230, -34, 230, -tipHeight - 44, -20, -tipHeight - 44, -20, -34, -6, -34],
      labelX: x - 15,
      labelY: y + (-tipHeight - 24),
    };
  } else {
    recordTipPos = {
      points: [0, -24, 6, -34, 20, -34, 20, -tipHeight - 44, -230, -tipHeight - 44, -230, -34, -6, -34],
      labelX: x - 225,
      labelY: y + (-tipHeight - 24),
    };
  }
  return recordTipPos;
}

function getRecordTipHeight(message: string): number {
  return new Konva.Text({
    text: message,
    fontFamily: TEXT_FONT_FAMILY,
    fontSize: 12,
    padding: 4,
    fill: RECORD_TOOLTIP_FONT_COLOR_LIGHT_THEME,
    width: 240,
  }).height();
}

function getAbbrLabelContent(content: string, labelWidth: number): string {
  let labelCharacterCount = content.length;
  let showCharacterCount: number = labelWidth / 6;
  if (showCharacterCount >= labelCharacterCount) {
    return content;
  }
  if (showCharacterCount - 3 < 0) {
    return `${content.charAt(0)}...`;
  }
  return `${content.substring(0, showCharacterCount - 3)}...`;
}
