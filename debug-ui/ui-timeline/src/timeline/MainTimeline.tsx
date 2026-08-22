// Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
// This source file is part of the Cangjie project, licensed under Apache-2.0
// with Runtime Library Exception.
//
// See https://cangjie-lang.cn/pages/LICENSE for license information.

import React, {useContext, useEffect, useRef, useState} from 'react';
import {Group, Rect} from '../konva/react-konva';
import {IsThemeDark, MouseLeaveHandlers, MouseMoveHandlers, MouseUpHandlers} from './Contexts';
import {Shape} from 'konva/lib/Shape';
import {getMainTimelineTheme} from './Theme';
import {getIdeType, usePrevious} from '@bitfun-dap/ui-common';
import {CursorStyle} from './Types';
import Konva from 'konva';

const SCALE_HEIGHT = 16;
const SCALE_TRACK_HEIGHT = 8;

interface MainTimelineProps {
  selectionTimeSetter: (selectionTime: [number, number]) => void;

  timeStampSelectedRecord: number;

  totalPixelWidth: number;

  totalTimeMille: number;
}

export const MainTimeline: (props: MainTimelineProps) => JSX.Element = (props: MainTimelineProps): JSX.Element => {
  const {totalPixelWidth, totalTimeMille, timeStampSelectedRecord, selectionTimeSetter} = props;
  const theme = getMainTimelineTheme(useContext(IsThemeDark));
  const wheelDelta = totalPixelWidth / 600;

  let [selection, setSelection] = useState<[number, number]>([0, totalPixelWidth]);
  const selectionSetter: (border1: number, border2: number) => void =
      (border1: number, border2: number): void => setSelection([border1, border2]);

  // refresh selection range when window size changed
  let prevTotalPixelWidth = usePrevious(totalPixelWidth);
  useEffect(() => {
    if (prevTotalPixelWidth === undefined || prevTotalPixelWidth === totalPixelWidth || prevTotalPixelWidth === 0) {
      return;
    }
    let border1 = selection[0] * totalPixelWidth / prevTotalPixelWidth;
    let border2 = selection[1] * totalPixelWidth / prevTotalPixelWidth;
    selectionSetter(border1, border2);
  }, [prevTotalPixelWidth, totalPixelWidth]);

  // change selected time when selected pixel changed
  useEffect(() => {
    let time1 = selection[0] * totalTimeMille / totalPixelWidth;
    let time2 = selection[1] * totalTimeMille / totalPixelWidth;
    if (time1 <= time2) {
      selectionTimeSetter([time1, time2]);
    } else {
      selectionTimeSetter([time2, time1]);
    }
  }, [selection, totalPixelWidth, totalTimeMille]);

  // change interval when selected record point changed
  useEffect(() => {
    let leftScalePointerPixel = Math.min(selection[0], selection[1]);
    let rightScalePointerPixel = Math.max(selection[1], selection[0]);
    let selectedRecordPixel = totalPixelWidth * timeStampSelectedRecord / totalTimeMille;
    if (leftScalePointerPixel <= selectedRecordPixel && rightScalePointerPixel >= selectedRecordPixel) {
      // when selected record is being contained in selection range, the selection should maintain
      return;
    }
    let intervalLength = rightScalePointerPixel - leftScalePointerPixel;
    let intervalLengthHalf = intervalLength >> 1;
    let newLeftScalePointerPixel: number;
    let newRightScalePointerPixel: number;
    if (selectedRecordPixel < leftScalePointerPixel) {
      newLeftScalePointerPixel = Math.max(0, selectedRecordPixel - intervalLengthHalf);
      newRightScalePointerPixel = newLeftScalePointerPixel + intervalLength;
    } else {
      newRightScalePointerPixel = Math.min(totalPixelWidth, selectedRecordPixel + intervalLengthHalf);
      newLeftScalePointerPixel = newRightScalePointerPixel - intervalLength;
    }
    selectionSetter(newLeftScalePointerPixel, newRightScalePointerPixel);
  }, [timeStampSelectedRecord]);

  // disable default ctrl + wheel event
  document.body.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  }, {passive: false});
  useEffect(():() => void => {
    function handleWheel(event: WheelEvent): void {
      let leftBorder = Math.min(selection[0], selection[1]);
      let rightBorder = Math.max(selection[1], selection[0]);
      if (event.ctrlKey) {
        let deltaY = event.deltaY;
        if (deltaY > 0) {
          // expand
          let newLeft = Math.max(0, leftBorder - wheelDelta);
          let newRight = Math.min(totalPixelWidth, rightBorder + wheelDelta);
          selectionSetter(newLeft, newRight);
        } else if (deltaY < 0) {
          // shrink
          let newLeft = correctPixel(leftBorder + wheelDelta, 0, totalPixelWidth);
          let newRight = correctPixel(rightBorder - wheelDelta, 0, totalPixelWidth);
          if (newLeft <= newRight) {
            selectionSetter(newLeft, newRight);
          }
        }
      }
    }

    document.addEventListener('wheel', handleWheel);
    return (): void => {
      document.removeEventListener('wheel', handleWheel);
    };
  }, [selection]);

  return (
    <Group>
      <TimeRuler totalPixelWidth={totalPixelWidth}/>
      {/* selection scale */}
      <Rect
        fill={theme.selectedInterval}
        height={SCALE_HEIGHT}
        opacity={0.6}
        width={getSelectionWidth(selection) + 1}
        x={getSelectionStart(selection)}
        y={SCALE_TRACK_HEIGHT}
      />
      <ScaleTrack
        selection={selection}
        selectionSetter={selectionSetter}
        totalPixelWidth={totalPixelWidth}
      />
      <ScaleBilateral
        totalPixelWidth={totalPixelWidth}
        selectionSetter={selectionSetter}
      />
      <ScaleUnilateral
        selection={selection}
        selectionSetter={selectionSetter}
        totalPixelWidth={totalPixelWidth}
      />
    </Group>
  );
};

