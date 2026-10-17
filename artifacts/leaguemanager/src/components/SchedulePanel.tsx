import { useMemo, useState } from "react";
import { fmtDateTime, fmtMinute, scoreText } from "@/lib/format";
import type { Club, CompetitionDetail, Engine, Fixture } from "@/lib/types";
import { Btn, Chip, EmptyState, Panel, SectionTitle } from "./ui";

function ClubLine({ club, align = "left" }: { club?: Club; align?: "left" | "right" }) {
  return (
    <span className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: club?.primaryColor || "#333" }} />
      <span className="truncate text-[13px]">{club?.name || "—"}</span>
    </span>
  );
}

function MatchRow({ fixture, clubById }: { fixture: Fixture; clubById: Map<string, Club> }) {
  const [open, setOpen] = useState(false);
  const home = clubById.get(fixture.homeId);
  const away = fixture.awayId ? clubById.get(fixture.awayId) : undefined;
  const events = fixture.events || [];

  return (
    <div className="rounded-xl border border-[var(--line)] bg-white/[0.02]">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3">
        <ClubLine club={home} />
        <div className="text-center">
          <span className="num rounded-lg bg-black/40 px-3 py-1 text-sm font-semibold">
            {fixture.awayId ? scoreText(fixture.homeScore, fixture.awayScore) : "exempt"}
          </span>
          <div className="mt-1 flex justify-center gap-1">
            {fixture.homePens !== null && fixture.awayPens !== null ? (
              <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--amber)]">
                TAB {fixture.homePens}-{fixture.awayPens}
              </span>
            ) : null}
            {fixture.extraTime ? (
              <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--cyan)]">AP</span>
            ) : null}
          </div>
        </div>
        <ClubLine club={away} align="right" />
      </div>
      {events.length ? (
        <div className="border-t border-[var(--line)] px-4 py-2">
          <button
            type="button"
            className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--text)]"
            onClick={() => setOpen(value => !value)}
          >
            {open ? "▾ Masquer le déroulé" : `▸ Déroulé du match (${events.length})`}
          </button>
          {open ? (
            <ul className="mt-2 flex flex-col gap-1">
              {events.slice(0, 24).map((event, index) => (
                <li key={`${event.minute}-${index}`} className="flex items-center gap-3 text-[12px]">
                  <span className="num w-10 shrink-0 text-[var(--muted)]">{fmtMinute(event.minute)}</span>
                  <span
                    className="text-[var(--muted)]"
                    style={{
                      color:
                        event.type === "goal"
                          ? "var(--lime)"
                          : event.type === "card"
                            ? "var(--amber)"
                            : event.type === "injury"
                              ? "var(--red)"
                              : "var(--muted)",
                    }}
                  >
                    {event.label}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function SchedulePanel({
  detail,
  engine,
  onEngine,
  onSimulate,
  onReset,
  busy,
  action,
}: {
  detail: CompetitionDetail;
  engine: Engine;
  onEngine: (engine: Engine) => void;
  onSimulate: (options: { step?: boolean; replay?: boolean }) => void;
  onReset: () => void;
  busy: boolean;
  action: string | null;
}) {
  const clubById = useMemo(() => new Map(detail.clubs.map(club => [club.id, club])), [detail.clubs]);

  const stages = useMemo(() => {
    const groups = new Map<string, Fixture[]>();
    for (const fixture of [...detail.fixtures].sort((a, b) => a.round - b.round)) {
      const list = groups.get(fixture.stage) || [];
      list.push(fixture);
      groups.set(fixture.stage, list);
    }
    return [...groups.entries()];
  }, [detail.fixtures]);

  const played = detail.fixtures.filter(fixture => fixture.played).length;
  const total = detail.fixtures.length;
  const nextPending = detail.fixtures.find(fixture => !fixture.played && fixture.awayId && !fixture.group);

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <SectionTitle
          eyebrow="Calendrier"
          title={`${played}/${total} matchs joués`}
          note="Le moteur rapide tire les scores d'une loi de Poisson pondérée par les notes ; le moteur détaillé joue minute par minute et garde le déroulé (buts, arrêts, cartons, blessures)."
        />

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Btn active={engine === "fast"} onClick={() => onEngine("fast")} disabled={busy}>
              ⚡ Rapide
            </Btn>
            <Btn active={engine === "detail"} onClick={() => onEngine("detail")} disabled={busy}>
              ⏱ Minute par minute
            </Btn>
          </div>
          <span className="mx-1 hidden h-6 w-px bg-[var(--line)] sm:block" />
          <Btn variant="primary" onClick={() => onSimulate({ step: true })} disabled={busy || played >= total}>
            {action === "step" ? "Simulation…" : "Journée suivante"}
          </Btn>
          <Btn onClick={() => onSimulate({})} disabled={busy || played >= total}>
            {action === "all" ? "Simulation…" : "Tout simuler"}
          </Btn>
          <Btn onClick={() => onSimulate({ replay: true })} disabled={busy}>
            {action === "replay" ? "Reprise…" : "Rejouer tout"}
          </Btn>
          <Btn
            variant="danger"
            onClick={() => {
              if (window.confirm("Réinitialiser le calendrier et effacer tous les résultats ?")) onReset();
            }}
            disabled={busy}
          >
            Réinitialiser
          </Btn>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Chip label="Graine" value={detail.settings.seed} />
          <Chip label="Terrain" value={`${Math.round(detail.settings.homeAdvantage * 100)} %`} />
          <Chip label="Points" value={`${detail.settings.pointsWin}/${detail.settings.pointsDraw}/${detail.settings.pointsLoss}`} />
          {nextPending ? <Chip label="Prochain" value={nextPending.stage} /> : null}
          <Chip label="Maj" value={fmtDateTime(detail.updatedAt)} />
        </div>
      </Panel>

      {total === 0 ? (
        <Panel>
          <EmptyState title="Calendrier vide" text="Enregistre la compétition avec au moins deux clubs pour générer les matchs." />
        </Panel>
      ) : null}

      {stages.map(([stage, fixtures]) => (
        <Panel key={stage}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            {stage}
            <span className="num text-[11px]">
              {fixtures.filter(fixture => fixture.played).length}/{fixtures.length}
            </span>
          </h3>
          <div className="flex flex-col gap-2">
            {fixtures.map(fixture => (
              <MatchRow key={fixture.id} fixture={fixture} clubById={clubById} />
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
