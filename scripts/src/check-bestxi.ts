import { pathToFileURL } from "node:url";

// Le harnais s'exécute en dehors de Vite : il doit résoudre l'alias "@/"
// du frontend vers le dossier src réel.
process.env.TSX_TSCONFIG_PATH = "../artifacts/lineup-creator/tsconfig.json";

const analysisModule = await import(pathToFileURL(new URL("../../artifacts/lineup-creator/src/lib/formationAnalysis.ts", import.meta.url).pathname)) as typeof import("../../artifacts/lineup-creator/src/lib/formationAnalysis");
const { chooseBestXI, profilePlayerPosition } = analysisModule;
const formationsModule = await import(pathToFileURL(new URL("../../artifacts/lineup-creator/src/lib/formations.ts", import.meta.url).pathname)) as typeof import("../../artifacts/lineup-creator/src/lib/formations");
const { FOOTBALL_FORMATIONS, HOCKEY_FORMATIONS } = formationsModule;
import type { AnalysisPlayer, AnalysisSport, FormationMap } from "../../artifacts/lineup-creator/src/lib/formationAnalysis";

type Checks = { name: string; ok: boolean; details: string };
const results: Checks[] = [];

function expect(name: string, ok: boolean, details = "") {
  results.push({ name, ok, details });
  console.log(`${ok ? "✅" : "❌"} ${name}${details ? ` — ${details}` : ""}`);
}

function roster(entries: [string, string, number][]): AnalysisPlayer[] {
  return entries.map(([name, position, rating], index) => ({
    id: `p${index}`,
    name,
    position,
    rating,
  }));
}

function checkPlacement(
  label: string,
  formation: string,
  map: FormationMap,
  players: AnalysisPlayer[],
  sport: AnalysisSport,
  expectEmpty = false,
) {
  const definition = map[formation];
  const chosen = chooseBestXI(formation, definition, players, sport);
  // Gardien au sens du référentiel (GB, G, GK, "Gardien de but"…), pas un
  // simple match de chaîne sur la position brute.
  const goalkeepers = players.filter(p => profilePlayerPosition(p.position, sport).role === "goalkeeper");

  // Règle 1 : le poste GB ne reçoit jamais un joueur de champ.
  const gkSlot = chosen.find(c => c.slot.label === "GB" || c.slot.label === "G");
  const gkPlayer = gkSlot?.player;
  if (goalkeepers.length > 0) {
    expect(
      `${label} : gardien placé au but`,
      !!gkPlayer && goalkeepers.some(g => g.id === gkPlayer.id),
      gkPlayer ? `${gkPlayer.name} (${gkPlayer.position}) au ${gkSlot?.slot.label}` : "poste GB vide",
    );
  } else if (!expectEmpty) {
    expect(
      `${label} : pas de joueur de champ au but`,
      !gkPlayer,
      gkPlayer ? `${gkPlayer.name} placé au GB alors qu'aucun gardien n'existe` : "GB laissé libre",
    );
  }

  // Règle 2 : un joueur placé doit être au poste naturel (≥90) ou au pire
  // compatible (>0) ; "0" signifie incompatibilité pure (ex. MDC → BU).
  const misplaced = chosen.filter(c => c.player && c.analysis.bestFit === 0 && !c.slot.label.match(/^G[BB]?$/));
  expect(
    `${label} : aucun joueur sur un poste incompatible`,
    misplaced.length === 0,
    misplaced.map(m => `${m.player?.name} → ${m.slot.label}`).join(", ") || "OK",
  );

  // Règle 3 : pas de doublon.
  const ids = chosen.flatMap(c => c.player ? [c.player.id] : []);
  expect(
    `${label} : aucun doublon`,
    new Set(ids).size === ids.length,
    "OK",
  );
}

// ── Effectif réaliste 4-3-3 : gardien, défense, milieux, attaquants ──
checkPlacement(
  "4-3-3 effectif réaliste",
  "4-3-3",
  FOOTBALL_FORMATIONS,
  roster([
    ["Walls", "GB", 84],
    ["Silva", "DG", 80],
    ["Kimpembe", "DC", 81],
    ["Marquinhos", "DC", 85],
    ["Hakimi", "DD", 84],
    ["Vitinha", "MC", 83],
    ["Verratti", "MC", 85],
    ["Zaïre", "MDC", 79],
    ["Neymar", "AG", 89],
    ["Mbappé", "BU", 91],
    ["Dembélé", "AD", 84],
    ["Soler", "MOC", 76],
  ]),
  "football",
);