function TimeRuler(props: { totalPixelWidth: number}): JSX.Element {
  const {totalPixelWidth} = props;
  const theme = getMainTimelineTheme(useContext(IsThemeDark));

  return (
    <>
      <Rect
        height={1}
        width={totalPixelWidth}
        x={0}
        y={SCALE_TRACK_HEIGHT}
        fill={theme.scaleLine}
        opacity={0.5}
        shadowBlur={3}
      />
    </>
  );
}

function ScaleTrack(props: { selection: [number, number]; selectionSetter: (border1: number, border2: number) => void; totalPixelWidth: number}): JSX.Element {
  const {selection, selectionSetter, totalPixelWidth} = props;
  const trackWidth = getSelectionWidth(selection);
  const theme = getMainTimelineTheme(useContext(IsThemeDark));

  let [isAllowModifyByTrace, setAllowModifyByTrack] = useState<boolean>(false);
  let [isHighLightScale, setHighLightScale] = useState<boolean>(false);
  useEffect(() => {
    if (getIdeType() !== 'Deveco' && getIdeType() !== 'Standalone') {
      setCursorStyle(isAllowModifyByTrace ? 'grab' : 'auto');
    } else {
      setHighLightScale(isAllowModifyByTrace);
    }
  }, [isAllowModifyByTrace]);

  return (
    <Group
      draggable={true}
      height={SCALE_TRACK_HEIGHT}
      onDragEnd={(): void => setAllowModifyByTrack(false)}
      onDragMove={(evt: Konva.KonvaEventObject<DragEvent>): void => {
        evt.target.y(0);
        if (!isAllowModifyByTrace) {
          return;
        }
        let x = evt.target.x();
        let correctX = correctPixel(x, 0, totalPixelWidth - trackWidth);
        if (x !== correctX) {
          evt.target.x(correctX);
        }
        selectionSetter(correctX, correctX + trackWidth);
      }}
      onDragStart={(): void => setAllowModifyByTrack(true)}
      onMouseEnter={(): void => setAllowModifyByTrack(true)}
      onMouseLeave={(): void => setAllowModifyByTrack(false)}
      width={trackWidth}
      x={getSelectionStart(selection)}
      y={0}
    >
      <Rect
        cornerRadius={[15, 15, 0, 0]}
        fill={isHighLightScale ? theme.selectedIntervalHighLight : theme.selectedInterval}
        height={SCALE_TRACK_HEIGHT}
        opacity={0.6}
        width={trackWidth + 1}
        x={0}
        y={0}
      />
    </Group>
  );
}

