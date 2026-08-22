// Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
// This source file is part of the Cangjie project, licensed under Apache-2.0
// with Runtime Library Exception.
//
// See https://cangjie-lang.cn/pages/LICENSE for license information.

import {Group, Layer, Stage} from '../konva/react-konva';
import React, {useContext, useEffect, useRef, useState} from 'react';
import Konva from 'konva';
import {MouseLeaveHandlers, MouseMoveHandlers, MouseUpHandlers, SelectedRecordId} from './Contexts';
import {RecordsLine} from './RecordsLine';
import {MainTimeline} from './MainTimeline';
import {
  MAIN_TIMELINE_STAGE_HEIGHT, RECORD_ICON_RADIUS,
  RECORD_POINTS_LINE_SPACING,
  TIMELINE_STAGE_BORDER_WIDTH
} from './Constants';
import {RecordProps} from '../message/protocol/AllRecordsType';
import {getRecordLineLabelWidth, getThreadGroup} from './Utils';
import { getIdeType } from '@bitfun-dap/ui-common';

interface TimelineStageProps {
  records: RecordProps[];

  totalTimeMille: number;

  windowHeight: number;

  windowWidth: number;
}

export const TimelineStage: (props: TimelineStageProps) => JSX.Element = (props: TimelineStageProps): JSX.Element => {
  const {records, totalTimeMille, windowHeight, windowWidth} = props;
  const mouseMoveHandlers: React.MutableRefObject<Set<(evt: Konva.KonvaEventObject<MouseEvent>) => void>> = useRef(new Set());
  const mouseUpHandlers: React.MutableRefObject<Set<(evt: Konva.KonvaEventObject<MouseEvent>) => void>> = useRef(new Set());
  const mouseLeaveHandlers: React.MutableRefObject<Set<(evt: Konva.KonvaEventObject<MouseEvent>) => void>> = useRef(new Set());

  const recordsLineLabelWidth = getRecordLineLabelWidth(records, windowWidth, getIdeType());
  const timelineStageWidth = windowWidth - TIMELINE_STAGE_BORDER_WIDTH;
  const mainTimelineStageWidth = timelineStageWidth - recordsLineLabelWidth;
  const recordsLineStageHeight = windowHeight - MAIN_TIMELINE_STAGE_HEIGHT - 20;

  let [timeSelection, setTimeSelection] = useState<[number, number]>([0, totalTimeMille - 1]);
  let timeSelectionSetter = (curTimeSelection: [number, number]): void => setTimeSelection(curTimeSelection);
  let [scrollLayerY, setScrollLayerY] = useState(0);
  let selectedRecordId = useContext(SelectedRecordId);
  let timeStampSelectedRecord = 0;
  records.forEach(r => {
    if (r.id === selectedRecordId) {
      timeStampSelectedRecord = r.dateTimeStamp;
    }
  });

  useEffect(() => {
    setScrollLayerY(0);
  });

  // group by thread
  // number, [number, string]: groupKey, [rowIndex, groupValue]
  let groups: Map<number, [number, string]>;
  if (records.length === 0) {
    groups = new Map([[0, [0, '']]]);
  } else {
    groups = getThreadGroup(records);
  }
  // change scrollLayerY when selected record changed
  useEffect(() => {
    let record = records.filter(r => r.id === selectedRecordId);
    if (record.length === 0) {
      return;
    }
    let lineMsg = groups.get(record[0].threadId);
    // y is ordinate of the center of the selected record
    let y = lineMsg === undefined ? 0 : lineMsg[0] * RECORD_POINTS_LINE_SPACING;
    // do not change scrollLayerY if selected record is in the current scroll window
    if (y >= -scrollLayerY && y <= (recordsLineStageHeight - scrollLayerY - RECORD_ICON_RADIUS * 4)) {
      return;
    }
    // scrollLayerY <= 0; scrollLayerY == 0 when scroll to the top; scrollLayerY < 0 when scroll down
    setScrollLayerY(-Math.max(y + RECORD_ICON_RADIUS * 4 - recordsLineStageHeight, 0));
  }, [selectedRecordId]);

  return (
    <MouseLeaveHandlers.Provider value={mouseLeaveHandlers.current}>
      <MouseUpHandlers.Provider value={mouseUpHandlers.current}>
        <MouseMoveHandlers.Provider value={mouseMoveHandlers.current}>
          <Stage
            height={MAIN_TIMELINE_STAGE_HEIGHT}
            width={timelineStageWidth + 2}
            x={recordsLineLabelWidth}
            onMouseLeave={(evt: Konva.KonvaEventObject<MouseEvent>): void => {mouseLeaveHandlers.current.forEach(func => func(evt))}}
            onMouseMove={(evt: Konva.KonvaEventObject<MouseEvent>): void => {mouseMoveHandlers.current.forEach(func => func(evt))}}
            onMouseUp={(evt: Konva.KonvaEventObject<MouseEvent>): void => {mouseUpHandlers.current.forEach(func => func(evt))}}
          >
            <Layer>
              <Group>
                <MainTimeline
                  selectionTimeSetter={timeSelectionSetter}
                  timeStampSelectedRecord={timeStampSelectedRecord}
                  totalPixelWidth={mainTimelineStageWidth}
                  totalTimeMille={totalTimeMille}
                />
              </Group>
            </Layer>
          </Stage>
          <Stage
            height={recordsLineStageHeight}
            width={timelineStageWidth}
            onWheel={(e: Konva.KonvaEventObject<WheelEvent>): void => {
              if (e.evt.ctrlKey) {
                return;
              }
              e.evt.preventDefault();
              let dy = e.evt.deltaY;
              let linesTotalHeight = calculateRecordLinesHeight(records);
              if (linesTotalHeight < recordsLineStageHeight) {
                setScrollLayerY(0);
                return;
              }
              let minY = -(linesTotalHeight - recordsLineStageHeight);
              let maxY = 0;
              let y = Math.max(minY, Math.min(scrollLayerY - dy, maxY));
              setScrollLayerY(y);
            }}
          >
            <Layer
              y={scrollLayerY}
            >
              <Group
                y={10}
              >
                <RecordsLine
                  records={records}
                  groups={groups}
                  timeSelection={timeSelection}
                  myTotalPixelWidth={mainTimelineStageWidth}
                  windowHeight={recordsLineStageHeight}
                  windowWidth={windowWidth}
                  scrollLayerY={scrollLayerY}
                />
              </Group>
            </Layer>
          </Stage>
        </MouseMoveHandlers.Provider>
      </MouseUpHandlers.Provider>
    </MouseLeaveHandlers.Provider>
  );
};

function calculateRecordLinesHeight(records: RecordProps[]): number {
  let line = new Set(records.map(r => r.threadId)).size;
  return line * RECORD_POINTS_LINE_SPACING;
}
