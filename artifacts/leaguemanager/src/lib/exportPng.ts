import { diffText, fmtDate, scoreText } from "./format";
import { computeStandings, groupMembers, groupNames, knockoutRounds, winnerOf } from "./standings";
import type { Club, CompetitionDetail, Fixture, StandingRow } from "./types";

const WIDTH = 1600;
const SCALE = 2;
const PAD = 72;
const FONT = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

type Ctx = CanvasRenderingContext2D;

function createCanvas(height: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = Math.max(400, Math.round(height)) * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible dans ce navigateur.");
  ctx.scale(SCALE, SCALE);
  return { canvas, ctx };
}

function roundRect(ctx: Ctx, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function paintBackground(ctx: Ctx, height: number) {
  ctx.fillStyle = "#08090c";
  ctx.fillRect(0, 0, WIDTH, height);
  const glow = ctx.createRadialGradient(WIDTH * 0.15, -80, 0, WIDTH * 0.15, -80, 900);
  glow.addColorStop(0, "rgba(200,255,61,0.12)");
  glow.addColorStop(1, "rgba(8,9,12,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, height);
}

function ellipsize(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let value = text;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
  return `${value}…`;
}

function drawHeader(ctx: Ctx, detail: CompetitionDetail, subtitle: string) {
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText(subtitle.toUpperCase(), PAD, 96);

  ctx.fillStyle = "#f2f1ec";
  ctx.font = `800 68px ${FONT}`;
  ctx.fillText(ellipsize(ctx, detail.name, WIDTH - PAD * 2), PAD, 168);

  const labels = [
    detail.format === "league" ? "Ligue" : detail.format === "cup" ? "Coupe" : "Poules + phases finales",
    detail.sport === "hockey" ? "Hockey" : "Football",
    `${detail.clubIds.length} clubs`,
    `graine ${detail.settings.seed}`,
  ];
  ctx.font = `500 22px ${FONT}`;
  let x = PAD;
  for (const label of labels) {
    const width = ctx.measureText(label).width + 36;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(ctx, x, 202, width, 46, 23);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#b7bcc4";
    ctx.fillText(label, x + 18, 232);
    x += width + 12;
  }
}

function drawFooter(ctx: Ctx, height: number) {
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = `500 20px ${FONT}`;
  ctx.fillText(`ISTAN PROJECTS · LEAGUEMANAGER — ${fmtDate(Date.now())}`, PAD, height - 46);
}

function badge(ctx: Ctx, club: Club | undefined, x: number, y: number, size = 26) {
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = club?.primaryColor || "#3a3d44";
  ctx.fill();
}

function drawStandingsTable(
  ctx: Ctx,
  rows: StandingRow[],
  clubById: Map<string, Club>,
  options: { x: number; y: number; title?: string; qualify?: number; width?: number },
) {
  const width = options.width || WIDTH - PAD * 2;
  let y = options.y;

  if (options.title) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(options.title.toUpperCase(), options.x, y);
    y += 26;
  }

  const columns: { key: string; label: string; width: number; align: "left" | "right" }[] = [
    { key: "pos", label: "#", width: 60, align: "right" },
    { key: "club", label: "CLUB", width: width - 60 - 9 * 74, align: "left" },
    { key: "played", label: "J", width: 74, align: "right" },
    { key: "won", label: "V", width: 74, align: "right" },
    { key: "drawn", label: "N", width: 74, align: "right" },
    { key: "lost", label: "D", width: 74, align: "right" },
    { key: "goalsFor", label: "BP", width: 74, align: "right" },
    { key: "goalsAgainst", label: "BC", width: 74, align: "right" },
    { key: "diff", label: "DIFF", width: 74, align: "right" },
    { key: "points", label: "PTS", width: 74, align: "right" },
  ];

  const rowHeight = 56;
  const headerHeight = 48;
  const tableHeight = headerHeight + rows.length * rowHeight + 18;

  ctx.fillStyle = "rgba(255,255,255,0.03)";
  roundRect(ctx, options.x, y, width, tableHeight, 20);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 1;
  ctx.stroke();

  let x = options.x + 24;
  ctx.font = `600 19px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  for (const column of columns) {
    const textX = column.align === "right" ? x + column.width - 74 : x;
    ctx.fillText(column.label, textX, y + 34);
    x += column.width;
  }

  rows.forEach((row, index) => {
    const rowY = y + headerHeight + index * rowHeight;
    const qualified = options.qualify !== undefined && index < options.qualify;
    if (qualified) {
      ctx.fillStyle = "rgba(200,255,61,0.07)";
      roundRect(ctx, options.x + 8, rowY - 4, width - 16, rowHeight - 6, 14);
      ctx.fill();
    }

    const club = clubById.get(row.clubId);
    let cellX = options.x + 24;
    for (const column of columns) {
      const textY = rowY + 32;
      if (column.key === "club") {
        badge(ctx, club, cellX + 2, rowY + 12);
        ctx.font = `600 24px ${FONT}`;
        ctx.fillStyle = "#f2f1ec";
        ctx.fillText(ellipsize(ctx, club?.name || row.clubId, column.width - 60), cellX + 40, textY);
      } else {
        const value =
          column.key === "pos"
            ? String(index + 1)
            : column.key === "diff"
              ? diffText(row.diff)
              : String(row[column.key as keyof StandingRow] as number);
        ctx.font = column.key === "points" ? `700 24px ${FONT}` : `500 23px ${FONT}`;
        ctx.fillStyle =
          column.key === "points" ? "#c8ff3d" : column.key === "pos" ? "rgba(255,255,255,0.45)" : "#e4e3dd";
        const textX = column.align === "right" ? cellX + column.width - 74 + 12 : cellX;
        ctx.fillText(value, textX, textY);
      }
      cellX += column.width;
    }
  });

  return y + tableHeight + 44;
}

function drawFixtureList(
  ctx: Ctx,
  fixtures: Fixture[],
  clubById: Map<string, Club>,
  options: { x: number; y: number; title?: string },
) {
  let y = options.y;
  if (options.title) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(options.title.toUpperCase(), options.x, y);
    y += 30;
  }

  const width = WIDTH - PAD * 2;
  for (const fixture of fixtures) {
    const home = clubById.get(fixture.homeId);
    const away = fixture.awayId ? clubById.get(fixture.awayId) : undefined;
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    roundRect(ctx, options.x, y, width, 56, 14);
    ctx.fill();

    badge(ctx, home, options.x + 18, y + 15, 22);
    ctx.font = `600 23px ${FONT}`;
    ctx.fillStyle = "#f2f1ec";
    ctx.fillText(ellipsize(ctx, home?.name || "—", 420), options.x + 52, y + 36);

    const score = fixture.awayId ? scoreText(fixture.homeScore, fixture.awayScore) : "exempt";
    ctx.font = `700 24px ${FONT}`;
    ctx.fillStyle = "#c8ff3d";
    ctx.fillText(score, options.x + width / 2 - 40, y + 36);

    if (fixture.homePens !== null && fixture.awayPens !== null) {
      ctx.font = `500 18px ${FONT}`;
      ctx.fillStyle = "#ffd400";
      ctx.fillText(`TAB ${fixture.homePens}-${fixture.awayPens}`, options.x + width / 2 + 46, y + 36);
    }

    ctx.font = `600 23px ${FONT}`;
    ctx.fillStyle = "#f2f1ec";
    const awayName = ellipsize(ctx, away?.name || "—", 420);
    ctx.fillText(awayName, options.x + width - 52 - ctx.measureText(awayName).width, y + 36);
    badge(ctx, away, options.x + width - 40, y + 15, 22);

    ctx.font = `500 18px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText(fixture.stage, options.x + 52, y + 52);

    y += 64;
  }
  return y + 24;
}

