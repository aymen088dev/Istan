/**
 * LEAGUEMANAGER — API
 *
 * Gère les clubs et les compétitions. Comme le reste du portail, la
 * persistance suit le motif maison : Postgres quand DATABASE_URL est fourni,
 * sinon un fichier JSON écrit de façon atomique (avec sauvegarde .bak) — donc
 * les données vivent bien sur le serveur et sont partagées entre appareils.
 *
 * La simulation tourne ici, côté serveur : elle est déterministe (graine) et
 * n'appelle aucun service d'IA externe.
 */

import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  advanceCompetition,
  buildSchedule,
  computeStandings,
  simulateCompetition,
  type Competition,
  type CompetitionFormat,
  type Engine,
  type LeagueClub,
  type Sport,
} from "../lib/leagueEngine";

type LeagueStore = {
  clubs: LeagueClub[];
  competitions: Competition[];
};

const router: IRouter = Router();
const filePath = process.env.LEAGUE_DATA_FILE || path.join(process.cwd(), "data", "league.json");

function text(value: unknown, fallback = "", max = 120) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function rating(value: unknown, fallback = 70) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function color(value: unknown, fallback: string) {
  const raw = text(value, "", 32);
  return /^#[0-9a-fA-F]{3,8}$/.test(raw) ? raw : fallback;
}

function normalizeClub(body: unknown, id?: string): LeagueClub | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const name = text(value.name, "", 80);
  if (!name) return null;
  const ratingValue = (value.rating && typeof value.rating === "object" ? value.rating : {}) as Record<string, unknown>;
  return {
    id: id || text(value.id, `club-${randomUUID()}`, 100),
    name,
    shortName: text(value.shortName, name.slice(0, 3).toUpperCase(), 5),
    city: text(value.city, "", 60),
    country: text(value.country, "ISTANMUSTA", 40),
    sport: value.sport === "hockey" ? "hockey" : "football",
    logo: typeof value.logo === "string" ? value.logo.slice(0, 2_000_000) : undefined,
    primaryColor: color(value.primaryColor, "#c8ff3d"),
    secondaryColor: color(value.secondaryColor, "#0b0c0f"),
    ratingMode: value.ratingMode === "advanced" ? "advanced" : "classic",
    rating: {
      overall: rating(ratingValue.overall, 70),
      attack: rating(ratingValue.attack, 70),
      midfield: rating(ratingValue.midfield, 70),
      defense: rating(ratingValue.defense, 70),
    },
  };
}

function normalizeSettings(body: unknown): Competition["settings"] {
  const value = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  return {
    pointsWin: rating(value.pointsWin, 3),
    pointsDraw: rating(value.pointsDraw, 1),
    pointsLoss: rating(value.pointsLoss, 0),
    doubleRound: value.doubleRound === true,
    legs: Number(value.legs) === 2 ? 2 : 1,
    extraTime: value.extraTime !== false,
    penalties: value.penalties !== false,
    groupCount: Math.max(1, Math.min(16, Math.round(Number(value.groupCount) || 2))),
    teamsPerGroup: Math.max(2, Math.min(24, Math.round(Number(value.teamsPerGroup) || 4))),
    qualifyPerGroup: Math.max(1, Math.min(8, Math.round(Number(value.qualifyPerGroup) || 2))),
    seed: Number.isFinite(Number(value.seed)) ? Math.round(Number(value.seed)) : 20261017,
    homeAdvantage: Math.max(0, Math.min(1, Number(value.homeAdvantage ?? 0.15))),
  };
}

function normalizeCompetition(body: unknown, id?: string): Competition | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const name = text(value.name, "", 80);
  if (!name) return null;
  const format: CompetitionFormat =
    value.format === "cup" ? "cup" : value.format === "custom" ? "custom" : "league";
  const clubIds = Array.isArray(value.clubIds)
    ? [...new Set(value.clubIds.map(entry => text(entry, "", 100)).filter(Boolean))].slice(0, 64)
    : [];
  const fixtures = Array.isArray(value.fixtures) ? (value.fixtures as Competition["fixtures"]).slice(0, 512) : [];
  return {
    id: id || text(value.id, `comp-${randomUUID()}`, 100),
    name,
    sport: value.sport === "hockey" ? "hockey" : "football",
    format,
    settings: normalizeSettings(value.settings),
    clubIds,
    fixtures: fixtures.map(fixture => ({
      ...fixture,
      homeScore: fixture.homeScore ?? null,
      awayScore: fixture.awayScore ?? null,
      homePens: fixture.homePens ?? null,
      awayPens: fixture.awayPens ?? null,
      played: fixture.played === true,
      events: Array.isArray(fixture.events) ? fixture.events : [],
    })),
    createdAt: Number(value.createdAt) || Date.now(),
    updatedAt: Date.now(),
  };
}

async function readStore(): Promise<LeagueStore> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as LeagueStore;
  } catch {
    try {
      return JSON.parse(await readFile(`${filePath}.bak`, "utf8")) as LeagueStore;
    } catch {
      return { clubs: [], competitions: [] };
    }
  }
}

