import { useRef, useState, useCallback } from "react";
import { Pencil, Trash2, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type Arrow = {
  id: string;
  x1: number; y1: number;
  x2: number; y2: number;
  color: string;
};

type Props = {
  arrows: Arrow[];
  drawMode: boolean;
  arrowColor: string;
  onAdd: (a: Arrow) => void;
  onUndo: () => void;
  onClear: () => void;
  onColorChange: (c: string) => void;
  onToggleDrawMode: () => void;
};

const COLORS = [
  { hex: "#ffffff", label: "Blanc" },
  { hex: "#ef4444", label: "Rouge" },
  { hex: "#fbbf24", label: "Jaune" },
  { hex: "#22d3ee", label: "Cyan" },
  { hex: "#a78bfa", label: "Violet" },
  { hex: "#4ade80", label: "Vert" },
];

const MARKER_IDS: Record<string, string> = {};
COLORS.forEach(c => { MARKER_IDS[c.hex] = `arrow-${c.hex.replace("#", "")}`; });

function getPercent(clientX: number, clientY: number, rect: DOMRect) {
  return {
    x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
    y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
  };
}

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function ArrowsOverlay({
  arrows, drawMode, arrowColor,
  onAdd, onUndo, onClear, onColorChange, onToggleDrawMode,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [preview, setPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const drawing = useRef(false);
  const startPt = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!drawMode || !svgRef.current) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const rect = svgRef.current.getBoundingClientRect();
    const pt = getPercent(e.clientX, e.clientY, rect);
    startPt.current = pt;
    drawing.current = true;
    setPreview({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
  }, [drawMode]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing.current || !svgRef.current) return;
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const pt = getPercent(e.clientX, e.clientY, rect);
    setPreview({ x1: startPt.current.x, y1: startPt.current.y, x2: pt.x, y2: pt.y });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!drawing.current || !svgRef.current) return;
    drawing.current = false;
    const rect = svgRef.current.getBoundingClientRect();
    const pt = getPercent(e.clientX, e.clientY, rect);
    setPreview(null);
    if (dist(startPt.current.x, startPt.current.y, pt.x, pt.y) > 3) {
      onAdd({
        id: crypto.randomUUID(),
        x1: startPt.current.x, y1: startPt.current.y,
        x2: pt.x, y2: pt.y,
        color: arrowColor,
      });
    }
  }, [arrowColor, onAdd]);

  const markerId = (color: string) => MARKER_IDS[color] ?? `arrow-${color.replace("#", "")}`;
  const allColors = [...new Set([...COLORS.map(c => c.hex), arrowColor])];

  return (
    <>
      {/* SVG overlay */}
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          zIndex: drawMode ? 25 : 5,
          pointerEvents: drawMode ? "all" : "none",
          cursor: drawMode ? "crosshair" : "default",
          touchAction: drawMode ? "none" : "auto",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drawing.current = false; setPreview(null); }}
      >
        <defs>
          {allColors.map(color => (
            <marker
              key={color}
              id={markerId(color)}
              viewBox="0 0 10 10"
              refX="9" refY="5"
              markerWidth="5" markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          ))}
        </defs>

        {arrows.map(a => (
          <line
            key={a.id}
            x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
            stroke={a.color}
            strokeWidth="1.6"
            strokeLinecap="round"
            markerEnd={`url(#${markerId(a.color)})`}
            style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.7))" }}
          />
        ))}

        {preview && (
          <line
            x1={preview.x1} y1={preview.y1} x2={preview.x2} y2={preview.y2}
            stroke={arrowColor}
            strokeWidth="1.6"
            strokeDasharray="3 2"
            strokeLinecap="round"
            markerEnd={`url(#${markerId(arrowColor)})`}
            opacity={0.8}
          />
        )}
      </svg>

      {/* Floating toolbar — always visible when drawMode */}
      {drawMode && (
        <div
          className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[30] flex items-center gap-1.5 px-3 py-2 rounded-2xl"
          style={{
            background: "rgba(5,8,15,0.92)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
            pointerEvents: "all",
          }}
        >
          {COLORS.map(c => (
            <button
              key={c.hex}
              onClick={() => onColorChange(c.hex)}
              title={c.label}
              className="transition-all active:scale-90"
              style={{
                width: arrowColor === c.hex ? 22 : 18,
                height: arrowColor === c.hex ? 22 : 18,
                borderRadius: "50%",
                background: c.hex,
                border: arrowColor === c.hex
                  ? "2.5px solid white"
                  : "2px solid rgba(255,255,255,0.2)",
                boxShadow: arrowColor === c.hex ? `0 0 0 2px ${c.hex}55` : "none",
                flexShrink: 0,
              }}
            />
          ))}
          <div className="w-px h-5 bg-white/15 mx-0.5" />
          <button
            onClick={onUndo}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/8 hover:bg-white/15 transition-all active:scale-90 text-white/70"
            title="Annuler la dernière"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClear}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/8 hover:bg-red-500/30 transition-all active:scale-90 text-white/70 hover:text-red-400"
            title="Tout effacer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-5 bg-white/15 mx-0.5" />
          <button
            onClick={onToggleDrawMode}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-500/20 hover:bg-red-500/35 transition-all active:scale-90 text-red-400"
            title="Fermer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Toggle button when NOT in draw mode */}
      {!drawMode && (
        <button
          onClick={onToggleDrawMode}
          className={cn(
            "absolute bottom-10 right-3 z-[15] w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-90",
            arrows.length > 0
              ? "bg-amber-400/20 border border-amber-400/40 text-amber-400"
              : "bg-white/10 border border-white/15 text-white/50 hover:text-white/80 hover:bg-white/15"
          )}
          title="Dessiner des flèches tactiques"
          style={{ pointerEvents: "all" }}
        >
          <Pencil className="w-4 h-4" />
          {arrows.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 text-[9px] bg-amber-400 text-black font-black rounded-full w-4 h-4 flex items-center justify-center">
              {arrows.length}
            </span>
          )}
        </button>
      )}
    </>
  );
}
