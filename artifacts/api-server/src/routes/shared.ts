import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import {
  db,
  lineupClubsTable,
  lineupCompositionsTable,
  type SharedPlayer,
  type SharedRosterPlayer,
} from "@workspace/db";

type MatchRecord = {
  opponent: string;
  scored: number;
  conceded: number;
  playedAt: number;
};

type ClubPayload = {
  id: string;
  name: string;
  logo?: string;
  jerseyColor: string;
  secondaryColor: string;
  accentColor: string;
  numberColor: string;
  jerseyStyle: string;
  backgroundId: string;
  category: "club" | "selection";
  roster?: SharedRosterPlayer[];
  isFavorite?: boolean;
  matchHistory?: MatchRecord[];
};

type CompositionPayload = {
  id: string;
  name: string;
  savedAt?: number;
  sport: "football" | "hockey";
  formation: string;
  title: string;
  players: SharedPlayer[];
  bench: SharedPlayer[];
  jerseyColor: string;
  secondaryColor: string;
  accentColor: string;
  numberColor?: string;
  jerseyStyle: string;
  backgroundId: string;
  showBench: boolean;
  showDetails: boolean;
};

type FileStore = {
  clubs: ClubPayload[];
  compositions: CompositionPayload[];
};

const router: IRouter = Router();
const filePath = process.env.SHARED_DATA_FILE || path.join(process.cwd(), "data", "lineup-shared.json");

function validText(value: unknown, fallback = "", max = 200) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function normalizeRoster(value: unknown): SharedRosterPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && typeof item === "object").slice(0, 80).map((item, index) => {
    const player = item as Record<string, unknown>;
    return {
      id: validText(player.id, `roster-${index}`),
      name: validText(player.name, `Joueur ${index + 1}`),
      age: Math.max(15, Math.min(45, Number(player.age) || 22)),
      rating: Math.max(1, Math.min(99, Number(player.rating) || 75)),
      nationality: validText(player.nationality, "ISTANMUSTA", 32).toUpperCase(),
      position: validText(player.position, "MC", 24).toUpperCase(),
      number: validText(player.number, String(index + 1), 4),
    };
  });
}

function normalizeClub(body: unknown, id?: string): ClubPayload | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const name = validText(value.name, "", 120);
  if (!name) return null;
  return {
    id: id || validText(value.id, `club-${randomUUID()}`, 100),
    name,
    logo: typeof value.logo === "string" ? value.logo.slice(0, 2_000_000) : undefined,
    jerseyColor: validText(value.jerseyColor, "#10b981", 20),
    secondaryColor: validText(value.secondaryColor, "#ffffff", 20),
    accentColor: validText(value.accentColor, "#064e3b", 20),
    numberColor: validText(value.numberColor, "#ffffff", 20),
    jerseyStyle: validText(value.jerseyStyle, "plain", 30),
    backgroundId: validText(value.backgroundId, "football-standard", 80),
    category: value.category === "selection" ? "selection" : "club",
    roster: normalizeRoster(value.roster),
    // Champs optionnels du nouveau menu club : favori synchronisé et
    // historique des matchs (trophées feuille de match).
    isFavorite: value.isFavorite === true ? true : undefined,
    matchHistory: (Array.isArray(value.matchHistory) ? value.matchHistory : [])
      .filter(item => item && typeof item === "object")
      .slice(0, 50)
      .map((item, index) => {
        const record = item as Record<string, unknown>;
        return {
          opponent: validText(record.opponent, `Adversaire ${index + 1}`, 120),
          scored: Math.max(0, Math.min(99, Number(record.scored) || 0)),
          conceded: Math.max(0, Math.min(99, Number(record.conceded) || 0)),
          playedAt: Number(record.playedAt) || Date.now(),
        };
      }),
  };
}