/** Écriture atomique : fichier temporaire + fsync, puis rename, puis .bak. */
async function writeStore(store: LeagueStore) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  const payload = JSON.stringify(store, null, 2);
  await writeFile(tmp, payload, "utf8");
  const handle = await open(tmp, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, filePath).catch(async error => {
    await unlink(tmp).catch(() => undefined);
    throw error;
  });
  await writeFile(`${filePath}.bak`, payload, "utf8").catch(() => undefined);
}

function publicCompetition(competition: Competition, clubs: LeagueClub[]) {
  return {
    ...competition,
    standings: computeStandings(competition.clubIds, competition.fixtures, competition.settings),
    clubs,
  };
}

/* ----------------------------- Clubs ----------------------------- */

router.get("/league/clubs", async (_req, res): Promise<void> => {
  const store = await readStore();
  res.json({ clubs: store.clubs });
});

router.put("/league/clubs/:id", async (req, res): Promise<void> => {
  const id = text(req.params.id, "", 100);
  const club = normalizeClub(req.body, id);
  if (!club) {
    res.status(400).json({ message: "Club invalide : le nom est obligatoire." });
    return;
  }
  const store = await readStore();
  const index = store.clubs.findIndex(item => item.id === club.id);
  if (index >= 0) store.clubs[index] = club;
  else store.clubs.unshift(club);
  await writeStore(store);
  res.json({ club });
});

router.delete("/league/clubs/:id", async (req, res): Promise<void> => {
  const id = text(req.params.id, "", 100);
  const store = await readStore();
  store.clubs = store.clubs.filter(club => club.id !== id);
  // Une compétition sans ses clubs n'a plus de sens : on retire le club des
  // listes d'engagés, sans effacer l'historique des matchs déjà joués.
  store.competitions = store.competitions.map(competition => ({
    ...competition,
    clubIds: competition.clubIds.filter(clubId => clubId !== id),
  }));
  await writeStore(store);
  res.status(204).send();
});

/* -------------------------- Compétitions ------------------------- */

router.get("/league/competitions", async (_req, res): Promise<void> => {
  const store = await readStore();
  res.json({ competitions: store.competitions });
});

router.get("/league/competitions/:id", async (req, res): Promise<void> => {
  const store = await readStore();
  const competition = store.competitions.find(item => item.id === req.params.id);
  if (!competition) {
    res.status(404).json({ message: "Compétition introuvable." });
    return;
  }
  res.json({ competition: publicCompetition(competition, store.clubs) });
});

router.put("/league/competitions/:id", async (req, res): Promise<void> => {
  const id = text(req.params.id, "", 100);
  const competition = normalizeCompetition(req.body, id);
  if (!competition) {
    res.status(400).json({ message: "Compétition invalide : le nom est obligatoire." });
    return;
  }
  if (competition.clubIds.length < 2) {
    res.status(400).json({ message: "Il faut au moins deux clubs engagés." });
    return;
  }
  const store = await readStore();
  const known = store.clubs.filter(club => competition.clubIds.includes(club.id));
  if (known.length < 2) {
    res.status(400).json({ message: "Les clubs engagés doivent exister dans la liste des clubs." });
    return;
  }

  // Le calendrier est fabriqué par le serveur : même compétition, même
  // calendrier, quel que soit l'appareil qui l'ouvre.
  if (!competition.fixtures.length) {
    competition.fixtures = buildSchedule(competition, known);
  }

  const index = store.competitions.findIndex(item => item.id === competition.id);
  if (index >= 0) store.competitions[index] = competition;
  else store.competitions.unshift(competition);
  await writeStore(store);
  res.json({ competition: publicCompetition(competition, known) });
});

router.delete("/league/competitions/:id", async (req, res): Promise<void> => {
  const id = text(req.params.id, "", 100);
  const store = await readStore();
  store.competitions = store.competitions.filter(item => item.id !== id);
  await writeStore(store);
  res.status(204).send();
});

router.post("/league/competitions/:id/simulate", async (req, res): Promise<void> => {
  const store = await readStore();
  const competition = store.competitions.find(item => item.id === req.params.id);
  if (!competition) {
    res.status(404).json({ message: "Compétition introuvable." });
    return;
  }
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const engine: Engine = body.engine === "detail" ? "detail" : "fast";
  const clubs = store.clubs.filter(club => competition.clubIds.includes(club.id));
  if (clubs.length < 2) {
    res.status(400).json({ message: "Clubs insuffisants pour simuler cette compétition." });
    return;
  }

  const played = simulateCompetition(competition, clubs, {
    engine,
    step: body.step === true,
    replay: body.replay === true,
  });
  if (competition.format !== "league") advanceCompetition(competition, clubs);
  competition.updatedAt = Date.now();
  await writeStore(store);
  res.json({ competition: publicCompetition(competition, clubs), played });
});

/* --------------------------- Réinitialiser ------------------------ */

router.post("/league/competitions/:id/reset", async (req, res): Promise<void> => {
  const store = await readStore();
  const competition = store.competitions.find(item => item.id === req.params.id);
  if (!competition) {
    res.status(404).json({ message: "Compétition introuvable." });
    return;
  }
  const clubs = store.clubs.filter(club => competition.clubIds.includes(club.id));
  competition.fixtures = buildSchedule(competition, clubs);
  competition.updatedAt = Date.now();
  await writeStore(store);
  res.json({ competition: publicCompetition(competition, clubs) });
});

export default router;
