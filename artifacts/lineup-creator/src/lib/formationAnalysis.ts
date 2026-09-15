import footballRules from "@/data/formation-analysis/football.json";
import hockeyRules from "@/data/formation-analysis/hockey.json";

export type AnalysisSport = "football" | "hockey";
export type FormationSlot = { x: number; y: number; label: string };
export type FormationDefinition = { positions: FormationSlot[] };
export type FormationMap = Record<string, FormationDefinition>;
export type AnalysisPlayer = {
  id: string;
  name: string;
  rating: number;
  position: string;
  number?: string;
  nationality?: string;
};

/** Normalise les joueurs provenant du JSON/API avant toute analyse de poste. */
export function normalizeAnalysisPlayer(value: Partial<AnalysisPlayer>, index: number): AnalysisPlayer {
  const rating = Number(value.rating);
  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : `analysis-player-${index}`,
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : `Joueur ${index + 1}`,
    position: typeof value.position === "string" ? value.position.trim() : "",
    rating: Number.isFinite(rating) ? Math.max(1, Math.min(99, rating)) : 75,
    number: typeof value.number === "string" ? value.number : undefined,
    nationality: typeof value.nationality === "string" ? value.nationality : undefined,
  };
}

export type PositionRole =
  | "goalkeeper"
  | "central-defender"
  | "fullback"
  | "defender"
  | "defensive-mid"
  | "midfielder"
  | "attacking-mid"
  | "wing"
  | "center"
  | "forward"
  | "striker"
  | "unknown";

export type PositionProfile = { role: PositionRole; side?: "left" | "right" };

export type SlotAnalysis = {
  index: number;
  label: string;
  role: PositionRole;
  side?: "left" | "right";
  bestFit: number;
  recommendedPlayerId?: string;
  recommendedPlayerName?: string;
  recommendation: "excellent" | "good" | "adaptation" | "missing";
};

export type FormationAnalysis = {
  formation: string;
  sport: AnalysisSport;
  playerCount: number;
  averageFit: number;
  exactPostes: number;
  adaptations: number;
  missingPostes: number;
  goalkeeperReady: boolean;
  slots: SlotAnalysis[];
  warnings: string[];
};

export type RosterDiagnosis = {
  total: number;
  goalkeepers: number;
  defenders: number;
  midfielders: number;
  attackers: number;
  unknownPositions: string[];
  duplicateNumbers: string[];
  warnings: string[];
};

const RULES = {
  football: footballRules,
  hockey: hockeyRules,
} as const;

