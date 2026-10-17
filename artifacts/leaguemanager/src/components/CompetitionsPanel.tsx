import { fmtDate, fmtDateTime } from "@/lib/format";
import { newCompetition, FORMAT_LABELS, type Club, type Competition, type CompetitionDetail, type CompetitionFormat, type Sport } from "@/lib/types";
import { Btn, Chip, EmptyState, Notice, Panel, RangeField, SectionTitle, SelectField, TextField, ToggleField } from "./ui";
import { useState } from "react";

export default function CompetitionsPanel({
  clubs,
  competitions,
  selectedId,
  onSelect,
  onSave,
  onDelete,
}: {
  clubs: Club[];
  competitions: Competition[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSave: (competition: Competition) => Promise<CompetitionDetail>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Competition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function patch(changes: Partial<Competition>) {
    setDraft(current => (current ? { ...current, ...changes } : current));
  }

  function patchSettings(changes: Partial<Competition["settings"]>) {
    setDraft(current => (current ? { ...current, settings: { ...current.settings, ...changes } } : current));
  }

  function toggleClub(clubId: string) {
    setDraft(current => {
      if (!current) return current;
      const engaged = current.clubIds.includes(clubId);
      return {
        ...current,
        clubIds: engaged ? current.clubIds.filter(id => id !== clubId) : [...current.clubIds, clubId],
      };
    });
  }

  async function submit() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("Donne un nom à la compétition.");
      return;
    }
    if (draft.clubIds.length < 2) {
      setError("Engage au moins deux clubs.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await onSave({ ...draft, name: draft.name.trim() });
      onSelect(saved.id);
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  const draftClubs = clubs.filter(club => draft?.sport ? club.sport === draft.sport : true);

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <SectionTitle
          eyebrow="Compétitions"
          title={`${competitions.length} compétition${competitions.length > 1 ? "s" : ""}`}
          note="Ligue (aller ou aller/retour), coupe à élimination directe ou format personnalisé (poules puis phases finales). Le calendrier est généré par le serveur : tout le monde voit le même."
          right={
            <Btn
              variant="primary"
              onClick={() => {
                setDraft(newCompetition());
                setError(null);
              }}
              disabled={clubs.length < 2}
            >
              + Nouvelle compétition
            </Btn>
          }
        />

        {clubs.length < 2 ? (
          <EmptyState title="Il faut au moins deux clubs" text="Crée d'abord deux clubs dans l'onglet Clubs : ils seront engagés dans la compétition." />
        ) : competitions.length === 0 ? (
          <EmptyState title="Aucune compétition" text="Crée une ligue, une coupe ou un format personnalisé avec tes clubs." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {competitions.map(competition => {
              const played = competition.fixtures.filter(fixture => fixture.played).length;
              const total = competition.fixtures.length;
              return (
                <article
                  key={competition.id}
                  className={`flex flex-col gap-3 rounded-2xl border p-4 transition ${
                    selectedId === competition.id
                      ? "border-[rgba(200,255,61,0.5)] bg-[rgba(200,255,61,0.06)]"
                      : "border-[var(--line)] bg-white/[0.02]"
                  }`}
                >
                  <div>
                    <p className="font-semibold">{competition.name}</p>
                    <p className="text-[12px] text-[var(--muted)]">
                      Créée le {fmtDate(competition.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Chip value={FORMAT_LABELS[competition.format]} />
                    <Chip value={competition.sport === "hockey" ? "🏒 Hockey" : "⚽ Football"} />
                    <Chip value={`${competition.clubIds.length} clubs`} />
                    {competition.format === "league" ? (
                      <Chip value={competition.settings.doubleRound ? "Aller/retour" : "Aller simple"} />
                    ) : null}
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-[var(--muted)]">
                      <span>Progression</span>
                      <span className="num">
                        {played}/{total || "—"} matchs
                      </span>
                    </div>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-white/10">
                      <span
                        className="block h-full rounded-full bg-[var(--lime)]"
                        style={{ width: total ? `${(played / total) * 100}%` : "0%" }}
                      />
                    </span>
                  </div>
                  <div className="mt-auto flex gap-2">
                    <Btn variant="primary" onClick={() => onSelect(competition.id)}>
                      Ouvrir
                    </Btn>
                    <Btn onClick={() => { setDraft({ ...competition, settings: { ...competition.settings } }); setError(null); }}>
                      Régler
                    </Btn>
                    <Btn
                      variant="danger"
                      onClick={() => {
                        if (window.confirm(`Supprimer « ${competition.name} » et tous ses résultats ?`)) {
                          void onDelete(competition.id);
                        }
                      }}
                    >
                      Suppr.
                    </Btn>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      {draft ? (
        <Panel>
          <SectionTitle
            eyebrow={competitions.some(item => item.id === draft.id) ? "Modifier" : "Nouvelle compétition"}
            title={draft.name || "Compétition sans nom"}
            note="Le calendrier est calculé à l'enregistrement, à partir de la graine : la même graine rejoue exactement les mêmes matchs."
          />

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <TextField label="Nom" value={draft.name} onChange={value => patch({ name: value })} placeholder="Ligue Istanmusta D1" maxLength={80} />

              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField<Sport>
                  label="Sport"
                  value={draft.sport}
                  onChange={value => patch({ sport: value, clubIds: draft.clubIds.filter(id => clubs.find(club => club.id === id)?.sport === value) })}
                  options={[
                    { value: "football", label: "Football" },
                    { value: "hockey", label: "Hockey" },
                  ]}
                />
                <SelectField<CompetitionFormat>
                  label="Format"
                  value={draft.format}
                  onChange={value => patch({ format: value })}
                  options={[
                    { value: "league", label: "Ligue — championnat" },
                    { value: "cup", label: "Coupe — élimination directe" },
                    { value: "custom", label: "Personnalisé — poules puis tableau" },
                  ]}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="field">
                  Points victoire
                  <input className="input num" type="number" min={0} max={10} value={draft.settings.pointsWin} onChange={event => patchSettings({ pointsWin: Number(event.target.value) })} />
                </label>
                <label className="field">
                  Points nul
                  <input className="input num" type="number" min={0} max={10} value={draft.settings.pointsDraw} onChange={event => patchSettings({ pointsDraw: Number(event.target.value) })} />
                </label>
                <label className="field">
                  Points défaite
                  <input className="input num" type="number" min={0} max={10} value={draft.settings.pointsLoss} onChange={event => patchSettings({ pointsLoss: Number(event.target.value) })} />
                </label>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4">
                {draft.format === "league" ? (
                  <ToggleField
                    label="Matchs aller / retour"
                    checked={draft.settings.doubleRound}
                    onChange={value => patchSettings({ doubleRound: value })}
                    hint="Chaque club reçoit et se déplace une fois contre chaque adversaire."
                  />
                ) : null}
                {draft.format === "cup" ? (
                  <SelectField
                    label="Nombre de matchs par tour"
                    value={String(draft.settings.legs)}
                    onChange={value => patchSettings({ legs: value === "2" ? 2 : 1 })}
                    options={[
                      { value: "1", label: "Match sec" },
                      { value: "2", label: "Aller / retour (score cumulé)" },
                    ]}
                  />
                ) : null}
                {draft.format !== "league" ? (
                  <>
                    <ToggleField
                      label="Prolongation"
                      checked={draft.settings.extraTime}
                      onChange={value => patchSettings({ extraTime: value })}
                      hint="Quand le score est à égalité à la fin du temps réglementaire."
                    />
                    <ToggleField
                      label="Tirs au but"
                      checked={draft.settings.penalties}
                      onChange={value => patchSettings({ penalties: value })}
                      hint="Dernier recours pour désigner un vainqueur."
                    />
                  </>
                ) : null}
                {draft.format === "custom" ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="field">
                      Nombre de poules
                      <input className="input num" type="number" min={1} max={16} value={draft.settings.groupCount} onChange={event => patchSettings({ groupCount: Number(event.target.value) })} />
                    </label>
                    <label className="field">
                      Clubs par poule
                      <input className="input num" type="number" min={2} max={24} value={draft.settings.teamsPerGroup} onChange={event => patchSettings({ teamsPerGroup: Number(event.target.value) })} />
                    </label>
                    <label className="field">
                      Qualifiés par poule
                      <input className="input num" type="number" min={1} max={8} value={draft.settings.qualifyPerGroup} onChange={event => patchSettings({ qualifyPerGroup: Number(event.target.value) })} />
                    </label>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4">
                <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  Clubs engagés ({draft.clubIds.length})
                </p>
                <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {draftClubs.map(club => {
                    const engaged = draft.clubIds.includes(club.id);
                    return (
                      <button
                        key={club.id}
                        type="button"
                        onClick={() => toggleClub(club.id)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] transition ${
                          engaged ? "border-[rgba(200,255,61,0.45)] bg-[rgba(200,255,61,0.08)]" : "border-[var(--line)]"
                        }`}
                      >
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: club.primaryColor }} />
                        <span className="truncate">{club.name}</span>
                        <span className="num ml-auto text-[11px] text-[var(--muted)]">
                          {club.ratingMode === "advanced"
                            ? `${club.rating.defense}/${club.rating.midfield}/${club.rating.attack}`
                            : club.rating.overall}
                        </span>
                      </button>
                    );
                  })}
                  {draftClubs.length === 0 ? (
                    <p className="text-[13px] text-[var(--muted)]">Aucun club dans ce sport pour l'instant.</p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-4 rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4">
                <label className="field">
                  Graine de simulation
                  <div className="flex gap-2">
                    <input
                      className="input num"
                      type="number"
                      value={draft.settings.seed}
                      onChange={event => patchSettings({ seed: Number(event.target.value) })}
                    />
                    <Btn onClick={() => patchSettings({ seed: Math.floor(Math.random() * 100000) })}>Aléatoire</Btn>
                  </div>
                </label>
                <RangeField
                  label="Avantage du terrain"
                  value={Math.round(draft.settings.homeAdvantage * 100)}
                  onChange={value => patchSettings({ homeAdvantage: value / 100 })}
                  hint="0 % : terrain neutre. 35 % : l'écart le plus marqué."
                />
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4">
              <Notice tone="error">{error}</Notice>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <Btn variant="primary" onClick={() => void submit()} disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer et générer le calendrier"}
            </Btn>
            <Btn onClick={() => { setDraft(null); setError(null); }}>Annuler</Btn>
          </div>
        </Panel>
      ) : null}

      {competitions.length ? (
        <p className="text-[12px] text-[var(--muted)]">
          Dernière ouverture : {selectedId ? fmtDateTime(competitions.find(item => item.id === selectedId)?.updatedAt || 0) : "aucune compétition sélectionnée"}
        </p>
      ) : null}
    </div>
  );
}