// ── Aucun gardien : le poste GB doit rester libre, les autres postes remplis ──
const noGk = chooseBestXI(
  "4-3-3",
  FOOTBALL_FORMATIONS["4-3-3"],
  roster([
    ["A", "DG", 80], ["B", "DC", 82], ["C", "DC", 78], ["D", "DD", 79],
    ["E", "MDC", 81], ["F", "MC", 83], ["G", "MC", 77], ["H", "AG", 85],
    ["I", "BU", 88], ["J", "AD", 84], ["K", "MOC", 80],
  ]),
  "football",
);
expect(
  "Sans gardien : GB laissé libre",
  !noGk.find(c => (c.slot.label === "GB") && c.player),
  "OK",
);
expect(
  "Sans gardien : 10 joueurs de champ placés",
  noGk.filter(c => c.player && c.slot.label !== "GB").length === 10,
  `${noGk.filter(c => c.player && c.slot.label !== "GB").length}/10`,
);

// ── Effectif court : 6 joueurs seulement ──
const short = chooseBestXI(
  "4-3-3",
  FOOTBALL_FORMATIONS["4-3-3"],
  roster([["A", "GB", 80], ["B", "DC", 85], ["C", "MC", 88], ["D", "BU", 90], ["E", "AG", 82], ["F", "MDC", 76]]),
  "football",
);
expect(
  "Effectif court : 6 joueurs placés",
  short.filter(c => c.player).length === 6,
  `${short.filter(c => c.player).length}/6`,
);
expect(
  "Effectif court : le gardien est au but",
  short.find(c => c.slot.label === "GB")?.player?.position === "GB",
  "OK",
);

// ── Priorité aux postes naturels : un DC de meilleure note ne doit pas
//    éjecter un MG naturel du poste MG au profit d'un MG plus faible ailleurs. ──
const naturalFirst = chooseBestXI(
  "4-4-2",
  FOOTBALL_FORMATIONS["4-4-2"],
  roster([
    ["G1", "GB", 85],
    ["DC1", "DC", 87],
    ["DC2", "DC", 84],
    ["DC3", "DC", 83],
    ["DC4", "DC", 82],
    ["DG1", "DG", 78],
    ["DD1", "DD", 77],
    ["MDC1", "MDC", 80],
    ["MC1", "MC", 86],
    ["MC2", "MC", 81],
    ["BU1", "BU", 89],
    ["BU2", "BU", 85],
    ["MG1", "MG", 79],
  ]),
  "football",
);
const mgSlot = naturalFirst.find(c => c.slot.label === "MG");
expect(
  "4-4-2 : le poste MG reçoit le MG naturel",
  mgSlot?.player?.position === "MG",
  mgSlot ? `MG reçoit ${mgSlot.player?.name} (${mgSlot.player?.position}) à ${mgSlot.analysis.bestFit}%` : "vide",
);
const ddSlot = naturalFirst.find(c => c.slot.label === "AD");
expect(
  "4-4-2 : le poste latéral droit reçoit un joueur de couloir droit",
  ddSlot?.player?.position === "DD" || ddSlot?.player?.position === "DC",
  ddSlot ? `AD reçoit ${ddSlot.player?.name} (${ddSlot.player?.position}) à ${ddSlot.analysis.bestFit}%` : "vide",
);

// ── Hockey : gardien, défenseurs, centre, ailiers ──
checkPlacement(
  "Hockey 1-2-2",
  "1-2-2 (Standard)",
  HOCKEY_FORMATIONS,
  roster([
    ["Gardien", "G", 85],
    ["Dg", "DG", 80],
    ["Dd", "DD", 80],
    ["Centre", "C", 84],
    ["Ag", "AG", 82],
    ["Ad", "AD", 82],
    ["Reserve", "C", 78],
  ]),
  "hockey",
);

// ── Postes exotiques (texte libre de l'IA) ──
checkPlacement(
  "Positions textuelles",
  "4-3-3",
  FOOTBALL_FORMATIONS,
  roster([
    ["K", "Gardien de but", 82],
    ["L", "Arrière gauche", 79],
    ["M", "Défenseur central", 84],
    ["N", "Stoppeur", 83],
    ["O", "Latéral droit", 81],
    ["P", "Milieu défensif", 80],
    ["Q", "Milieu relayeur", 78],
    ["R", "Milieu offensif", 86],
    ["S", "Ailier gauche", 88],
    ["T", "Avant-centre", 90],
    ["U", "Ailier droit", 85],
  ]),
  "football",
);

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies`);
if (failed.length > 0) {
  process.exitCode = 1;
}
