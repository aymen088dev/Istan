import { useState } from "react";
import { Search, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { countries, resolveCountryCode } from "@/lib/countries";

type Props = {
  value: string;
  onChange: (code: string) => void;
};

function FlagImage({ code, size = 22 }: { code: string; size?: number }) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const normalized = resolveCountryCode(code);
  const country = countries.find(c => c.code === normalized);
  if (country?.isCustom) {
    return <img src={`${base}/istanmusta-flag.png`} alt="flag" style={{ width: size, height: size, objectFit: "cover", borderRadius: "50%" }} />;
  }
  return (
    <img
      src={`https://flagcdn.com/w20/${normalized.toLowerCase()}.png`}
      alt={normalized}
      style={{ width: size, height: size, objectFit: "cover", borderRadius: "50%" }}
      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

export function NationalityPicker({ value, onChange }: Props) {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? countries.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase())
      )
    : countries;

  const selected = countries.find(c => c.code === resolveCountryCode(value)) || countries[0];

  return (
    <div className="space-y-2">
      {/* Current selection preview */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-lg border border-border">
        <div className="w-7 h-7 rounded-full bg-black/60 border border-white/15 flex items-center justify-center overflow-hidden shrink-0">
          <FlagImage code={selected.code} size={24} />
        </div>
        <span className="text-sm font-semibold">{selected.name}</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">{selected.code}</span>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Rechercher un pays…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-9 text-sm"
          autoComplete="off"
        />
      </div>

      {/* Country list */}
      <div className="max-h-52 overflow-y-auto rounded-lg border border-border divide-y divide-border/40">
        {filtered.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-4">Aucun pays trouvé</p>
        ) : (
          filtered.map(c => (
            <button
              key={c.code}
              type="button"
              onClick={() => onChange(c.code)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left ${
                value === c.code ? "bg-primary/10" : ""
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-black/50 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                <FlagImage code={c.code} size={20} />
              </div>
              <span className={`flex-1 ${value === c.code ? "text-primary font-semibold" : ""}`}>
                {c.name}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">{c.code}</span>
              {value === c.code && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
