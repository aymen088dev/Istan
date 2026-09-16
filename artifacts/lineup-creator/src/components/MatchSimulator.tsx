import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trophy, RefreshCw, Sparkles, Timer, Star } from "lucide-react";
import { simulateMatch, type MatchResult, type SimPlayer } from "@/lib/matchSim";
import type { Player } from "@/lib/formations";

type OpponentMode = "bench" | "generated";

const SYL_A = ["Ka", "Be", "Zo", "Ma", "Ti", "Ra", "Ni", "Lo", "Va", "Dja", "Sel", "Mor"];
const SYL_B = ["ren", "lo", "kan", "vi", "sta", "mi", "dou", "zel", "tra", "no", "wan", "fi"];
const SYL_C = ["ov", "is", "ar", "et", "ovski", "ini", "son", "ez", "an", "or", "ic", "as"];
const GEN_POSITIONS = ["Gardien", "Défense", "Défense", "Latéral", "Latéral", "Milieu", "Milieu", "Milieu", "Ailier", "Ailier", "Attaquant"];

function generatedOpponent(average: number, seed: number): SimPlayer[] {
  const rand = (n: number) => {
    const x = Math.imul(seed + n * 7919, 2654435761) >>> 0;
    return (x >>> 8) / 16777216;
  };
  return Array.from({ length: 11 }, (_, i) => {
    const name = `${SYL_A[Math.floor(rand(i * 3) * SYL_A.length)]}${SYL_B[Math.floor(rand(i * 3 + 1) * SYL_B.length)]}${SYL_C[Math.floor(rand(i * 3 + 2) * SYL_C.length)]}`;
    const spread = Math.round((rand(i * 7) - 0.5) * 14);
    return {
      id: `gen-${seed}-${i}`,
      name,
      rating: Math.max(45, Math.min(95, Math.round(average + spread))),
      position: GEN_POSITIONS[i] ?? "Milieu",
      isCaptain: i === 4,
    };
  });
}

function StatBar({ label, home, away, suffix = "" }: { label: string; home: number; away: number; suffix?: string }) {
  const total = Math.max(1, home + away);
  const homePct = Math.round((home / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] font-semibold">
        <span className="tabular-nums">{home}{suffix}</span>
        <span className="text-muted-foreground uppercase tracking-wide text-[9px]">{label}</span>
        <span className="tabular-nums">{away}{suffix}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden flex">
        <div className="h-full rounded-l-full" style={{ width: `${homePct}%`, background: "var(--primary)" }} />
        <div className="h-full flex-1 bg-white/25" />
      </div>
    </div>
  );
}

export function MatchSimulator({
  open,
  onOpenChange,
  players,
  bench,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: Player[];
  bench: Player[];
}) {
  const [mode, setMode] = useState<OpponentMode>("generated");
  const [attempt, setAttempt] = useState(0);

  const homeName = "Mon XI";
  const homePlayers = useMemo<SimPlayer[]>(
    () => players
      .filter(p => p.name.trim() && p.name.trim().toLowerCase() !== "libre")
      .map(p => ({ id: p.id, name: p.name, rating: p.rating ?? 60, position: p.position, isCaptain: p.isCaptain })),
    [players],
  );
  const awayPlayers = useMemo<SimPlayer[]>(() => {
    if (mode === "bench") {
      return [...bench]
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 11)
        .map(p => ({ id: p.id, name: p.name, rating: p.rating ?? 60, position: p.position, isCaptain: p.isCaptain }));
    }
    const avg = homePlayers.length ? homePlayers.reduce((s, p) => s + p.rating, 0) / homePlayers.length : 72;
    return generatedOpponent(Math.round(avg), 1234 + attempt * 77);
  }, [mode, bench, homePlayers, attempt]);

  const awayName = mode === "bench" ? "XI Remplaçants" : "Équipe Générée";
  const canSimulate = homePlayers.length >= 5 && awayPlayers.length >= 5;

  const result: MatchResult | null = useMemo(() => {
    if (!open || !canSimulate) return null;
    return simulateMatch({ name: homeName, players: homePlayers }, { name: awayName, players: awayPlayers }, String(attempt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canSimulate, homePlayers, awayPlayers, attempt]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            Simulateur de match
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            Score déterministe basé sur les notes : la même compo rejouée donne le même résultat.
          </DialogDescription>
        </DialogHeader>

        {!canSimulate ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Il faut au moins 5 joueurs sur le terrain{mode === "bench" ? " et 5 remplaçants" : ""} pour simuler.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Choix adversaire */}
            <div className="grid grid-cols-2 gap-2">
              <Button variant={mode === "generated" ? "default" : "outline"} size="sm"
                onClick={() => { setMode("generated"); setAttempt(a => a + 1); }}>
                <Sparkles className="w-3.5 h-3.5 mr-1" />Équipe générée
              </Button>
              <Button variant={mode === "bench" ? "default" : "outline"} size="sm"
                onClick={() => { setMode("bench"); setAttempt(a => a + 1); }}>
                XI Remplaçants
              </Button>
            </div>

            {/* Score */}
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4 text-center">
              <div className="flex items-center justify-center gap-3">
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-xs font-bold truncate">{homeName}</p>
                  <p className="text-[9px] text-muted-foreground">Moy. {result?.teamRatingHome ?? "—"}</p>
                </div>
                <div className="text-4xl font-black tabular-nums tracking-tight">
                  {result ? `${result.scoreHome} - ${result.scoreAway}` : "—"}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-bold truncate">{awayName}</p>
                  <p className="text-[9px] text-muted-foreground">Moy. {result?.teamRatingAway ?? "—"}</p>
                </div>
              </div>
              {result && (
                <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                  <Star className="w-3 h-3 text-amber-400" />
                  MVP : <span className="font-bold text-foreground">{result.mvp}</span> ({result.mvpRating}/10)
                </div>
              )}
            </div>

            {/* Buts */}
            {result && result.goals.length > 0 && (
              <div className="space-y-1.5">
                {result.goals.map((goal, i) => (
                  <div key={i} className={`flex items-center gap-2 text-[11px] ${goal.side === "away" ? "flex-row-reverse text-right" : ""}`}>
                    <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 font-bold tabular-nums">
                      <Timer className="w-3 h-3" />{goal.minute}'
                    </span>
                    <span className="truncate font-semibold">⚽ {goal.scorer}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Stats */}
            {result && (
              <div className="space-y-2.5 rounded-xl border border-border/40 bg-muted/10 p-3">
                <StatBar label="Possession" home={result.stats.possessionHome} away={100 - result.stats.possessionHome} suffix="%" />
                <StatBar label="Tirs" home={result.stats.shotsHome} away={result.stats.shotsAway} />
                <StatBar label="Passes réussies" home={result.stats.passAccuracyHome} away={result.stats.passAccuracyAway} suffix="%" />
              </div>
            )}

            <Button className="w-full" onClick={() => setAttempt(a => a + 1)}>
              <RefreshCw className="w-4 h-4 mr-1" />Rejouer le match
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
