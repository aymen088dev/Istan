/**
 * Outils d'équipe : répartition équilibrée en deux équipes et remise en
 * place des positions. Utilisés depuis les Options > Général > Outils.
 */

import { FOOTBALL_FORMATIONS, HOCKEY_FORMATIONS, type Player } from "@/lib/formations";

/** Ordre de tirage « serpent » : équilibré note par note (1-2-2-2-…). */
export function balancedTeams(players: Player[]): { a: Player[]; b: Player[] } {
  const sorted = [...players].sort((p, q) => (q.rating ?? 0) - (p.rating ?? 0));
  const a: Player[] = [];
  const b: Player[] = [];
  let turn = 0;
  let takeA = true;
  for (const player of sorted) {
    (takeA ? a : b).push(player);
    turn += 1;
    // 1er tour : 1 joueur chacun, puis 2 chacun en alternance stricte.
    if (turn % 2 === 0) takeA = !takeA;
    else if (turn > 2) takeA = !takeA;
  }
  return { a, b };
}

/** Tirage aléatoire reproductible mélangé avant l'équilibrage. */
export function shuffledBalancedTeams(players: Player[], seed = Date.now()): { a: Player[]; b: Player[] } {
  let state = seed >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = [...players];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return balancedTeams(pool);
}

/** Moyenne des notes d'une équipe (pour l'aperçu d'équilibre). */
export function averageRating(players: Player[]): number {
  if (players.length === 0) return 0;
  return Math.round((players.reduce((s, p) => s + (p.rating ?? 0), 0) / players.length) * 10) / 10;
}

/**
 * Remet chaque joueur exactement sur le slot de sa formation : le terrain
 * redevient parfaitement aligné après des déplacements libres.
 */
export function snapPlayersToFormation(
  players: Player[],
  formation: string,
  sport: "football" | "hockey",
): Player[] {
  const map = (sport === "football" ? FOOTBALL_FORMATIONS : HOCKEY_FORMATIONS) as Record<
    string,
    { positions: Array<{ x: number; y: number; label: string }> }
  >;
  const slots = map[formation]?.positions ?? [];
  if (slots.length === 0) return players;
  return players.map((player, index) => {
    const slot = slots[index % slots.length];
    return { ...player, x: slot.x, y: slot.y };
  });
}
