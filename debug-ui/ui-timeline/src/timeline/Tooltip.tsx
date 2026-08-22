// Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.
// This source file is part of the Cangjie project, licensed under Apache-2.0
// with Runtime Library Exception.
//
// See https://cangjie-lang.cn/pages/LICENSE for license information.

import {Label, Line, Tag, Text} from '../konva/ReactKonvaCore';
import {TooltipTheme} from './Theme';

const ARROW_SIDE_LENGTH = 6;
const HALF_ARROW_SIDE_LENGTH = ARROW_SIDE_LENGTH / 2;

export interface TooltipProps {
  startPos: [number, number];
  widthRange: [number, number];
  heightRange: [number, number];
  targetHeight: number;
  maxTooltipWidth: number;
  message: string;
  theme: TooltipTheme;
}

export function Tooltip(props: TooltipProps): JSX.Element {
  const {startPos, heightRange, targetHeight, message, theme} = props;

  let tooltipSize: number[] = getToolTipSize(message, theme.fontSize);
  let [tooltipWidth, tooltipHeight] = tooltipSize;
  let text: string = message;

  let leftWidth = 10;
  let tooltipBottom = startPos[1] + HALF_ARROW_SIDE_LENGTH + tooltipHeight;
  let borderPoints: number[] = [];

  let triLeft = startPos[0] - HALF_ARROW_SIDE_LENGTH;
  let triRight = startPos[0] + HALF_ARROW_SIDE_LENGTH;
  let rectLeft = startPos[0] - 10;
  let rectRight = rectLeft + tooltipWidth + 10;

  let textY = 0;

  if (tooltipBottom <= heightRange[1]) {
    let rectTop = startPos[1] + HALF_ARROW_SIDE_LENGTH;
    let rectBottom = rectTop + tooltipHeight;

    borderPoints = borderPoints.concat(startPos, [triRight, rectTop]);
    borderPoints = borderPoints.concat([rectRight, rectTop], [rectRight, rectBottom], [rectLeft, rectBottom], [rectLeft, rectTop]);
    borderPoints = borderPoints.concat([triLeft, rectTop]);

    textY = startPos[1] + HALF_ARROW_SIDE_LENGTH;
  } else {
    let triTop = [startPos[0], startPos[1] - targetHeight];
    let rectBottom = triTop[1] - HALF_ARROW_SIDE_LENGTH;
    let rectTop = rectBottom - tooltipHeight;

    borderPoints = borderPoints.concat(triTop, [triRight, rectBottom]);
    borderPoints = borderPoints.concat([rectRight, rectBottom], [rectRight, rectTop], [rectLeft, rectTop], [rectLeft, rectBottom]);
    borderPoints = borderPoints.concat([triLeft, rectBottom]);

    textY = triTop[1] - HALF_ARROW_SIDE_LENGTH - tooltipSize[1];
  }
  return (
    <>
      <Line
        closed={true}
        fill={theme.fill}
        opacity={1}
        points={borderPoints}
        rotation={0}
        stroke={theme.stroke}
        strokeWidth={0.3}
      />
      <Label
        x={startPos[0] - leftWidth}
        y={textY}
      >
        <Tag/>
        <Text
          fill={theme.font}
          fontFamily={theme.fontFamily}
          fontSize={12}
          opacity={0.9}
          padding={3}
          text={text}
          width={rectRight - rectLeft}
        />
      </Label>
    </>
  );
}

function getToolTipSize(text: string, fontSize: number): number[] {
  // 创建临时元素
  const _span = document.createElement('span');
  // 放入文本
  _span.innerText = text;
  // 设置文字大小
  _span.style.fontSize = `${fontSize}px`;
  // span放入body中
  document.body.appendChild(_span);
  // 获取span的宽度
  let width = _span.offsetWidth;
  let height = _span.offsetHeight;
  // 从body中删除该span
  document.body.removeChild(_span);
  // 返回span宽度
  return [width, height];
}
