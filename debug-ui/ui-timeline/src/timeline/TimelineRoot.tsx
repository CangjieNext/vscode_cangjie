// Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
// This source file is part of the Cangjie project, licensed under Apache-2.0
// with Runtime Library Exception.
//
// See https://cangjie-lang.cn/pages/LICENSE for license information.

import React, {useEffect, useRef, useState} from 'react';
import {TimelineStage} from './TimelineStage';
import {IsThemeDark, SelectedRecordId} from './Contexts';
import {NO_TIME_UNIT} from './Constants';
import {AllRecordsType, RecordProps} from '../message/protocol/AllRecordsType';
import {RecordsChangedType} from '../message/protocol/RecordChangedType';
import {EventListener, getIdeType, MessageManager, setBackground, StoppedType, ThemeChangedType} from '@bitfun-dap/ui-common';

export interface TimelineRootProps {
  initialRecords: RecordProps[];

  initialThemeDark: boolean;
}

export const TimelineRoot: (props: TimelineRootProps) => JSX.Element = (props: TimelineRootProps): JSX.Element => {
  const {initialRecords, initialThemeDark} = props;
  const {windowHeight, windowWidth} = useWindowDimensions();
  const ideType = getIdeType();

  if (NO_TIME_UNIT) {
    realTimestampToSeqTimestamp(0, initialRecords);
  }

  let [isThemeDark, setThemeDark] = useState(initialThemeDark);
  let [records, setRecords] = useState(initialRecords);
  let prevRecords = useRef(initialRecords);
  let [selectedRecordId, setSelectedRecordId] = useState<undefined | number>(undefined);
  let recordsMap = new Map<number, number>();
  useEffect(() => {
    prevRecords.current = records;
    if (records.length !== 0) {
      setSelectedRecordId(prevRecords.current[prevRecords.current.length - 1].id);
    }
  }, [records]);
  let removeRecords: (removeRecordIds: number[]) => RecordProps[] = (removeRecordIds: number[]): RecordProps[] => {
    prevRecords.current.forEach((r, index) => {
      recordsMap.set(r.id, index);
    });
    removeRecordIds.forEach(id => {
      let index = recordsMap.get(id);
      if (index !== undefined) {
        prevRecords.current[index].id = -1;
      }
    });
    let newRecords: RecordProps[] = [];
    let idx = 0;
    prevRecords.current.forEach(r => {
      if (r.id !== -1) {
        newRecords[idx] = r;
        idx++;
      }
    });
    return newRecords;
  };

  // register event listener
  useEffect(() => {
    MessageManager.instance().registerEventListener(new EventListener(ThemeChangedType, newThemeDark => {
      setThemeDark(newThemeDark);
      setBackground(ideType, newThemeDark);
    }));
    MessageManager.instance().registerEventListener(new EventListener(AllRecordsType, allRecords => {
      if (NO_TIME_UNIT) {
        realTimestampToSeqTimestamp(0, allRecords);
      }
      setRecords(allRecords);
    }));
    MessageManager.instance().registerEventListener(new EventListener(RecordsChangedType, curProps => {
      let {newRecords, removedRecordIds} = curProps;
      if (NO_TIME_UNIT) {
        let starting = 0;
        if (prevRecords.current.length > 0) {
          starting = prevRecords.current[prevRecords.current.length - 1].dateTimeStamp + 1;
        }
        realTimestampToSeqTimestamp(starting, newRecords);
      }
      if (removedRecordIds !== undefined) {
        let newRecordsTmp = removeRecords(removedRecordIds).concat(newRecords);
        recordsMap.clear();
        newRecordsTmp.forEach((r, index) => {
          recordsMap.set(r.id, index);
        });
        setRecords(newRecordsTmp);
      } else {
        setRecords(prevRecords.current.concat(newRecords));
      }
    }));
    MessageManager.instance().registerEventListener(new EventListener(StoppedType, curProps => {
      let {recordId} = curProps;
      setSelectedRecordId(recordId);
    }));
  }, []);

  return (
    <IsThemeDark.Provider value={isThemeDark}>
      <SelectedRecordId.Provider value={selectedRecordId}>
        <>
          <TimelineStage
            records={records}
            totalTimeMille={getTotalTimeMille(records)}
            windowHeight={windowHeight}
            windowWidth={windowWidth}
          />
        </>
      </SelectedRecordId.Provider>
    </IsThemeDark.Provider>
  );
};

function realTimestampToSeqTimestamp(startingIdx: number, records: RecordProps[]): void {
  for (let i = 0; i < records.length; i++) {
    records[i].dateTimeStamp = startingIdx + i;
  }
}

function getTotalTimeMille(records: RecordProps[]): number {
  if (records.length <= 1) {
    return 1000;
  }
  if (NO_TIME_UNIT) {
    return records[records.length - 1].dateTimeStamp + 1;
  }
  return records[records.length - 1].dateTimeStamp + 100;
}

function getWindowDimensions(): { windowHeight: number; windowWidth: number } {
  const {innerWidth: width, innerHeight: height} = window;
  return {
    windowWidth: width,
    windowHeight: height,
  };
}

function useWindowDimensions(): { windowHeight: number; windowWidth: number } {
  const [windowDimensions, setWindowDimensions] = useState(getWindowDimensions());

  useEffect(() => {
    function handleResize(): void {
      setWindowDimensions(getWindowDimensions());
    }

    window.addEventListener('resize', handleResize);
    return (): void => window.removeEventListener('resize', handleResize);
  }, []);

  return windowDimensions;
}
