import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Bot,
  BarChart3,
  Check,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Users, Trophy,
  Download,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NationalityPicker } from "@/components/NationalityPicker";
import { RatingControl } from "@/components/RatingControl";
import { generateSquadFromCriteria, generateSquadFromText, type GeneratedPlayer } from "@/lib/ai";
import type { Club, RosterPlayer } from "@/components/ClubsManager";
import { countries } from "@/lib/countries";
import { resolveCountryCode } from "@/lib/countries";
import {
  analysisFilePayload,
  analyzeAllFormations,
  analyzeFormation,
  diagnoseRoster,
  type FormationMap,
  type AnalysisSport,
} from "@/lib/formationAnalysis";
import { FOOTBALL_FORMATIONS, HOCKEY_FORMATIONS } from "@/lib/formations";
import { FormationPicker } from "@/components/FormationPicker";

type Props = {
  club: Club;
  onChange: (roster: RosterPlayer[]) => void;
  onBestXI?: (formation?: string) => void;
  onBestXIAI?: (formation?: string) => void | Promise<void>;
  onRecommendFormation?: (formation: string) => void;
  formation?: string;
  sport?: "football" | "hockey";
};

const positionOptions = {
  football: ["GB", "DG", "DC", "DD", "MDC", "MC", "MOC", "MG", "MD", "AG", "AD", "BU"],
  hockey: ["G", "DG", "DD", "D", "C", "AG", "AD"],
} as const;

const emptyPlayer = (sport: "football" | "hockey"): Omit<RosterPlayer, "id"> => ({
  name: "",
  age: 22,
  rating: 75,
  nationality: "ISTANMUSTA",
  position: sport === "hockey" ? "C" : "MC",
  number: "1",
});

