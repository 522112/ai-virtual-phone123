"use client";

import { useEffect, useRef } from "react";
import type { JournalStroke } from "@/lib/journal-types";

type JournalDoodlePadProps = {
  strokes: JournalStroke[];
  color?: string;
  disabled?: boolean;
  onChange: (strokes: JournalStroke[]) => void;
};

export function JournalDoodlePad({ strokes, color = "#2b2b31", disabled, onChange }: JournalDoodlePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef(strokes);
  const drawingRef = useRef<JournalStroke | null>(null);

  useEffect(() => {
    strokesRef.current = strokes;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);
      for (const point of stroke.points.slice(1)) {
        ctx.lineTo(point.x * width, point.y * height);
      }
      ctx.stroke();
    }
  }, [strokes]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  return (
    <canvas
      ref={canvasRef}
      className="journal-doodle-pad"
      onPointerDown={event => {
        if (disabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drawingRef.current = { points: [pointFromEvent(event)], color, width: 2.4 };
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
        onChange(next);
      }}
      onPointerCancel={() => {
        drawingRef.current = null;
      }}
    />
  );
}
