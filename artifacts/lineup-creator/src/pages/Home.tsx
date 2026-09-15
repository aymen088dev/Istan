import { useState, useRef, useEffect, useCallback } from "react";
import html2canvas from "html2canvas-pro";
import {
  Download, Hash, FlipHorizontal2, RotateCcw, Shuffle, Swords,
  Upload, Image as ImageIcon, Palette, Home as HomeIcon, Settings, BookOpen,
  Plus, Minus, Trash2, Users, ChevronDown, X, Pencil, LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOOTBALL_FORMATIONS, HOCKEY_FORMATIONS, Player } from "@/lib/formations";
import { PlayerMarker } from "@/components/PlayerMarker";
import { BenchMarker } from "@/components/BenchMarker";
import { JerseySVG, type JerseyStyle, JERSEY_STYLE_LABELS } from "@/components/JerseySVG";
import { BACKGROUNDS, getBackgroundsForSport, getDefaultBackground } from "@/lib/backgrounds";
import { LibraryPage } from "@/components/LibraryPage";
import { ClubsManager, type Club } from "@/components/ClubsManager";
import type { RosterPlayer } from "@/components/ClubsManager";
import type { SavedComposition } from "@/components/CompositionLibrary";
import { NationalityPicker } from "@/components/NationalityPicker";
import { countries, resolveCountryCode } from "@/lib/countries";
import { FormationPicker } from "@/components/FormationPicker";
import { ArrowsOverlay, type Arrow } from "@/components/ArrowsOverlay";
import { RatingControl } from "@/components/RatingControl";
import { upsertPlayersInLibrary } from "@/lib/playerLibrary";
import { chooseBestXI, normalizeAnalysisPlayer } from "@/lib/formationAnalysis";
import { suggestBestXI } from "@/lib/ai";

/* ── Constants ── */
const COLOR_PRESETS = [
  { label: "Vert",        jersey: "#10b981", text: "#ffffff", accent: "#064e3b", num: "#ffffff" },
  { label: "Bleu Royal",  jersey: "#1d4ed8", text: "#ffffff", accent: "#1e3a8a", num: "#ffffff" },
  { label: "Rouge Vif",   jersey: "#dc2626", text: "#ffffff", accent: "#7f1d1d", num: "#ffffff" },
  { label: "Noir/Or",     jersey: "#111827", text: "#f59e0b", accent: "#ffffff",  num: "#f59e0b" },
  { label: "Blanc/Noir",  jersey: "#f9fafb", text: "#111827", accent: "#374151", num: "#111827" },
  { label: "Bordeaux",    jersey: "#7c0a02", text: "#ffffff", accent: "#ffd700", num: "#ffd700" },
  { label: "Orange",      jersey: "#ea580c", text: "#ffffff", accent: "#1c1917", num: "#ffffff" },
  { label: "Violet",      jersey: "#7c3aed", text: "#ffffff", accent: "#ede9fe", num: "#ffffff" },
  { label: "PSG",         jersey: "#001a4e", text: "#dc143c", accent: "#d4af37", num: "#d4af37" },
  { label: "OM",          jersey: "#009fda", text: "#ffffff", accent: "#003d5b", num: "#ffffff" },
  { label: "Barça",       jersey: "#004d98", text: "#a50044", accent: "#ffed00", num: "#ffed00" },
  { label: "Real Madrid", jersey: "#f9fafb", text: "#001a4e", accent: "#d4af37", num: "#001a4e" },
];

const RANDOM_PALETTES = [
  { jersey: "#dc143c", text: "#ffffff", accent: "#8b0000",  num: "#ffffff" },
  { jersey: "#1a237e", text: "#ffd700", accent: "#0d47a1",  num: "#ffd700" },
  { jersey: "#ff6f00", text: "#000000", accent: "#e65100",  num: "#000000" },
  { jersey: "#006064", text: "#e0f7fa", accent: "#00838f",  num: "#ffffff" },
  { jersey: "#4a148c", text: "#f3e5f5", accent: "#6a1b9a",  num: "#ffd700" },
  { jersey: "#1b5e20", text: "#f1f8e9", accent: "#2e7d32",  num: "#ffffff" },
  { jersey: "#880e4f", text: "#fce4ec", accent: "#ad1457",  num: "#ffd700" },
  { jersey: "#bf360c", text: "#ffffff", accent: "#e64a19",  num: "#ffd700" },
  { jersey: "#263238", text: "#cfd8dc", accent: "#546e7a",  num: "#4caf50" },
  { jersey: "#f57f17", text: "#212121", accent: "#f9a825",  num: "#212121" },
  { jersey: "#006400", text: "#ffffff", accent: "#228b22",  num: "#ffd700" },
  { jersey: "#191970", text: "#c0c0c0", accent: "#000080",  num: "#c0c0c0" },
];

const JERSEY_STYLES: JerseyStyle[] = ["plain", "bicolor", "striped", "hoops", "sash", "diagonal", "chevron", "collar"];
const STORAGE_KEY = "lineup-creator-state-v5";

const TITLE_COLOR_PRESETS = [
  "#ffffff", "#f59e0b", "#10b981", "#60a5fa", "#f87171", "#e879f9",
  "#fbbf24", "#34d399", "#818cf8", "#fb923c",
];

function clampPlayer(p: Player): Player {
  return { ...p, x: Math.max(18, Math.min(82, p.x)), y: Math.max(10, Math.min(92, p.y)) };
}

function loadState() {
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    if (!r) return null;
    const s = JSON.parse(r);
    if (s.players) s.players = s.players.map(clampPlayer);
    return s;
  } catch { return null; }
}

function buildBench(sport: "football" | "hockey"): Player[] {
  const count = sport === "football" ? 7 : 4;
  return Array.from({ length: count }, (_, i) => ({
    id: `bench-${i}`, name: `Rmp ${i + 1}`, number: `${i + 12}`,
    position: "RMP", nationality: "FR", rating: 75, isCaptain: false, x: 0, y: 0,
  }));
}

function mapY(y: number) { return 22 + ((y - 12) / 76) * 60; }
function mapX(x: number) { return Math.max(18, Math.min(82, x)); }

function ratingColor(r: number) {
  if (r >= 90) return "#f59e0b";
  if (r >= 80) return "#22c55e";
  if (r >= 70) return "#3b82f6";
  return "#94a3b8";
}

type SelectionSport = "football" | "hockey";
type PositionRole = "goalkeeper" | "central-defender" | "fullback" | "defender" | "defensive-mid" | "midfielder" | "attacking-mid" | "wing" | "center" | "forward" | "striker" | "unknown";
type PositionProfile = { role: PositionRole; side?: "left" | "right" };
type FormationSlot = { x: number; y: number; label: string };