function normalizeComposition(body: unknown, id?: string): CompositionPayload | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const name = validText(value.name, "", 160);
  if (!name) return null;
  return {
    id: id || validText(value.id, `comp-${randomUUID()}`, 100),
    name,
    savedAt: Number(value.savedAt) || Date.now(),
    sport: value.sport === "hockey" ? "hockey" : "football",
    formation: validText(value.formation, "4-3-3", 100),
    title: validText(value.title, "XI DE DÉPART", 160),
    players: Array.isArray(value.players) ? value.players.slice(0, 40) as SharedPlayer[] : [],
    bench: Array.isArray(value.bench) ? value.bench.slice(0, 40) as SharedPlayer[] : [],
    jerseyColor: validText(value.jerseyColor, "#10b981", 20),
    secondaryColor: validText(value.secondaryColor, "#ffffff", 20),
    accentColor: validText(value.accentColor, "#064e3b", 20),
    numberColor: typeof value.numberColor === "string" ? value.numberColor : undefined,
    jerseyStyle: validText(value.jerseyStyle, "plain", 30),
    backgroundId: validText(value.backgroundId, "football-standard", 80),
    showBench: value.showBench !== false,
    showDetails: value.showDetails === true,
  };
}

async function readFileStore(): Promise<FileStore> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as FileStore;
  } catch {
    // Fichier principal illisible (écriture interrompue, crash…) : on tente
    // la sauvegarde .bak écrite lors de la précédente écriture réussie.
    try {
      return JSON.parse(await readFile(`${filePath}.bak`, "utf8")) as FileStore;
    } catch {
      return { clubs: [], compositions: [] };
    }
  }
}

/**
 * Écriture atomique + sauvegarde : le JSON est d'abord écrit dans un fichier
 * temporaire (fsync), puis renommé — un lecteur ne peut jamais tomber sur un
 * fichier à moitié écrit, et la version précédente reste disponible en .bak
 * si le processus meurt pendant le rename.
 */
async function writeFileStore(store: FileStore) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  const payload = JSON.stringify(store, null, 2);
  const handle = await writeFile(tmp, payload, "utf8").then(() => open(tmp, "r+"));
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  // Le .bak précédent est remplacé après la réussite du rename.
  await rename(tmp, filePath).catch(async error => {
    await unlink(tmp).catch(() => undefined);
    throw error;
  });
  await writeFile(`${filePath}.bak`, payload, "utf8").catch(() => undefined);
}

function clubFromRow(row: typeof lineupClubsTable.$inferSelect): ClubPayload {
  return {
    id: row.id,
    name: row.name,
    logo: row.logo ?? undefined,
    jerseyColor: row.jerseyColor,
    secondaryColor: row.secondaryColor,
    accentColor: row.accentColor,
    numberColor: row.numberColor,
    jerseyStyle: row.jerseyStyle,
    backgroundId: row.backgroundId,
    category: row.category === "selection" ? "selection" : "club",
    roster: row.roster ?? [],
  };
}

function compositionFromRow(row: typeof lineupCompositionsTable.$inferSelect): CompositionPayload {
  return {
    id: row.id,
    name: row.name,
    savedAt: row.savedAt.getTime(),
    sport: row.sport === "hockey" ? "hockey" : "football",
    formation: row.formation,
    title: row.title,
    players: row.players ?? [],
    bench: row.bench ?? [],
    jerseyColor: row.jerseyColor,
    secondaryColor: row.secondaryColor,
    accentColor: row.accentColor,
    numberColor: row.numberColor ?? undefined,
    jerseyStyle: row.jerseyStyle,
    backgroundId: row.backgroundId,
    showBench: row.showBench,
    showDetails: row.showDetails,
  };
}

router.get("/clubs", async (_req, res): Promise<void> => {
  if (db) {
    const rows = await db.select().from(lineupClubsTable).orderBy(desc(lineupClubsTable.updatedAt));
    res.json({ clubs: rows.map(clubFromRow) });
    return;
  }
  const store = await readFileStore();
  res.json({ clubs: store.clubs });
});

