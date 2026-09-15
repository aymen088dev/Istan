import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Trash2, Check, Pencil, X, Upload, Users, Trophy, Sparkles, Shield, Flag,
  Star, Activity, CalendarDays, Search, ArrowDownWideNarrow, Copy, FileDown,
  Swords, LayoutGrid, ChevronRight, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { JerseySVG, type JerseyStyle, JERSEY_STYLE_LABELS } from "@/components/JerseySVG";
import { BACKGROUNDS } from "@/lib/backgrounds";
import { SquadManager } from "@/components/SquadManager";
import { FormationPicker } from "@/components/FormationPicker";
import { deleteSharedClub, getSharedClubs, saveSharedClub } from "@/lib/sharedApi";
import { uploadClubLogo } from "@/lib/sharedApi";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  analyzeFormation,
  profilePlayerPosition,
  type FormationMap,
  type AnalysisSport,
  type AnalysisPlayer,
} from "@/lib/formationAnalysis";
import { FOOTBALL_FORMATIONS, HOCKEY_FORMATIONS } from "@/lib/formations";

export type RosterPlayer = {
  id: string;
  name: string;
  age: number;
  rating: number;
  nationality: string;
  position: string;
  number: string;
};

export type ClubMatchRecord = {
  opponent: string;
  scored: number;
  conceded: number;
  playedAt: number;
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
  isFavorite?: boolean;
  matchHistory?: ClubMatchRecord[];
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

function emptyForm(): Omit<Club, "id"> {
  return {
    name: "", category: "club", logo: undefined,
    jerseyColor: "#10b981", secondaryColor: "#ffffff", accentColor: "#064e3b",
    numberColor: "#ffffff", jerseyStyle: "plain", backgroundId: "football-standard",
  };
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

function matchSummary(club: Club) {
  const history = club.matchHistory ?? [];
  const wins = history.filter(m => m.scored > m.conceded).length;
  const draws = history.filter(m => m.scored === m.conceded).length;
  const losses = history.filter(m => m.scored < m.conceded).length;
  const goalsFor = history.reduce((sum, m) => sum + m.scored, 0);
  const goalsAgainst = history.reduce((sum, m) => sum + m.conceded, 0);
  return { played: history.length, wins, draws, losses, goalsFor, goalsAgainst };
}

const ClubBadge = memo(function ClubBadge({ club, className = "h-14 w-14" }: { club: Club; className?: string }) {
  const Icon = club.category === "club" ? Shield : Flag;
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-2xl border border-white/15 shadow-inner ${className}`}
      style={{ background: `linear-gradient(145deg, ${club.jerseyColor} 0%, ${club.accentColor} 100%)` }}
    >
      {club.logo ? (
        <img src={club.logo} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain p-1.5" />
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
});

/* ─────────────────────────────────────────────────────────────────────────
   Distribution par poste : GB / DEF / MIL / ATT via le référentiel partagé.
   ───────────────────────────────────────────────────────────────────────── */
type PositionFilter = "all" | "GB" | "DEF" | "MIL" | "ATT";

function rosterGroupOf(position: string, sport: AnalysisSport): PositionFilter | null {
  const role = profilePlayerPosition(position, sport).role;
  if (role === "goalkeeper") return "GB";
  if (role === "central-defender" || role === "fullback" || role === "defender") return "DEF";
  if (role === "defensive-mid" || role === "midfielder" || role === "attacking-mid") return "MIL";
  if (role === "wing" || role === "center" || role === "forward" || role === "striker") return "ATT";
  return null;
}

const POSITION_FILTERS: Array<{ id: PositionFilter; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "GB", label: "GB" },
  { id: "DEF", label: "DEF" },
  { id: "MIL", label: "MIL" },
  { id: "ATT", label: "ATT" },
];

/* ─────────────────────────────────────────────────────────────────────────
   MiniXI : meilleur XI du club affiché sur un mini-terrain, calculé avec
   exactement les mêmes règles que le placement réel (analyzeFormation) et la
   meilleure formation automatiquement détectée.
   ───────────────────────────────────────────────────────────────────────── */
const MiniXI = memo(function MiniXI({ club, sport }: { club: Club; sport: AnalysisSport }) {
  const roster = club.roster ?? [];
  const best = useMemo(() => {
    if (roster.length === 0) return null;
    const formations = (sport === "football" ? FOOTBALL_FORMATIONS : HOCKEY_FORMATIONS) as FormationMap;
    let bestName = Object.keys(formations)[0];
    let bestFit = -1;
    for (const [name, definition] of Object.entries(formations)) {
      const analysis = analyzeFormation(name, definition, roster as AnalysisPlayer[], sport);
      if (analysis.averageFit > bestFit) {
        bestFit = analysis.averageFit;
        bestName = name;
      }
    }
    return analyzeFormation(bestName, formations[bestName], roster as AnalysisPlayer[], sport);
  }, [roster, sport]);

  if (!best) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/25 px-4 py-8 text-center">
        <LayoutGrid className="mb-2 h-6 w-6 text-white/30" />
        <p className="text-xs font-bold text-white/60">Aucun joueur dans cet effectif</p>
        <p className="mt-1 text-[10px] text-white/35">Ajoute des joueurs pour voir le meilleur XI ici.</p>
      </div>
    );
  }

  const formations = (sport === "football" ? FOOTBALL_FORMATIONS : HOCKEY_FORMATIONS) as FormationMap;
  const positions = formations[best.formation]?.positions ?? [];

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/10"
      style={{
        aspectRatio: "3/4",
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.06), transparent 55%)," +
          "linear-gradient(180deg, #0b3d20 0%, #0a351c 55%, #062512 100%)",
      }}
      aria-label={`Meilleur XI ${best.formation} — compatibilité ${best.averageFit}%`}
    >
      <div className="absolute inset-3 rounded-xl border border-white/15" />
      <div className="absolute left-3 right-3 top-1/2 h-px bg-white/10" />
      <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
      <div className="absolute inset-x-3 top-1/3 h-px border-t border-dashed border-white/10" />
      <div className="absolute inset-x-3 top-2/3 h-px border-t border-dashed border-white/10" />
      {/* Surface de réparation */}
      <div className="absolute bottom-3 left-1/2 h-10 w-24 -translate-x-1/2 rounded-b border-x border-b border-white/15" />
      <div className="absolute top-3 left-1/2 h-10 w-24 -translate-x-1/2 rounded-t border-x border-t border-white/15" />

      {best.slots.map(slot => {
        const pos = positions[slot.index];
        if (!pos || !slot.recommendedPlayerName) return null;
        return (
          <div
            key={slot.index}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/25 text-[9px] font-black shadow-md"
              style={{ background: club.jerseyColor, color: club.numberColor }}
            >
              {slot.recommendedPlayerName.slice(0, 2).toUpperCase()}
            </div>
            <span className="mt-0.5 max-w-[62px] truncate rounded bg-black/60 px-1 text-[7px] font-bold leading-tight text-white">
              {slot.recommendedPlayerName}
            </span>
            <span
              className={`mt-0.5 rounded-full px-1 text-[6.5px] font-black leading-tight ${
                slot.recommendation === "excellent" ? "bg-emerald-500/25 text-emerald-300"
                : slot.recommendation === "good" ? "bg-blue-500/25 text-blue-300"
                : "bg-amber-500/25 text-amber-300"
              }`}
            >
              {slot.bestFit}%
            </span>
          </div>
        );
      })}

      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-xl bg-black/55 px-2.5 py-1.5 backdrop-blur-sm">
        <span className="text-[10px] font-black text-white">{best.formation}</span>
        <span className={`text-[10px] font-black ${best.goalkeeperReady ? "text-emerald-300" : "text-amber-300"}`}>
          {best.averageFit}% · {best.exactPostes}/{best.slots.length} naturels
        </span>
      </div>
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────────────────
   Export CSV de l'effectif (compatible Excel/LibreOffice, BOM UTF-8).
   ───────────────────────────────────────────────────────────────────────── */
function downloadRosterCsv(club: Club) {
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const rows: string[] = [
    ["Nom", "Poste", "Numéro", "Âge", "OVR", "Nationalité"].map(escape).join(";"),
    ...(club.roster ?? []).map(player => [
      player.name, player.position, player.number, player.age, player.rating, player.nationality,
    ].map(escape).join(";")),
  ];
  const blob = new Blob(["\uFEFF" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${club.name.replace(/[^\w-]+/g, "_")}-effectif.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

type Props = {
  onApply: (club: Club) => void;
  onApplyBestXI?: (club: Club, formation?: string) => void;
  onApplyBestXIAI?: (club: Club, formation?: string) => void;
  onRecommendFormation?: (formation: string) => void;
  formation?: string;
  sport?: "football" | "hockey";
};

type MenuTab = "apercu" | "effectif" | "match";

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
  const [syncState, setSyncState] = useState<"syncing" | "ready" | "offline">("syncing");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Club, "id">>(emptyForm());
  const [filterCat, setFilterCat] = useState<"all" | "club" | "selection">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"rating" | "name" | "size">("rating");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("all");
  const [menuClubId, setMenuClubId] = useState<string | null>(null);
  const [menuTab, setMenuTab] = useState<MenuTab>("apercu");
  const [squadClubId, setSquadClubId] = useState<string | null>(null);
  const [formationClubId, setFormationClubId] = useState<string | null>(null);
  const [bestXIMode, setBestXIMode] = useState<"local" | "ai" | null>(null);
  const [matchForm, setMatchForm] = useState({ opponent: "", scored: "0", conceded: "0" });
  const logoRef = useRef<HTMLInputElement>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const rosterWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const sync = async (isPolling = false) => {
      try {
        const shared = await getSharedClubs();
        if (!active) return;
        if (shared.length > 0) {
          // Ne re-rend que si le contenu a réellement changé : évite le
          // clignotement et les re-rendus lourds à chaque tick de polling.
          setClubs(previous => {
            if (JSON.stringify(previous) === JSON.stringify(shared)) return previous;
            saveClubs(shared);
            return shared;
          });
          setSyncState("ready");
          return;
        }
        if (isPolling) return;
        const local = loadClubs();
        for (const club of local) {
          await saveSharedClub(club);
        }
        setSyncState("ready");
      } catch {
        if (active) setSyncState("offline");
      }
    };
    void sync();
    const onFocus = () => { void sync(); };
    window.addEventListener("focus", onFocus);
    const poll = window.setInterval(() => { void sync(true); }, 5000);
    return () => {
      active = false;
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      if (rosterWriteTimerRef.current) {
        clearTimeout(rosterWriteTimerRef.current);
        rosterWriteTimerRef.current = null;
      }
    };
  }, []);

  const persistClub = useCallback((club: Club, all: Club[]) => {
    saveClubs(all);
    setClubs(all);
    queueWrite(() => saveSharedClub(club));
  }, [queueWrite]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setSyncState("offline");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => e.target.value = "";
    reader.onload = async ev => {
      const dataUrl = ev.target?.result as string;
      setForm(f => ({ ...f, logo: dataUrl }));
      try {
        const { url } = await uploadClubLogo(dataUrl);
        setForm(f => (f.logo === dataUrl ? { ...f, logo: url } : f));
        setSyncState("ready");
      } catch {
        setSyncState("offline");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editId) {
      const previous = clubs.find(c => c.id === editId);
      const updated = clubs.map(c => c.id === editId ? { ...form, id: editId, isFavorite: previous?.isFavorite, matchHistory: previous?.matchHistory } : c);
      persistClub(updated.find(c => c.id === editId)!, updated);
      setEditId(null);
    } else {
      const newClub: Club = {
        ...form,
        id: `club-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      persistClub(newClub, [newClub, ...clubs]);
    }
    setForm(emptyForm());
    setShowForm(false);
  };

  const handleEdit = (club: Club) => {
    setForm({
      name: club.name, category: club.category, logo: club.logo, roster: club.roster,
      jerseyColor: club.jerseyColor, secondaryColor: club.secondaryColor,
      accentColor: club.accentColor, numberColor: club.numberColor,
      jerseyStyle: club.jerseyStyle, backgroundId: club.backgroundId,
    });
    setEditId(club.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    const updated = clubs.filter(c => c.id !== id);
    saveClubs(updated);
    setClubs(updated);
    if (menuClubId === id) setMenuClubId(null);
    if (squadClubId === id) setSquadClubId(null);
    if (formationClubId === id) {
      setFormationClubId(null);
      setBestXIMode(null);
    }
    queueWrite(() => deleteSharedClub(id));
  };

  const toggleFavorite = (club: Club) => {
    const updated = clubs.map(c => c.id === club.id ? { ...c, isFavorite: !c.isFavorite } : c);
    persistClub(updated.find(c => c.id === club.id)!, updated);
  };

  const duplicateClub = (club: Club) => {
    const copy: Club = {
      ...club,
      id: `club-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `${club.name} (copie)`,
      isFavorite: false,
      matchHistory: [],
    };
    persistClub(copy, [copy, ...clubs]);
    setMenuClubId(null);
  };

  const recordMatch = () => {
    if (!menuClub || !matchForm.opponent.trim()) return;
    const record: ClubMatchRecord = {
      opponent: matchForm.opponent.trim(),
      scored: Math.max(0, Math.min(99, Number(matchForm.scored) || 0)),
      conceded: Math.max(0, Math.min(99, Number(matchForm.conceded) || 0)),
      playedAt: Date.now(),
    };
    const updated = clubs.map(c => c.id === menuClub.id
      ? { ...c, matchHistory: [record, ...(c.matchHistory ?? [])].slice(0, 50) }
      : c);
    persistClub(updated.find(c => c.id === menuClub.id)!, updated);
    setMatchForm({ opponent: "", scored: "0", conceded: "0" });
  };

  const handleRosterChange = (roster: RosterPlayer[]) => {
    if (!squadClub) return;
    const updated = clubs.map(club => club.id === squadClub.id ? { ...club, roster } : club);
    const changedClub = updated.find(club => club.id === squadClub.id);
    if (!changedClub) return;

    // La saisie d'un nom/âge/poste déclenche plusieurs changements successifs.
    // On met à jour l'interface immédiatement, mais on n'envoie qu'une seule
    // sauvegarde serveur 450 ms après la dernière frappe.
    saveClubs(updated);
    setClubs(updated);
    setSyncState("syncing");
    if (rosterWriteTimerRef.current) clearTimeout(rosterWriteTimerRef.current);
    rosterWriteTimerRef.current = setTimeout(() => {
      rosterWriteTimerRef.current = null;
      queueWrite(() => saveSharedClub(changedClub));
    }, 450);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm());
  };

  const menuClub = clubs.find(club => club.id === menuClubId) ?? null;
  const squadClub = clubs.find(club => club.id === squadClubId) ?? null;
  const formationClub = clubs.find(club => club.id === formationClubId) ?? null;

  const openBestXI = (club: Club, mode: "local" | "ai") => {
    setFormationClubId(club.id);
    setBestXIMode(mode);
    setMenuClubId(null);
  };
  const openSquad = (club: Club, tab: MenuTab = "effectif") => {
    setSquadClubId(club.id);
    setMenuTab(tab);
    setMenuClubId(null);
  };
  const closeFormationPicker = () => {
    setFormationClubId(null);
    setBestXIMode(null);
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = clubs.filter(club =>
      (filterCat === "all" || club.category === filterCat) &&
      (!query || club.name.toLowerCase().includes(query)),
    );
    if (sortBy === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "size") return [...list].sort((a, b) => (b.roster?.length ?? 0) - (a.roster?.length ?? 0));
    if (sortBy === "rating") return [...list].sort((a, b) => clubStats(b).averageRating - clubStats(a).averageRating);
    return list;
  }, [clubs, filterCat, search, sortBy]);

  const rosterDistribution = useMemo(() => {
    if (!menuClub) return null;
    const counts: Record<PositionFilter, number> = { all: menuClub.roster?.length ?? 0, GB: 0, DEF: 0, MIL: 0, ATT: 0 };
    for (const player of menuClub.roster ?? []) {
      const group = rosterGroupOf(player.position, sport);
      if (group) counts[group] += 1;
    }
    return counts;
  }, [menuClub, sport]);

  return (
    <div className="space-y-4">
      {/* ── En-tête ── */}
      <div className="flex items-end justify-between gap-3 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/15 via-background to-background p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Espace équipe</p>
          <h3 className="mt-1 text-lg font-black tracking-tight">Clubs & effectifs</h3>
          <p className="mt-1 text-xs text-muted-foreground">Clique sur un club pour ouvrir son menu complet.</p>
          <p className={`mt-2 text-[10px] font-semibold ${syncState === "offline" ? "text-amber-400" : "text-muted-foreground"}`}>
            {syncState === "syncing" ? "Synchronisation…" : syncState === "offline" ? "Mode local · serveur partagé indisponible" : "Données synchronisées"}
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-border/50 bg-background/60 px-3 py-2 text-center">
          <p className="text-lg font-black text-primary">{clubs.length}</p>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">équipes</p>
        </div>
      </div>

      {/* ── Filtres catégorie + tri ── */}
      <div className="flex gap-2">
        <div className="flex flex-1 items-center gap-1 rounded-lg border border-border/40 bg-muted/30 p-1">
          {(["all", "club", "selection"] as const).map(cat => (
            <button key={cat} onClick={() => setFilterCat(cat)}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${filterCat === cat ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {cat === "all" ? "Tous" : cat === "club" ? "Clubs" : "Sél."}
            </button>
          ))}
        </div>
        <Select value={sortBy} onValueChange={value => setSortBy(value as typeof sortBy)}>
          <SelectTrigger className="h-auto w-[130px] shrink-0 text-xs" aria-label="Trier les clubs">
            <ArrowDownWideNarrow className="h-3.5 w-3.5 opacity-60" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rating">Par GEN</SelectItem>
            <SelectItem value="name">Par nom</SelectItem>
            <SelectItem value="size">Par effectif</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Recherche ── */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un club…"
          className="h-9 border-border/50 bg-background pl-9 text-sm" />
        {search && (
          <button onClick={() => setSearch("")} aria-label="Effacer la recherche"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Grille des clubs ── */}
      <div className="grid max-h-[min(52vh,500px)] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3">
        {filtered.map(club => {
          const stats = clubStats(club);
          return (
            <div
              key={club.id}
              role="button"
              tabIndex={0}
              aria-label={`Ouvrir le menu de ${club.name}`}
              className="group relative cursor-pointer rounded-2xl border border-border/50 bg-gradient-to-b from-muted/35 to-muted/10 p-3 transition-all hover:-translate-y-0.5 hover:border-primary/50"
              onClick={() => { setMenuClubId(club.id); setMenuTab("apercu"); }}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setMenuClubId(club.id);
                  setMenuTab("apercu");
                }
              }}
            >
              {/* Favori */}
              <button
                aria-label={club.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                onClick={e => { e.stopPropagation(); toggleFavorite(club); }}
                className="absolute right-2 top-2 z-10 rounded-full bg-black/35 p-1 transition-transform hover:scale-110"
              >
                <Star className={`h-3.5 w-3.5 ${club.isFavorite ? "fill-amber-400 text-amber-400" : "text-white/50"}`} />
              </button>

              <ClubBadge club={club} />
              <span className="mt-2 block w-full truncate text-center text-xs font-black leading-tight">{club.name}</span>
              <span className={`mx-auto mt-1 flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${club.category === "club" ? "bg-blue-500/20 text-blue-300" : "bg-yellow-500/20 text-yellow-300"}`}>
                {club.category === "club" ? <Shield className="h-2.5 w-2.5" /> : <Flag className="h-2.5 w-2.5" />}
                {club.category === "club" ? "Club" : "Sél."}
              </span>
              <div className="mt-1.5 grid w-full grid-cols-2 gap-1 border-t border-border/40 pt-1.5 text-center">
                <span className="text-[9px] text-muted-foreground"><b className="block text-[11px] text-foreground">{stats.averageRating || "—"}</b>GEN moyen</span>
                <span className="text-[9px] text-muted-foreground"><b className="block text-[11px] text-foreground">{stats.count}</b>joueurs</span>
              </div>

              {/* Application rapide au survol (desktop) */}
              <div className="absolute inset-x-3 bottom-10 hidden justify-center group-hover:flex">
                <button
                  onClick={e => { e.stopPropagation(); onApply(club); }}
                  className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[10px] font-black text-primary-foreground shadow-lg transition-transform active:scale-95"
                >
                  <Check className="h-3 w-3" /> Appliquer
                </button>
              </div>
              <ChevronRight className="absolute bottom-2 right-2 h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
          );
        })}

        <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm()); }}
          className="flex h-full min-h-[88px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border/40 bg-muted/10 p-2 transition-all hover:border-primary/50">
          <Plus className="h-5 w-5 text-muted-foreground" />
          <span className="text-[9px] font-semibold text-muted-foreground">Ajouter</span>
        </button>
      </div>

      {/* ── Formulaire d'ajout / édition ── */}
      {showForm && (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">{editId ? "Modifier le club" : "Nouveau club"}</span>
            <button onClick={handleCancel} className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
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
              <Button variant="outline" size="sm" className="relative h-8 w-full gap-1.5 overflow-hidden text-xs">
                <Upload className="h-3 w-3" />
                {form.logo ? "Remplacer" : "Logo"}
                {form.logo && (
                  <button type="button" onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, logo: undefined })); }}
                    className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-destructive hover:bg-destructive/10" aria-label="Retirer le logo">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
                <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoUpload} className="absolute inset-0 cursor-pointer opacity-0" />
              </Button>
            </div>
          </div>

          {/* Aperçu maillot */}
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0">
              <JerseySVG uid="form-preview" color1={form.jerseyColor} color2={form.secondaryColor} color3={form.accentColor} numberColor={form.numberColor} style={form.jerseyStyle} number="10" />
            </div>
            <div className="grid flex-1 grid-cols-4 gap-1.5">
              {([
                { label: "Principale", key: "jerseyColor" },
                { label: "Secondaire", key: "secondaryColor" },
                { label: "Contour", key: "accentColor" },
                { label: "Numéro", key: "numberColor" },
              ] as const).map(({ label, key }) => (
                <div key={key} className="flex flex-col items-center gap-1">
                  <input type="color" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="h-8 w-8 cursor-pointer rounded-lg border border-border/60 bg-transparent p-0.5" aria-label={label} />
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

          <Button onClick={handleSave} className="h-9 w-full text-sm font-bold">
            <Check className="mr-2 h-4 w-4" />
            {editId ? "Modifier" : "Sauvegarder"}
          </Button>
        </div>
      )}

      {/* ═══════════════ MENU CLUB — BOTTOM-SHEET 3 ONGLETS ═══════════════ */}
      <Sheet open={!!menuClub} onOpenChange={open => { if (!open) setMenuClubId(null); }}>
        {menuClub && (
          <SheetContent side="bottom" className="flex max-h-[90vh] flex-col rounded-t-3xl border-white/10 bg-zinc-950 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>{menuClub.name}</SheetTitle>
            </SheetHeader>

            {/* Hero dégradé aux couleurs du club */}
            <div className="relative shrink-0 overflow-hidden px-5 pb-3 pt-3" style={{ background: `linear-gradient(140deg, ${menuClub.jerseyColor} 0%, ${menuClub.accentColor} 130%)` }}>
              <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/30" />
              <div className="relative flex items-center gap-4">
                <ClubBadge club={menuClub} className="h-16 w-16 shrink-0 border-white/30 bg-black/25 shadow-xl" />
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/65">
                    {menuClub.category === "club" ? "Club" : "Sélection"}{menuClub.isFavorite ? " · favori" : ""}
                  </p>
                  <h2 className="truncate text-xl font-black leading-tight text-white drop-shadow-md">{menuClub.name}</h2>
                  <p className="mt-0.5 text-[11px] font-semibold text-white/75">
                    {clubStats(menuClub).count} joueur{clubStats(menuClub).count > 1 ? "s" : ""} · GEN {clubStats(menuClub).averageRating || "—"} · {JERSEY_STYLE_LABELS[menuClub.jerseyStyle]?.toLowerCase() ?? menuClub.jerseyStyle}
                  </p>
                </div>
                <button
                  onClick={() => toggleFavorite(menuClub)}
                  aria-label={menuClub.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/30"
                >
                  <Star className={`h-4 w-4 ${menuClub.isFavorite ? "fill-amber-400 text-amber-400" : "text-white/70"}`} />
                </button>
              </div>
            </div>

            {/* Onglets du menu */}
            <div className="flex shrink-0 gap-1 border-b border-white/10 px-4 pb-2 pt-1">
              {([
                { id: "apercu" as const, label: "Aperçu", icon: LayoutGrid },
                { id: "match" as const, label: "Matchs", icon: Swords },
                { id: "effectif" as const, label: "Effectif", icon: Users },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setMenuTab(tab.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-bold transition-colors ${menuTab === tab.id ? "bg-primary/15 text-primary" : "text-white/45 hover:text-white/80"}`}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Contenu de l'onglet actif */}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              {menuTab === "apercu" && (
                <>
                  {/* Statistiques rapides */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { icon: Star, label: "GEN moyen", value: clubStats(menuClub).averageRating || "—", highlight: true },
                      { icon: CalendarDays, label: "Âge moyen", value: clubStats(menuClub).averageAge ? `${clubStats(menuClub).averageAge} ans` : "—", highlight: false },
                      { icon: Activity, label: "Meilleur GEN", value: clubStats(menuClub).topRating || "—", highlight: false },
                    ].map(stat => (
                      <div key={stat.label} className={`rounded-2xl border p-2.5 text-center ${stat.highlight ? "border-primary/40 bg-primary/10" : "border-border/50 bg-muted/20"}`}>
                        <stat.icon className="mx-auto mb-1 h-3.5 w-3.5 text-primary" />
                        <p className="text-sm font-black">{stat.value}</p>
                        <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Meilleur XI sur mini-terrain */}
                  <MiniXI club={menuClub} sport={sport} />

                  {/* Distribution par poste */}
                  {rosterDistribution && (rosterDistribution.all ?? 0) > 0 && (
                    <div className="space-y-2 rounded-2xl border border-border/50 bg-muted/15 p-3">
                      <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Distribution par poste</p>
                      <div className="grid grid-cols-4 gap-2">
                        {POSITION_FILTERS.filter(f => f.id !== "all").map(filter => {
                          const value = rosterDistribution[filter.id];
                          const total = Math.max(1, rosterDistribution.all);
                          return (
                            <div key={filter.id} className="text-center">
                              <p className="text-sm font-black text-primary">{value}</p>
                              <div className="mx-auto mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((value / total) * 100)}%` }} />
                              </div>
                              <p className="mt-1 text-[8px] font-bold uppercase text-muted-foreground">{filter.label}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Actions principales */}
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => { onApply(menuClub); setMenuClubId(null); }}
                      className="flex h-12 items-center gap-3 rounded-2xl px-4 text-left text-sm font-black text-white shadow-lg transition-transform active:scale-[0.98]"
                      style={{ background: `linear-gradient(135deg, ${menuClub.jerseyColor} 0%, ${menuClub.accentColor} 100%)` }}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-black/25"><Check className="h-4 w-4" /></span>
                      <span className="flex-1">Appliquer le thème</span>
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      {onApplyBestXI && (menuClub.roster?.length ?? 0) > 0 && (
                        <Button type="button" variant="secondary" className="h-11 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-bold" onClick={() => openBestXI(menuClub, "local")}>
                          <Trophy className="h-4 w-4 text-primary" /> Meilleur XI
                        </Button>
                      )}
                      {onApplyBestXIAI && (menuClub.roster?.length ?? 0) > 0 && (
                        <Button type="button" variant="outline" className="h-11 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-bold" onClick={() => openBestXI(menuClub, "ai")}>
                          <Sparkles className="h-4 w-4 text-primary" /> Optimiser IA
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button type="button" variant="ghost" className="justify-center gap-2 rounded-xl text-xs" onClick={() => { handleEdit(menuClub); setMenuClubId(null); }}>
                        <Pencil className="h-3.5 w-3.5" /> Modifier
                      </Button>
                      <Button type="button" variant="ghost" className="justify-center gap-2 rounded-xl text-xs" onClick={() => duplicateClub(menuClub)}>
                        <Copy className="h-3.5 w-3.5" /> Dupliquer
                      </Button>
                      <Button type="button" variant="ghost" className="justify-center gap-2 rounded-xl text-xs" onClick={() => downloadRosterCsv(menuClub)}>
                        <FileDown className="h-3.5 w-3.5" /> Export CSV
                      </Button>
                      <Button type="button" variant="ghost" className="justify-center gap-2 rounded-xl text-xs text-destructive hover:text-destructive" onClick={() => handleDelete(menuClub.id)}>
                        <Trash2 className="h-3.5 w-3.5" /> Supprimer
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {menuTab === "match" && (
                <>
                  {/* Feuille de match : bilan + historique */}
                  {(() => {
                    const summary = matchSummary(menuClub);
                    return (
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: "Joués", value: summary.played },
                          { label: "V", value: summary.wins },
                          { label: "N", value: summary.draws },
                          { label: "D", value: summary.losses },
                        ].map(item => (
                          <div key={item.label} className="rounded-2xl border border-border/50 bg-muted/15 p-2.5 text-center">
                            <p className="text-base font-black">{item.value}</p>
                            <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                          </div>
                        ))}
                        <p className="col-span-4 text-center text-[10px] font-semibold text-muted-foreground">
                          Buts {summary.goalsFor} pour · {summary.goalsAgainst} contre
                        </p>
                      </div>
                    );
                  })()}

                  <div className="space-y-2 rounded-2xl border border-border/50 bg-muted/15 p-3">
                    <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                      <Swords className="h-3 w-3" /> Nouveau résultat
                    </p>
                    <Input value={matchForm.opponent} onChange={e => setMatchForm(f => ({ ...f, opponent: e.target.value }))} placeholder="Adversaire" className="h-8 text-xs" />
                    <div className="flex items-center gap-2">
                      <Input type="number" min={0} max={99} value={matchForm.scored} onChange={e => setMatchForm(f => ({ ...f, scored: e.target.value }))} className="h-8 w-16 text-center text-sm font-black" aria-label="Buts marqués" />
                      <span className="text-muted-foreground font-bold">-</span>
                      <Input type="number" min={0} max={99} value={matchForm.conceded} onChange={e => setMatchForm(f => ({ ...f, conceded: e.target.value }))} className="h-8 w-16 text-center text-sm font-black" aria-label="Buts encaissés" />
                      <Button type="button" size="sm" className="ml-auto h-8 gap-1 text-xs" onClick={recordMatch} disabled={!matchForm.opponent.trim()}>
                        <Plus className="h-3 w-3" /> Ajouter
                      </Button>
                    </div>
                  </div>

                  {(menuClub.matchHistory?.length ?? 0) === 0 ? (
                    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/60 py-6 text-center">
                      <History className="mb-2 h-6 w-6 text-muted-foreground/40" />
                      <p className="text-xs text-muted-foreground">Aucun match enregistré.</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {menuClub.matchHistory!.map((match, index) => {
                        const result = match.scored > match.conceded ? "V" : match.scored === match.conceded ? "N" : "D";
                        const resultColor = result === "V" ? "bg-emerald-500/20 text-emerald-300" : result === "N" ? "bg-blue-500/20 text-blue-300" : "bg-red-500/20 text-red-300";
                        return (
                          <div key={`${match.playedAt}-${index}`} className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-background/40 px-3 py-2">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${resultColor}`}>{result}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold">vs {match.opponent}</p>
                              <p className="text-[9px] text-muted-foreground">{new Date(match.playedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</p>
                            </div>
                            <span className="shrink-0 text-sm font-black tabular-nums">{match.scored} - {match.conceded}</span>
                            <button
                              type="button"
                              aria-label="Supprimer ce match"
                              onClick={() => {
                                const updated = clubs.map(c => c.id === menuClub.id ? { ...c, matchHistory: (c.matchHistory ?? []).filter((_, i) => i !== index) } : c);
                                persistClub(updated.find(c => c.id === menuClub.id)!, updated);
                              }}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {menuTab === "effectif" && (
                <div className="space-y-3">
                  {/* Aperçu de l'effectif : filtres GB/DEF/MIL/ATT */}
                  <div className="flex gap-1 rounded-lg border border-border/40 bg-muted/25 p-1">
                    {POSITION_FILTERS.map(filter => {
                      const count = filter.id === "all"
                        ? (menuClub.roster?.length ?? 0)
                        : (menuClub.roster ?? []).filter(p => rosterGroupOf(p.position, sport) === filter.id).length;
                      const active = positionFilter === filter.id;
                      return (
                        <button
                          key={filter.id}
                          onClick={() => setPositionFilter(filter.id)}
                          className={`flex-1 rounded-md py-1.5 text-[10px] font-bold transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          {filter.label}
                          <span className="ml-1 opacity-70">{count}</span>
                        </button>
                      );
                    })}
                  </div>

                  {(menuClub.roster ?? []).length === 0 ? (
                    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/60 py-6 text-center">
                      <Users className="mb-2 h-6 w-6 text-muted-foreground/40" />
                      <p className="text-xs text-muted-foreground">Effectif vide.</p>
                    </div>
                  ) : (
                    (menuClub.roster ?? [])
                      .filter(player => positionFilter === "all" || rosterGroupOf(player.position, sport) === positionFilter)
                      .map(player => (
                        <div key={player.id} className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/40 px-2.5 py-2">
                          <span className="w-5 shrink-0 text-center text-[10px] font-black text-primary">#{player.number}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold">{player.name}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{player.position} · {player.age} ans</p>
                          </div>
                          <span className="shrink-0 text-xs font-black tabular-nums text-primary">{player.rating}</span>
                        </div>
                      ))
                  )}

                  <Button type="button" className="h-10 w-full gap-2 text-xs font-bold" onClick={() => openSquad(menuClub)}>
                    <Users className="h-4 w-4" /> Gérer l'effectif complet
                  </Button>
                </div>
              )}
            </div>
          </SheetContent>
        )}
      </Sheet>

      {/* ═══════════════ EFFECTIF — FENÊTRE PLEIN ÉCRAN (bug d'affichage réglé) ═══════════════ */}
      <Dialog open={!!squadClub} onOpenChange={open => { if (!open) setSquadClubId(null); }}>
        <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden p-0 sm:max-w-[560px]">
          {squadClub && (
            <>
              <DialogHeader className="shrink-0 border-b border-border/40 px-4 py-3"
                style={{ background: `linear-gradient(135deg, ${squadClub.jerseyColor}18 0%, transparent 70%)` }}>
                <DialogTitle className="flex items-center gap-2.5 text-base">
                  <ClubBadge club={squadClub} className="h-9 w-9 rounded-xl" />
                  <span className="min-w-0 flex-1 truncate">Effectif — {squadClub.name}</span>
                  <button onClick={() => setSquadClubId(null)} aria-label="Fermer"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </DialogTitle>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <SquadManager
                  club={squadClub}
                  onChange={handleRosterChange}
                  onBestXI={requestedFormation => onApplyBestXI?.(squadClub, requestedFormation)}
                  onBestXIAI={requestedFormation => onApplyBestXIAI?.(squadClub, requestedFormation)}
                  onRecommendFormation={onRecommendFormation}
                  formation={formation}
                  sport={sport}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Sélecteur de formation pour Meilleur XI / IA */}
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
