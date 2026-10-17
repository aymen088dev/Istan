/**
 * Simulateur de match déterministe.
 *
 * Le score dépend uniquement des notes des joueurs alignés (avec bonus
 * capitaine) et d'une graine dérivée des noms des deux équipes : la même
 * composition rejouée donne toujours le même résultat, donc les utilisateurs
 * peuvent comparer des XI sans effet de hasard non reproductible.
 */

export type SimPlayer = {
  id: string;
  name: string;
  rating: number;
  position?: string;
  isCaptain?: boolean;
};

export type SimGoal = { minute: number; side: "home" | "away"; scorer: string };

export type SimStats = {
  possessionHome: number;
  shotsHome: number;
  shotsAway: number;
  passAccuracyHome: number;
  passAccuracyAway: number;
};

export type MatchResult = {
  seed: string;
  scoreHome: number;
  scoreAway: number;
  goals: SimGoal[];
  mvp: string;
  mvpRating: number;
  teamRatingHome: number;
  teamRatingAway: number;
  stats: SimStats;
};

function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** PRNG mulberry32 : sequence reproductible depuis une graine. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Moyenne des notes pondérée, le gardien comptant à part. */
function teamStrength(players: SimPlayer[]): number {
  if (players.length === 0) return 40;
  const rated = players.map(p => Math.max(1, Math.min(99, p.rating)) + (p.isCaptain ? 1.5 : 0));
  return rated.reduce((sum, v) => sum + v, 0) / rated.length;
}

export function simulateMatch(
  home: { name: string; players: SimPlayer[] },
  away: { name: string; players: SimPlayer[] },
  seedExtra = "",
): MatchResult {
  const seed = hashSeed(`${home.name}|${away.name}|${seedExtra}`);
  const rand = mulberry32(seed);

  const strengthHome = teamStrength(home.players);
  const strengthAway = teamStrength(away.players);

  // Force relative -> espérance de buts (calibrée pour des scores réalistes).
  const diff = (strengthHome - strengthAway) / 30;
  const expectedHome = Math.max(0.25, 1.45 + diff);
  const expectedAway = Math.max(0.25, 1.45 - diff);

  // Buts : le nombre suit une loi de Poisson approchée par inversion.
  const poisson = (lambda: number) => {
    const limit = Math.exp(-lambda);
    let k = 0;
    let product = rand();
    while (product > limit && k < 9) {
      product *= rand();
      k++;
    }
    return k;
  };

  const scoreHome = poisson(expectedHome);
  const scoreAway = poisson(expectedAway);

  // Scorer : pondéré par la note (les meilleurs marquent plus).
  const pickScorer = (players: SimPlayer[], side: "home" | "away"): SimGoal => {
    const scorers = players.filter(p => !/gardien|gk|goalkeeper/i.test(p.position ?? ""));
    const pool = scorers.length > 0 ? scorers : players;
    const weights = pool.map(p => Math.pow(Math.max(1, p.rating), 6));
    const total = weights.reduce((s, w) => s + w, 0);
    let roll = rand() * total;
    let chosen = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { chosen = pool[i]; break; }
    }
    return { minute: 1 + Math.floor(rand() * 90), side, scorer: chosen.name };
  };

  const goals: SimGoal[] = [
    ...Array.from({ length: scoreHome }, () => pickScorer(home.players, "home" as const)),
    ...Array.from({ length: scoreAway }, () => pickScorer(away.players, "away" as const)),
  ].sort((a, b) => a.minute - b.minute);

  // MVP : meilleure note du match, bonus pour les buteurs.
  const mvpBoost = new Map<string, number>();
  for (const goal of goals) mvpBoost.set(goal.scorer, (mvpBoost.get(goal.scorer) ?? 0) + 1.2);
  const mvpCandidate = [...home.players, ...away.players]
    .map(p => ({ name: p.name, score: Math.max(1, p.rating) + (mvpBoost.get(p.name) ?? 0) }))
    .sort((a, b) => b.score - a.score)[0];

  const possessionHome = Math.round(
    50 + Math.max(-28, Math.min(28, (strengthHome - strengthAway) * 0.85)),
  );
  const shotsBase = 6 + Math.round(strengthHome / 12);
  const stats: SimStats = {
    possessionHome,
    shotsHome: scoreHome + 2 + Math.round(rand() * shotsBase),
    shotsAway: scoreAway + 2 + Math.round(rand() * shotsBase),
    passAccuracyHome: Math.min(97, 62 + Math.round(strengthHome * 0.34) + Math.round(rand() * 4)),
    passAccuracyAway: Math.min(97, 62 + Math.round(strengthAway * 0.34) + Math.round(rand() * 4)),
  };

  return {
    seed: seed.toString(36),
    scoreHome,
    scoreAway,
    goals,
    mvp: mvpCandidate?.name ?? "—",
    mvpRating: Math.min(10, Math.round(((mvpCandidate?.score ?? 6) / 10) * 10) / 10),
    teamRatingHome: Math.round(strengthHome * 10) / 10,
    teamRatingAway: Math.round(strengthAway * 10) / 10,
    stats,
  };
}