function drawBracket(
  ctx: Ctx,
  detail: CompetitionDetail,
  clubById: Map<string, Club>,
  options: { x: number; y: number; title?: string },
) {
  const rounds = knockoutRounds(detail.fixtures);
  let y = options.y;
  if (options.title) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(options.title.toUpperCase(), options.x, y);
    y += 34;
  }
  if (!rounds.length) return y;

  const columnWidth = Math.floor((WIDTH - PAD * 2) / Math.max(1, rounds.length));
  rounds.forEach((round, roundIndex) => {
    const x = options.x + roundIndex * columnWidth;
    ctx.font = `600 19px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText(round.stage.toUpperCase(), x, y + 12);

    let fixtureY = y + 34;
    for (const fixture of round.fixtures) {
      const width = columnWidth - 24;
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      roundRect(ctx, x, fixtureY, width, 96, 14);
      ctx.fill();

      const winner = winnerOf(fixture);
      const lines: { club: Club | undefined; id: string; score: number | null }[] = [
        { club: clubById.get(fixture.homeId), id: fixture.homeId, score: fixture.homeScore },
        ...(fixture.awayId
          ? [{ club: clubById.get(fixture.awayId), id: fixture.awayId, score: fixture.awayScore }]
          : []),
      ];
      lines.forEach((line, index) => {
        const lineY = fixtureY + 22 + index * 34;
        badge(ctx, line.club, x + 14, lineY - 6, 20);
        ctx.font = winner === line.id ? `700 21px ${FONT}` : `500 21px ${FONT}`;
        ctx.fillStyle = winner === line.id ? "#c8ff3d" : "#d6d5cf";
        ctx.fillText(ellipsize(ctx, line.club?.name || "—", width - 100), x + 42, lineY + 9);
        ctx.font = `600 21px ${FONT}`;
        ctx.fillStyle = "#f2f1ec";
        const value = line.score === null ? "-" : String(line.score);
        ctx.fillText(value, x + width - 26 - ctx.measureText(value).width, lineY + 9);
      });
      if (!fixture.awayId) {
        ctx.font = `500 18px ${FONT}`;
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillText("exempt", x + 42, fixtureY + 66);
      }
      fixtureY += 108;
    }
  });

  const deepest = Math.max(...rounds.map(round => round.fixtures.length), 1);
  return y + 34 + deepest * 108 + 24;
}

function download(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "competition";
}

/* ------------------------------ Exports ------------------------------ */

export function renderStandings(detail: CompetitionDetail): HTMLCanvasElement {
  const clubById = new Map(detail.clubs.map(club => [club.id, club]));
  const { canvas, ctx } = createCanvas(1600);
  paintBackground(ctx, canvas.height / SCALE);
  drawHeader(ctx, detail, "Classement");

  let y = 300;
  if (detail.format === "custom") {
    const groups = groupNames(detail.fixtures);
    for (const group of groups) {
      y = drawStandingsTable(ctx, computeStandings(groupMembers(detail.fixtures, group), detail.fixtures.filter(f => f.group === group), detail.settings), clubById, {
        x: PAD,
        y,
        title: group,
        qualify: detail.settings.qualifyPerGroup,
      });
    }
  } else {
    y = drawStandingsTable(ctx, detail.standings, clubById, { x: PAD, y, title: "Classement général" });
  }

  if (detail.format !== "league") drawBracket(ctx, detail, clubById, { x: PAD, y: y + 20, title: "Phases finales" });
  drawFooter(ctx, canvas.height / SCALE);
  return canvas;
}

export function exportStandingsPng(detail: CompetitionDetail) {
  download(renderStandings(detail), `leaguemanager-classement-${slug(detail.name)}.png`);
}

export function renderResults(detail: CompetitionDetail): HTMLCanvasElement {
  const clubById = new Map(detail.clubs.map(club => [club.id, club]));
  const played = detail.fixtures.filter(fixture => fixture.played);
  const estimate = 420 + played.length * 64 + 120;
  const { canvas, ctx } = createCanvas(estimate);
  paintBackground(ctx, canvas.height / SCALE);
  drawHeader(ctx, detail, "Résultats");

  let y = 300;
  const stages = [...new Set(played.map(fixture => fixture.stage))];
  for (const stage of stages) {
    y = drawFixtureList(ctx, played.filter(fixture => fixture.stage === stage), clubById, { x: PAD, y, title: stage });
  }
  if (!stages.length) {
    ctx.font = `500 24px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("Aucun match joué pour l'instant.", PAD, y);
  }
  drawFooter(ctx, canvas.height / SCALE);
  return canvas;
}