function clean(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[_./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string) {
  return clean(value).replace(/\s/g, "");
}

function includes(value: string, aliases: readonly string[]) {
  const normalized = clean(value);
  const short = normalized.replace(/\s/g, "");
  return aliases.some(alias => {
    const normalizedAlias = clean(alias);
    return normalized === normalizedAlias || short === normalizedAlias.replace(/\s/g, "");
  });
}

export function profilePlayerPosition(value: string, sport: AnalysisSport): PositionProfile {
  const position = clean(value);
  const key = compact(value);
  const rules = RULES[sport].roles as Record<string, readonly string[]>;

  if (includes(position, [...rules.goalkeeper, "GARDIEN DE BUT", "KEEPER"])) return { role: "goalkeeper" };
  if (sport === "hockey") {
    if (includes(position, ["DG", "LD", "LEFT DEFENSE", "LEFT DEFENCEMAN", "DÉFENSEUR GAUCHE"])) return { role: "defender", side: "left" };
    if (includes(position, ["DD", "RD", "RIGHT DEFENSE", "RIGHT DEFENCEMAN", "DÉFENSEUR DROIT"])) return { role: "defender", side: "right" };
    if (includes(position, rules.defender)) return { role: "defender" };
    if (includes(position, rules.center)) return { role: "center" };
    if (includes(position, ["AG", "LW", "LEFT WING", "LEFT WINGER", "AILIER GAUCHE", "AILE GAUCHE"])) return { role: "wing", side: "left" };
    if (includes(position, ["AD", "RW", "RIGHT WING", "RIGHT WINGER", "AILIER DROIT", "AILE DROITE"])) return { role: "wing", side: "right" };
    if (includes(position, rules.forward)) return { role: "forward" };
    return { role: "unknown" };
  }

  if (includes(position, ["DG", "LB", "LWB", "LEFT BACK", "LEFT WING BACK", "ARRIERE GAUCHE", "LATERAL GAUCHE", "LATÉRAL GAUCHE"]) || (position.includes("ARRIERE") || position.includes("LATERAL")) && position.includes("GAUCHE")) return { role: "fullback", side: "left" };
  if (includes(position, ["DD", "RB", "RWB", "RIGHT BACK", "RIGHT WING BACK", "ARRIERE DROIT", "LATERAL DROIT", "LATÉRAL DROIT"]) || (position.includes("ARRIERE") || position.includes("LATERAL")) && position.includes("DROIT")) return { role: "fullback", side: "right" };
  if (includes(position, rules["central-defender"])) return { role: "central-defender" };
  if (includes(position, ["DÉFENSEUR CENTRAL", "CENTRAL DEFENDER", "STOPPEUR"])) return { role: "central-defender" };
  if (includes(position, rules.defender) || position.includes("DEFENSEUR") || position.includes("DEFENSEURE")) return { role: "defender" };
  if ((position.includes("ARRIERE") || position.includes("LATERAL")) && !position.includes("GAUCHE") && !position.includes("DROIT")) return { role: "fullback" };
  if (includes(position, rules["defensive-mid"]) || position.includes("MILIEU DEFENSIF")) return { role: "defensive-mid" };
  if (includes(position, ["MOG", "LEFT ATTACKING MIDFIELDER", "MILIEU OFFENSIF GAUCHE"]) || position.includes("MILIEU OFFENSIF GAUCHE")) return { role: "attacking-mid", side: "left" };
  if (includes(position, ["MOD", "RIGHT ATTACKING MIDFIELDER", "MILIEU OFFENSIF DROIT"]) || position.includes("MILIEU OFFENSIF DROIT")) return { role: "attacking-mid", side: "right" };
  if (includes(position, ["MG", "LM", "LEFT MIDFIELDER", "LEFT MID", "MILIEU GAUCHE"])) return { role: "midfielder", side: "left" };
  if (includes(position, ["MD", "RM", "RIGHT MIDFIELDER", "RIGHT MID", "MILIEU DROIT"])) return { role: "midfielder", side: "right" };
  if (includes(position, rules["attacking-mid"])) return { role: "attacking-mid" };
  if (includes(position, rules.midfielder) || position.includes("MILIEU RELAYEUR") || position === "MILIEU CENTRAL") return { role: "midfielder" };
  if (includes(position, ["AG", "LW", "LEFT WINGER", "LEFT WING", "AILIER GAUCHE", "AILE GAUCHE"]) || position.includes("AILIER GAUCHE") || position.includes("AILIERE GAUCHE") || position.includes("AILE GAUCHE")) return { role: "wing", side: "left" };
  if (includes(position, ["AD", "RW", "RIGHT WINGER", "RIGHT WING", "AILIER DROIT", "AILE DROITE"]) || position.includes("AILIER DROIT") || position.includes("AILIERE DROITE") || position.includes("AILE DROITE")) return { role: "wing", side: "right" };
  if (position === "AILIER" || position === "AILIERE") return { role: "wing" };
  if (includes(position, rules.striker)) return { role: "striker" };
  if (includes(position, ["AVANT CENTRE", "AVANT-CENTRE", "CENTRE AVANT"]) || position.includes("AVANT CENTRE")) return { role: "striker" };
  if (includes(position, rules.forward)) return { role: "forward" };
  return { role: "unknown" };
}

export function profileFormationSlot(slot: FormationSlot, sport: AnalysisSport): PositionProfile {
  const label = clean(slot.label);
  const key = compact(slot.label);
  if (sport === "hockey") return profilePlayerPosition(label, sport);
  if (key === "AG" && slot.y > 50) return { role: "fullback", side: "left" };
  if (key === "AD" && slot.y > 50) return { role: "fullback", side: "right" };
  if (key === "LAT") return { role: "fullback", side: slot.x < 50 ? "left" : "right" };
  if (key === "PG") return { role: "fullback", side: "left" };
  if (key === "PD") return { role: "fullback", side: "right" };
  if (key === "PISTON") return { role: "fullback", side: slot.x < 50 ? "left" : "right" };
  if (key === "LIBERO") return { role: "central-defender" };
  if (key === "MOG") return { role: "attacking-mid", side: "left" };
  if (key === "MOD") return { role: "attacking-mid", side: "right" };
  if (key === "FN") return { role: "forward" };
  if (key === "AG") return { role: "wing", side: "left" };
  if (key === "AD") return { role: "wing", side: "right" };
  if (key === "MG") return { role: "midfielder", side: "left" };
  if (key === "MD") return { role: "midfielder", side: "right" };
  return profilePlayerPosition(label, sport);
}

export function positionScore(slot: FormationSlot, player: AnalysisPlayer, sport: AnalysisSport) {
  const wanted = profileFormationSlot(slot, sport);
  const actual = profilePlayerPosition(player.position, sport);
  if (actual.role === "goalkeeper") return wanted.role === "goalkeeper" ? 100 : 0;
  if (wanted.role === "goalkeeper") return 0;
  if (wanted.role === actual.role) {
    if (wanted.side && actual.side) return wanted.side === actual.side ? 100 : 72;
    if (wanted.side && !actual.side) return 88;
    return 96;
  }
  if (sport === "hockey") {
    if (wanted.role === "defender" && actual.role === "defender") return wanted.side && actual.side && wanted.side !== actual.side ? 76 : 88;
    if (wanted.role === "center" && ["center", "forward"].includes(actual.role)) return actual.role === "center" ? 94 : 76;
    if ((wanted.role === "wing" || wanted.role === "forward") && ["wing", "center", "forward"].includes(actual.role)) return actual.role === "wing" ? 86 : 74;
    // Un poste inconnu ne doit jamais être considéré comme compatible : cela
    // envoyait les joueurs mal renseignés sur n'importe quel poste libre.
    return 0;
  }
  if (wanted.role === "central-defender" && ["central-defender", "defender", "fullback"].includes(actual.role)) return actual.role === "fullback" ? 62 : 88;
  if (wanted.role === "fullback" && ["defender", "midfielder", "wing"].includes(actual.role)) return actual.role === "defender" ? 82 : actual.role === "wing" ? 58 : 46;
  if (wanted.role === "defensive-mid" && ["midfielder", "attacking-mid", "central-defender"].includes(actual.role)) return actual.role === "midfielder" ? 78 : 58;
  if (wanted.role === "midfielder" && ["defensive-mid", "attacking-mid", "wing"].includes(actual.role)) return 78;
  if (wanted.role === "attacking-mid" && ["midfielder", "forward", "striker", "wing"].includes(actual.role)) return actual.role === "midfielder" ? 78 : 66;
  if (wanted.role === "wing" && ["midfielder", "forward", "striker", "attacking-mid"].includes(actual.role)) return actual.role === "midfielder" ? 72 : 62;
  if (wanted.role === "forward" && ["attacking-mid", "striker", "wing"].includes(actual.role)) return actual.role === "striker" ? 82 : 68;
  if (wanted.role === "striker" && ["forward", "wing", "attacking-mid"].includes(actual.role)) return actual.role === "forward" ? 82 : 60;
  // Les postes inconnus restent libres plutôt que de produire un placement
  // visuellement plausible mais tactiquement faux.
  return 0;
}

function assignmentValue(slot: FormationSlot, player: AnalysisPlayer, sport: AnalysisSport) {
  return positionScore(slot, player, sport) * 0.72 + Math.max(0, Math.min(100, player.rating)) * 0.28;
}

function optimizeAssignment(
  slots: FormationSlot[],
  players: AnalysisPlayer[],
  sport: AnalysisSport,
  aiPriority?: ReadonlyMap<string, number>,
) {
  const used = new Set<string>();
  const assignment = new Map<number, AnalysisPlayer>();
  // Règle absolue : un joueur n'est JAMAIS placé sur un poste incompatible
  // (score 0). Concrètement, aucun joueur de champ ne finit au but et aucun
  // gardien ne finit sur le terrain. Un poste sans joueur compatible reste
  // simplement vide (affiché "Libre") plutôt que mal occupé.
  const isCompatible = (slot: FormationSlot, player: AnalysisPlayer) => positionScore(slot, player, sport) > 0;
  const ordered = slots.map((slot, index) => ({
    slot,
    index,
    options: players.filter(player => isCompatible(slot, player)).length,
  })).sort((a, b) => a.options - b.options || b.slot.y - a.slot.y);

  for (const { slot, index } of ordered) {
    const choice = players
      .filter(player => !used.has(player.id) && isCompatible(slot, player))
      .sort((a, b) => {
        const valueDifference = assignmentValue(slot, b, sport) - assignmentValue(slot, a, sport);
        if (valueDifference !== 0) return valueDifference;
        return (aiPriority?.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (aiPriority?.get(b.id) ?? Number.MAX_SAFE_INTEGER);
      })[0];
    if (choice) {
      used.add(choice.id);
      assignment.set(index, choice);
    }
  }

  // Passes "pas de poste vide" : quand l'effectif compte assez de joueurs de
  // champ pour couvrir tous les slots non-gardien, chaque poste doit recevoir
  // quelqu'un de compatible ou, à défaut, le joueur de champ restant le plus
  // proche (jamais un gardien déplacé). Un joueur déplacé doit toujours
  // améliorer la compatibilité globale du XI.
  const fieldSlots = ordered
    .filter(({ slot }) => profileFormationSlot(slot, sport).role !== "goalkeeper")
    .map(({ index }) => index);
  const fieldPlayers = players.filter(player => profilePlayerPosition(player.position, sport).role !== "goalkeeper");
  const needsRepair = fieldSlots.length <= fieldPlayers.length
    ? fieldSlots.filter(index => !assignment.has(index))
    : [];
  if (needsRepair.length > 0) {
    const unfilled = new Set(needsRepair);
    for (const index of needsRepair) {
      const slot = slots[index];
      // 1) Un joueur compatible non encore placé ?
      const compatible = fieldPlayers
        .filter(player => !used.has(player.id) && isCompatible(slot, player))
        .sort((a, b) => assignmentValue(slot, b, sport) - assignmentValue(slot, a, sport))[0];
      if (compatible) {
        used.add(compatible.id);
        assignment.set(index, compatible);
        unfilled.delete(index);
        continue;
      }
      // 2) Sinon : échange contre le pire joueur de champ déjà placé, si cela
      // améliore la compatibilité totale (score de poste + note) et que ce
      // joueur reste compatible avec le poste à remplir.
      const swap = fieldPlayers
        .filter(player => ![...assignment.values()].some(assigned => assigned.id === player.id))
        .filter(player => isCompatible(slot, player))
        .sort((a, b) => b.rating - a.rating)[0]
        ?? [...assignment.entries()]
          .filter(([candidateIndex]) => fieldSlots.includes(candidateIndex))
          .sort((a, b) =>
            (positionScore(slots[a[0]], a[1], sport) + a[1].rating)
            - (positionScore(slots[b[0]], b[1], sport) + b[1].rating),
          )[0]?.[1];
      if (!swap) continue;
      const currentIndex = [...assignment.entries()].find(([, player]) => player.id === swap.id)?.[0];
      const gainHere = assignmentValue(slot, swap, sport);
      const lossThere = currentIndex === undefined
        ? 0
        : assignmentValue(slots[currentIndex], swap, sport);
      if (currentIndex !== undefined && gainHere <= lossThere) continue;
      if (currentIndex !== undefined) assignment.delete(currentIndex);
      used.add(swap.id);
      assignment.set(index, swap);
      unfilled.delete(index);
    }
    // Les slots vidés par l'échange sont re-remplis avec les restants
    // compatibles uniquement.
    const leftovers = fieldPlayers.filter(player => !used.has(player.id));
    for (const index of unfilled) {
      const slot = slots[index];
      const choice = leftovers
        .filter(player => isCompatible(slot, player))
        .sort((a, b) => assignmentValue(slot, b, sport) - assignmentValue(slot, a, sport))[0];
      if (choice) {
        used.add(choice.id);
        assignment.set(index, choice);
      }
    }
  }

  // Repair the greedy result with swaps. This catches the common case where
  // a versatile player took a slot needed by a specialist.
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const { slot, index } of ordered) {
      const current = assignment.get(index);
      if (!current) continue;
      for (const candidate of players) {
        if (candidate.id === current.id) continue;
        // Jamais de candidat incompatible (score 0), sinon un gardien ou un
        // joueur hors poste pourrait être réintroduit par l'affinage.
        if (!isCompatible(slot, candidate)) continue;
        const otherIndex = [...assignment.entries()].find(([, player]) => player.id === candidate.id)?.[0];
        const currentValue = assignmentValue(slot, current, sport);
        const candidateValue = assignmentValue(slot, candidate, sport);
        if (candidateValue <= currentValue + 1) continue;
        if (otherIndex === undefined) {
          assignment.set(index, candidate);
          changed = true;
          break;
        }
        const otherSlot = slots[otherIndex];
        const otherValueBefore = assignmentValue(otherSlot, candidate, sport);
        const otherValueAfter = assignmentValue(otherSlot, current, sport);
        if (candidateValue + otherValueAfter > currentValue + otherValueBefore + 1) {
          assignment.set(index, candidate);
          assignment.set(otherIndex, current);
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
  return assignment;
}

export function analyzeFormation(
  formation: string,
  definition: FormationDefinition,
  players: AnalysisPlayer[],
  sport: AnalysisSport,
  aiPriority?: ReadonlyMap<string, number>,
): FormationAnalysis {
  const assignment = optimizeAssignment(definition.positions, players, sport, aiPriority);
  const slots = definition.positions.map((slot, index) => {
    const role = profileFormationSlot(slot, sport);
    const player = assignment.get(index);
    const fit = player ? positionScore(slot, player, sport) : 0;
    return {
      index,
      label: slot.label,
      role: role.role,
      side: role.side,
      bestFit: fit,
      recommendedPlayerId: player?.id,
      recommendedPlayerName: player?.name,
      recommendation: !player ? "missing" : fit >= 90 ? "excellent" : fit >= 70 ? "good" : "adaptation",
    } satisfies SlotAnalysis;
  });
  const averageFit = slots.length ? Math.round(slots.reduce((sum, slot) => sum + slot.bestFit, 0) / slots.length) : 0;
  const exactPostes = slots.filter(slot => slot.bestFit >= 90).length;
  const adaptations = slots.filter(slot => slot.bestFit > 0 && slot.bestFit < 90).length;
  const missingPostes = slots.filter(slot => slot.bestFit === 0).length;
  const goalkeeperReady = slots.some(slot => slot.role === "goalkeeper" && slot.bestFit >= 90);
  const warnings: string[] = [];
  if (!goalkeeperReady) warnings.push("Aucun gardien naturel n'est correctement affecté.");
  if (missingPostes > 0) warnings.push(`${missingPostes} poste${missingPostes > 1 ? "s" : ""} sans joueur compatible.`);
  if (adaptations > 0) warnings.push(`${adaptations} adaptation${adaptations > 1 ? "s" : ""} de poste à surveiller.`);
  return { formation, sport, playerCount: players.length, averageFit, exactPostes, adaptations, missingPostes, goalkeeperReady, slots, warnings };
}

export function diagnoseRoster(players: Array<Partial<AnalysisPlayer>>, sport: AnalysisSport): RosterDiagnosis {
  const normalized = players.map((player, index) => normalizeAnalysisPlayer(player, index));
  const counts = { goalkeepers: 0, defenders: 0, midfielders: 0, attackers: 0 };
  const unknown = new Set<string>();
  const numbers = new Map<string, number>();

  for (const player of normalized) {
    const profile = profilePlayerPosition(player.position, sport);
    if (profile.role === "goalkeeper") counts.goalkeepers += 1;
    else if (["central-defender", "fullback", "defender"].includes(profile.role)) counts.defenders += 1;
    else if (["defensive-mid", "midfielder", "attacking-mid"].includes(profile.role)) counts.midfielders += 1;
    else if (["wing", "center", "forward", "striker"].includes(profile.role)) counts.attackers += 1;
    else if (player.position.trim()) unknown.add(player.position.trim());
    const number = player.number?.trim();
    if (number) numbers.set(number, (numbers.get(number) ?? 0) + 1);
  }

  const duplicateNumbers = [...numbers.entries()].filter(([, count]) => count > 1).map(([number]) => number);
  const warnings: string[] = [];
  if (sport === "football" && counts.goalkeepers === 0) warnings.push("Aucun gardien");
  if (unknown.size > 0) warnings.push(`${unknown.size} poste${unknown.size > 1 ? "s" : ""} non reconnu${unknown.size > 1 ? "s" : ""}`);
  if (duplicateNumbers.length > 0) warnings.push(`${duplicateNumbers.length} numéro${duplicateNumbers.length > 1 ? "s" : ""} en doublon`);
  if (counts.defenders === 0) warnings.push("Aucun défenseur");
  if (counts.midfielders === 0 && sport === "football") warnings.push("Aucun milieu");
  return {
    total: normalized.length,
    ...counts,
    unknownPositions: [...unknown],
    duplicateNumbers,
    warnings,
  };
}

export function analyzeAllFormations(formations: FormationMap, players: AnalysisPlayer[], sport: AnalysisSport) {
  return Object.entries(formations)
    .map(([formation, definition]) => analyzeFormation(formation, definition, players, sport))
    .sort((a, b) => b.averageFit - a.averageFit || b.exactPostes - a.exactPostes);
}

export function chooseBestXI(
  formation: string,
  definition: FormationDefinition,
  players: AnalysisPlayer[],
  sport: AnalysisSport,
  aiPriority?: ReadonlyMap<string, number>,
) {
  const analysis = analyzeFormation(formation, definition, players, sport, aiPriority);
  const bySlot = new Map(analysis.slots.map(slot => [slot.index, slot.recommendedPlayerId]));
  return definition.positions.map((slot, index) => {
    const player = players.find(candidate => candidate.id === bySlot.get(index));
    return { slot, player, analysis: analysis.slots[index] };
  });
}

export function analysisFilePayload(formations: FormationMap, players: AnalysisPlayer[], sport: AnalysisSport) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sport,
    source: RULES[sport],
    formations: analyzeAllFormations(formations, players, sport),
  };
}