"use client";

import { useEffect, useRef, useState } from "react";
import type { JournalBrushKind, JournalStroke } from "@/lib/journal-types";
import { JOURNAL_BRUSH_LABEL, JOURNAL_BRUSHES } from "@/lib/journal-types";

const DOODLE_COLORS = ["#2b2722", "#8a5a4a", "#c56b6b", "#c4a15a", "#6a8f6a", "#5a7aa0", "#7a5a8a", "#f4efe6"];

type JournalDoodlePadProps = {
  strokes: JournalStroke[];
  color?: string;
  disabled?: boolean;
  tools?: boolean;
  onChange: (strokes: JournalStroke[]) => void;
};

function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: JournalStroke,
  width: number,
  height: number,
) {
  if (stroke.points.length < 2) return;
  const brush = stroke.brush || "pen";
  const copies = brush === "watercolor" ? 3 : brush === "pencil" ? 2 : 1;
  for (let copy = 0; copy < copies; copy += 1) {
    const ox = brush === "watercolor" ? (copy - 1) * 1.4 : brush === "pencil" ? copy * 0.6 : 0;
    const oy = brush === "watercolor" ? (copy === 2 ? 1.1 : 0) : 0;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color;
    if (brush === "highlighter") {
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = stroke.width * 2.4;
    } else if (brush === "marker") {
      ctx.globalAlpha = 0.82;
      ctx.lineWidth = stroke.width * 1.55;
    } else if (brush === "pencil") {
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = Math.max(0.7, stroke.width * 0.7);
    } else if (brush === "watercolor") {
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = stroke.width * 2.6;
    } else {
      ctx.globalAlpha = 1;
      ctx.lineWidth = stroke.width;
    }
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x * width + ox, stroke.points[0].y * height + oy);
    for (const point of stroke.points.slice(1)) {
      ctx.lineTo(point.x * width + ox, point.y * height + oy);
    }
    ctx.stroke();
    ctx.restore();
  }
}

export function JournalDoodlePad({
  strokes,
  color = "#2b2722",
  disabled,
  tools,
  onChange,
}: JournalDoodlePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef(strokes);
  const drawingRef = useRef<JournalStroke | null>(null);
  const historyRef = useRef<JournalStroke[][]>([strokes]);
  const indexRef = useRef(0);
  const [ink, setInk] = useState(color);
  const [width, setWidth] = useState(2.4);
  const [brush, setBrush] = useState<JournalBrushKind>("pen");

  useEffect(() => {
    strokesRef.current = strokes;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(cssW * ratio));
    canvas.height = Math.max(1, Math.round(cssH * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    for (const stroke of strokes) {
      paintStroke(ctx, stroke, cssW, cssH);
    }
  }, [strokes]);

  const commit = (next: JournalStroke[]) => {
    const clipped = historyRef.current.slice(0, indexRef.current + 1);
    clipped.push(next);
    historyRef.current = clipped.slice(-40);
    indexRef.current = historyRef.current.length - 1;
    onChange(next);
  };

  const undo = () => {
    if (indexRef.current <= 0) return;
    indexRef.current -= 1;
    onChange(historyRef.current[indexRef.current] || []);
  };

  const redo = () => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    indexRef.current += 1;
    onChange(historyRef.current[indexRef.current] || []);
  };

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  return (
    <div className={`journal-doodle-wrap${tools ? " has-tools" : ""}`}>
      {tools && !disabled ? (
        <div className="journal-doodle-tools" onPointerDown={event => event.stopPropagation()}>
          <div className="journal-doodle-colors">
            {DOODLE_COLORS.map(item => (
              <button
                key={item}
                type="button"
                className="journal-doodle-swatch"
                data-active={ink === item ? "" : undefined}
                style={{ background: item }}
                onClick={() => setInk(item)}
                aria-label={item}
              />
            ))}
          </div>
          <label className="journal-doodle-width">
            <span>粗细</span>
            <input
              type="range"
              min="0.8"
              max="10"
              step="0.2"
              value={width}
              onChange={event => setWidth(Number(event.target.value))}
            />
          </label>
          <div className="journal-font-row">
            {JOURNAL_BRUSHES.map(item => (
              <button
                key={item}
                type="button"
                data-active={brush === item ? "" : undefined}
                onClick={() => setBrush(item)}
              >
                {JOURNAL_BRUSH_LABEL[item]}
              </button>
            ))}
          </div>
          <div className="journal-font-row">
            <button type="button" onClick={undo}>撤销</button>
            <button type="button" onClick={redo}>回退</button>
            <button type="button" onClick={() => commit([])}>清空</button>
          </div>
        </div>
      ) : null}
      <canvas
        ref={canvasRef}
        className="journal-doodle-pad"
        onPointerDown={event => {
          if (disabled) return;
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          drawingRef.current = {
            points: [pointFromEvent(event)],
            color: ink,
            width,
            brush,
          };
        }}
        onPointerMove={event => {
          if (!drawingRef.current) return;
          drawingRef.current.points.push(pointFromEvent(event));
          const live = drawingRef.current;
          onChange([...strokesRef.current.filter(item => item !== live), live]);
        }}
        onPointerUp={() => {
          if (!drawingRef.current) return;
          const live = drawingRef.current;
          const next = [...strokesRef.current.filter(item => item !== live), live];
          drawingRef.current = null;
          commit(next);
        }}
        onPointerCancel={() => {
          drawingRef.current = null;
        }}
      />
    </div>
  );
}
