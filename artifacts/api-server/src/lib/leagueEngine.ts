/**
 * MOTEUR DE COMPÉTITION — LEAGUEMANAGER
 *
 * Tout est calculé ici, en local : aucune IA externe, aucun appel réseau.
 * Le hasard vient d'un générateur à graine (mulberry32) dérivé de l'identifiant
 * de la compétition et de celui du match. Deux simulations avec la même graine
 * et les mêmes équipes donnent exactement les mêmes scores — indispensable pour
 * qu'un résultat enregistré soit rejouable et vérifiable.
 *
 * Deux moteurs :
 *   - « fast »   : buts tirés d'une loi de Poisson pondérée par les notes
 *                  (instantané, pour les grosses compétitions) ;
 *   - « detail » : minute par minute — occasions, arrêts, buts, cartons,
 *                  blessures — plus riche, un peu plus lourd.
 */

export type Sport = "football" | "hockey";
export type RatingMode = "classic" | "advanced";
export type CompetitionFormat = "league" | "cup" | "custom";
export type Engine = "fast" | "detail";

export type ClubRating = {
  /** Note générale 0-100 (utilisée seule en mode classique). */
  overall: number;
  /** Compartiments 0-100 (utilisés en mode avancé). */
  attack: number;
  midfield: number;
  defense: number;
};

export type LeagueClub = {
  id: string;
  name: string;
  shortName: string;
  city: string;
  country: string;
  sport: Sport;
  logo?: string;
  primaryColor: string;
  secondaryColor: string;
  ratingMode: RatingMode;
  rating: ClubRating;
};

export type CompetitionSettings = {
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  /** Championnat : matchs aller/retour. */
  doubleRound: boolean;
  /** Coupe : 1 match sec ou 2 matchs (aller/retour, score cumulé). */
  legs: 1 | 2;
  extraTime: boolean;
  penalties: boolean;
  groupCount: number;
  teamsPerGroup: number;
  qualifyPerGroup: number;
  /** Graine de simulation : même graine = mêmes résultats. */
  seed: number;
  /** Avantage du terrain, 0 → aucun, 0.35 → fort. */
  homeAdvantage: number;
};

export type MatchEvent = {
  minute: number;
  type: "goal" | "shot" | "save" | "card" | "injury" | "penalty";
  clubId: string;
  label: string;
};

export type Fixture = {
  id: string;
  /** « Journée 3 », « Groupe A · J2 », « Quarts », « Finale »… */
  stage: string;
  round: number;
  group?: string;
  homeId: string;
  awayId: string | null;
  leg: number;
  played: boolean;
  homeScore: number | null;
  awayScore: number | null;
  homePens: number | null;
  awayPens: number | null;
  extraTime: boolean;
  events: MatchEvent[];
};

export type Competition = {
  id: string;
  name: string;
  sport: Sport;
  format: CompetitionFormat;
  settings: CompetitionSettings;
  clubIds: string[];
  fixtures: Fixture[];
  createdAt: number;
  updatedAt: number;
};

export type StandingRow = {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  diff: number;
  points: number;
  form: ("V" | "N" | "D")[];
};

/* ------------------------------------------------------------------ */
/* Hasard déterministe                                                 */
/* ------------------------------------------------------------------ */

function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

/** Loi de Poisson par la méthode de Knuth (λ petit : cas des scores sportifs). */
function poisson(rng: Rng, lambda: number): number {
  const l = Math.exp(-Math.max(0.05, lambda));
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > l && k < 25);
  return k - 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pick<T>(rng: Rng, list: T[]): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/* ------------------------------------------------------------------ */
/* Notes                                                              */
/* ------------------------------------------------------------------ */

/**
 * Notes effectives d'un club. En mode classique, la note générale est
 * déclinée sur les trois compartiments (attaque un peu au-dessus, défense
 * un peu en dessous) : le match reste lisible même si l'utilisateur n'a
 * rempli qu'un seul curseur.
 */
export function effectiveRatings(club: LeagueClub) {
  const overall = clamp(club.rating.overall, 0, 100);
  if (club.ratingMode === "advanced") {
    return {
      attack: clamp(club.rating.attack, 0, 100),
      midfield: clamp(club.rating.midfield, 0, 100),
      defense: clamp(club.rating.defense, 0, 100),
      overall,
    };
  }
  return {
    attack: clamp(overall + 3, 0, 100),
    midfield: overall,
    defense: clamp(overall - 3, 0, 100),
    overall,
  };
}