router.put("/clubs/:id", async (req, res): Promise<void> => {
  const id = validText(req.params.id, "", 100);
  const club = normalizeClub(req.body, id);
  if (!club) {
    res.status(400).json({ message: "Club invalide." });
    return;
  }
  if (db) {
    const [row] = await db.insert(lineupClubsTable).values({
      id: club.id,
      name: club.name,
      logo: club.logo ?? null,
      jerseyColor: club.jerseyColor,
      secondaryColor: club.secondaryColor,
      accentColor: club.accentColor,
      numberColor: club.numberColor,
      jerseyStyle: club.jerseyStyle,
      backgroundId: club.backgroundId,
      category: club.category,
      roster: club.roster,
    }).onConflictDoUpdate({
      target: lineupClubsTable.id,
      set: {
        name: club.name,
        logo: club.logo ?? null,
        jerseyColor: club.jerseyColor,
        secondaryColor: club.secondaryColor,
        accentColor: club.accentColor,
        numberColor: club.numberColor,
        jerseyStyle: club.jerseyStyle,
        backgroundId: club.backgroundId,
        category: club.category,
        roster: club.roster,
        updatedAt: new Date(),
      },
    }).returning();
    res.json({ club: clubFromRow(row) });
    return;
  }
  const store = await readFileStore();
  const index = store.clubs.findIndex(item => item.id === club.id);
  if (index >= 0) store.clubs[index] = club;
  else store.clubs.unshift(club);
  await writeFileStore(store);
  res.json({ club });
});

router.delete("/clubs/:id", async (req, res): Promise<void> => {
  const id = validText(req.params.id, "", 100);
  if (db) {
    await db.delete(lineupClubsTable).where(eq(lineupClubsTable.id, id));
  } else {
    const store = await readFileStore();
    store.clubs = store.clubs.filter(club => club.id !== id);
    await writeFileStore(store);
  }
  res.status(204).send();
});

router.get("/compositions", async (_req, res): Promise<void> => {
  if (db) {
    const rows = await db.select().from(lineupCompositionsTable).orderBy(desc(lineupCompositionsTable.updatedAt));
    res.json({ compositions: rows.map(compositionFromRow) });
    return;
  }
  const store = await readFileStore();
  res.json({ compositions: store.compositions.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0)) });
});

router.put("/compositions/:id", async (req, res): Promise<void> => {
  const id = validText(req.params.id, "", 100);
  const composition = normalizeComposition(req.body, id);
  if (!composition) {
    res.status(400).json({ message: "Composition invalide." });
    return;
  }
  const savedAt = new Date(composition.savedAt || Date.now());
  if (db) {
    const [row] = await db.insert(lineupCompositionsTable).values({
      id: composition.id,
      name: composition.name,
      savedAt,
      sport: composition.sport,
      formation: composition.formation,
      title: composition.title,
      players: composition.players,
      bench: composition.bench,
      jerseyColor: composition.jerseyColor,
      secondaryColor: composition.secondaryColor,
      accentColor: composition.accentColor,
      numberColor: composition.numberColor ?? null,
      jerseyStyle: composition.jerseyStyle,
      backgroundId: composition.backgroundId,
      showBench: composition.showBench,
      showDetails: composition.showDetails,
    }).onConflictDoUpdate({
      target: lineupCompositionsTable.id,
      set: {
        name: composition.name,
        sport: composition.sport,
        formation: composition.formation,
        title: composition.title,
        players: composition.players,
        bench: composition.bench,
        jerseyColor: composition.jerseyColor,
        secondaryColor: composition.secondaryColor,
        accentColor: composition.accentColor,
        numberColor: composition.numberColor ?? null,
        jerseyStyle: composition.jerseyStyle,
        backgroundId: composition.backgroundId,
        showBench: composition.showBench,
        showDetails: composition.showDetails,
        updatedAt: new Date(),
      },
    }).returning();
    res.json({ composition: compositionFromRow(row) });
    return;
  }
  const store = await readFileStore();
  const index = store.compositions.findIndex(item => item.id === composition.id);
  if (index >= 0) store.compositions[index] = composition;
  else store.compositions.unshift(composition);
  await writeFileStore(store);
  res.json({ composition });
});

router.delete("/compositions/:id", async (req, res): Promise<void> => {
  const id = validText(req.params.id, "", 100);
  if (db) {
    await db.delete(lineupCompositionsTable).where(eq(lineupCompositionsTable.id, id));
  } else {
    const store = await readFileStore();
    store.compositions = store.compositions.filter(composition => composition.id !== id);
    await writeFileStore(store);
  }
  res.status(204).send();
});

export default router;