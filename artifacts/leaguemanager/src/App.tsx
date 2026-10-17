import { useCallback, useEffect, useState } from "react";
import ClubsPanel from "@/components/ClubsPanel";
import CompetitionsPanel from "@/components/CompetitionsPanel";
import ExportPanel from "@/components/ExportPanel";
import SchedulePanel from "@/components/SchedulePanel";
import StandingsPanel from "@/components/StandingsPanel";
import { Btn, Chip, EmptyState, Notice, Panel } from "@/components/ui";
import * as api from "@/lib/api";
import { FORMAT_LABELS, type Club, type Competition, type CompetitionDetail, type Engine } from "@/lib/types";

type Tab = "clubs" | "competitions" | "schedule" | "standings" | "export";

const TABS: { id: Tab; label: string }[] = [
  { id: "clubs", label: "Clubs" },
  { id: "competitions", label: "Compétitions" },
  { id: "schedule", label: "Calendrier & résultats" },
  { id: "standings", label: "Classement & tableau" },
  { id: "export", label: "Export PNG" },
];

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export default function App() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CompetitionDetail | null>(null);
  const [tab, setTab] = useState<Tab>("clubs");
  const [engine, setEngine] = useState<Engine>("fast");
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [loadedClubs, loadedCompetitions] = await Promise.all([api.getClubs(), api.getCompetitions()]);
    setClubs(loadedClubs);
    setCompetitions(loadedCompetitions);
    return loadedCompetitions;
  }, []);

  useEffect(() => {
    void load()
      .then(list => {
        if (list.length && !selectedId) setSelectedId(list[0].id);
      })
      .catch(cause => setError(message(cause, "Chargement impossible.")));
  }, [load, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let alive = true;
    void api
      .getCompetition(selectedId)
      .then(loaded => {
        if (alive) setDetail(loaded);
      })
      .catch(cause => {
        if (alive) setError(message(cause, "Compétition illisible."));
      });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function saveClub(club: Club) {
    await api.saveClub(club);
    await load();
    setNotice(`Club « ${club.name} » enregistré.`);
  }

  async function removeClub(id: string) {
    const club = clubs.find(item => item.id === id);
    await api.deleteClub(id);
    await load();
    if (detail && detail.clubIds.includes(id)) setDetail(await api.getCompetition(detail.id));
    setNotice(`Club « ${club?.name || id} » supprimé.`);
  }

  async function saveCompetition(competition: Competition) {
    const saved = await api.saveCompetition(competition);
    await load();
    setDetail(saved);
    setNotice(`Compétition « ${saved.name} » enregistrée — ${saved.fixtures.length} matchs au calendrier.`);
    return saved;
  }

  async function removeCompetition(id: string) {
    await api.deleteCompetition(id);
    const list = await load();
    if (selectedId === id) setSelectedId(list.find(item => item.id !== id)?.id || null);
    setDetail(null);
    setNotice("Compétition supprimée.");
  }

  async function simulate(options: { step?: boolean; replay?: boolean }) {
    if (!selectedId) return;
    setBusy(true);
    setAction(options.replay ? "replay" : options.step ? "step" : "all");
    setError(null);
    try {
      const result = await api.simulateCompetition(selectedId, { engine, ...options });
      setDetail(result.competition);
      setCompetitions(await api.getCompetitions());
      setNotice(
        result.played === 0
          ? "Aucun match à jouer : le calendrier est déjà complet."
          : `${result.played} match${result.played > 1 ? "s" : ""} simulé${result.played > 1 ? "s" : ""} en mode ${engine === "fast" ? "rapide" : "minute par minute"}.`,
      );
    } catch (cause) {
      setError(message(cause, "Simulation impossible."));
    } finally {
      setBusy(false);
      setAction(null);
    }
  }

  async function reset() {
    if (!selectedId) return;
    setBusy(true);
    setAction("reset");
    try {
      setDetail(await api.resetCompetition(selectedId));
      setCompetitions(await api.getCompetitions());
      setNotice("Calendrier régénéré, résultats effacés.");
    } catch (cause) {
      setError(message(cause, "Réinitialisation impossible."));
    } finally {
      setBusy(false);
      setAction(null);
    }
  }

  const selected = competitions.find(item => item.id === selectedId) || null;

  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1240px] flex-col gap-6 px-5 py-7 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--lime)] text-lg font-black text-[#0a0b0d]">
            L
          </span>
          <div>
            <p className="text-[15px] font-extrabold tracking-wide">ISTAN LEAGUEMANAGER</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Compétitions · simulation locale · export PNG
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {competitions.length ? (
            <label className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
              Compétition
              <select
                className="input"
                style={{ minWidth: 220 }}
                value={selectedId || ""}
                onChange={event => setSelectedId(event.target.value || null)}
              >
                <option value="">— choisir —</option>
                {competitions.map(competition => (
                  <option key={competition.id} value={competition.id}>
                    {competition.name} ({FORMAT_LABELS[competition.format]})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <a className="btn btn-ghost" href="/">
            ← Portail
          </a>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2 border-y border-[var(--line)] py-3">
        {TABS.map(item => (
          <button
            key={item.id}
            type="button"
            className="tab"
            data-active={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? (
        <Notice tone="error">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>fermer</button>
        </Notice>
      ) : null}
      {notice ? <Notice>{notice}</Notice> : null}

      {tab === "clubs" ? (
        <ClubsPanel clubs={clubs} onSave={saveClub} onDelete={removeClub} />
      ) : null}

      {tab === "competitions" ? (
        <CompetitionsPanel
          clubs={clubs}
          competitions={competitions}
          selectedId={selectedId}
          onSelect={id => {
            setSelectedId(id);
            setTab("schedule");
          }}
          onSave={saveCompetition}
          onDelete={removeCompetition}
        />
      ) : null}

      {tab === "schedule" || tab === "standings" || tab === "export" ? (
        !detail ? (
          <Panel>
            <EmptyState
              title="Aucune compétition ouverte"
              text="Choisis une compétition dans le sélecteur en haut, ou crées-en une dans l'onglet Compétitions."
            />
            <div className="mt-5 flex gap-3">
              <Btn variant="primary" onClick={() => setTab("competitions")}>
                Voir les compétitions
              </Btn>
            </div>
          </Panel>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Chip label={FORMAT_LABELS[detail.format]} value={detail.name} />
              <Chip label="Clubs" value={detail.clubIds.length} />
              <Chip
                label="Matchs"
                value={`${detail.fixtures.filter(fixture => fixture.played).length}/${detail.fixtures.length}`}
              />
              <Chip label="Moteur" value={engine === "fast" ? "Rapide" : "Minute par minute"} />
              {selected ? <Chip label="Maj" value={new Date(selected.updatedAt).toLocaleString("fr-FR")} /> : null}
            </div>

            {tab === "schedule" ? (
              <SchedulePanel
                detail={detail}
                engine={engine}
                onEngine={setEngine}
                onSimulate={options => void simulate(options)}
                onReset={() => void reset()}
                busy={busy}
                action={action}
              />
            ) : null}
            {tab === "standings" ? <StandingsPanel detail={detail} /> : null}
            {tab === "export" ? <ExportPanel detail={detail} /> : null}
          </>
        )
      ) : null}

      <footer className="mt-auto flex flex-wrap justify-between gap-3 border-t border-[var(--line)] pt-5 text-[12px] text-[var(--muted)]">
        <span>Simulation locale et déterministe — aucune IA externe, aucun appel réseau pendant un match.</span>
        <span>Données enregistrées sur le serveur du portail.</span>
      </footer>
    </div>
  );
}
