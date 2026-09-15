import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Player } from "@/lib/formations";
import { JerseySVG, type JerseyStyle } from "@/components/JerseySVG";
import { NationalityPicker } from "@/components/NationalityPicker";
import { countries } from "@/lib/countries";
import { RatingControl } from "@/components/RatingControl";

type BenchMarkerProps = {
  player: Player;
  jerseyColor: string;
  secondaryColor: string;
  accentColor: string;
  numberColor: string;
  jerseyStyle: JerseyStyle;
  showNationality?: boolean;
  onUpdate: (id: string, updates: Partial<Player>) => void;
};

function ratingColor(r: number) {
  if (r >= 90) return "#f59e0b";
  if (r >= 80) return "#22c55e";
  if (r >= 70) return "#3b82f6";
  return "#94a3b8";
}

function FlagImage({ code, size = 16 }: { code: string; size?: number }) {
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

export function BenchMarker({ player, jerseyColor, secondaryColor, accentColor, numberColor, jerseyStyle, showNationality, onUpdate }: BenchMarkerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rating = player.rating ?? 75;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button className="flex flex-col items-center gap-0.5 cursor-pointer group transition-all hover:scale-105 px-1 py-1 rounded-lg hover:bg-white/5">
          <div className="relative w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9" style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>
            <JerseySVG
              uid={player.id}
              color1={jerseyColor}
              color2={secondaryColor}
              color3={accentColor}
              numberColor={numberColor}
              style={jerseyStyle}
              number={player.number}
            />
            {showNationality && player.nationality && (
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full overflow-hidden border border-black/40 bg-black/60 flex items-center justify-center">
                <FlagImage code={player.nationality} size={12} />
              </div>
            )}
          </div>
          <div
            className="flex items-center gap-0.5 px-1 py-[2px] rounded-sm max-w-[52px]"
            style={{
              background: "rgba(0,0,0,0.5)",
              border: `1px solid rgba(255,255,255,0.07)`,
              borderLeft: `1.5px solid ${jerseyColor}`,
            }}
          >
            <span className="text-white/80 text-[7px] sm:text-[8px] font-bold uppercase tracking-wide truncate leading-none flex-1 min-w-0">
              {player.name}
            </span>
            <span className="text-[7px] sm:text-[8px] font-black leading-none shrink-0" style={{ color: ratingColor(rating) }}>
              {rating}
            </span>
          </div>
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Remplaçant — {player.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Nom</Label>
            <Input value={player.name} onChange={e => onUpdate(player.id, { name: e.target.value })} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Numéro</Label>
            <Input value={player.number} onChange={e => onUpdate(player.id, { number: e.target.value })} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Position</Label>
            <Input value={player.position} onChange={e => onUpdate(player.id, { position: e.target.value })} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Note OVR</Label>
            <div className="col-span-3 flex items-center gap-3">
              <RatingControl
                value={rating}
                compact
                onChange={value => onUpdate(player.id, { rating: value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Nationalité</Label>
            <NationalityPicker
              value={player.nationality}
              onChange={v => onUpdate(player.id, { nationality: v })}
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg border border-border/40">
            <div className="w-7 h-7 rounded-full bg-black/60 border border-white/15 flex items-center justify-center overflow-hidden shrink-0">
              <FlagImage code={player.nationality} size={24} />
            </div>
            <span className="text-sm text-muted-foreground">Drapeau : {player.nationality}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