function cleanPosition(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[_./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function profilePlayerPosition(value: string, sport: SelectionSport): PositionProfile {
  const position = cleanPosition(value);
  const compact = position.replace(/\s/g, "");
  if (["G", "GB", "GK", "GOALKEEPER", "GARDIEN", "GOALIE"].includes(compact)) return { role: "goalkeeper" };

  if (sport === "hockey") {
    if (["DG", "LD", "LEFT DEFENSE", "LEFT DEFENCEMAN"].includes(compact)) return { role: "defender", side: "left" };
    if (["DD", "RD", "RIGHT DEFENSE", "RIGHT DEFENCEMAN"].includes(compact)) return { role: "defender", side: "right" };
    if (["D", "DEF", "DEFENDER", "DEFENSEUR", "DEFENSE"].includes(compact)) return { role: "defender" };
    if (["C", "CENTER", "CENTRE", "CENTRE ICE"].includes(compact)) return { role: "center" };
    if (["AG", "LW", "LEFT WING", "LEFT WINGER", "AILIER GAUCHE", "AILE GAUCHE"].includes(position) || compact === "AG" || compact === "LW") return { role: "wing", side: "left" };
    if (["AD", "RW", "RIGHT WING", "RIGHT WINGER", "AILIER DROIT", "AILE DROITE"].includes(position) || compact === "AD" || compact === "RW") return { role: "wing", side: "right" };
    if (["F", "ATT", "ATTAQUANT", "FORWARD", "BU", "MOC", "SS", "ATTACKER"].includes(compact)) return { role: "forward" };
    return { role: "unknown" };
  }

  if (["DC", "DFC", "CB", "CENTRAL DEFENDER", "DEFENSEUR CENTRAL", "STOPPEUR"].includes(position) || ["DC", "DFC", "CB"].includes(compact)) return { role: "central-defender" };
  if (["DG", "LB", "LWB", "LEFT BACK", "LEFT WING BACK", "ARRIERE GAUCHE", "LATERAL GAUCHE"].includes(position) || ["DG", "LB", "LWB"].includes(compact)) return { role: "fullback", side: "left" };
  if (["DD", "RB", "RWB", "RIGHT BACK", "RIGHT WING BACK", "ARRIERE DROIT", "LATERAL DROIT"].includes(position) || ["DD", "RB", "RWB"].includes(compact)) return { role: "fullback", side: "right" };
  if (["D", "DEF", "DEFENDER", "DEFENSEUR", "DEFENSE"].includes(compact)) return { role: "defender" };
  if (["MDC", "CDM", "DM", "DEFENSIVE MIDFIELDER", "MILIEU DEFENSIF"].includes(position) || ["MDC", "CDM", "DM"].includes(compact)) return { role: "defensive-mid" };
  if (["MOC", "CAM", "AM", "ATTACKING MIDFIELDER", "MILIEU OFFENSIF"].includes(position) || ["MOC", "CAM", "AM"].includes(compact)) return { role: "attacking-mid" };
  if (["MC", "CM", "MIDFIELDER", "MILIEU", "MILIEU CENTRAL", "M"].includes(position) || ["MC", "CM", "M"].includes(compact)) return { role: "midfielder" };
  if (["MG", "LM", "LEFT MIDFIELDER", "LEFT MID", "MILIEU GAUCHE"].includes(position) || ["MG", "LM"].includes(compact)) return { role: "midfielder", side: "left" };
  if (["MD", "RM", "RIGHT MIDFIELDER", "RIGHT MID", "MILIEU DROIT"].includes(position) || ["MD", "RM"].includes(compact)) return { role: "midfielder", side: "right" };
  if (["AG", "LW", "LEFT WINGER", "LEFT WING", "AILIER GAUCHE", "AILE GAUCHE"].includes(position) || ["AG", "LW"].includes(compact)) return { role: "wing", side: "left" };
  if (["AD", "RW", "RIGHT WINGER", "RIGHT WING", "AILIER DROIT", "AILE DROITE"].includes(position) || ["AD", "RW"].includes(compact)) return { role: "wing", side: "right" };
  if (["BU", "ST", "CF", "AC", "BT", "STRIKER", "FORWARD", "ATTACKER", "AVANT CENTRE", "AVANT CENTRE"].includes(position) || ["BU", "ST", "CF", "AC", "BT", "F", "ATT"].includes(compact)) return { role: "striker" };
  if (["SS", "SECOND STRIKER", "SUPPORT STRIKER"].includes(position) || compact === "SS") return { role: "forward" };
  return { role: "unknown" };
}

function profileFormationSlot(slot: FormationSlot, sport: SelectionSport): PositionProfile {
  const label = cleanPosition(slot.label);
  if (sport === "hockey") return profilePlayerPosition(label, sport);
  // The football formations use AG/AD twice: low on the pitch they are fullbacks,
  // high on the pitch they are wingers. The coordinates disambiguate the slot.
  if (label === "AG" && slot.y > 50) return { role: "fullback", side: "left" };
  if (label === "AD" && slot.y > 50) return { role: "fullback", side: "right" };
  if (label === "LAT" && slot.y > 50) return { role: "fullback", side: slot.x < 50 ? "left" : "right" };
  if (label === "AG") return { role: "wing", side: "left" };
  if (label === "AD") return { role: "wing", side: "right" };
  if (label === "MG") return { role: "midfielder", side: "left" };
  if (label === "MD") return { role: "midfielder", side: "right" };
  return profilePlayerPosition(label, sport);
}

function positionScore(slot: FormationSlot, player: RosterPlayer, sport: SelectionSport) {
  const wanted = profileFormationSlot(slot, sport);
  const actual = profilePlayerPosition(player.position, sport);
  if (actual.role === "goalkeeper") return wanted.role === "goalkeeper" ? 100 : 0;
  if (wanted.role === "goalkeeper") return 0;
  if (wanted.role === actual.role) {
    if (wanted.side && actual.side) return wanted.side === actual.side ? 100 : 72;
    return 94;
  }
  if (sport === "hockey") {
    if (wanted.role === "defender" && (actual.role === "central-defender" || actual.role === "defender")) return 88;
    if (wanted.role === "center" && actual.role === "forward") return 76;
    if ((wanted.role === "wing" || wanted.role === "forward") && (actual.role === "wing" || actual.role === "center" || actual.role === "forward")) return 76;
    return 10;
  }
  if (wanted.role === "central-defender" && ["central-defender", "defender", "fullback"].includes(actual.role)) return actual.role === "fullback" ? 60 : 86;
  if (wanted.role === "fullback" && actual.role === "defender") return 78;
  if (wanted.role === "fullback" && actual.role === "wing" && wanted.side === actual.side) return 38;
  if (wanted.role === "defensive-mid" && ["midfielder", "attacking-mid"].includes(actual.role)) return 72;
  if (wanted.role === "midfielder" && ["defensive-mid", "attacking-mid"].includes(actual.role)) return 78;
  if (wanted.role === "attacking-mid" && ["midfielder", "forward", "striker"].includes(actual.role)) return actual.role === "midfielder" ? 76 : 62;
  if (wanted.role === "wing" && ["midfielder", "forward", "striker"].includes(actual.role)) return actual.role === "midfielder" ? 70 : 58;
  if (wanted.role === "striker" && ["forward", "wing", "attacking-mid"].includes(actual.role)) return actual.role === "forward" ? 78 : 58;
  return 10;
}

function FlagImage({ code, size = 16 }: { code: string; size?: number }) {
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

/* ═══════════════════════════════════════════════ */
export default function Home() {
  const saved = loadState();

  /* ── State ── */
  const [sport, setSport] = useState<"football" | "hockey">(saved?.sport ?? "football");
  const [formation, setFormation] = useState<string>(saved?.formation ?? "4-3-3");
  const [formationPickerOpen, setFormationPickerOpen] = useState(false);
  const [players, setPlayers] = useState<Player[]>(saved?.players ?? []);
  const [bench, setBench] = useState<Player[]>(saved?.bench ?? []);
  const [title, setTitle] = useState<string>(saved?.title ?? "XI DE DÉPART");
  const [titleColor, setTitleColor] = useState<string>(saved?.titleColor ?? "#ffffff");
  const [jerseyColor, setJerseyColor] = useState(saved?.jerseyColor ?? "#10b981");
  const [secondaryColor, setSecondaryColor] = useState(saved?.secondaryColor ?? "#ffffff");
  const [accentColor, setAccentColor] = useState(saved?.accentColor ?? "#064e3b");
  const [numberColor, setNumberColor] = useState(saved?.numberColor ?? "#ffffff");
  const [jerseyStyle, setJerseyStyle] = useState<JerseyStyle>(saved?.jerseyStyle ?? "plain");
  const [backgroundId, setBackgroundId] = useState(saved?.backgroundId ?? "football-standard");
  const [pitchGrassColor, setPitchGrassColor] = useState(saved?.pitchGrassColor ?? "");
  const [showDetails, setShowDetails] = useState<boolean>(saved?.showDetails ?? false);
  const [showBench, setShowBench] = useState<boolean>(saved?.showBench ?? true);
  const [showName, setShowName] = useState<boolean>(saved?.showName ?? true);
  const [showRating, setShowRating] = useState<boolean>(saved?.showRating ?? true);
  const [showNationality, setShowNationality] = useState<boolean>(saved?.showNationality ?? true);
  const [gkColor, setGkColor] = useState<string>(saved?.gkColor ?? "#f59e0b");
  const [gkSecondaryColor, setGkSecondaryColor] = useState<string>(saved?.gkSecondaryColor ?? "#92400e");
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [pitchTint, setPitchTint] = useState(saved?.pitchTint ?? "#000000");
  const [pitchTintOpacity, setPitchTintOpacity] = useState<number>(saved?.pitchTintOpacity ?? 0);
  const [showScore, setShowScore] = useState<boolean>(saved?.showScore ?? false);
  const [teamHome, setTeamHome] = useState(saved?.teamHome ?? "Domicile");
  const [teamAway, setTeamAway] = useState(saved?.teamAway ?? "Extérieur");
  const [scoreHome, setScoreHome] = useState(saved?.scoreHome ?? "0");
  const [scoreAway, setScoreAway] = useState(saved?.scoreAway ?? "0");
  const [exporting, setExporting] = useState(false);
  const [mobilePage, setMobilePage] = useState<"accueil" | "parametres" | "bibliotheque">("accueil");

  /* Bench panel state (mobile) */
  const [benchPanelOpen, setBenchPanelOpen] = useState(false);
  const [benchEditId, setBenchEditId] = useState<string | null>(null);

  /* Tactical arrows */
  const [arrows, setArrows] = useState<Arrow[]>(saved?.arrows ?? []);
  const [drawMode, setDrawMode] = useState(false);
  const [arrowColor, setArrowColor] = useState("#ffffff");

  const compositionRef = useRef<HTMLDivElement>(null);
  const pitchRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const previousSport = useRef(sport);

  /* ── Init ── */
  const initPlayers = useCallback((s: "football" | "hockey", f: string) => {
    const formations = s === "football" ? FOOTBALL_FORMATIONS : HOCKEY_FORMATIONS;
    const key = formations[f] ? f : (s === "football" ? "4-3-3" : "1-2-2 (Standard)");
    return formations[key].positions.map((pos, i) => ({
      id: `player-${i}`, name: `Joueur ${i + 1}`, number: `${i + 1}`,
      position: pos.label, nationality: "FR", rating: 80, isCaptain: false,
      x: mapX(pos.x), y: mapY(pos.y),
    }));
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (!saved?.players?.length) {
      setPlayers(initPlayers(sport, formation));
      setBench(buildBench(sport));
    }
  }, []);

  useEffect(() => {
    if (previousSport.current === sport) return;
    previousSport.current = sport;
    const formations = sport === "football" ? FOOTBALL_FORMATIONS : HOCKEY_FORMATIONS;
    const key = formations[formation] ? formation : (sport === "football" ? "4-3-3" : "1-2-2 (Standard)");
    if (!formations[formation]) setFormation(key);
    setPlayers(initPlayers(sport, key));
    setBench(buildBench(sport));
    setBackgroundId(getDefaultBackground(sport));
  }, [sport]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sport, formation, players, bench, title, titleColor,
        jerseyColor, secondaryColor, accentColor, numberColor, jerseyStyle,
        backgroundId, pitchGrassColor, showDetails, showBench,
        pitchTint, pitchTintOpacity, showScore, teamHome, teamAway, scoreHome, scoreAway,
        arrows, showName, showRating, showNationality, gkColor, gkSecondaryColor,
      }));
    } catch {}
  }, [sport, formation, players, bench, title, titleColor, jerseyColor, secondaryColor, accentColor, numberColor, jerseyStyle, backgroundId, pitchGrassColor, showDetails, showBench, pitchTint, pitchTintOpacity, showScore, teamHome, teamAway, scoreHome, scoreAway, arrows, showName, showRating, showNationality, gkColor, gkSecondaryColor]);

  useEffect(() => {
    upsertPlayersInLibrary([...players, ...bench]);
  }, [players, bench]);

  /* ── Actions ── */
  const updatePlayer = (id: string, u: Partial<Player>) => setPlayers(p => p.map(x => x.id === id ? { ...x, ...u } : x));
  const updateBenchPlayer = (id: string, u: Partial<Player>) => setBench(p => p.map(x => x.id === id ? { ...x, ...u } : x));

  const handleReset = () => { setPlayers(initPlayers(sport, formation)); setBench(buildBench(sport)); };
  const handleAutoNumber = () => {
    setPlayers(p => p.map((x, i) => ({ ...x, number: `${i + 1}` })));
    setBench(p => p.map((x, i) => ({ ...x, number: `${players.length + i + 1}` })));
  };
  const handleRandomColors = () => {
    const p = RANDOM_PALETTES[Math.floor(Math.random() * RANDOM_PALETTES.length)];
    setJerseyColor(p.jersey); setSecondaryColor(p.text); setAccentColor(p.accent); setNumberColor(p.num);
    setJerseyStyle(JERSEY_STYLES[Math.floor(Math.random() * JERSEY_STYLES.length)]);
  };
  const handleMirror = () => setPlayers(p => p.map(x => ({ ...x, x: 100 - x.x })));

  const handleAddBenchPlayer = () => {
    const newIdx = bench.length + 1;
    const newId = `bench-${Date.now()}`;
    setBench(b => [...b, {
      id: newId, name: `Rmp ${newIdx}`, number: `${players.length + newIdx}`,
      position: "RMP", nationality: "FR", rating: 75, isCaptain: false, x: 0, y: 0,
    }]);
  };

  const handleRemoveBenchPlayer = (id: string) => {
    setBench(b => b.filter(p => p.id !== id));
    if (benchEditId === id) setBenchEditId(null);
  };

  const handleApplyClub = (club: Club) => {
    setJerseyColor(club.jerseyColor);
    setSecondaryColor(club.secondaryColor);
    setAccentColor(club.accentColor);
    setNumberColor(club.numberColor);
    setJerseyStyle(club.jerseyStyle);
    setBackgroundId(club.backgroundId);
    if (club.logo) setLogoImage(club.logo);
    setMobilePage("accueil");
  };

  const applyBestXI = (club: Club, requestedFormation = formation, aiPriority?: ReadonlyMap<string, number>) => {
    const roster = club.roster ?? [];
    if (roster.length === 0) return;
    handleApplyClub(club);
    const formations = sport === "football" ? FOOTBALL_FORMATIONS : HOCKEY_FORMATIONS;
    const selectedFormationName = formations[requestedFormation]
      ? requestedFormation
      : Object.keys(formations)[0];
    const selectedFormation = formations[selectedFormationName];
    // Keep the formation selector and the positions placed on the pitch in sync.
    // The old effect listened to every formation change and could immediately
    // overwrite this computed XI with blank placeholder players.
    setFormation(selectedFormationName);
    const usedIds = new Set<string>();
    const available = roster.map((player, index) => {
      const normalized = normalizeAnalysisPlayer(player, index);
      const baseId = normalized.id || `roster-${index}`;
      const id = usedIds.has(baseId) ? `${baseId}-${index}` : baseId;
      usedIds.add(id);
      return { ...normalized, id };
    }).sort((a, b) => b.rating - a.rating);
    const chosen = chooseBestXI(selectedFormationName, selectedFormation, available, sport, aiPriority);
    const used = new Set(chosen.flatMap(({ player }) => player ? [player.id] : []));
    const nextPlayers = selectedFormation.positions.map((slot, index) => {
      const choice = chosen[index]?.player;
      // Poste sans joueur compatible : slot "Libre" (identité négative pour ne
      // pas heurter la clé player-0), pas un faux joueur prétendument placé.
      const isEmptySlot = !choice || choice.rating <= 0;
      return {
        id: isEmptySlot ? `empty-${club.id}-${index}` : (choice?.id ?? `empty-${index}`),
        name: isEmptySlot ? "Libre" : (choice?.name ?? `Joueur ${index + 1}`),
        number: isEmptySlot ? "—" : (choice?.number ?? String(index + 1)),
        position: slot.label,
        nationality: resolveCountryCode(choice?.nationality ?? "ISTANMUSTA"),
        club: club.name,
        rating: choice?.rating ?? 0,
        isCaptain: index === 0,
        x: mapX(slot.x),
        y: mapY(slot.y),
      };
    });
    const benchCount = sport === "football" ? 7 : 4;
    const nextBench = available
      .filter(player => !used.has(player.id))
      .slice(0, benchCount)
      .map((player, index) => ({
        id: `bench-${player.id}`,
        name: player.name,
        number: player.number ?? String(index + 1),
        position: player.position,
        nationality: resolveCountryCode(player.nationality),
        rating: player.rating,
        isCaptain: false,
        x: 0,
        y: 0,
      }));
    setPlayers(nextPlayers);
    setBench(nextBench);
  };

  const handleApplyBestXI = (club: Club, requestedFormation = formation) => {
    applyBestXI(club, requestedFormation);
  };

  const handleApplyBestXIAI = async (club: Club, requestedFormation = formation) => {
    const roster = club.roster ?? [];
    if (roster.length === 0) return;

    // The deterministic algorithm remains the baseline and is applied immediately.
    applyBestXI(club, requestedFormation);
    const suggestion = await suggestBestXI(
      roster.map((player, index) => {
        const normalized = normalizeAnalysisPlayer(player, index);
        return {
          id: normalized.id,
          name: normalized.name,
          age: player.age,
          rating: normalized.rating,
          position: normalized.position,
          number: normalized.number ?? player.number,
        };
      }),
      sport,
      requestedFormation,
    );
    const aiPriority = new Map(suggestion.playerIds.map((id, index) => [id, index]));
    // Groq only breaks ties in the existing position/rating algorithm; it never
    // replaces the deterministic compatibility rules.
    if (aiPriority.size > 0) applyBestXI(club, requestedFormation, aiPriority);
  };

  const handleLoadComposition = (c: SavedComposition) => {
    setSport(c.sport); setFormation(c.formation); setTitle(c.title);
    setPlayers(c.players); setBench(c.bench);
    setJerseyColor(c.jerseyColor); setSecondaryColor(c.secondaryColor);
    setAccentColor(c.accentColor ?? "#064e3b"); setNumberColor(c.numberColor ?? "#ffffff");
    setJerseyStyle((c.jerseyStyle as JerseyStyle) ?? "plain");
    setBackgroundId(c.backgroundId ?? getDefaultBackground(c.sport));
    setShowBench(c.showBench ?? true); setShowDetails(c.showDetails ?? false);
    setMobilePage("accueil");
  };

  const handleExport = async () => {
    if (!compositionRef.current || exporting) return;
    setExporting(true);
    try {
      const el = compositionRef.current;
      const rect = el.getBoundingClientRect();
      const contentBottom = Array.from(el.children).reduce((bottom, child) => {
        const childRect = child.getBoundingClientRect();
        return Math.max(bottom, childRect.bottom - rect.top);
      }, 0);
      const W = Math.ceil(Math.max(el.scrollWidth, rect.width));
      // scrollHeight can be smaller than the visible bench when one of the
      // mobile ancestors constrains the composition. Include every direct
      // child so the exported image contains the complete substitutes area.
      const H = Math.ceil(Math.max(el.scrollHeight, rect.height, contentBottom));
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#111827",
        logging: false,
        width: W,
        height: H,
        onclone: (_doc: Document, cloned: HTMLElement) => {
          cloned.style.overflow = "visible";
          cloned.style.borderRadius = "0";
          cloned.style.maxWidth = "none";
          cloned.style.width = `${W}px`;
          cloned.style.height = `${H}px`;
           cloned.style.minHeight = `${H}px`;
           cloned.style.overflow = "visible";
           Array.from(cloned.children).forEach(child => {
             const childElement = child as HTMLElement;
             childElement.style.maxHeight = "none";
             childElement.style.overflow = "visible";
           });
          let p: HTMLElement | null = cloned.parentElement;
          while (p) {
            p.style.overflow = "visible";
            p.style.maxHeight = "none";
            p.style.height = "auto";
            p = p.parentElement;
          }
        },
      });
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `istan-${sport}-${Date.now()}.png`;
      a.click();
    } catch (e) { console.error("Export error", e); }
    finally { setExporting(false); }
  };

  const activeBg = BACKGROUNDS.find(b => b.id === backgroundId);
  const bgClass = activeBg?.cssClass ?? (sport === "football" ? "pitch-bg" : "rink-bg");

  const currentState: Omit<SavedComposition, "id" | "name" | "savedAt"> = {
    sport, formation, title, players, bench,
    jerseyColor, secondaryColor, accentColor, numberColor,
    jerseyStyle: jerseyStyle as string,
    backgroundId, showBench, showDetails,
  };

  /* bench player being edited */
  const editingBenchPlayer = bench.find(p => p.id === benchEditId) ?? null;

  /* ═══════════════ SHARED JSX BLOCKS ═══════════════ */

  /* Pitch canvas */
  const PitchCanvas = (
    <div
      className="w-full max-w-[400px] sm:max-w-[440px] relative rounded-2xl overflow-hidden border border-white/10"
      style={{ boxShadow: "0 30px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)" }}
      ref={compositionRef}
    >
      <div className="relative w-full" style={{ aspectRatio: "3/4" }} ref={pitchRef}>
        <div
          className={bgImage ? "" : bgClass}
          style={{
            position: "absolute",
            inset: 0,
            ...(bgImage ? { backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
            ...(pitchGrassColor && !bgImage ? { backgroundColor: pitchGrassColor } : {}),
          }}
        />
        {pitchTint && pitchTintOpacity > 0 && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: pitchTint, opacity: pitchTintOpacity / 100 }} />
        )}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.1) 20%, rgba(0,0,0,0) 38%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.72) 100%)" }} />

        {/* Title / Score */}
        <div className="absolute top-0 left-0 right-0 pt-3 pb-2 flex flex-col items-center z-[1] pointer-events-none">
          {showScore ? (
            <div className="flex items-center gap-2 px-3">
              <span className="text-white font-black text-[10px] uppercase tracking-wide truncate max-w-[65px]">{teamHome}</span>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md" style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <span className="text-white font-black text-base tabular-nums">{scoreHome}</span>
                <span className="text-white/40 font-black text-xs">-</span>
                <span className="text-white font-black text-base tabular-nums">{scoreAway}</span>
              </div>
              <span className="text-white font-black text-[10px] uppercase tracking-wide truncate max-w-[65px]">{teamAway}</span>
            </div>
          ) : (
            <h1
              className="font-black uppercase text-center overflow-hidden w-full px-4 leading-tight"
              style={{
                fontSize: "clamp(11px, 5vw, 25px)",
                letterSpacing: "0.14em",
                textShadow: "0 2px 20px rgba(0,0,0,0.9)",
                paddingRight: logoImage ? "72px" : undefined,
                color: titleColor,
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
                overflow: "hidden",
              }}>
              {title}
            </h1>
          )}
          <div className="mt-1.5 h-[2px] w-12 rounded-full opacity-60" style={{ background: jerseyColor }} />
        </div>

        {logoImage && (
          <div className="absolute top-2 right-2 z-10 pointer-events-none">
            <img src={logoImage} alt="Logo" className="w-11 h-11 object-contain drop-shadow-lg" />
          </div>
        )}

        {players.map((p, i) => (
          <PlayerMarker key={p.id} player={p}
            jerseyColor={jerseyColor} secondaryColor={secondaryColor} accentColor={accentColor}
            numberColor={numberColor} jerseyStyle={jerseyStyle} showDetails={showDetails}
            isGK={i === 0} gkColor={gkColor} gkSecondaryColor={gkSecondaryColor}
            showName={showName} showRating={showRating} showNationality={showNationality}
            onUpdate={updatePlayer} containerRef={pitchRef} />
        ))}

        <ArrowsOverlay
          arrows={arrows}
          drawMode={drawMode}
          arrowColor={arrowColor}
          onAdd={a => setArrows(prev => [...prev, a])}
          onUndo={() => setArrows(prev => prev.slice(0, -1))}
          onClear={() => setArrows([])}
          onColorChange={setArrowColor}
          onToggleDrawMode={() => setDrawMode(m => !m)}
        />

        <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none">
          <span className="text-white/25 font-bold uppercase" style={{ fontSize: "7px", letterSpacing: "0.28em" }}>★ ISTAN CREATOR ★</span>
        </div>
      </div>

      {showBench && (
        <div className="border-t border-white/[0.05] px-2 py-2.5" style={{ background: "linear-gradient(135deg, #06080f 0%, #0b1018 100%)" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 h-px bg-white/6" />
            <span className="text-white/25 font-bold uppercase" style={{ fontSize: "7px", letterSpacing: "0.25em" }}>Remplaçants</span>
            <div className="flex-1 h-px bg-white/6" />
          </div>
          <div
            className="flex flex-wrap items-start justify-center"
            style={{ gap: bench.length > 9 ? "2px" : "4px" }}
          >
            {bench.map(p => (
              <BenchMarker key={p.id} player={p}
                jerseyColor={jerseyColor} secondaryColor={secondaryColor} accentColor={accentColor}
                numberColor={numberColor} jerseyStyle={jerseyStyle}
                 showNationality={showNationality}
                onUpdate={updateBenchPlayer} />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  /* ── Mobile Bench Panel ── */
  const BenchPanel = benchPanelOpen && (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) setBenchPanelOpen(false); }}
    >
      <div className="bg-[#0d111a] rounded-t-2xl border-t border-white/10 flex flex-col max-h-[82vh]"
        style={{ boxShadow: "0 -24px 80px rgba(0,0,0,0.7)" }}>

        {/* Panel Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">Remplaçants</span>
            <span className="text-xs text-white/40 font-semibold bg-white/8 px-2 py-0.5 rounded-full">{bench.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddBenchPlayer}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-bold hover:bg-primary/25 transition-all active:scale-95">
              <Plus className="w-3.5 h-3.5" />Ajouter
            </button>
            <button
              onClick={() => setBenchPanelOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/6 hover:bg-white/12 transition-all">
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>
        </div>

        {/* Player List */}
        <div className="flex-1 overflow-y-auto">
          {bench.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Users className="w-8 h-8 text-white/20" />
              <p className="text-sm text-white/40">Aucun remplaçant</p>
              <button onClick={handleAddBenchPlayer}
                className="px-4 py-2 rounded-xl bg-primary/15 text-primary text-sm font-bold hover:bg-primary/25 transition-all">
                <Plus className="w-4 h-4 inline mr-1.5" />Ajouter
              </button>
            </div>
          ) : bench.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.04] hover:bg-white/[0.02] transition-all">
              {/* Jersey */}
              <div className="w-8 h-8 shrink-0" style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>
                <JerseySVG uid={p.id} color1={jerseyColor} color2={secondaryColor} color3={accentColor}
                  numberColor={numberColor} style={jerseyStyle} number={p.number} />
              </div>
              {/* Flag */}
              <div className="w-5 h-5 rounded-full overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center shrink-0">
                <FlagImage code={p.nationality} size={18} />
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate leading-tight">{p.name}</div>
                <div className="text-[10px] text-white/40 font-medium">#{p.number} · {p.position}</div>
              </div>
              {/* Rating */}
              <span className="text-sm font-black tabular-nums shrink-0" style={{ color: ratingColor(p.rating ?? 75) }}>
                {p.rating ?? 75}
              </span>
              {/* Edit */}
              <button
                onClick={() => setBenchEditId(p.id)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/6 hover:bg-white/12 transition-all active:scale-95 shrink-0">
                <Pencil className="w-3.5 h-3.5 text-white/60" />
              </button>
              {/* Delete */}
              <button
                onClick={() => handleRemoveBenchPlayer(p.id)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-destructive/15 text-white/30 hover:text-destructive transition-all active:scale-95 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Panel Footer */}
        {bench.length > 0 && (
          <div className="px-4 py-3 border-t border-white/[0.06] flex gap-2 shrink-0">
            <button onClick={handleAddBenchPlayer}
              className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border border-dashed border-white/20 text-sm text-white/40 hover:text-white/60 hover:border-white/30 transition-all active:scale-[0.98]">
              <Plus className="w-4 h-4" />Ajouter un remplaçant
            </button>
            {bench.length > 0 && (
              <button onClick={() => handleRemoveBenchPlayer(bench[bench.length - 1].id)}
                className="flex items-center justify-center gap-1.5 px-3 h-10 rounded-xl border border-white/10 text-sm text-white/40 hover:text-destructive hover:border-destructive/30 transition-all active:scale-95">
                <Minus className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  /* ── Bench Edit Dialog (mobile panel inline edit) ── */
  const BenchEditDialog = (
    <Dialog open={!!benchEditId} onOpenChange={open => { if (!open) setBenchEditId(null); }}>
      {editingBenchPlayer && (
        <DialogContent className="sm:max-w-[400px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier — {editingBenchPlayer.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label className="text-sm">Nom</Label>
              <Input value={editingBenchPlayer.name}
                onChange={e => updateBenchPlayer(editingBenchPlayer.id, { name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Numéro</Label>
                <Input value={editingBenchPlayer.number}
                  onChange={e => updateBenchPlayer(editingBenchPlayer.id, { number: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Position</Label>
                <Input value={editingBenchPlayer.position}
                  onChange={e => updateBenchPlayer(editingBenchPlayer.id, { position: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Note OVR — {editingBenchPlayer.rating ?? 75}</Label>
              <RatingControl
                value={editingBenchPlayer.rating ?? 75}
                onChange={value => updateBenchPlayer(editingBenchPlayer.id, { rating: value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Nationalité</Label>
              <NationalityPicker
                value={editingBenchPlayer.nationality}
                onChange={v => updateBenchPlayer(editingBenchPlayer.id, { nationality: v })} />
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 rounded-lg border border-border/40">
              <div className="w-6 h-6 rounded-full overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center shrink-0">
                <FlagImage code={editingBenchPlayer.nationality} size={22} />
              </div>
              <span className="text-sm text-muted-foreground">Drapeau — {editingBenchPlayer.nationality}</span>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );

  /* Settings content */
  const SettingsContent = (includeClubs: boolean) => (
    <Tabs defaultValue="general" className="w-full">
      <TabsList className={`grid w-full mb-4 ${includeClubs ? "grid-cols-4" : "grid-cols-3"}`}>
        <TabsTrigger value="general" className="text-[11px]">Général</TabsTrigger>
        <TabsTrigger value="kit" className="text-[11px]">Kit</TabsTrigger>
        <TabsTrigger value="terrain" className="text-[11px]">Terrain</TabsTrigger>
        {includeClubs && <TabsTrigger value="clubs" className="text-[11px]">Clubs</TabsTrigger>}
      </TabsList>

      {/* ── GÉNÉRAL ── */}
      <TabsContent value="general" className="space-y-5">

        {/* Sport + Formation */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sport</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={sport === "football" ? "default" : "outline"} size="sm" onClick={() => setSport("football")}>⚽ Football</Button>
              <Button variant={sport === "hockey" ? "default" : "outline"} size="sm" onClick={() => setSport("hockey")}>🏒 Hockey</Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Formation</Label>
            <Button
              variant="outline"
              className="w-full h-9 justify-between font-semibold text-sm"
              onClick={() => setFormationPickerOpen(true)}
            >
              <span className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 opacity-60" />
                {formation}
              </span>
              <ChevronDown className="w-4 h-4 opacity-40" />
            </Button>
          </div>
        </div>

        {/* Titre */}
        <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-3">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Titre</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="XI DE DÉPART" className="h-9" />
          <div className="space-y-2">
            <Label className="text-[10px] text-muted-foreground">Couleur du titre</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={titleColor} onChange={e => setTitleColor(e.target.value)}
                className="w-9 h-8 rounded-md cursor-pointer border border-border/50 p-0.5 bg-transparent shrink-0" />
              <div className="flex gap-1.5 flex-wrap">
                {TITLE_COLOR_PRESETS.map(c => (
                  <button key={c} onClick={() => setTitleColor(c)}
                    className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110 active:scale-95 shrink-0"
                    style={{ background: c, borderColor: titleColor === c ? "white" : "rgba(255,255,255,0.12)" }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Score du match */}
        <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Swords className="w-3.5 h-3.5 text-primary" />
              <Label className="text-sm font-semibold">Score</Label>
            </div>
            <Switch checked={showScore} onCheckedChange={setShowScore} />
          </div>
          {showScore && (
            <div className="grid grid-cols-5 gap-1.5 items-center">
              <Input value={teamHome} onChange={e => setTeamHome(e.target.value)} placeholder="Dom." className="col-span-2 text-xs h-8" />
              <div className="flex items-center gap-1 justify-center">
                <Input value={scoreHome} onChange={e => setScoreHome(e.target.value)} className="w-8 text-center text-sm font-black h-8 p-1" maxLength={2} />
                <span className="text-muted-foreground font-bold text-xs">-</span>
                <Input value={scoreAway} onChange={e => setScoreAway(e.target.value)} className="w-8 text-center text-sm font-black h-8 p-1" maxLength={2} />
              </div>
              <Input value={teamAway} onChange={e => setTeamAway(e.target.value)} placeholder="Ext." className="col-span-2 text-xs h-8" />
            </div>
          )}
        </div>

        {/* Affichage joueurs */}
        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Affichage joueurs</Label>
          {[
            { label: "Nom", desc: "Badge nom sous le maillot", val: showName, set: setShowName },
            { label: "Note OVR", desc: "Badge note en bas à gauche", val: showRating, set: setShowRating },
            { label: "Nationalité", desc: "Drapeau en bas à droite", val: showNationality, set: setShowNationality },
            { label: "Remplaçants", desc: "Banc visible dans l'export", val: showBench, set: setShowBench },
          ].map(({ label, desc, val, set }) => (
            <div key={label} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/40">
              <div>
                <Label className="text-sm font-medium">{label}</Label>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch checked={val} onCheckedChange={set} />
            </div>
          ))}
        </div>

        {/* Couleur gardien */}
        <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-3">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Couleur Gardien (GK)</Label>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] text-muted-foreground">Principal</span>
              <input type="color" value={gkColor} onChange={e => setGkColor(e.target.value)}
                className="w-10 h-8 rounded-lg cursor-pointer border border-border/50 p-0.5 bg-transparent" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] text-muted-foreground">Secondaire</span>
              <input type="color" value={gkSecondaryColor} onChange={e => setGkSecondaryColor(e.target.value)}
                className="w-10 h-8 rounded-lg cursor-pointer border border-border/50 p-0.5 bg-transparent" />
            </div>
            <div className="flex gap-1.5 flex-wrap flex-1">
              {[["#f59e0b","#92400e"],["#f97316","#7c2d12"],["#a78bfa","#4c1d95"],["#34d399","#064e3b"],["#f87171","#7f1d1d"]].map(([c1,c2]) => (
                <button key={c1} onClick={() => { setGkColor(c1); setGkSecondaryColor(c2); }}
                  className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110 active:scale-95 shrink-0"
                  style={{ background: c1, borderColor: gkColor === c1 ? "white" : "rgba(255,255,255,0.15)" }} />
              ))}
            </div>
          </div>
        </div>

        {/* Actions rapides */}
        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Actions</Label>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={handleAutoNumber} className="flex-col h-12 gap-1 text-xs">
              <Hash className="w-4 h-4" />Auto-N°
            </Button>
            <Button variant="outline" size="sm" onClick={handleMirror} className="flex-col h-12 gap-1 text-xs">
              <FlipHorizontal2 className="w-4 h-4" />Miroir
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset} className="flex-col h-12 gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30">
              <RotateCcw className="w-4 h-4" />Reset
            </Button>
          </div>
        </div>
      </TabsContent>

      {/* ── KIT ── */}
      <TabsContent value="kit" className="space-y-5">
        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Style maillot</Label>
          <div className="grid grid-cols-4 gap-2">
            {JERSEY_STYLES.map(s => (
              <button key={s} onClick={() => setJerseyStyle(s)} title={JERSEY_STYLE_LABELS[s]}
                className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border-2 transition-all hover:bg-muted/40 ${jerseyStyle === s ? "border-primary bg-primary/10" : "border-border/50"}`}>
                <div className="w-8 h-8">
                  <JerseySVG uid={`p-${s}`} color1={jerseyColor} color2={secondaryColor} color3={accentColor} numberColor={numberColor} style={s} number="" />
                </div>
                <span className="text-[8px] text-muted-foreground text-center leading-tight">{JERSEY_STYLE_LABELS[s]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Presets</Label>
            <Button variant="ghost" size="sm" onClick={handleRandomColors} className="h-7 text-xs gap-1 text-primary hover:bg-primary/10">
              <Shuffle className="w-3 h-3" />Aléatoire
            </Button>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {COLOR_PRESETS.map(p => (
              <button key={p.label} title={p.label}
                onClick={() => { setJerseyColor(p.jersey); setSecondaryColor(p.text); setAccentColor(p.accent); setNumberColor(p.num); }}
                className="w-9 h-9 rounded-full border-2 transition-all hover:scale-110 active:scale-95"
                style={{ background: `linear-gradient(135deg, ${p.jersey} 50%, ${p.text} 50%)`, borderColor: jerseyColor === p.jersey ? "white" : "rgba(255,255,255,0.12)" }} />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Couleurs</Label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Principale",  val: jerseyColor,    set: setJerseyColor },
              { label: "Secondaire",  val: secondaryColor, set: setSecondaryColor },
              { label: "Contour",     val: accentColor,    set: setAccentColor },
              { label: "Numéro",      val: numberColor,    set: setNumberColor },
            ].map(({ label, val, set }) => (
              <div key={label} className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">{label}</Label>
                <div className="flex gap-1">
                  <input type="color" value={val} onChange={e => set(e.target.value)}
                    className="w-9 h-8 rounded-md cursor-pointer border border-border/50 p-0.5 bg-transparent shrink-0" />
                  <Input type="text" value={val} onChange={e => set(e.target.value)}
                    className="font-mono text-[10px] h-8 flex-1 min-w-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </TabsContent>

      {/* ── TERRAIN ── */}
      <TabsContent value="terrain" className="space-y-5">
        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Style de terrain</Label>
          <div className="grid grid-cols-3 gap-2">
            {getBackgroundsForSport(sport).map(bg => (
              <button key={bg.id} onClick={() => { setBackgroundId(bg.id); setBgImage(null); }}
                className={`h-12 rounded-lg border-2 overflow-hidden relative transition-all hover:scale-[1.02] ${backgroundId === bg.id ? "border-primary ring-1 ring-primary/20" : "border-border/50"}`}>
                <div className={`w-full h-full ${bg.cssClass}`} />
                <div className="absolute inset-0 bg-black/50 flex items-end justify-center pb-1">
                  <span className="text-white text-[7px] font-bold uppercase tracking-wide">{bg.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Couleur gazon personnalisée */}
        <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Palette className="w-3 h-3" />Couleur du gazon
            </Label>
            {pitchGrassColor && (
              <button onClick={() => setPitchGrassColor("")} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">
                Réinitialiser
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={pitchGrassColor || "#2d6a30"} onChange={e => setPitchGrassColor(e.target.value)}
              className="w-10 h-8 rounded-md cursor-pointer border border-border/50 p-0.5 bg-transparent shrink-0" />
            <div className="flex gap-1.5 flex-wrap">
              {["#2d6a30","#0d2b12","#5c4a1e","#1a2a5e","#8b1a1a","#3a0a5c","#0a1a3a","#1a1a2e"].map(c => (
                <button key={c} onClick={() => setPitchGrassColor(c)}
                  className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110"
                  style={{ background: c, borderColor: pitchGrassColor === c ? "white" : "rgba(255,255,255,0.15)" }} />
              ))}
            </div>
          </div>
        </div>

        {/* Teinte */}
        <div className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-3">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Palette className="w-3 h-3" />Teinte overlay
          </Label>
          <div className="flex gap-2 items-end">
            <input type="color" value={pitchTint} onChange={e => setPitchTint(e.target.value)}
              className="w-10 h-8 rounded-md cursor-pointer border border-border/50 p-0.5 bg-transparent shrink-0" />
            <div className="flex-1 space-y-1">
              <Label className="text-[9px] text-muted-foreground">Opacité — {pitchTintOpacity}%</Label>
              <input type="range" min={0} max={80} value={pitchTintOpacity} onChange={e => setPitchTintOpacity(parseInt(e.target.value))} className="w-full h-2" />
            </div>
            {pitchTintOpacity > 0 && <Button variant="ghost" size="sm" onClick={() => setPitchTintOpacity(0)} className="h-8 px-2 text-xs text-muted-foreground">✕</Button>}
          </div>
        </div>

        {/* Images */}
        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Images</Label>
          {[
            { label: "Logo équipe", state: logoImage, clear: () => setLogoImage(null), set: setLogoImage, icon: <ImageIcon className="w-3.5 h-3.5" /> },
            { label: "Fond perso", state: bgImage, clear: () => setBgImage(null), set: setBgImage, icon: <Upload className="w-3.5 h-3.5" /> },
          ].map(({ label, state, clear, set, icon }) => (
            <div key={label} className="flex gap-2">
              <Button variant="outline" className="flex-1 relative overflow-hidden h-9 text-xs gap-2">
                {icon}{label}
                <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && set(URL.createObjectURL(e.target.files[0]))} className="absolute inset-0 opacity-0 cursor-pointer" />
              </Button>
              {state && <Button variant="ghost" size="icon" onClick={clear} className="h-9 w-9 text-destructive shrink-0">&times;</Button>}
            </div>
          ))}
        </div>
      </TabsContent>

      {/* ── CLUBS ── */}
      {includeClubs && (
        <TabsContent value="clubs" className="space-y-3">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs font-semibold text-primary">Clique sur un club pour appliquer son thème</p>
          </div>
          <ClubsManager
            onApply={handleApplyClub}
            onApplyBestXI={handleApplyBestXI}
            onApplyBestXIAI={handleApplyBestXIAI}
            onRecommendFormation={recommendedFormation => {
              setFormation(recommendedFormation);
              setPlayers(initPlayers(sport, recommendedFormation));
            }}
            formation={formation}
            sport={sport}
          />
        </TabsContent>
      )}
    </Tabs>
  );

  /* ═══════════════ RENDER ═══════════════ */
  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">

      {/* ── HEADER ── */}
      <header className="shrink-0 border-b border-white/[0.06] bg-background/95 backdrop-blur-xl z-30"
        style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04)" }}>
        <div className="flex items-center justify-between px-4 h-13 py-2">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #7c3aed 0%, #10b981 100%)" }}>
              <span className="text-white text-[11px] font-black">IC</span>
            </div>
            <div className="leading-none">
              <div className="text-sm font-black tracking-tight">ISTAN</div>
              <div className="text-[8px] font-bold tracking-[0.2em] text-primary uppercase">CREATOR</div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1 p-1 bg-muted/40 rounded-lg border border-border/50">
            {(["football", "hockey"] as const).map(s => (
              <button key={s} onClick={() => setSport(s)}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${sport === s ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {s === "football" ? "⚽ Football" : "🏒 Hockey"}
              </button>
            ))}
          </div>

          <Button onClick={handleExport} disabled={exporting} size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold shadow-[0_0_12px_rgba(16,185,129,0.3)] h-9">
            <Download className={`w-4 h-4 mr-1.5 ${exporting ? "animate-bounce" : ""}`} />
            {exporting ? "Export…" : "Exporter"}
          </Button>
        </div>
      </header>

      {/* ── MOBILE QUICK CONTROLS (fixed strip below header) ── */}
      <div className="md:hidden shrink-0 z-20 px-3 py-2 flex items-center gap-2 border-b border-white/[0.04]"
        style={{ background: "rgba(10,12,18,0.92)", backdropFilter: "blur(12px)" }}>
        {[
          { label: "N°", icon: <Hash className="w-3.5 h-3.5" />, action: handleAutoNumber, color: "" },
          { label: "Miroir", icon: <FlipHorizontal2 className="w-3.5 h-3.5" />, action: handleMirror, color: "" },
          { label: "Reset",  icon: <RotateCcw className="w-3.5 h-3.5" />, action: handleReset, color: "text-destructive/80 border-destructive/25" },
        ].map(({ label, icon, action, color }) => (
          <button key={label} onClick={action}
            className={`flex items-center justify-center gap-1 h-8 px-3 rounded-lg border border-white/10 bg-white/[0.04] text-[11px] font-semibold transition-all active:scale-95 hover:bg-white/[0.08] ${color}`}>
            {icon}{label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => { setBenchPanelOpen(true); setMobilePage("accueil"); }}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-primary/25 bg-primary/10 text-primary text-[11px] font-bold transition-all active:scale-95 hover:bg-primary/20">
          <Users className="w-3.5 h-3.5" />
          Remplaçants
          <span className="text-[9px] bg-primary/20 px-1.5 py-0.5 rounded-full font-bold">{bench.length}</span>
        </button>
      </div>

      {/* ══════════════ DESKTOP LAYOUT ══════════════ */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] max-w-[500px] max-h-[500px] bg-primary/6 blur-[120px] rounded-full" />
          </div>
          {PitchCanvas}
        </div>
        <div className="w-[360px] shrink-0 border-l border-border/50 bg-card flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5">
            {SettingsContent(true)}
          </div>
        </div>
      </div>

      {/* ══════════════ MOBILE LAYOUT ══════════════ */}
      <div className="md:hidden flex-1 overflow-hidden relative">

        {/* PAGE: ACCUEIL */}
        {mobilePage === "accueil" && (
          <div className="h-full flex flex-col items-center overflow-y-auto pt-4 px-3 gap-0 pb-4">
            {PitchCanvas}
            <div className="h-2 w-full shrink-0" />
          </div>
        )}

        {/* PAGE: PARAMÈTRES */}
        {mobilePage === "parametres" && (
          <div className="h-full overflow-y-auto">
            <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border/30 px-4 py-2">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Paramètres</p>
            </div>
            <div className="p-4">
              {SettingsContent(true)}
            </div>
          </div>
        )}

        {/* PAGE: BIBLIOTHÈQUE */}
        {mobilePage === "bibliotheque" && (
          <div className="h-full overflow-hidden">
            <LibraryPage onLoadComposition={handleLoadComposition} currentState={currentState} />
          </div>
        )}
      </div>

      {/* ══════════════ MOBILE BOTTOM NAV ══════════════ */}
      <nav className="md:hidden shrink-0 z-30"
        style={{
          background: "rgba(10,12,18,0.96)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}>
        <div className="flex items-center justify-around px-2 pt-2 pb-2">
          {[
            { id: "accueil",      label: "Terrain",    icon: HomeIcon },
            { id: "parametres",   label: "Options",    icon: Settings },
            { id: "bibliotheque", label: "Biblio",     icon: BookOpen },
          ].map(({ id, label, icon: Icon }) => {
            const active = mobilePage === id;
            return (
              <button key={id} onClick={() => setMobilePage(id as typeof mobilePage)}
                className="flex flex-col items-center gap-1 flex-1 py-1 transition-all active:scale-95">
                <div className={`flex items-center justify-center w-12 h-8 rounded-2xl transition-all duration-200 ${active ? "bg-primary/15" : ""}`}>
                  <Icon className={`transition-all duration-200 ${active ? "w-5 h-5 text-primary" : "w-5 h-5 text-white/35"}`} />
                </div>
                <span className={`text-[10px] font-semibold tracking-wide transition-all duration-200 ${active ? "text-primary" : "text-white/30"}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Mobile Bench Panel ── */}
      {BenchPanel}

      {/* ── Bench Edit Dialog ── */}
      {BenchEditDialog}

      {/* ── Formation Picker ── */}
      <FormationPicker
        open={formationPickerOpen}
        onClose={() => setFormationPickerOpen(false)}
        sport={sport}
        current={formation}
        jerseyColor={jerseyColor}
        onSelect={f => { setFormation(f); setPlayers(initPlayers(sport, f)); }}
      />
    </div>
  );
}
