import type { CompetitionSettings, Fixture, StandingRow } from "./types";

/**
 * Même règle que côté serveur : points, différence de buts, buts marqués,
 * puis ordre alphabétique. Utilisé pour les classements de poule et pour
 * l'export PNG, afin que l'écran et l'image disent exactement la même chose.
 */
export function computeStandings(
  clubIds: string[],
  fixtures: Fixture[],
  settings: CompetitionSettings,
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const id of clubIds) {
    rows.set(id, {
      clubId: id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      diff: 0,
      points: 0,
      form: [],
    });
  }

  for (const fixture of [...fixtures].sort((a, b) => a.round - b.round)) {
    if (!fixture.played || fixture.homeScore === null || fixture.awayScore === null || !fixture.awayId) continue;
    const home = rows.get(fixture.homeId);
    const away = rows.get(fixture.awayId);
    if (!home || !away) continue;
    home.played++;
    away.played++;
    home.goalsFor += fixture.homeScore;
    home.goalsAgainst += fixture.awayScore;
    away.goalsFor += fixture.awayScore;
    away.goalsAgainst += fixture.homeScore;

    if (fixture.homeScore > fixture.awayScore) {
      home.won++;
      away.lost++;
      home.points += settings.pointsWin;
      away.points += settings.pointsLoss;
      home.form.push("V");
      away.form.push("D");
    } else if (fixture.homeScore < fixture.awayScore) {
      away.won++;
      home.lost++;
      away.points += settings.pointsWin;
      home.points += settings.pointsLoss;
      away.form.push("V");
      home.form.push("D");
    } else {
      home.drawn++;
      away.drawn++;
      home.points += settings.pointsDraw;
      away.points += settings.pointsDraw;
      home.form.push("N");
      away.form.push("N");
    }
  }

  const list = [...rows.values()];
  for (const row of list) row.diff = row.goalsFor - row.goalsAgainst;
  return list.sort(
    (a, b) => b.points - a.points || b.diff - a.diff || b.goalsFor - a.goalsFor || a.clubId.localeCompare(b.clubId),
  );
}

/** Clubs présents dans une poule donnée, déduits de ses matchs. */
export function groupMembers(fixtures: Fixture[], group: string): string[] {
  return [
    ...new Set(
      fixtures
        .filter(fixture => fixture.group === group)
        .flatMap(fixture => [fixture.homeId, fixture.awayId])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

export function groupNames(fixtures: Fixture[]): string[] {
  return [...new Set(fixtures.filter(fixture => fixture.group).map(fixture => fixture.group as string))].sort();
}

/** Vainqueur d'un match (tirs au but inclus). */
export function winnerOf(fixture: Fixture): string | null {
  if (!fixture.awayId) return fixture.homeId;
  if (!fixture.played || fixture.homeScore === null || fixture.awayScore === null) return null;
  if (fixture.homeScore > fixture.awayScore) return fixture.homeId;
  if (fixture.awayScore > fixture.homeScore) return fixture.awayId;
  if (fixture.homePens !== null && fixture.awayPens !== null) {
    return fixture.homePens > fixture.awayPens ? fixture.homeId : fixture.awayId;
  }
  return null;
}

/** Tours du tableau final, du premier au dernier. */
export function knockoutRounds(fixtures: Fixture[]): { round: number; stage: string; fixtures: Fixture[] }[] {
  const knockout = fixtures.filter(fixture => !fixture.group);
  const rounds = [...new Set(knockout.map(fixture => fixture.round))].sort((a, b) => a - b);
  return rounds.map(round => {
    const list = knockout.filter(fixture => fixture.round === round);
    return { round, stage: list[0]?.stage || `Tour ${round}`, fixtures: list };
  });
}
