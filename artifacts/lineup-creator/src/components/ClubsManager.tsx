import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Check, Pencil, X, Upload, Users, Trophy, Sparkles, Shield, Flag, Star, Activity, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { JerseySVG, type JerseyStyle, JERSEY_STYLE_LABELS } from "@/components/JerseySVG";
import { BACKGROUNDS } from "@/lib/backgrounds";
import { SquadManager } from "@/components/SquadManager";
import { FormationPicker } from "@/components/FormationPicker";
import { deleteSharedClub, getSharedClubs, saveSharedClub } from "@/lib/sharedApi";

export type RosterPlayer = {
  id: string;
  name: string;
  age: number;
  rating: number;
  nationality: string;
  position: string;
  number: string;
};

export type Club = {
  id: string;
  name: string;
  logo?: string;
  jerseyColor: string;
  secondaryColor: string;
  accentColor: string;
  numberColor: string;
  jerseyStyle: JerseyStyle;
  backgroundId: string;
  category: "club" | "selection";
  roster?: RosterPlayer[];
};

const CLUBS_KEY = "istan-clubs-v1";

export function loadClubs(): Club[] {
  try {
    const value = JSON.parse(localStorage.getItem(CLUBS_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((club): club is Club => Boolean(
      club && typeof club === "object" &&
      typeof club.id === "string" &&
      typeof club.name === "string" &&
      club.name.trim(),
    ));
  } catch { return []; }
}
function saveClubs(clubs: Club[]) {
  try {
    localStorage.setItem(CLUBS_KEY, JSON.stringify(clubs));
    window.dispatchEvent(new CustomEvent("istan-clubs-updated"));
  } catch {}
}

const JERSEY_STYLES: JerseyStyle[] = ["plain", "bicolor", "striped", "hoops", "sash", "diagonal", "chevron", "collar"];

const DEFAULT_CLUBS: Omit<Club, "id">[] = [
  { name: "PSG", category: "club", jerseyColor: "#001a4e", secondaryColor: "#dc143c", accentColor: "#d4af37", numberColor: "#d4af37", jerseyStyle: "plain", backgroundId: "football-night" },
  { name: "OM", category: "club", jerseyColor: "#009fda", secondaryColor: "#ffffff", accentColor: "#003d5b", numberColor: "#ffffff", jerseyStyle: "plain", backgroundId: "football-standard" },
  { name: "OL", category: "club", jerseyColor: "#ffffff", secondaryColor: "#e41e20", accentColor: "#003f7a", numberColor: "#003f7a", jerseyStyle: "plain", backgroundId: "football-standard" },
  { name: "France", category: "selection", jerseyColor: "#002395", secondaryColor: "#ffffff", accentColor: "#ED2939", numberColor: "#ffffff", jerseyStyle: "plain", backgroundId: "football-night" },
  { name: "Barça", category: "club", jerseyColor: "#004d98", secondaryColor: "#a50044", accentColor: "#ffed00", numberColor: "#ffed00", jerseyStyle: "striped", backgroundId: "football-standard" },
  { name: "Real Madrid", category: "club", jerseyColor: "#f9fafb", secondaryColor: "#001a4e", accentColor: "#d4af37", numberColor: "#001a4e", jerseyStyle: "plain", backgroundId: "football-standard" },
  { name: "Man Utd", category: "club", jerseyColor: "#da020e", secondaryColor: "#ffffff", accentColor: "#ffe500", numberColor: "#ffffff", jerseyStyle: "plain", backgroundId: "football-red" },
  { name: "Juventus", category: "club", jerseyColor: "#000000", secondaryColor: "#ffffff", accentColor: "#000000", numberColor: "#ffffff", jerseyStyle: "striped", backgroundId: "football-standard" },
];

type Props = {
  onApply: (club: Club) => void;
  onApplyBestXI?: (club: Club, formation?: string) => void;
  onApplyBestXIAI?: (club: Club, formation?: string) => void;
  onRecommendFormation?: (formation: string) => void;
  formation?: string;
  sport?: "football" | "hockey";
};

function emptyForm(): Omit<Club, "id"> {
  return {
    name: "", category: "club", logo: undefined,
    jerseyColor: "#10b981", secondaryColor: "#ffffff", accentColor: "#064e3b",
    numberColor: "#ffffff", jerseyStyle: "plain", backgroundId: "football-standard",
  };
}

function ClubBadge({ club, className = "h-14 w-14" }: { club: Club; className?: string }) {
  const Icon = club.category === "club" ? Shield : Flag;
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-2xl border border-white/15 shadow-inner ${className}`}
      style={{
        background: `linear-gradient(145deg, ${club.jerseyColor} 0%, ${club.accentColor} 100%)`,
      }}
    >
      {club.logo ? (
        <img src={club.logo} alt="" className="h-full w-full object-cover" />
      ) : (
        <>
          <Icon className="h-7 w-7 text-white/80 drop-shadow-md" strokeWidth={1.7} />
          <span className="absolute bottom-1 left-0 right-0 text-center text-[8px] font-black uppercase tracking-wider text-white/75">
            {club.name.slice(0, 3)}
          </span>
        </>
      )}
    </div>
  );
}

function clubStats(club: Club) {
  const roster = club.roster ?? [];
  const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  return {
    count: roster.length,
    averageAge: average(roster.map(player => player.age).filter(Number.isFinite)),
    averageRating: average(roster.map(player => player.rating).filter(Number.isFinite)),
    topRating: roster.length ? Math.max(...roster.map(player => player.rating)) : 0,
  };
}

export function ClubsManager({ onApply, onApplyBestXI, onApplyBestXIAI, onRecommendFormation, formation, sport = "football" }: Props) {
  const [clubs, setClubs] = useState<Club[]>(() => {
    const saved = loadClubs();
    if (saved.length === 0) {
      const defaults = DEFAULT_CLUBS.map((c, i) => ({ ...c, id: `default-${i}` }));
      saveClubs(defaults);
      return defaults;
    }
    return saved;
  });
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Club, "id">>(emptyForm());
  const [filterCat, setFilterCat] = useState<"all" | "club" | "selection">("all");
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [menuClubId, setMenuClubId] = useState<string | null>(null);
  const [formationClubId, setFormationClubId] = useState<string | null>(null);
  const [bestXIMode, setBestXIMode] = useState<"local" | "ai" | null>(null);
  const [syncState, setSyncState] = useState<"syncing" | "ready" | "offline">("syncing");
  const logoRef = useRef<HTMLInputElement>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const queueWrite = useCallback((operation: () => Promise<unknown>) => {
    setSyncState("syncing");
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(operation)
      .then(() => setSyncState("ready"))
      .catch(() => setSyncState("offline"));
  }, []);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      try {
        const shared = await getSharedClubs();
        if (!active) return;
        if (shared.length > 0) {
          setClubs(shared);
          saveClubs(shared);
          setSyncState("ready");
          return;
        }
        const local = loadClubs();
        for (const club of local) {
          await saveSharedClub(club);
        }
        setSyncState("ready");
      } catch {
        // localStorage remains available when the API is temporarily offline.
        if (active) setSyncState("offline");
      }
    };
    void sync();
    const onFocus = () => { void sync(); };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const filtered = clubs.filter(c => filterCat === "all" || c.category === filterCat);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setForm(f => ({ ...f, logo: ev.target?.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editId) {
      const updated = clubs.map(c => c.id === editId ? { ...form, id: editId } : c);
      saveClubs(updated);
      setClubs(updated);
      queueWrite(() => saveSharedClub({ ...form, id: editId }));
      setEditId(null);
    } else {
      const newClub: Club = {
        ...form,
        id: `club-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      const updated = [newClub, ...clubs];
      saveClubs(updated);
      setClubs(updated);
      queueWrite(() => saveSharedClub(newClub));
    }
    setForm(emptyForm());
    setShowForm(false);
  };

  const handleEdit = (club: Club) => {
    setForm({ name: club.name, category: club.category, logo: club.logo, roster: club.roster, jerseyColor: club.jerseyColor, secondaryColor: club.secondaryColor, accentColor: club.accentColor, numberColor: club.numberColor, jerseyStyle: club.jerseyStyle, backgroundId: club.backgroundId });
    setEditId(club.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    const updated = clubs.filter(c => c.id !== id);
    saveClubs(updated);
    setClubs(updated);
    if (selectedClubId === id) setSelectedClubId(null);
    if (menuClubId === id) setMenuClubId(null);
    if (formationClubId === id) {
      setFormationClubId(null);
      setBestXIMode(null);
    }
    queueWrite(() => deleteSharedClub(id));
  };

  const selectedClub = clubs.find(club => club.id === selectedClubId) ?? null;
  const menuClub = clubs.find(club => club.id === menuClubId) ?? null;
  const formationClub = clubs.find(club => club.id === formationClubId) ?? null;
  const openBestXI = (club: Club, mode: "local" | "ai") => {
    setFormationClubId(club.id);
    setBestXIMode(mode);
    setMenuClubId(null);
  };
  const openSquad = (club: Club) => {
    setSelectedClubId(club.id);
    setMenuClubId(null);
  };
  const closeFormationPicker = () => {
    setFormationClubId(null);
    setBestXIMode(null);
  };
  const handleRosterChange = (roster: RosterPlayer[]) => {
    if (!selectedClub) return;
    const updated = clubs.map(club => club.id === selectedClub.id ? { ...club, roster } : club);
    saveClubs(updated);
    setClubs(updated);
    const updatedClub = updated.find(club => club.id === selectedClub.id);
    if (updatedClub) queueWrite(() => saveSharedClub(updatedClub));
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm());
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/15 via-background to-background p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Espace équipe</p>
          <h3 className="mt-1 text-lg font-black tracking-tight">Clubs & effectifs</h3>
          <p className="mt-1 text-xs text-muted-foreground">Applique un style, gère les joueurs et prépare ton XI.</p>
          <p className={`mt-2 text-[10px] font-semibold ${syncState === "offline" ? "text-amber-400" : "text-muted-foreground"}`}>
            {syncState === "syncing" ? "Synchronisation…" : syncState === "offline" ? "Mode local · serveur partagé indisponible" : "Données synchronisées"}
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-border/50 bg-background/60 px-3 py-2 text-center">
          <p className="text-lg font-black text-primary">{clubs.length}</p>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">équipes</p>
        </div>
      </div>
      {/* Filter tabs */}
      <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-lg border border-border/40">
        {(["all", "club", "selection"] as const).map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all capitalize ${filterCat === cat ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {cat === "all" ? "Tous" : cat === "club" ? "Clubs" : "Sélections"}
          </button>
        ))}
      </div>

      {/* Club grid */}
      <div className="grid max-h-[min(55vh,520px)] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3">
        {filtered.map(club => (
          <div
            key={club.id}
            role="button"
            tabIndex={0}
            aria-label={`Ouvrir le menu de ${club.name}`}
            className="relative group rounded-2xl border border-border/50 bg-gradient-to-b from-muted/35 to-muted/10 p-3 flex min-w-0 flex-col items-center gap-2 hover:border-primary/50 hover:-translate-y-0.5 transition-all cursor-pointer shadow-sm"
            onClick={() => setMenuClubId(club.id)}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setMenuClubId(club.id);
              }
            }}
          >
            {/* Lightweight club/selection icon — no jersey SVG in the list */}
            <ClubBadge club={club} />
            <span className="w-full truncate text-center text-xs font-black leading-tight">{club.name}</span>
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${club.category === "club" ? "bg-blue-500/20 text-blue-300" : "bg-yellow-500/20 text-yellow-300"}`}>
              {club.category === "club" ? <Shield className="h-2.5 w-2.5" /> : <Flag className="h-2.5 w-2.5" />}
              {club.category === "club" ? "Club" : "Sél."}
            </span>
            <div className="grid w-full grid-cols-2 gap-1 border-t border-border/40 pt-1.5 text-center">
              <span className="text-[9px] text-muted-foreground"><b className="block text-[11px] text-foreground">{clubStats(club).averageRating || "—"}</b>GEN moyen</span>
              <span className="text-[9px] text-muted-foreground"><b className="block text-[11px] text-foreground">{clubStats(club).averageAge || "—"}</b>âge moyen</span>
            </div>

            {/* Hover actions */}
            <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-2xl bg-black/75 opacity-0 transition-opacity group-hover:opacity-100" onClick={e => e.stopPropagation()}>
              <button onClick={() => onApply(club)} className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg">
                <Check className="w-3.5 h-3.5 text-primary-foreground" />
              </button>
              <button onClick={() => openSquad(club)} className="w-7 h-7 rounded-full bg-primary/80 flex items-center justify-center shadow-lg" title="Gérer l'effectif">
                <Users className="w-3 h-3 text-primary-foreground" />
              </button>
              <button onClick={() => handleEdit(club)} className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shadow-lg">
                <Pencil className="w-3 h-3 text-foreground" />
              </button>
              <button onClick={() => handleDelete(club.id)} className="w-7 h-7 rounded-full bg-destructive/80 flex items-center justify-center shadow-lg">
                <Trash2 className="w-3 h-3 text-white" />
              </button>
            </div>
          </div>
        ))}

        {/* Add button */}
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm()); }}
          className="rounded-xl border-2 border-dashed border-border/40 hover:border-primary/50 bg-muted/10 flex flex-col items-center justify-center gap-1 p-2 transition-all h-full min-h-[88px]">
          <Plus className="w-5 h-5 text-muted-foreground" />
          <span className="text-[9px] text-muted-foreground font-semibold">Ajouter</span>
        </button>
      </div>

      {selectedClub && (
        <SquadManager
          club={selectedClub}
          onChange={handleRosterChange}
          onBestXI={(requestedFormation) => onApplyBestXI?.(selectedClub, requestedFormation)}
           onBestXIAI={(requestedFormation) => onApplyBestXIAI?.(selectedClub, requestedFormation)}
          onRecommendFormation={onRecommendFormation}
          formation={formation}
          sport={sport}
        />
      )}

      {/* Add/Edit form */}
      {showForm && (
        <div className="rounded-xl border border-primary/30 bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">{editId ? "Modifier le club" : "Nouveau club"}</span>
            <button onClick={handleCancel} className="w-6 h-6 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Nom</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: PSG, Équipe de France…" className="h-8 text-sm" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Catégorie</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as "club" | "selection" }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="club">Club</SelectItem>
                  <SelectItem value="selection">Sélection</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Logo</Label>
              <Button variant="outline" size="sm" className="h-8 w-full text-xs relative overflow-hidden gap-1.5">
                <Upload className="w-3 h-3" />
                {form.logo ? "Changer" : "Logo"}
                <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
              </Button>
            </div>
          </div>

          {/* Jersey preview */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 shrink-0">
              <JerseySVG uid="form-preview" color1={form.jerseyColor} color2={form.secondaryColor} color3={form.accentColor} numberColor={form.numberColor} style={form.jerseyStyle} number="10" />
            </div>
            <div className="grid grid-cols-4 gap-1.5 flex-1">
              {[
                { label: "Principale", val: form.jerseyColor, key: "jerseyColor" },
                { label: "Secondaire", val: form.secondaryColor, key: "secondaryColor" },
                { label: "Contour", val: form.accentColor, key: "accentColor" },
                { label: "Numéro", val: form.numberColor, key: "numberColor" },
              ].map(({ label, val, key }) => (
                <div key={key} className="flex flex-col items-center gap-1">
                  <input type="color" value={val} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-border/60 p-0.5 bg-transparent" />
                  <span className="text-[8px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Style maillot</Label>
              <Select value={form.jerseyStyle} onValueChange={v => setForm(f => ({ ...f, jerseyStyle: v as JerseyStyle }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JERSEY_STYLES.map(s => <SelectItem key={s} value={s}>{JERSEY_STYLE_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Terrain</Label>
              <Select value={form.backgroundId} onValueChange={v => setForm(f => ({ ...f, backgroundId: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BACKGROUNDS.filter(b => b.sport === "football" || b.sport === "both").map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleSave} className="w-full h-9 text-sm font-bold">
            <Check className="w-4 h-4 mr-2" />
            {editId ? "Modifier" : "Sauvegarder"}
          </Button>
        </div>
      )}

      <Dialog open={!!menuClub} onOpenChange={open => { if (!open) setMenuClubId(null); }}>
        {menuClub && (
          <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-zinc-950 p-0 sm:max-w-[430px]">
            <div className="relative overflow-hidden rounded-t-lg p-5" style={{ background: `linear-gradient(135deg, ${menuClub.jerseyColor} 0%, ${menuClub.accentColor} 115%)` }}>
              <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex items-center gap-4">
                <ClubBadge club={menuClub} className="h-20 w-20 shrink-0 border-white/30 bg-black/20" />
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/65">{menuClub.category === "club" ? "Club" : "Sélection"}</p>
                  <h2 className="truncate text-2xl font-black text-white">{menuClub.name}</h2>
                  <p className="mt-1 text-xs font-semibold text-white/70">{clubStats(menuClub).count} joueur{clubStats(menuClub).count > 1 ? "s" : ""} dans l’effectif</p>
                </div>
              </div>
            </div>
            <DialogHeader>
              <DialogTitle className="sr-only">{menuClub.name}</DialogTitle>
              <DialogDescription className="sr-only">Actions et statistiques du club</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 p-5 pt-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: Star, label: "GEN moyen", value: clubStats(menuClub).averageRating || "—" },
                  { icon: CalendarDays, label: "Âge moyen", value: clubStats(menuClub).averageAge ? `${clubStats(menuClub).averageAge} ans` : "—" },
                  { icon: Activity, label: "Meilleur GEN", value: clubStats(menuClub).topRating || "—" },
                ].map(stat => (
                  <div key={stat.label} className="rounded-xl border border-border/50 bg-muted/20 p-2.5 text-center">
                    <stat.icon className="mx-auto mb-1 h-3.5 w-3.5 text-primary" />
                    <p className="text-sm font-black">{stat.value}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-2">
                <Button type="button" className="h-11 justify-start gap-3 rounded-xl font-bold" onClick={() => { onApply(menuClub); setMenuClubId(null); }}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/15"><Check className="h-4 w-4" /></span> Appliquer le thème
                </Button>
                <Button type="button" variant="secondary" className="h-11 justify-start gap-3 rounded-xl font-bold" onClick={() => openSquad(menuClub)}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15"><Users className="h-4 w-4 text-primary" /></span> Ouvrir l’effectif
                </Button>
                {onApplyBestXI && (menuClub.roster?.length ?? 0) > 0 && (
                  <Button type="button" variant="outline" className="h-11 justify-start gap-3 rounded-xl font-bold" onClick={() => openBestXI(menuClub, "local")}>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10"><Trophy className="h-4 w-4 text-primary" /></span> Placer le meilleur XI
                  </Button>
                )}
                {onApplyBestXIAI && (menuClub.roster?.length ?? 0) > 0 && (
                  <Button type="button" variant="outline" className="h-11 justify-start gap-3 rounded-xl font-bold" onClick={() => openBestXI(menuClub, "ai")}>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10"><Sparkles className="h-4 w-4 text-primary" /></span> Optimiser avec l’IA
                  </Button>
                )}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button type="button" variant="ghost" className="justify-center gap-2 rounded-xl text-xs" onClick={() => { handleEdit(menuClub); setMenuClubId(null); }}>
                    <Pencil className="h-3.5 w-3.5" /> Modifier
                  </Button>
                  <Button type="button" variant="ghost" className="justify-center gap-2 rounded-xl text-xs text-destructive hover:text-destructive" onClick={() => handleDelete(menuClub.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <FormationPicker
        open={Boolean(formationClub && bestXIMode)}
        onClose={closeFormationPicker}
        sport={sport}
        current={formation ?? (sport === "football" ? "4-3-3" : "1-2-2 (Standard)")}
        jerseyColor={formationClub?.jerseyColor ?? "#10b981"}
        onSelect={selectedFormation => {
          if (!formationClub || !bestXIMode) return;
          if (bestXIMode === "ai") {
            void Promise.resolve(onApplyBestXIAI?.(formationClub, selectedFormation)).catch(() => undefined);
          } else {
            onApplyBestXI?.(formationClub, selectedFormation);
          }
          closeFormationPicker();
        }}
      />
    </div>
  );
}