function ScaleBilateral(props: { selectionSetter: (border1: number, border2: number) => void; totalPixelWidth: number}): JSX.Element {
  const {selectionSetter, totalPixelWidth} = props;
  const theme = getMainTimelineTheme(useContext(IsThemeDark));

  let [isAllowModifyBilateral, setAllowModifyBilateral] = useState<boolean>(false);
  useEffect(() => {
    if (getIdeType() !== 'Deveco') {
      setCursorStyle(isAllowModifyBilateral ? 'crosshair' : 'auto');
    }
  }, [isAllowModifyBilateral]);

  let [isShowInterval, setIsShowInterval] = useState(false);
  let [intervalStart, setIntervalStart] = useState(0);
  let [intervalEnd, setIntervalEnd] = useState(totalPixelWidth);

  useEffect(() => {
    if (isShowInterval || intervalStart === intervalEnd) {
      return;
    }
    selectionSetter(intervalStart, intervalEnd);
  }, [isShowInterval]);

  let outsideAreaRef = useRef<Shape | undefined>();
  let mouseMoveHandlers = useContext(MouseMoveHandlers);
  let mouseUpHandlers = useContext(MouseUpHandlers);
  let mouseLeaveHandlers = useContext(MouseLeaveHandlers);
  useEffect(() => {
    if (!isShowInterval) {
      return (): void => {};
    }
    const moveHandler = (): void => {
      if (outsideAreaRef.current === undefined || outsideAreaRef.current === null) {
        return;
      }
      if (outsideAreaRef.current.getRelativePointerPosition() === undefined) {
        return;
      }
      let pointerPosition = outsideAreaRef.current.getRelativePointerPosition();
      if (pointerPosition === undefined || pointerPosition === null) {
        return;
      }
      let x = pointerPosition.x;
      if (x < 0) {
        x = 0;
      } else if (x > totalPixelWidth) {
        x = totalPixelWidth;
      }
      setIntervalEnd(x);
    };
    const upHandler = (): void => setIsShowInterval(false);
    const leaveHandler = (): void => setIsShowInterval(false);
    mouseMoveHandlers.add(moveHandler);
    mouseUpHandlers.add(upHandler);
    mouseLeaveHandlers.add(leaveHandler);
    return (): void => {
      mouseMoveHandlers.delete(moveHandler);
      mouseUpHandlers.delete(upHandler);
      mouseLeaveHandlers.delete(leaveHandler);
    };
  }, [isShowInterval]);

  return (
    <Group>
      <Rect
        height={SCALE_HEIGHT}
        onMouseDown={(evt): void => {
          if (evt.target === undefined || evt.target === null) {
            return;
          }
          if (evt.target.getRelativePointerPosition() === undefined) {
            return;
          }
          outsideAreaRef.current = evt.target as Shape;
          let pointerPosition = evt.target.getRelativePointerPosition();
          if (pointerPosition === undefined || pointerPosition === null) {
            return;
          }
          let pixel = pointerPosition.x;
          setIsShowInterval(true);
          setIntervalStart(pixel);
          setIntervalEnd(pixel);
        }}
        onMouseEnter={(): void => setAllowModifyBilateral(true)}
        onMouseLeave={(): void => setAllowModifyBilateral(false)}
        width={totalPixelWidth}
        x={0}
        y={SCALE_TRACK_HEIGHT}
      />
      {isShowInterval && (intervalStart !== intervalEnd) &&
        <Rect
          fill={theme.selectedInterval}
          height={SCALE_HEIGHT}
          opacity={0.8}
          width={Math.abs(intervalEnd - intervalStart) + 1}
          x={Math.min(intervalStart, intervalEnd)}
          y={SCALE_TRACK_HEIGHT}
        />}
    </Group>
  );
}