export function exportResultsPng(detail: CompetitionDetail) {
  download(renderResults(detail), `leaguemanager-resultats-${slug(detail.name)}.png`);
}

export function renderBracket(detail: CompetitionDetail): HTMLCanvasElement {
  const clubById = new Map(detail.clubs.map(club => [club.id, club]));
  const rounds = knockoutRounds(detail.fixtures);
  const deepest = rounds.length ? Math.max(...rounds.map(round => round.fixtures.length)) : 1;
  const { canvas, ctx } = createCanvas(420 + deepest * 108 + 120);
  paintBackground(ctx, canvas.height / SCALE);
  drawHeader(ctx, detail, "Tableau final");
  drawBracket(ctx, detail, clubById, { x: PAD, y: 300, title: "Phases finales" });
  drawFooter(ctx, canvas.height / SCALE);
  return canvas;
}

export function exportBracketPng(detail: CompetitionDetail) {
  download(renderBracket(detail), `leaguemanager-tableau-${slug(detail.name)}.png`);
}

/** Affiche complète : classement, derniers résultats et tableau final. */
export function renderPoster(detail: CompetitionDetail): HTMLCanvasElement {
  const clubById = new Map(detail.clubs.map(club => [club.id, club]));
  const played = detail.fixtures.filter(fixture => fixture.played).slice(-8);
  const { canvas, ctx } = createCanvas(1400);
  paintBackground(ctx, canvas.height / SCALE);
  drawHeader(ctx, detail, "Affiche de compétition");

  let y = 300;
  if (detail.format === "custom") {
    for (const group of groupNames(detail.fixtures)) {
      y = drawStandingsTable(ctx, computeStandings(groupMembers(detail.fixtures, group), detail.fixtures.filter(f => f.group === group), detail.settings), clubById, {
        x: PAD,
        y,
        title: group,
        qualify: detail.settings.qualifyPerGroup,
      });
    }
  } else {
    y = drawStandingsTable(ctx, detail.standings, clubById, { x: PAD, y, title: "Classement" });
  }

  if (played.length) y = drawFixtureList(ctx, played, clubById, { x: PAD, y: y + 10, title: "Derniers résultats" });
  if (detail.format !== "league") y = drawBracket(ctx, detail, clubById, { x: PAD, y: y + 10, title: "Tableau final" });

  drawFooter(ctx, canvas.height / SCALE);
  return canvas;
}

export function exportPosterPng(detail: CompetitionDetail) {
  download(renderPoster(detail), `leaguemanager-affiche-${slug(detail.name)}.png`);
}