const BASE_GOALS: Record<Sport, number> = { football: 1.32, hockey: 3.1 };

/**
 * Espérance de buts d'une équipe face à une autre.
 * Le rapport attaque/défense est borné pour qu'une équipe très faible ne
 * prenne pas quinze buts à chaque match.
 */
function expectedGoals(
  attack: number,
  defense: number,
  home: boolean,
  settings: CompetitionSettings,
  sport: Sport,
) {
  const ratio = clamp(attack / Math.max(25, defense), 0.45, 2.1);
  const lambda = BASE_GOALS[sport] * Math.pow(ratio, 1.25);
  const homeFactor = home ? 1 + 0.16 * clamp(settings.homeAdvantage, 0, 1) : 1;
  return clamp(lambda * homeFactor, 0.15, sport === "hockey" ? 9 : 5.5);
}

function penaltyShootout(rng: Rng, homeAttack: number, awayAttack: number) {
  let home = 0;
  let away = 0;
  for (let i = 0; i < 5; i++) {
    if (rng() < 0.62 + homeAttack / 900) home++;
    if (rng() < 0.62 + awayAttack / 900) away++;
  }
  let guard = 0;
  while (home === away && guard < 12) {
    if (rng() < 0.6 + homeAttack / 900) home++;
    if (rng() < 0.6 + awayAttack / 900) away++;
    guard++;
  }
  if (home === away) home++;
  return { home, away };
}

/* ------------------------------------------------------------------ */
/* Moteur rapide (Poisson)                                             */
/* ------------------------------------------------------------------ */

export type MatchOutcome = {
  homeScore: number;
  awayScore: number;
  homePens: number | null;
  awayPens: number | null;
  extraTime: boolean;
  events: MatchEvent[];
};

export function simulateFast(
  rng: Rng,
  home: LeagueClub,
  away: LeagueClub,
  settings: CompetitionSettings,
  sport: Sport,
  knockout: boolean,
): MatchOutcome {
  const rh = effectiveRatings(home);
  const ra = effectiveRatings(away);
  let homeScore = poisson(rng, expectedGoals(rh.attack, ra.defense, true, settings, sport));
  let awayScore = poisson(rng, expectedGoals(ra.attack, rh.defense, false, settings, sport));
  let extraTime = false;
  let homePens: number | null = null;
  let awayPens: number | null = null;

  // En coupe, il faut un vainqueur : prolongation puis tirs au but.
  const mustDecide = knockout && settings.legs === 1;
  if (mustDecide && homeScore === awayScore) {
    if (settings.extraTime) {
      extraTime = true;
      const extra = sport === "hockey" ? 4 : 2;
      homeScore += poisson(rng, expectedGoals(rh.attack, ra.defense, true, settings, sport) * (extra / 20));
      awayScore += poisson(rng, expectedGoals(ra.attack, rh.defense, false, settings, sport) * (extra / 20));
    }
    if (homeScore === awayScore && settings.penalties) {
      const shootout = penaltyShootout(rng, rh.attack, ra.attack);
      homePens = shootout.home;
      awayPens = shootout.away;
    }
  }

  return { homeScore, awayScore, homePens, awayPens, extraTime, events: [] };
}

/* ------------------------------------------------------------------ */
/* Moteur détaillé (minute par minute)                                 */
/* ------------------------------------------------------------------ */

const FIRST_NAMES = ["Yanis", "Karim", "Emre", "Léa", "Deniz", "Sami", "Nour", "Elias", "Mina", "Tarik"];
const LAST_NAMES = ["Basturk", "Kaya", "Demir", "Yilmaz", "Aslan", "Aydin", "Cetin", "Dogan", "Erdem", "Sahin"];

function playerName(rng: Rng) {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
}

