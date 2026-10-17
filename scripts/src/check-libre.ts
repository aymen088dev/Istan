process.env.TSX_TSCONFIG_PATH = "../artifacts/lineup-creator/tsconfig.json";
const analysisModule = await import(new URL("../../artifacts/lineup-creator/src/lib/formationAnalysis.ts", import.meta.url).pathname) as typeof import("../../artifacts/lineup-creator/src/lib/formationAnalysis");
const { chooseBestXI, profilePlayerPosition } = analysisModule;
const formationsModule = await import(new URL("../../artifacts/lineup-creator/src/lib/formations.ts", import.meta.url).pathname) as typeof import("../../artifacts/lineup-creator/src/lib/formations");
const { FOOTBALL_FORMATIONS } = formationsModule;
import type { AnalysisPlayer } from "../../artifacts/lineup-creator/src/lib/formationAnalysis";

// Scénario de la capture : postes génériques « ATTAQUANT » générés par l'IA
const roster: AnalysisPlayer[] = [
  { id: "p1", name: "Leo Le Marchand", position: "DG", rating: 75 },
  { id: "p2", name: "Enzo Caruso", position: "AG", rating: 85 },
  { id: "p3", name: "Adrien Le Boucher", position: "DD", rating: 80 },
  { id: "p4", name: "Becko Lotistanoix", position: "MDC", rating: 79 },
  { id: "p5", name: "Pedro Hernacio", position: "MOC", rating: 83 },
  { id: "p6", name: "Desire Providence", position: "MC", rating: 82 },
  { id: "p7", name: "Matteo Sanchez", position: "DC", rating: 80 },
  // Banc avec postes génériques IA
  { id: "b1", name: "Adem V.", position: "ATTAQUANT", rating: 81 },
  { id: "b2", name: "Nabil R.", position: "ATTAQUANT", rating: 80 },
  { id: "b3", name: "Amir G.", position: "MILIEU", rating: 79 },
  { id: "b4", name: "Rayan K.", position: "DEFENSE", rating: 79 },
  { id: "b5", name: "Karim B.", position: "ATTAQUANT", rating: 78 },
];
const def = FOOTBALL_FORMATIONS["4-3-3"];
const chosen = chooseBestXI("4-3-3", def, roster, "football");
const libre = chosen.filter(c => !c.player);
const placed = chosen.filter(c => c.player);
console.log(`Placés: ${placed.length}/11 — LIBRE: ${libre.length}`);
for (const c of chosen) console.log(`  ${c.slot.label.padEnd(4)} → ${c.player ? `${c.player.name} (${c.player.position})` : "LIBRE"}`);
const gk = chosen.find(c => c.slot.label === "GB" || c.slot.label === "G");
const gkPlayer = gk?.player;
const isGk = gkPlayer ? profilePlayerPosition(gkPlayer.position, "football").role === "goalkeeper" : true;
console.log(isGk ? "OK: but gardien ou libre" : "BUG: joueur de champ au but !");
console.log(libre.length === 0 && placed.length === 11 ? "OK: aucun poste LIBRE" : `ATTENTION: ${libre.length} poste(s) libre(s)`);