function CountryFlag({ value }: { value: string }) {
  const normalized = resolveCountryCode(value);
  const country = countries.find(item =>
    item.code.toUpperCase() === normalized ||
    item.name.toUpperCase() === normalized,
  );

  if (country?.isCustom) {
    return (
      <img
        src={`${import.meta.env.BASE_URL}istanmusta-flag.png`}
        alt={country.name}
        className="h-4 w-6 shrink-0 rounded-sm object-cover"
      />
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w20/${normalized.toLowerCase()}.png`}
      alt={country?.name ?? normalized}
      title={country?.name ?? value}
      aria-label={country?.name ?? value}
      className="h-4 w-6 shrink-0 rounded-sm object-cover"
      onError={event => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
    >
    </img>
  );
}

export function SquadManager({ club, onChange, onBestXI, onBestXIAI, onRecommendFormation, formation, sport = "football" }: Props) {
  const roster = club.roster ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyPlayer(sport));
  const [aiMode, setAiMode] = useState<"text" | "criteria">("criteria");
  const [rawText, setRawText] = useState("");
  const [criteria, setCriteria] = useState({
    count: 23,
    ageMin: 18,
    ageMax: 32,
    ratingMin: 65,
    ratingMax: 85,
    nationality: "ISTANMUSTA",
    positions: sport === "hockey" ? "G, DG, DD, C, AG, AD" : "GB, DG, DC, DD, MDC, MC, MOC, AG, AD, BU",
  });
  // Répartition des nationalités en % : [{ nationality, percent }] avec des
  // lignes ajoutables/supprimables. Les parts n'ont pas à totaliser 100 :
  // le reste de l'effectif garde la nationalité par défaut.
  const [nationalityMix, setNationalityMix] = useState<Array<{ nationality: string; percent: number }>>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [aiBestXILoading, setAiBestXILoading] = useState(false);
  const [aiBestXIError, setAiBestXIError] = useState("");
  const [formationPickerOpen, setFormationPickerOpen] = useState(false);
  const [placementMode, setPlacementMode] = useState<"local" | "ai" | null>(null);

  const formationMap = (sport === "football" ? FOOTBALL_FORMATIONS : HOCKEY_FORMATIONS) as FormationMap;
  const activeFormation = formation && formationMap[formation] ? formation : Object.keys(formationMap)[0];
  // L'analyse de toutes les formations est volontairement différée : la liste
  // et les champs de saisie restent réactifs même avec un gros effectif.
  const analysisRoster = useDeferredValue(roster);
  const activeAnalysis = useMemo(
    () => analyzeFormation(activeFormation, formationMap[activeFormation], analysisRoster, sport as AnalysisSport),
    [activeFormation, formationMap, analysisRoster, sport],
  );
  // L'analyse des ~65 formations ne tourne que lorsque le panneau d'analyse
  // est ouvert : en édition courante, zéro coût CPU par frappe clavier.
  const recommendedFormation = useMemo(
    () => analysisOpen ? analyzeAllFormations(formationMap, analysisRoster, sport as AnalysisSport)[0] : null,
    [analysisOpen, formationMap, analysisRoster, sport],
  );
  const rosterDiagnosis = useMemo(
    () => diagnoseRoster(roster, sport as AnalysisSport),
    [roster, sport],
  );

  const downloadAnalysis = () => {
    const payload = analysisFilePayload(formationMap, roster, sport as AnalysisSport);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sport}-formations-analysis.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    setCriteria(current => ({
      ...current,
      positions: sport === "hockey" ? "G, DG, DD, C, AG, AD" : "GB, DG, DC, DD, MDC, MC, MOC, AG, AD, BU",
    }));
    setForm(current => current.name ? current : emptyPlayer(sport));
  }, [sport]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyPlayer(sport));
    setDialogOpen(true);
  };

  const openEdit = (player: RosterPlayer) => {
    setEditingId(player.id);
    setForm({
      name: player.name,
      age: player.age,
      rating: player.rating,
      nationality: player.nationality,
      position: player.position,
      number: player.number,
    });
    setDialogOpen(true);
  };

  const savePlayer = () => {
    if (!form.name.trim()) return;
    const next = {
      ...form,
      name: form.name.trim(),
      nationality: resolveCountryCode(form.nationality),
      position: form.position.trim().toUpperCase() || "MC",
      number: form.number.trim() || String(roster.length + 1),
    };
    onChange(editingId
      ? roster.map(player => player.id === editingId ? { ...next, id: editingId } : player)
      : [...roster, { ...next, id: `roster-${Date.now()}` }]);
    setDialogOpen(false);
  };

  const removePlayer = (id: string) => onChange(roster.filter(player => player.id !== id));

  const addGeneratedPlayers = (players: GeneratedPlayer[]) => {
    const generated = players.map((player, index) => ({
      ...player,
      nationality: resolveCountryCode(player.nationality),
      id: `ai-${Date.now()}-${index}`,
    }));
    onChange([...roster, ...generated]);
  };

  const generateFromText = async () => {
    if (!rawText.trim()) {
      setError("Colle d’abord un texte d’effectif.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      addGeneratedPlayers(await generateSquadFromText(rawText, sport, club.name));
      setRawText("");
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "La génération a échoué.");
    } finally {
      setGenerating(false);
    }
  };

  const generateFromCriteria = async () => {
    setGenerating(true);
    setError("");
    try {
      addGeneratedPlayers(await generateSquadFromCriteria({
        sport,
        clubName: club.name,
        ...criteria,
        nationalityMix: nationalityMix.filter(line => line.nationality.trim() && line.percent > 0),
      }));
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "La génération a échoué.");
    } finally {
      setGenerating(false);
    }
  };

  const runAiBestXI = async (requestedFormation = activeFormation) => {
    if (!onBestXIAI) return;
    setAiBestXIError("");
    setAiBestXILoading(true);
    try {
      await onBestXIAI(requestedFormation);
    } catch (aiError) {
      setAiBestXIError(aiError instanceof Error ? aiError.message : "La suggestion IA a échoué.");
    } finally {
      setAiBestXILoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border-2 border-emerald-400/40 bg-gradient-to-br from-violet-950/55 via-blue-950/45 to-emerald-950/55 p-4 shadow-[0_0_28px_rgba(16,185,129,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="truncate text-sm font-black">Effectif — {club.name}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{roster.length} joueur{roster.length > 1 ? "s" : ""} enregistré{roster.length > 1 ? "s" : ""}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {onBestXI && roster.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => { setPlacementMode("local"); setFormationPickerOpen(true); }} className="gap-1.5" title="Choisir une formation avant de placer l'effectif">
              <Trophy className="h-3.5 w-3.5" /> Meilleur XI
            </Button>
          )}
          {onBestXIAI && roster.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => { setPlacementMode("ai"); setFormationPickerOpen(true); }} disabled={aiBestXILoading} className="gap-1.5" title="Choisir une formation avant la suggestion IA">
              <Sparkles className={`h-3.5 w-3.5 ${aiBestXILoading ? "animate-pulse" : "text-primary"}`} />
              {aiBestXILoading ? "IA…" : "IA"}
            </Button>
          )}
          <Button size="sm" onClick={openNew} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Joueur
          </Button>
        </div>
      </div>
      {aiBestXIError && <p className="text-xs font-medium text-amber-400">{aiBestXIError}</p>}

      {roster.length > 0 && (
        <div className="rounded-xl border border-emerald-400/30 bg-gradient-to-r from-violet-950/45 via-blue-950/35 to-emerald-950/45 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-black">
              <Lightbulb className="h-4 w-4 text-amber-400" /> Contrôle de l’effectif
            </span>
            <span className="text-[10px] font-bold text-muted-foreground">{rosterDiagnosis.total} joueurs</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
            <span className="rounded-full bg-blue-500/15 px-2 py-1 text-blue-300">GB {rosterDiagnosis.goalkeepers}</span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-300">DEF {rosterDiagnosis.defenders}</span>
            <span className="rounded-full bg-violet-500/15 px-2 py-1 text-violet-300">MIL {rosterDiagnosis.midfielders}</span>
            <span className="rounded-full bg-orange-500/15 px-2 py-1 text-orange-300">ATT {rosterDiagnosis.attackers}</span>
          </div>
          {rosterDiagnosis.warnings.length > 0 ? (
            <p className="mt-2 text-[10px] font-semibold text-amber-300">À vérifier : {rosterDiagnosis.warnings.join(" · ")}</p>
          ) : (
            <p className="mt-2 text-[10px] font-semibold text-emerald-300">Effectif correctement renseigné.</p>
          )}
          {rosterDiagnosis.unknownPositions.length > 0 && (
            <p className="mt-1 truncate text-[10px] text-muted-foreground">Postes non reconnus : {rosterDiagnosis.unknownPositions.join(", ")}</p>
          )}
        </div>
      )}

      {roster.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-emerald-400/30 bg-gradient-to-br from-violet-950/35 via-blue-950/25 to-emerald-950/35">
          <button
            type="button"
            onClick={() => setAnalysisOpen(open => !open)}
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-primary/5"
          >
            <span className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span>
                <span className="block text-xs font-black">Analyse poste par poste</span>
                <span className="block text-[10px] text-muted-foreground">{activeAnalysis.averageFit}% de compatibilité · {activeAnalysis.exactPostes}/{activeAnalysis.slots.length} postes naturels</span>
              </span>
            </span>
            <span className={`text-[10px] font-black ${activeAnalysis.goalkeeperReady ? "text-emerald-400" : "text-amber-400"}`}>
              {activeAnalysis.goalkeeperReady ? "XI cohérent" : "À corriger"}
            </span>
          </button>

          {analysisOpen && (
            <div className="space-y-3 border-t border-primary/10 px-3 pb-3 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-primary/10 p-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Formation conseillée</p>
                  <p className="mt-0.5 text-sm font-black text-primary">{recommendedFormation?.formation ?? activeFormation}</p>
                  <p className="text-[10px] text-muted-foreground">{recommendedFormation?.averageFit ?? 0}% · {recommendedFormation?.exactPostes ?? 0} postes naturels</p>
                </div>
                <div className="rounded-lg bg-muted/35 p-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Adaptations</p>
                  <p className="mt-0.5 text-sm font-black">{activeAnalysis.adaptations}</p>
                  <p className="text-[10px] text-muted-foreground">{activeAnalysis.missingPostes} poste{activeAnalysis.missingPostes > 1 ? "s" : ""} manquant{activeAnalysis.missingPostes > 1 ? "s" : ""}</p>
                </div>
              </div>

              {recommendedFormation && recommendedFormation.formation !== activeFormation && onRecommendFormation && (
                <Button type="button" size="sm" variant="outline" onClick={() => onRecommendFormation(recommendedFormation.formation)} className="w-full gap-1.5 text-xs">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
                  Utiliser {recommendedFormation.formation}
                </Button>
              )}

              <div className="space-y-1.5">
                {activeAnalysis.slots.map(slot => (
                  <div key={slot.index} className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/15 px-2 py-1.5">
                    <span className="w-8 shrink-0 text-[10px] font-black text-primary">{slot.label}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{slot.recommendedPlayerName ?? "Aucun joueur"}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${slot.recommendation === "excellent" ? "bg-emerald-500/15 text-emerald-400" : slot.recommendation === "good" ? "bg-blue-500/15 text-blue-400" : slot.recommendation === "adaptation" ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"}`}>
                      {slot.bestFit}%
                    </span>
                  </div>
                ))}
              </div>

              {activeAnalysis.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-[10px] text-amber-200">
                  {activeAnalysis.warnings.join(" ")}
                </div>
              )}

              <Button type="button" variant="ghost" size="sm" onClick={downloadAnalysis} className="w-full gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Download className="h-3.5 w-3.5" />
                Exporter toutes les analyses en JSON
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {roster.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 py-7 text-center">
            <Users className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">Aucun joueur dans cet effectif.</p>
            <p className="mt-1 text-[10px] text-muted-foreground/70">Ajoute-les manuellement ou utilise l’IA ci-dessous.</p>
          </div>
        ) : (
          roster.map(player => (
            <div key={player.id} className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/50 px-2.5 py-2">
              <span className="w-6 shrink-0 text-center text-xs font-black text-primary">#{player.number}</span>
              <CountryFlag value={player.nationality} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{player.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {player.position} · {player.age} ans
                </p>
              </div>
              <span className="shrink-0 text-xs font-black tabular-nums text-primary">{player.rating}</span>
              <button type="button" aria-label={`Modifier ${player.name}`} onClick={() => openEdit(player)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" aria-label={`Supprimer ${player.name}`} onClick={() => removePlayer(player.id)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="space-y-3 border-t border-emerald-400/25 pt-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <p className="text-xs font-black uppercase tracking-wider text-primary">Générateur IA Groq</p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/40 p-1">
          <button type="button" onClick={() => setAiMode("criteria")} className={`rounded-md px-2 py-1.5 text-[11px] font-bold transition-colors ${aiMode === "criteria" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            Par critères
          </button>
          <button type="button" onClick={() => setAiMode("text")} className={`rounded-md px-2 py-1.5 text-[11px] font-bold transition-colors ${aiMode === "text" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            Depuis un texte
          </button>
        </div>

        {aiMode === "text" ? (
          <div className="space-y-2">
            <textarea
              value={rawText}
              onChange={event => setRawText(event.target.value)}
              placeholder={"Exemple :\n1. Aren Musta, gardien, 24 ans, OVR 82\n2. Mira Varen, défenseure, 21 ans, OVR 78"}
              className="min-h-28 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="button" onClick={generateFromText} disabled={generating} className="w-full gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              {generating ? "Génération en cours…" : "Transformer le texte en effectif"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Joueurs</Label>
                <Input type="number" min={1} max={40} value={criteria.count} onChange={event => setCriteria(c => ({ ...c, count: Number(event.target.value) }))} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Âge min</Label>
                <Input type="number" min={15} max={45} value={criteria.ageMin} onChange={event => setCriteria(c => ({ ...c, ageMin: Number(event.target.value) }))} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Âge max</Label>
                <Input type="number" min={15} max={45} value={criteria.ageMax} onChange={event => setCriteria(c => ({ ...c, ageMax: Number(event.target.value) }))} className="h-8 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">OVR minimum</Label>
                <Input type="number" min={1} max={99} value={criteria.ratingMin} onChange={event => setCriteria(c => ({ ...c, ratingMin: Number(event.target.value) }))} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">OVR maximum</Label>
                <Input type="number" min={1} max={99} value={criteria.ratingMax} onChange={event => setCriteria(c => ({ ...c, ratingMax: Number(event.target.value) }))} className="h-8 text-xs" />
              </div>
            </div>
            <Input value={criteria.positions} onChange={event => setCriteria(c => ({ ...c, positions: event.target.value }))} placeholder="Postes séparés par des virgules" className="h-8 text-xs" />
            <Input value={criteria.nationality} onChange={event => setCriteria(c => ({ ...c, nationality: event.target.value.toUpperCase() }))} placeholder="Nationalité, ex. ISTANMUSTA" className="h-8 text-xs" />

            <div className="space-y-1.5 rounded-lg border border-border/50 bg-muted/10 p-2">
              <div className="flex items-center justify-between">
                <Label className="text-[10px]">Répartition par nationalité (%)</Label>
                <button
                  type="button"
                  onClick={() => setNationalityMix(lines => [...lines, { nationality: "", percent: 25 }])}
                  className="flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary transition-colors hover:bg-primary/25"
                >
                  <Plus className="h-3 w-3" /> Ajouter
                </button>
              </div>
              {nationalityMix.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">Optionnel — ex. 40% BR, 30% FR. Le reste garde la nationalité par défaut.</p>
              ) : (
                <div className="space-y-1.5">
                  {nationalityMix.map((line, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <Input
                        value={line.nationality}
                        onChange={event => setNationalityMix(lines => lines.map((item, i) => i === index ? { ...item, nationality: event.target.value.toUpperCase() } : item))}
                        placeholder="BR"
                        className="h-7 flex-1 text-xs uppercase"
                      />
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={line.percent}
                        onChange={event => setNationalityMix(lines => lines.map((item, i) => i === index ? { ...item, percent: Number(event.target.value) } : item))}
                        className="h-7 w-16 shrink-0 text-center text-xs"
                      />
                      <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">%</span>
                      <button
                        type="button"
                        aria-label="Retirer cette nationalité"
                        onClick={() => setNationalityMix(lines => lines.filter((_, i) => i !== index))}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button type="button" onClick={generateFromCriteria} disabled={generating} className="w-full gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              {generating ? "Génération en cours…" : "Générer l’effectif"}
            </Button>
          </div>
        )}
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        <p className="text-[10px] text-muted-foreground">Les joueurs générés sont ajoutés à l’effectif et restent modifiables.</p>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier le joueur" : "Ajouter un joueur"} — {club.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nom complet</Label>
                <Input value={form.name} onChange={event => setForm(f => ({ ...f, name: event.target.value }))} placeholder="Aren Musta" />
              </div>
              <div className="space-y-1">
                <Label>Poste</Label>
                 <Input list={`position-options-${club.id}`} value={form.position} onChange={event => setForm(f => ({ ...f, position: event.target.value.toUpperCase() }))} placeholder={sport === "hockey" ? "C" : "MC"} />
                 <datalist id={`position-options-${club.id}`}>
                   {positionOptions[sport].map(position => <option key={position} value={position} />)}
                 </datalist>
              </div>
              <div className="space-y-1">
                <Label>Numéro</Label>
                <Input value={form.number} onChange={event => setForm(f => ({ ...f, number: event.target.value }))} placeholder="10" />
              </div>
              <div className="space-y-1">
                <Label>Âge</Label>
                <Input type="number" min={15} max={45} value={form.age} onChange={event => setForm(f => ({ ...f, age: Number(event.target.value) }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note OVR</Label>
              <RatingControl value={form.rating} onChange={rating => setForm(f => ({ ...f, rating }))} />
            </div>
            <div className="space-y-2">
              <Label>Nationalité et drapeau</Label>
              <NationalityPicker value={form.nationality} onChange={nationality => setForm(f => ({ ...f, nationality }))} />
            </div>
            <Button type="button" onClick={savePlayer} disabled={!form.name.trim()} className="w-full gap-2">
              <Check className="h-4 w-4" /> Enregistrer le joueur
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <FormationPicker
        open={formationPickerOpen}
        onClose={() => { setFormationPickerOpen(false); setPlacementMode(null); }}
        sport={sport}
        current={activeFormation}
        jerseyColor={club.jerseyColor}
        onSelect={selectedFormation => {
          const mode = placementMode;
          setFormationPickerOpen(false);
          setPlacementMode(null);
          if (mode === "ai") void runAiBestXI(selectedFormation);
          else if (mode === "local") onBestXI?.(selectedFormation);
        }}
      />
    </div>
  );
}