export function simulateDetail(
  rng: Rng,
  home: LeagueClub,
  away: LeagueClub,
  settings: CompetitionSettings,
  sport: Sport,
  knockout: boolean,
): MatchOutcome {
  const rh = effectiveRatings(home);
  const ra = effectiveRatings(away);
  const events: MatchEvent[] = [];
  let homeScore = 0;
  let awayScore = 0;

  const periods = sport === "hockey" ? [[1, 20], [21, 40], [41, 60]] : [[1, 45], [46, 90]];
  const totalMinutes = sport === "hockey" ? 60 : 90;

  for (const [from, to] of periods) {
    for (let minute = from; minute <= to; minute++) {
      // Possession : le milieu de terrain fait la différence, le terrain un peu.
      const midHome = rh.midfield * (1 + 0.05 * clamp(settings.homeAdvantage, 0, 1));
      const midAway = ra.midfield;
      const homeControl = midHome / Math.max(1, midHome + midAway);
      const attacking = rng() < homeControl;
      const atk = attacking ? rh.attack : ra.attack;
      const def = attacking ? ra.defense : rh.defense;
      const clubId = attacking ? home.id : away.id;

      const chance = clamp(0.06 + (atk - def) / 320, 0.02, 0.22) * (attacking ? 1.02 : 0.98);
      if (rng() > chance) continue;

      const conversion = clamp(0.1 + (atk - def) / 260, 0.03, 0.42) / (sport === "hockey" ? 1.5 : 1);
      const shooter = playerName(rng);
      if (rng() < conversion) {
        if (attacking) homeScore++;
        else awayScore++;
        events.push({
          minute,
          type: "goal",
          clubId,
          label: `But — ${shooter} (${attacking ? home.shortName : away.shortName})`,
        });
      } else if (rng() < 0.55) {
        events.push({ minute, type: "save", clubId, label: `Arrêt décisif sur ${shooter}` });
      } else {
        events.push({ minute, type: "shot", clubId, label: `Tir de ${shooter} à côté` });
      }

      if (rng() < 0.045) {
        events.push({
          minute,
          type: "card",
          clubId,
          label: `Carton jaune — ${playerName(rng)}`,
        });
      }
      if (rng() < 0.012) {
        events.push({ minute, type: "injury", clubId, label: `Blessure — ${playerName(rng)}` });
      }
    }
  }

  let extraTime = false;
  let homePens: number | null = null;
  let awayPens: number | null = null;
  const mustDecide = knockout && settings.legs === 1;

  if (mustDecide && homeScore === awayScore) {
    if (settings.extraTime) {
      extraTime = true;
      const minutes = sport === "hockey" ? 10 : 30;
      for (let minute = totalMinutes + 1; minute <= totalMinutes + minutes; minute++) {
        const homeChance = clamp(0.09 + (rh.attack - ra.defense) / 320, 0.03, 0.24);
        const awayChance = clamp(0.09 + (ra.attack - rh.defense) / 320, 0.03, 0.24);
        const roll = rng();
        if (roll < homeChance && rng() < 0.34) {
          homeScore++;
          events.push({
            minute,
            type: "goal",
            clubId: home.id,
            label: `But en prolongation — ${playerName(rng)} (${home.shortName})`,
          });
        } else if (roll > 1 - awayChance && rng() < 0.34) {
          awayScore++;
          events.push({
            minute,
            type: "goal",
            clubId: away.id,
            label: `But en prolongation — ${playerName(rng)} (${away.shortName})`,
          });
        }
      }
    }
    if (homeScore === awayScore && settings.penalties) {
      const shootout = penaltyShootout(rng, rh.attack, ra.attack);
      homePens = shootout.home;
      awayPens = shootout.away;
      events.push({
        minute: totalMinutes + (extraTime ? (sport === "hockey" ? 10 : 30) : 0) + 1,
        type: "penalty",
        clubId: homePens > awayPens ? home.id : away.id,
        label: `Tirs au but : ${homePens} - ${awayPens}`,
      });
    }
  }

  return { homeScore, awayScore, homePens, awayPens, extraTime, events };
}

/* ------------------------------------------------------------------ */
/* Calendriers                                                         */
/* ------------------------------------------------------------------ */

/** Algorithme du cercle : toutes les rencontres d'un championnat. */
function roundRobin(ids: string[], doubleRound: boolean): { round: number; homeId: string; awayId: string }[] {
  const pool = ids.slice();
  if (pool.length % 2 === 1) pool.push("__bye__");
  const size = pool.length;
  const rounds = size - 1;
  const half = size / 2;
  const games: { round: number; homeId: string; awayId: string }[] = [];
  let order = pool.slice();

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < half; i++) {
      const home = order[i];
      const away = order[size - 1 - i];
      if (home !== "__bye__" && away !== "__bye__") {
        // Alternance domicile/extérieur pour éviter qu'une équipe joue
        // toujours à la maison.
        const swap = (round + i) % 2 === 1;
        games.push({ round: round + 1, homeId: swap ? away : home, awayId: swap ? home : away });
      }
    }
    const fixed = order[0];
    const rest = order.slice(1);
    rest.unshift(rest.pop() as string);
    order = [fixed, ...rest];
  }

  if (doubleRound) {
    const retour = games.map(game => ({
      round: game.round + rounds,
      homeId: game.awayId,
      awayId: game.homeId,
    }));
    return [...games, ...retour];
  }
  return games;
}

