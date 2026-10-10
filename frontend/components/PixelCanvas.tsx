"use client";

import { useCallback, useEffect, useRef } from "react";
import type { BoardState, TileUpdate } from "@/lib/events";

export interface SelectedTile {
  x: number;
  y: number;
}

interface Props {
  boardVersion: number;
  getBoard: () => BoardState;
  width: number;
  height: number;
  zoom: number;
  selected: SelectedTile | null;
  onSelect: (tile: SelectedTile) => void;
}

function colorCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * Renders the full 100×100 canvas from the in-memory board (built from
 * chain events). Draws only painted tiles — O(painted), never O(canvas) per
 * update — and repaints on a zoom/selection/board change.
 */
export function PixelCanvas({
  boardVersion,
  getBoard,
  width,
  height,
  zoom,
  selected,
  onSelect,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardVersionRef = useRef(boardVersion);
  boardVersionRef.current = boardVersion;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = width * zoom;
    const cssH = height * zoom;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssW, cssH);

    // painted tiles
    const board = getBoard();
    board.tiles.forEach((tile: TileUpdate) => {
      ctx.fillStyle = colorCss(tile.color);
      ctx.fillRect(tile.x * zoom, tile.y * zoom, zoom, zoom);
    });

    // grid lines when zoomed in enough for them to read
    if (zoom >= 6) {
      ctx.strokeStyle = "rgba(45, 42, 38, 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= width; x++) {
        ctx.moveTo(x * zoom + 0.5, 0);
        ctx.lineTo(x * zoom + 0.5, height * zoom);
      }
      for (let y = 0; y <= height; y++) {
        ctx.moveTo(0, y * zoom + 0.5);
        ctx.lineTo(width * zoom, y * zoom + 0.5);
      }
      ctx.stroke();
    }

    // selection highlight
    if (selected) {
      ctx.strokeStyle = "#e4572e";
      ctx.lineWidth = Math.max(2, Math.floor(zoom / 4));
      ctx.strokeRect(
        selected.x * zoom + 1,
        selected.y * zoom + 1,
        zoom - 2,
        zoom - 2
      );
    }
  }, [getBoard, height, selected, width, zoom]);

  useEffect(() => {
    draw();
  }, [draw, boardVersion]);

  const tileFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): SelectedTile | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * height);
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    return { x, y };
  };

  return (
    <div
      className="canvas-wrap"
      tabIndex={0}
      role="application"
      aria-label="Pixel canvas. Use arrow keys to move the selection, press Enter to select."
      onKeyDown={(e) => {
        if (!selected) {
          if (e.key === "Enter" || e.key.startsWith("Arrow")) {
            onSelect({ x: 0, y: 0 });
            e.preventDefault();
          }
          return;
        }
        const move = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[
          e.key
        ];
        if (move) {
          onSelect({
            x: Math.min(width - 1, Math.max(0, selected.x + move[0])),
            y: Math.min(height - 1, Math.max(0, selected.y + move[1])),
          });
          e.preventDefault();
        }
      }}
    >
      <canvas
        ref={canvasRef}
        className="pixel-canvas"
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" && e.buttons === 0) return;
        }}
        onPointerDown={(e) => {
          const tile = tileFromEvent(e);
          if (tile) onSelect(tile);
        }}
      />
    </div>
  );
}
