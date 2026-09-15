import { Minus, Plus } from "lucide-react";

type RatingControlProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  compact?: boolean;
};

export function RatingControl({
  value,
  onChange,
  min = 1,
  max = 99,
  compact = false,
}: RatingControlProps) {
  const setRating = (next: number) => {
    onChange(Math.max(min, Math.min(max, Math.round(next))));
  };

  return (
    <div className={`flex items-center gap-2 ${compact ? "gap-1.5" : "gap-2.5"}`}>
      <button
        type="button"
        aria-label="Diminuer la note OVR"
        disabled={value <= min}
        onClick={() => setRating(value - 1)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        aria-label="Note OVR"
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => setRating(Number(e.target.value))}
        className="min-w-0 flex-1 accent-primary"
      />
      <button
        type="button"
        aria-label="Augmenter la note OVR"
        disabled={value >= max}
        onClick={() => setRating(value + 1)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <span
        className={`${compact ? "w-7 text-base" : "w-9 text-xl"} shrink-0 text-right font-black tabular-nums`}
        style={{ color: value >= 90 ? "#f59e0b" : value >= 80 ? "#4ade80" : value >= 70 ? "#60a5fa" : "#94a3b8" }}
      >
        {value}
      </span>
    </div>
  );
}