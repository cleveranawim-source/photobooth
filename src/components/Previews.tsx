import type { Frame, Layout, TextSlot } from "../types";

/**
 * 인화물 미리보기 — 실제 칸 좌표를 그대로 축소해 그립니다.
 * 앱 화면 색은 프레임을 따라가지 않으므로(고정 팔레트), 사용자가 무엇을 고르는지 알 수 있는
 * 유일한 단서가 이 그림입니다. 그래서 사진 칸뿐 아니라 글자 자리까지 색 막대로 흉내 냅니다.
 */
export function LayoutThumb({ layout, frame }: { layout: Layout; frame: Frame }) {
  const width = layout.paper.w * 300;
  const height = layout.paper.h * 300;

  const textBar = (slot: TextSlot, color: string, widthRatio: number, opacity: number, key: string) => {
    const barWidth = Math.min((slot.maxWidth ?? layout.tile.w) * widthRatio, layout.tile.w * 0.62);
    return (
      <rect
        key={key}
        x={slot.x - barWidth / 2}
        y={slot.y - slot.size * 0.42}
        width={barWidth}
        height={slot.size * 0.84}
        rx={slot.size * 0.3}
        fill={color}
        opacity={opacity}
      />
    );
  };

  return (
    <svg className="layout-thumb" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <rect x="0" y="0" width={width} height={height} fill={frame.paper} />
      {layout.tiles.map((tile, tileIndex) => (
        <g key={tileIndex} transform={`translate(${tile.x} ${tile.y})`}>
          {layout.cells.map((cell, cellIndex) => (
            <rect
              key={cellIndex}
              x={cell.x}
              y={cell.y}
              width={cell.w}
              height={cell.h}
              rx={Math.max(4, frame.photoRadius)}
              fill={frame.mat}
            />
          ))}
          {textBar(layout.title, frame.ink, 0.72, 0.9, "title")}
          {textBar(layout.tagline, frame.accent, 0.5, 1, "tagline")}
          {textBar(layout.caption, frame.ink, 0.6, 0.75, "caption")}
          {textBar(layout.stamp, frame.sub, 0.44, 0.6, "stamp")}
        </g>
      ))}
      {layout.cut && layout.tiles.length > 1 && (
        <line
          x1={layout.cut === "vertical" ? width / 2 : 10}
          y1={layout.cut === "vertical" ? 10 : height / 2}
          x2={layout.cut === "vertical" ? width / 2 : width - 10}
          y2={layout.cut === "vertical" ? height - 10 : height / 2}
          stroke={frame.sub}
          strokeWidth="6"
          strokeDasharray="24 18"
          opacity="0.7"
        />
      )}
    </svg>
  );
}

/** 프레임 색 조합만 압축해 보여주는 작은 표식 — 목록이 길어지는 관리자 화면용. */
export function FrameSwatch({ frame }: { frame: Frame }) {
  return (
    <span className="frame-swatch" style={{ background: frame.paper, borderColor: frame.mat }}>
      <span style={{ background: frame.mat }} />
      <span style={{ background: frame.accent }} />
      <span style={{ background: frame.ink }} />
    </span>
  );
}