function nextPowerOfTwo(n: number) {
  let value = 1;
  while (value < n) value *= 2;
  return value;
}

export function stageLabel(size: number): string {
  if (size === 2) return "Finale";
  if (size === 4) return "Demi-finales";
  if (size === 8) return "Quarts";
  if (size === 16) return "Huitièmes";
  if (size === 32) return "Seizièmes";
  return `Tour à ${size}`;
}

/**
 * Tableau à élimination directe.
 *
 * `seeded` (par défaut) : les mieux notés sont protégés — placement en
 * serpentin, donc 1er contre dernier, 2e contre avant-dernier, et les exempts
 * vont aux mieux classés.
 *
 * Sans tirage par tête de série (poules → phases finales), l'ordre reçu est
 * conservé tel quel : c'est lui qui porte le croisement des groupes.
 */
function buildBracket(clubs: LeagueClub[], ids: string[], round: number, group?: string, seeded = true): Fixture[] {
  const ranked = ids.slice().sort((a, b) => {
    const ca = clubs.find(club => club.id === a);
    const cb = clubs.find(club => club.id === b);
    return (cb ? effectiveRatings(cb).overall : 0) - (ca ? effectiveRatings(ca).overall : 0);
  });
  const size = nextPowerOfTwo(ranked.length);
  const slots: (string | null)[] = new Array(size).fill(null);
  if (seeded) {
    // Placement en serpentin : 1er contre dernier, 2e contre avant-dernier…
    ranked.forEach((id, index) => {
      const position = index % 2 === 0 ? index / 2 : size - 1 - (index - 1) / 2;
      slots[position] = id;
    });
  } else {
    ranked.forEach((id, index) => {
      slots[index] = id;
    });
  }

  const fixtures: Fixture[] = [];
  for (let i = 0; i < size / 2; i++) {
    const homeId = slots[i * 2];
    const awayId = slots[i * 2 + 1];
    if (!homeId && !awayId) continue;
    fixtures.push({
      id: `ko-${round}-${group ? `${group}-` : ""}${i}`,
      stage: group ? `${group} · ${stageLabel(size)}` : stageLabel(size),
      round,
      group,
      homeId: homeId || (awayId as string),
      awayId: homeId ? awayId : null,
      leg: 1,
      played: false,
      homeScore: null,
      awayScore: null,
      homePens: null,
      awayPens: null,
      extraTime: false,
      events: [],
    });
  }
  return fixtures;
}

/** Construit le calendrier complet d'une compétition neuve. */
export function buildSchedule(competition: Competition, clubs: LeagueClub[]): Fixture[] {
  const { format, settings, clubIds } = competition;

  if (format === "league") {
    return roundRobin(clubIds, settings.doubleRound).map((game, index) => ({
      id: `l-${index}`,
      stage: `Journée ${game.round}`,
      round: game.round,
      homeId: game.homeId,
      awayId: game.awayId,
      leg: 1,
      played: false,
      homeScore: null,
      awayScore: null,
      homePens: null,
      awayPens: null,
      extraTime: false,
      events: [],
    }));
  }

  if (format === "cup") {
    return buildBracket(clubs, clubIds, 1);
  }

  // Personnalisé : poules puis phases finales. Les clubs sont répartis en
  // serpentin selon leur note pour équilibrer les groupes.
  const groupCount = clamp(Math.round(settings.groupCount) || 2, 1, 16);
  const ranked = clubIds.slice().sort((a, b) => {
    const ca = clubs.find(club => club.id === a);
    const cb = clubs.find(club => club.id === b);
    return (cb ? effectiveRatings(cb).overall : 0) - (ca ? effectiveRatings(ca).overall : 0);
  });
  const groups: string[][] = Array.from({ length: groupCount }, () => [] as string[]);
  ranked.forEach((id, index) => {
    const column = index % groupCount;
    const row = Math.floor(index / groupCount);
    const target = row % 2 === 0 ? column : groupCount - 1 - column;
    groups[target].push(id);
  });

  const fixtures: Fixture[] = [];
  groups.forEach((members, groupIndex) => {
    const name = `Groupe ${String.fromCharCode(65 + groupIndex)}`;
    roundRobin(members, settings.doubleRound).forEach((game, index) => {
      fixtures.push({
        id: `g${groupIndex}-${index}`,
        stage: `${name} · J${game.round}`,
        round: game.round,
        group: name,
        homeId: game.homeId,
        awayId: game.awayId,
        leg: 1,
        played: false,
        homeScore: null,
        awayScore: null,
        homePens: null,
        awayPens: null,
        extraTime: false,
        events: [],
      });
    });
  });
  return fixtures;
}

