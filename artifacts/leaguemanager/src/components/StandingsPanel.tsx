import { useMemo, useState } from "react";
import { diffText, scoreText } from "@/lib/format";
import { computeStandings, groupMembers, groupNames, knockoutRounds, winnerOf } from "@/lib/standings";
import type { Club, CompetitionDetail, StandingRow } from "@/lib/types";
import { EmptyState, FormBadge, Panel, SectionTitle } from "./ui";

function StandingsTable({
  rows,
  clubById,
  qualify,
  title,
}: {
  rows: StandingRow[];
  clubById: Map<string, Club>;
  qualify?: number;
  title?: string;
}) {
  return (
    <div className="scroll-x">
      {title ? (
        <h3 className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{title}</h3>
      ) : null}
      <table className="table">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Club</th>
            <th className="num">J</th>
            <th className="num">V</th>
            <th className="num">N</th>
            <th className="num">D</th>
            <th className="num">BP</th>
            <th className="num">BC</th>
            <th className="num">Diff</th>
            <th className="num">Pts</th>
            <th>Forme</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const club = clubById.get(row.clubId);
            const qualified = qualify !== undefined && index < qualify;
            return (
              <tr key={row.clubId} style={qualified ? { background: "rgba(200,255,61,0.06)" } : undefined}>
                <td className="num text-[var(--muted)]">{index + 1}</td>
                <td>
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: club?.primaryColor || "#333" }} />
                    <span className="truncate">{club?.name || row.clubId}</span>
                  </span>
                </td>
                <td className="num">{row.played}</td>
                <td className="num">{row.won}</td>
                <td className="num">{row.drawn}</td>
                <td className="num">{row.lost}</td>
                <td className="num">{row.goalsFor}</td>
                <td className="num">{row.goalsAgainst}</td>
                <td className="num">{diffText(row.diff)}</td>
                <td className="num font-semibold">{row.points}</td>
                <td>
                  <span className="flex gap-1">
                    {row.form.slice(-5).map((result, formIndex) => (
                      <FormBadge key={`${row.clubId}-${formIndex}`} result={result} />
                    ))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Bracket({ detail, clubById }: { detail: CompetitionDetail; clubById: Map<string, Club> }) {
  const rounds = useMemo(() => knockoutRounds(detail.fixtures), [detail.fixtures]);
  if (!rounds.length) {
    return <EmptyState title="Pas encore de tableau" text="Les phases finales apparaissent dès que les poules sont terminées." />;
  }
  return (
    <div className="scroll-x">
      <div className="flex min-w-max gap-6">
        {rounds.map(round => (
          <div key={round.round} className="flex min-w-[260px] flex-1 flex-col gap-3">
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{round.stage}</h3>
            {round.fixtures.map(fixture => {
              const home = clubById.get(fixture.homeId);
              const away = fixture.awayId ? clubById.get(fixture.awayId) : undefined;
              const winner = winnerOf(fixture);
              const row = (club: Club | undefined, id: string) => (
                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={
                    winner === id
                      ? { background: "rgba(200,255,61,0.1)", color: "var(--text)" }
                      : { color: "var(--muted)" }
                  }
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: club?.primaryColor || "#333" }} />
                  <span className="truncate text-[13px]">{club?.name || "—"}</span>
                  <span className="num ml-auto text-[13px] font-semibold">
                    {fixture.played ? (id === fixture.homeId ? fixture.homeScore : fixture.awayScore) : "-"}
                  </span>
                </div>
              );
              return (
                <div key={fixture.id} className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-1.5">
                  {row(home, fixture.homeId)}
                  {fixture.awayId ? (
                    row(away, fixture.awayId)
                  ) : (
                    <div className="px-3 py-2 text-[12px] text-[var(--muted)]">exempt — passe directement</div>
                  )}
                  {fixture.homePens !== null && fixture.awayPens !== null ? (
                    <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.12em] text-[var(--amber)]">
                      Tirs au but {fixture.homePens}-{fixture.awayPens}
                    </p>
                  ) : null}
                  {fixture.extraTime ? (
                    <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.12em] text-[var(--cyan)]">Après prolongation</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StandingsPanel({ detail }: { detail: CompetitionDetail }) {
  const clubById = useMemo(() => new Map(detail.clubs.map(club => [club.id, club])), [detail.clubs]);
  const groups = useMemo(() => groupNames(detail.fixtures), [detail.fixtures]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const currentGroup = activeGroup && groups.includes(activeGroup) ? activeGroup : groups[0] || null;

  const globalRows = detail.standings;

  return (
    <div className="flex flex-col gap-6">
      {detail.format === "league" ? (
        <Panel>
          <SectionTitle
            eyebrow="Classement"
            title={detail.name}
            note={`${globalRows.reduce((sum, row) => sum + row.played, 0) / 2} matchs pris en compte · victoire ${detail.settings.pointsWin} pts, nul ${detail.settings.pointsDraw} pt.`}
          />
          {globalRows.some(row => row.played > 0) ? (
            <StandingsTable rows={globalRows} clubById={clubById} />
          ) : (
            <EmptyState title="Aucun match joué" text="Lance une simulation depuis l'onglet Calendrier pour remplir le classement." />
          )}
        </Panel>
      ) : null}

      {detail.format === "custom" ? (
        <Panel>
          <SectionTitle eyebrow="Poules" title="Classements de poule" note={`Les ${detail.settings.qualifyPerGroup} premiers de chaque poule passent au tableau final.`} />
          {groups.length ? (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {groups.map(group => (
                  <button
                    key={group}
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setActiveGroup(group)}
                    style={
                      currentGroup === group
                        ? { background: "var(--lime)", color: "#0a0b0d", borderColor: "transparent" }
                        : undefined
                    }
                  >
                    {group}
                  </button>
                ))}
              </div>
              {currentGroup ? (
                <StandingsTable
                  rows={computeStandings(groupMembers(detail.fixtures, currentGroup), detail.fixtures.filter(f => f.group === currentGroup), detail.settings)}
                  clubById={clubById}
                  qualify={detail.settings.qualifyPerGroup}
                  title={`${currentGroup} — les rangs surlignés sont qualifiés`}
                />
              ) : null}
            </>
          ) : (
            <EmptyState title="Poules non générées" text="Réinitialise le calendrier depuis l'onglet Calendrier pour répartir les clubs en poules." />
          )}
        </Panel>
      ) : null}

      {detail.format !== "league" ? (
        <Panel>
          <SectionTitle eyebrow="Phases finales" title="Tableau à élimination directe" note="Le vainqueur du tour passe au suivant ; en cas d'égalité, prolongation puis tirs au but selon les réglages." />
          <Bracket detail={detail} clubById={clubById} />
        </Panel>
      ) : null}
    </div>
  );
}
