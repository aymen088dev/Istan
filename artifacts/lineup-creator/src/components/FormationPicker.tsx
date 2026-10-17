import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FOOTBALL_FORMATIONS, HOCKEY_FORMATIONS } from "@/lib/formations";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  sport: "football" | "hockey";
  current: string;
  jerseyColor: string;
  onSelect: (formation: string) => void;
};

function MiniPitch({ positions, jerseyColor, active }: {
  positions: { x: number; y: number }[];
  jerseyColor: string;
  active: boolean;
}) {
  const W = 52, H = 68;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
      <rect width={W} height={H} rx="4" fill={active ? "#14532d" : "#1a3a26"} />
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="3" fill="none"
        stroke={active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)"} strokeWidth="0.8" />
      <line x1={2} y1={H / 2} x2={W - 2} y2={H / 2}
        stroke="rgba(255,255,255,0.2)" strokeWidth="0.7" />
      <circle cx={W / 2} cy={H / 2} r="6"
        fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.7" />
      {positions.map((p, i) => {
        const cx = 2 + (p.x / 100) * (W - 4);
        const cy = 2 + (p.y / 100) * (H - 4);
        const isGK = i === 0;
        return (
          <circle key={i} cx={cx} cy={cy} r={isGK ? 3.2 : 2.8}
            fill={isGK ? "#f59e0b" : jerseyColor}
            stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" />
        );
      })}
    </svg>
  );
}

type Group = { label: string; keys: string[] };

function groupFootball(): Group[] {
  const all = Object.keys(FOOTBALL_FORMATIONS);
  const four = all.filter(k => k.startsWith("4-"));
  const three = all.filter(k => k.startsWith("3-"));
  const five = all.filter(k => k.startsWith("5-"));
  const known = new Set([...four, ...three, ...five]);
  const other = all.filter(key => !known.has(key));
  return [
    { label: "4 défenseurs", keys: four },
    { label: "3 défenseurs", keys: three },
    { label: "5 défenseurs", keys: five },
    ...(other.length > 0 ? [{ label: "Autres", keys: other }] : []),
  ].filter(group => group.keys.length > 0);
}

function groupHockey(): Group[] {
  return [{ label: "Toutes", keys: Object.keys(HOCKEY_FORMATIONS) }];
}

export function FormationPicker({ open, onClose, sport, current, jerseyColor, onSelect }: Props) {
  const formations = sport === "football" ? FOOTBALL_FORMATIONS : HOCKEY_FORMATIONS;
  const groups = sport === "football" ? groupFootball() : groupHockey();
  const [tab, setTab] = useState(0);

  const handleSelect = (f: string) => {
    onSelect(f);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[82vh] flex flex-col p-0 bg-zinc-900 border-zinc-700">
        <SheetHeader className="px-4 pt-4 pb-2 shrink-0">
          <SheetTitle className="text-sm font-bold tracking-widest uppercase text-white/80">
            Choisir une formation
          </SheetTitle>
          {groups.length > 1 && (
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {groups.map((g, i) => (
                <button
                  key={g.label}
                  onClick={() => setTab(i)}
                  className={cn(
                    "px-3 py-1 rounded-full text-[11px] font-semibold transition-all",
                    tab === i
                      ? "bg-emerald-500 text-white"
                      : "bg-white/10 text-white/60 hover:bg-white/15"
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}
        </SheetHeader>

        <div className="overflow-y-auto flex-1 px-3 pb-6">
          <div className="grid grid-cols-3 gap-2 pt-1">
            {groups[tab].keys.map(key => {
              const pos = formations[key].positions;
              const isActive = key === current;
              return (
                <button
                  key={key}
                  onClick={() => handleSelect(key)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all active:scale-95",
                    isActive
                      ? "border-emerald-400 bg-emerald-500/15"
                      : "border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10"
                  )}
                >
                  <MiniPitch positions={pos} jerseyColor={jerseyColor} active={isActive} />
                  <span className={cn(
                    "text-[10px] font-bold leading-tight text-center uppercase tracking-wide line-clamp-2",
                    isActive ? "text-emerald-400" : "text-white/70"
                  )}>
                    {key}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