/* ------------------------------------------------------------------ */
/* Classements et progression                                          */
/* ------------------------------------------------------------------ */

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

  const ordered = fixtures.slice().sort((a, b) => a.round - b.round);
  for (const fixture of ordered) {
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

/**
 * Vrai quand tous les matchs d'une étape sont joués. Les exempts (une seule
 * équipe, `awayId === null`) comptent comme résolus : sinon un tableau à six
 * clubs ne pourrait jamais passer des quarts aux demi-finales.
 */
function roundComplete(fixtures: Fixture[], round: number, group?: string) {
  const concerned = fixtures.filter(
    fixture => fixture.round === round && (group === undefined || fixture.group === group),
  );
  if (!concerned.length) return false;
  return concerned.every(fixture => fixture.played || !fixture.awayId);
}

/**
 * Après une vague de résultats, fabrique les tours suivants :
 *   - coupe : vainqueurs du tour → tour suivant ;
 *   - personnalisé : fin des poules → tableau final avec les qualifiés.
 * Renvoie true si le calendrier a changé.
 */
export function advanceCompetition(competition: Competition, clubs: LeagueClub[]): boolean {
  const { fixtures, settings, format } = competition;

  if (format === "cup") {
    return advanceKnockoutRounds(fixtures, clubs, 1);
  }

  if (format === "custom") {
    const groupFixtures = fixtures.filter(fixture => fixture.group);
    const groupNames = [...new Set(groupFixtures.map(fixture => fixture.group as string))];
    const groupRounds = Math.max(0, ...groupFixtures.map(fixture => fixture.round));
    const knockoutStarted = fixtures.some(fixture => !fixture.group);

    // Tableau final déjà lancé : on avance de tour en tour.
    if (knockoutStarted) return advanceKnockoutRounds(fixtures, clubs, groupRounds + 1);

    const allGroupsDone =
      groupNames.length > 0 && groupNames.every(name => roundComplete(fixtures, groupRounds, name));
    if (!allGroupsDone) return false;

    const perGroup: string[][] = [];
    for (const name of groupNames) {
      const members = [
        ...new Set(
          fixtures
            .filter(fixture => fixture.group === name)
            .flatMap(fixture => [fixture.homeId, fixture.awayId])
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const standings = computeStandings(members, fixtures.filter(f => f.group === name), settings);
      const take = clamp(Math.round(settings.qualifyPerGroup) || 2, 1, members.length);
      perGroup.push(standings.slice(0, take).map(row => row.clubId));
    }

    // Croisement des groupes : les premiers de chaque poule sont opposés aux
    // qualifiés des autres poules, jamais à un club de leur propre groupe.
    const maxRank = Math.max(...perGroup.map(group => group.length));
    const qualified: string[] = [];
    for (let rank = 0; rank < maxRank; rank++) {
      const row = perGroup.map(group => group[rank]).filter((id): id is string => Boolean(id));
      qualified.push(...(rank % 2 === 0 ? row : row.reverse()));
    }

    const startRound = groupRounds + 1;
    fixtures.push(...buildBracket(clubs, qualified, startRound, undefined, false));
    return true;
  }

  return false;
}

/**
 * Fait avancer un tableau à élimination directe : quand tous les matchs d'un
 * tour sont joués, le tour suivant est fabriqué avec les vainqueurs (et la
 * finale après les demi-finales). Renvoie true si le calendrier a changé.
 */
function advanceKnockoutRounds(fixtures: Fixture[], clubs: LeagueClub[], startRound: number): boolean {
  let round = startRound;
  let changed = false;
  while (roundComplete(fixtures, round)) {
    const winners = fixtures
      .filter(fixture => fixture.round === round)
      .map(fixture => winnerOf(fixture))
      .filter((id): id is string => Boolean(id));
    if (winners.length <= 1) break;
    const next = round + 1;
    if (fixtures.some(fixture => fixture.round === next)) {
      round = next;
      continue;
    }
    fixtures.push(...buildBracket(clubs, winners, next));
    changed = true;
    round = next;
  }
  return changed;
}

export function winnerOf(fixture: Fixture): string | null {
  // Exempt : l'équipe passe directement au tour suivant.
  if (!fixture.awayId) return fixture.homeId;
  if (!fixture.played || fixture.homeScore === null || fixture.awayScore === null) return null;
  if (fixture.homeScore > fixture.awayScore) return fixture.homeId;
  if (fixture.awayScore > fixture.homeScore) return fixture.awayId;
  if (fixture.homePens !== null && fixture.awayPens !== null) {
    return fixture.homePens > fixture.awayPens ? fixture.homeId : fixture.awayId;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Simulation d'une compétition                                        */
/* ------------------------------------------------------------------ */

export type SimulateOptions = {
  engine: Engine;
  /** Ne simule qu'une seule vague (une journée, un tour) quand true. */
  step?: boolean;
  /** Rejoue aussi les matchs déjà joués. */
  replay?: boolean;
};

/**
 * Joue les matchs en attente. Le calendrier avance tout seul : fin de poules →
 * tableau final, tour terminé → tour suivant.
 */
export function simulateCompetition(
  competition: Competition,
  clubs: LeagueClub[],
  options: SimulateOptions,
): number {
  const clubById = new Map(clubs.map(club => [club.id, club]));
  let played = 0;
  let guard = 0;

  const runWave = () => {
    const pending = competition.fixtures.filter(fixture => !fixture.played && fixture.awayId);
    if (options.replay) {
      for (const fixture of competition.fixtures) {
        if (fixture.awayId) {
          fixture.played = false;
          fixture.homeScore = null;
          fixture.awayScore = null;
          fixture.homePens = null;
          fixture.awayPens = null;
          fixture.extraTime = false;
          fixture.events = [];
        }
      }
    }
    const targets = options.replay
      ? competition.fixtures.filter(fixture => !fixture.played && fixture.awayId)
      : pending;
    if (options.step) {
      // Une seule « vague » : la journée (ou le tour) la plus basse encore en
      // attente — toutes les poules d'une même journée avancent ensemble.
      const currentRound = Math.min(...targets.map(fixture => fixture.round));
      for (const fixture of targets) {
        if (fixture.round !== currentRound) continue;
        playFixture(fixture, clubById, competition, options.engine);
        played++;
      }
    } else {
      for (const fixture of targets) {
        playFixture(fixture, clubById, competition, options.engine);
        played++;
      }
    }
  };

  runWave();
  while (advanceCompetition(competition, clubs) && !options.step && guard < 12) {
    guard++;
    runWave();
  }
  competition.updatedAt = Date.now();
  return played;
}

function playFixture(
  fixture: Fixture,
  clubById: Map<string, LeagueClub>,
  competition: Competition,
  engine: Engine,
) {
  if (!fixture.awayId) return;
  const home = clubById.get(fixture.homeId);
  const away = clubById.get(fixture.awayId);
  if (!home || !away) return;

  const knockout = competition.format !== "league";
  // Graine dérivée du match : rejouer un résultat donne exactement le même
  // score, même si le reste de la compétition a bougé.
  const rng = mulberry32(hashSeed(`${competition.id}|${fixture.id}|${competition.settings.seed}`));
  const outcome =
    engine === "detail"
      ? simulateDetail(rng, home, away, competition.settings, competition.sport, knockout)
      : simulateFast(rng, home, away, competition.settings, competition.sport, knockout);

  fixture.homeScore = outcome.homeScore;
  fixture.awayScore = outcome.awayScore;
  fixture.homePens = outcome.homePens;
  fixture.awayPens = outcome.awayPens;
  fixture.extraTime = outcome.extraTime;
  fixture.events = outcome.events;
  fixture.played = true;
}

export function makeRng(seed: string): Rng {
  return mulberry32(hashSeed(seed));
}
