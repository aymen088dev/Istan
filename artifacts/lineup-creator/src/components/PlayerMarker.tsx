import { useState, useRef, useEffect } from "react";
import { Star, UserPlus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { countries } from "@/lib/countries";
import type { Player } from "@/lib/formations";
import { JerseySVG, type JerseyStyle } from "@/components/JerseySVG";
import { NationalityPicker } from "@/components/NationalityPicker";
import { RatingControl } from "@/components/RatingControl";
import {
  loadSynchronizedPlayerLibrary,
  savePlayerLibrary,
  upsertPlayerInLibrary,
  type LibraryPlayer,
} from "@/lib/playerLibrary";

const DRAG_THRESHOLD = 5;

type Props = {
  player: Player;
  jerseyColor: string;
  secondaryColor: string;
  accentColor: string;
  numberColor: string;
  jerseyStyle: JerseyStyle;
  showDetails: boolean;
  isGK?: boolean;
  gkColor?: string;
  gkSecondaryColor?: string;
  showName?: boolean;
  showRating?: boolean;
  showNationality?: boolean;
  onUpdate: (id: string, updates: Partial<Player>) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
};

export function ratingColor(r: number) {
  if (r >= 90) return "#f59e0b";
  if (r >= 80) return "#4ade80";
  if (r >= 70) return "#60a5fa";
  return "#94a3b8";
}

function FlagImage({ code, size = 18 }: { code: string; size?: number }) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const country = countries.find(c => c.code === code);
  if (country?.isCustom) {
    return <img src={`${base}/istanmusta-flag.png`} alt="flag" style={{ width: size, height: size, objectFit: "cover", borderRadius: "50%" }} />;
  }
  return (
    <img
      src={`https://flagcdn.com/w20/${code.toLowerCase()}.png`}
      alt={code}
      style={{ width: size, height: size, objectFit: "cover", borderRadius: "50%" }}
      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

export function PlayerMarker({
  player, jerseyColor, secondaryColor, accentColor, numberColor, jerseyStyle,
  showDetails, isGK, gkColor, gkSecondaryColor, showName, showRating, showNationality,
  onUpdate, containerRef,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [library, setLibrary] = useState<LibraryPlayer[]>([]);
  const [showLib, setShowLib] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const elRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const moved = useRef(false);
  const startXY = useRef({ x: 0, y: 0 });
  const pendingPos = useRef<{ x: number; y: number } | null>(null);

  const latestPlayer = useRef(player);
  const latestOnUpdate = useRef(onUpdate);
  useEffect(() => { latestPlayer.current = player; }, [player]);
  useEffect(() => { latestOnUpdate.current = onUpdate; }, [onUpdate]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      moved.current = false;
      pendingPos.current = null;
      startXY.current = { x: e.clientX, y: e.clientY };
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging.current || !containerRef.current || !elRef.current) return;
      e.preventDefault();

      const dx = e.clientX - startXY.current.x;
      const dy = e.clientY - startXY.current.y;
      if (!moved.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

      if (!moved.current) {
        moved.current = true;
        setIsDragging(true);
      }

      const rect = containerRef.current.getBoundingClientRect();
      const rawX = ((e.clientX - rect.left) / rect.width) * 100;
      const rawY = ((e.clientY - rect.top) / rect.height) * 100;
      const newX = Math.max(18, Math.min(82, rawX));
      const newY = Math.max(10, Math.min(90, rawY));

      elRef.current.style.left = `${newX}%`;
      elRef.current.style.top = `${newY}%`;
      pendingPos.current = { x: newX, y: newY };
    };

    const onUp = () => {
      if (!dragging.current) return;
      const wasDrag = moved.current;
      dragging.current = false;
      moved.current = false;
      setIsDragging(false);

      if (wasDrag && pendingPos.current) {
        latestOnUpdate.current(latestPlayer.current.id, pendingPos.current);
        pendingPos.current = null;
      } else if (!wasDrag) {
        setIsOpen(true);
        setLibrary(loadSynchronizedPlayerLibrary());
      }
    };

    el.addEventListener("pointerdown", onDown, { passive: false });
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [containerRef]);

  const handleDialogOpen = (open: boolean) => {
    if (open) setLibrary(loadSynchronizedPlayerLibrary());
    setIsOpen(open);
    setShowLib(false);
  };

  useEffect(() => {
    const refreshLibrary = () => {
      if (isOpen) setLibrary(loadSynchronizedPlayerLibrary());
    };
    window.addEventListener("istan-clubs-updated", refreshLibrary);
    return () => window.removeEventListener("istan-clubs-updated", refreshLibrary);
  }, [isOpen]);

  const rating = player.rating ?? 80;
  const x = Math.max(18, Math.min(82, player.x));
  const effectiveJerseyColor = isGK ? (gkColor ?? "#f59e0b") : jerseyColor;
  const effectiveSecondaryColor = isGK ? (gkSecondaryColor ?? "#92400e") : secondaryColor;
  const displayName = showName !== false;
  const displayRating = showRating !== false;
  const displayNationality = showNationality !== false;

  function ratingBg(r: number) {
    if (r >= 90) return "#854d0e";
    if (r >= 80) return "#14532d";
    if (r >= 70) return "#1e3a5f";
    return "#3f1d1d";
  }

  return (
    <>
      <div
        ref={elRef}
        className={`absolute flex flex-col items-center select-none touch-none
          ${isDragging ? "z-30 cursor-grabbing" : "z-10 cursor-grab hover:z-20"}`}
        style={{
          left: `${x}%`,
          top: `${player.y}%`,
          transform: `translate(-50%, -50%) scale(${isDragging ? 1.1 : 1})`,
          transition: isDragging ? "none" : "transform 0.15s ease",
          filter: `drop-shadow(0 4px 12px rgba(0,0,0,${isDragging ? 0.85 : 0.5}))`,
        }}
      >
        <div className="relative w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12">
          <JerseySVG
            uid={player.id}
            color1={effectiveJerseyColor}
            color2={effectiveSecondaryColor}
            color3={accentColor}
            numberColor={numberColor}
            style={jerseyStyle}
            number={player.number}
          />
          {player.isCaptain && (
            <div className="absolute -top-1.5 -right-1.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-yellow-400 flex items-center justify-center shadow-lg z-10 border-2 border-black/40">
              <span className="text-[8px] sm:text-[9px] font-black text-black leading-none">C</span>
            </div>
          )}
          {/* Rating badge — bottom-left of jersey */}
          {displayRating && (
            <div
              className="absolute -bottom-1 -left-1 min-w-[18px] h-[18px] px-0.5 rounded-full flex items-center justify-center z-10"
              style={{
                background: ratingBg(rating),
                border: `1.5px solid ${ratingColor(rating)}44`,
                boxShadow: "0 1px 4px rgba(0,0,0,0.7)",
              }}
            >
              <span className="text-[7px] font-black leading-none" style={{ color: ratingColor(rating) }}>{rating}</span>
            </div>
          )}
          {/* Nationality badge — bottom-right of jersey */}
          {displayNationality && player.nationality && (
            <div
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full overflow-hidden flex items-center justify-center z-10"
              style={{
                border: "1.5px solid rgba(0,0,0,0.5)",
                background: "rgba(0,0,0,0.6)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
              }}
            >
              <FlagImage code={player.nationality} size={14} />
            </div>
          )}
        </div>

        {displayName && (
          <div className="mt-1 flex items-center">
            <div
              className="flex items-center gap-0.5 px-1.5 py-[3px] rounded"
              style={{
                background: "rgba(0,0,0,0.72)",
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderLeft: `2px solid ${effectiveJerseyColor}`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
              }}
            >
              <span
                className="text-white font-bold tracking-wide uppercase leading-none whitespace-nowrap overflow-hidden"
                style={{
                  fontSize: player.name.length > 12 ? "5.5px" : player.name.length > 9 ? "6.5px" : player.name.length > 6 ? "7.5px" : "8px",
                  maxWidth: "58px",
                }}
              >
                {player.name}
              </span>
              {showDetails && (
                <span className="text-white/40 text-[7px] leading-none ml-0.5 hidden sm:inline">{player.position}</span>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={handleDialogOpen}>
        <DialogContent className="sm:max-w-[460px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Éditer le joueur</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">Nom</Label>
              <Input value={player.name} onChange={e => onUpdate(player.id, { name: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">Numéro</Label>
              <Input value={player.number} onChange={e => onUpdate(player.id, { number: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">Note OVR</Label>
              <div className="col-span-3 flex items-center gap-3">
                <RatingControl
                  value={rating}
                  onChange={value => onUpdate(player.id, { rating: value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">Position</Label>
              <Input value={player.position} onChange={e => onUpdate(player.id, { position: e.target.value })} className="col-span-3" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Nationalité</Label>
              <NationalityPicker value={player.nationality} onChange={v => onUpdate(player.id, { nationality: v })} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">Capitaine</Label>
              <Switch checked={!!player.isCaptain} onCheckedChange={v => onUpdate(player.id, { isCaptain: v })} />
            </div>
            <div className="border-t border-border pt-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                const upd = upsertPlayerInLibrary(player);
                savePlayerLibrary(upd);
                setLibrary(upd);
              }} className="flex-1"><Star className="w-3 h-3 mr-1.5" />Sauvegarder</Button>
              <Button variant="outline" size="sm" onClick={() => setShowLib(v => !v)} className="flex-1">
                <UserPlus className="w-3 h-3 mr-1.5" />{showLib ? "Fermer" : "Choisir un joueur"}
              </Button>
            </div>
            {showLib && (
              <div className="border border-border rounded-lg overflow-hidden">
                {library.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-5">Bibliothèque vide.</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto">
                    {Object.entries(
                      library.reduce<Record<string, { player: LibraryPlayer; index: number }[]>>((groups, savedPlayer, index) => {
                        const group = savedPlayer.club?.trim() || "Joueurs enregistrés";
                        (groups[group] ||= []).push({ player: savedPlayer, index });
                        return groups;
                      }, {}),
                    ).map(([clubName, entries]) => (
                      <section key={clubName} className="border-b border-border last:border-b-0">
                        <div className="sticky top-0 z-10 flex items-center justify-between bg-muted/80 px-3 py-1.5 backdrop-blur">
                          <span className="text-[10px] font-black uppercase tracking-wider text-primary">{clubName}</span>
                          <span className="text-[10px] text-muted-foreground">{entries.length} joueur{entries.length > 1 ? "s" : ""}</span>
                        </div>
                        {entries.map(({ player: savedPlayer, index }) => (
                          <div key={`${clubName}-${index}`} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40">
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-semibold">{savedPlayer.name}</span>
                              <span className="ml-2 text-xs text-muted-foreground">#{savedPlayer.number} · {savedPlayer.position}</span>
                            </div>
                            <span className="text-xs font-black tabular-nums" style={{ color: ratingColor(savedPlayer.rating ?? 80) }}>{savedPlayer.rating ?? 80}</span>
                            <Button variant="ghost" size="sm" onClick={() => { onUpdate(player.id, { name: savedPlayer.name, number: savedPlayer.number, position: savedPlayer.position, nationality: savedPlayer.nationality, club: savedPlayer.club, rating: savedPlayer.rating }); setShowLib(false); }} className="h-7 px-2 text-xs text-primary">Choisir</Button>
                            <Button variant="ghost" size="icon" onClick={() => { const upd = library.filter((_, j) => j !== index); savePlayerLibrary(upd); setLibrary(upd); }} className="h-7 w-7 text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </section>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
