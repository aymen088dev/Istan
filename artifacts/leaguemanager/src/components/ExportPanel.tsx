import { exportBracketPng, exportPosterPng, exportResultsPng, exportStandingsPng } from "@/lib/exportPng";
import { groupNames } from "@/lib/standings";
import type { CompetitionDetail } from "@/lib/types";
import { Btn, Chip, Notice, Panel, SectionTitle } from "./ui";
import { useState } from "react";

export default function ExportPanel({ detail }: { detail: CompetitionDetail }) {
  const [error, setError] = useState<string | null>(null);
  const played = detail.fixtures.filter(fixture => fixture.played).length;
  const knockout = detail.fixtures.some(fixture => !fixture.group && detail.format !== "league");
  const groups = groupNames(detail.fixtures);

  function run(kind: "standings" | "results" | "bracket" | "poster") {
    setError(null);
    try {
      if (kind === "standings") exportStandingsPng(detail);
      else if (kind === "results") exportResultsPng(detail);
      else if (kind === "bracket") exportBracketPng(detail);
      else exportPosterPng(detail);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export impossible.");
    }
  }

  const blocks: { kind: "standings" | "results" | "bracket" | "poster"; title: string; text: string; available: boolean }[] = [
    {
      kind: "standings",
      title: "Classement",
      text: detail.format === "custom"
        ? `Les ${groups.length} poules, qualifiés surlignés, puis le tableau final.`
        : "Le classement complet avec journées jouées, buts et différence.",
      available: detail.standings.some(row => row.played > 0),
    },
    {
      kind: "results",
      title: "Résultats",
      text: `Les ${played} matchs joués, journée par journée, scores et tirs au but inclus.`,
      available: played > 0,
    },
    {
      kind: "bracket",
      title: "Tableau final",
      text: "Le tableau à élimination directe, du premier tour à la finale.",
      available: knockout,
    },
    {
      kind: "poster",
      title: "Affiche complète",
      text: "Classement + derniers résultats + tableau : une seule image à publier.",
      available: detail.standings.some(row => row.played > 0) || played > 0,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <SectionTitle
          eyebrow="Export"
          title="Images prêtes à publier"
          note="Chaque export est dessiné sur un canvas puis téléchargé en PNG (1600 px de large, rendu en double densité pour rester net sur les réseaux)."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {blocks.map(block => (
            <article key={block.kind} className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4">
              <p className="font-semibold">{block.title}</p>
              <p className="text-[13px] text-[var(--muted)]">{block.text}</p>
              <div className="mt-auto">
                <Btn variant="primary" onClick={() => run(block.kind)} disabled={!block.available}>
                  Exporter en PNG
                </Btn>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Chip label="Compétition" value={detail.name} />
          <Chip label="Matchs joués" value={`${played}/${detail.fixtures.length}`} />
          <Chip label="Graine" value={detail.settings.seed} />
        </div>

        {error ? (
          <div className="mt-4">
            <Notice tone="error">{error}</Notice>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