const ScaleUnilateral = (
    props: {
      selection: [number, number];
      selectionSetter: (border1: number, border2: number) => void;
      totalPixelWidth: number;
    }): JSX.Element => {
  const {selection, selectionSetter, totalPixelWidth} = props;
  const pointerSetter1 = (pointer: number): void => selectionSetter(pointer, selection[1]);
  const pointerSetter2 = (pointer: number): void => selectionSetter(selection[0], pointer);

  return (
    <>
      <ScaleUnilateralSingle
        pointer={selection[0]}
        pointerSetter={pointerSetter1}
        totalPixelWidth={totalPixelWidth}
      />
      <ScaleUnilateralSingle
        pointer={selection[1]}
        pointerSetter={pointerSetter2}
        totalPixelWidth={totalPixelWidth}
      />
    </>
  );
};

const ScaleUnilateralSingle = (props: { pointer: number; pointerSetter: (pointer: number) => void; totalPixelWidth: number }): JSX.Element => {
  const {pointer, pointerSetter, totalPixelWidth} = props;
  const theme = getMainTimelineTheme(useContext(IsThemeDark));

  let [isAllowModifyUnilateral, setAllowModifyUnilateral] = useState<boolean>(false);
  let [isHighLightUnilateral, setHighLightUnilateral] = useState<boolean>(false);
  useEffect(() => {
    if (getIdeType() !== 'Deveco' && getIdeType() !== 'Standalone') {
      setCursorStyle(isAllowModifyUnilateral ? 'e-resize' : 'auto');
    } else {
      setHighLightUnilateral(isAllowModifyUnilateral);
    }
  }, [isAllowModifyUnilateral]);

  return (
    <Group
      draggable={true}
      height={40}
      onDragEnd={(): void => setAllowModifyUnilateral(false)}
      onDragMove={(evt: Konva.KonvaEventObject<DragEvent>): void => {
        evt.target.y(SCALE_TRACK_HEIGHT);
        if (!setAllowModifyUnilateral) {
          return;
        }
        let x = evt.target.x();
        let correctX = correctPixel(x, 0, totalPixelWidth);
        if (x !== correctX) {
          evt.target.x(correctX);
         }
        pointerSetter(correctX);
      }}
      onDragStart={(): void => setAllowModifyUnilateral(true)}
      onMouseEnter={(): void => setAllowModifyUnilateral(true)}
      onMouseLeave={(): void => setAllowModifyUnilateral(false)}
      width={3}
      x={pointer}
      y={SCALE_TRACK_HEIGHT}
    >
      <Rect
        fill={isHighLightUnilateral ? theme.scalePointerHighlight : theme.scalePointer}
        height={SCALE_HEIGHT}
        width={1}
        x={0}
        y={0}
      />
      <Rect
        fill={isHighLightUnilateral ? theme.scalePointerHighlight : theme.scalePointer}
        height={15}
        width={3}
        x={-1}
        y={SCALE_HEIGHT}
      />
    </Group>
  );
};

function getSelectionStart(selection: [number, number]): number {
  return Math.min(selection[0], selection[1]);
}

function getSelectionWidth(selection: [number, number]): number {
  return Math.abs(selection[0] - selection[1]);
}

function correctPixel(pixel: number, min: number, max: number): number {
  if (pixel < min) {
    return min;
  } else if (pixel > max) {
    return max;
  } else {
    return pixel;
  }
}

function setCursorStyle(cursorStyle: CursorStyle): void {
  const element = document.getElementById('root') as HTMLElement;
  element.style.cursor = cursorStyle;
}
