import type { Player } from "@/lib/formations";

export const PLAYER_LIBRARY_KEY = "lineup-player-library";
const CLUBS_KEY = "istan-clubs-v1";

export type LibraryPlayer = Omit<Player, "id" | "x" | "y">;

type StoredClubRoster = {
  name?: unknown;
  roster?: Array<{
    name?: unknown;
    number?: unknown;
    position?: unknown;
    nationality?: unknown;
    rating?: unknown;
  }>;
};

export function loadPlayerLibrary(): LibraryPlayer[] {
  try {
    return JSON.parse(localStorage.getItem(PLAYER_LIBRARY_KEY) || "[]");
  } catch {
    return [];
  }
}

function loadClubRosterPlayers(): LibraryPlayer[] {
  try {
    const stored = JSON.parse(localStorage.getItem(CLUBS_KEY) || "[]");
    if (!Array.isArray(stored)) return [];

    return stored.flatMap((club: StoredClubRoster) => {
      const clubName = typeof club?.name === "string" ? club.name.trim() : "";
      if (!clubName || !Array.isArray(club.roster)) return [];

      return club.roster
        .filter(player => typeof player?.name === "string" && player.name.trim())
        .map(player => ({
          name: String(player.name).trim(),
          number: typeof player.number === "string" ? player.number : String(player.number ?? ""),
          position: typeof player.position === "string" ? player.position : "—",
          nationality: typeof player.nationality === "string" ? player.nationality : "ISTANMUSTA",
          club: clubName,
          rating: typeof player.rating === "number" ? player.rating : 75,
          isCaptain: false,
        }));
    });
  } catch {
    return [];
  }
}

/**
 * The picker must reflect the club effectifs even when a player has not
 * previously been placed on the pitch. Manual library entries stay available
 * below the synchronized club entries.
 */
export function loadSynchronizedPlayerLibrary(): LibraryPlayer[] {
  const clubPlayers = loadClubRosterPlayers();
  const clubPlayerNames = new Set(clubPlayers.map(player => player.name.trim().toLowerCase()));
  const manualPlayers = loadPlayerLibrary().filter(player => (
    !clubPlayerNames.has(player.name.trim().toLowerCase())
  ));
  return [...clubPlayers, ...manualPlayers];
}

export function savePlayerLibrary(list: LibraryPlayer[]) {
  localStorage.setItem(PLAYER_LIBRARY_KEY, JSON.stringify(list));
}

export function isRealPlayerName(name: string) {
  const normalized = name.trim();
  return normalized.length > 0 && !/^(joueur|rmp)\s+\d+$/i.test(normalized);
}

export function toLibraryPlayer(player: Player): LibraryPlayer {
  return {
    name: player.name.trim(),
    number: player.number,
    position: player.position,
    nationality: player.nationality,
    club: player.club,
    rating: player.rating ?? 80,
    isCaptain: false,
  };
}

export function upsertPlayerInLibrary(
  player: Player,
  existing = loadPlayerLibrary(),
): LibraryPlayer[] {
  if (!isRealPlayerName(player.name)) return existing;

  const entry = toLibraryPlayer(player);
  const matchIndex = existing.findIndex(
    saved => saved.name.trim().toLowerCase() === entry.name.toLowerCase(),
  );

  if (matchIndex === -1) return [entry, ...existing];

  return existing.map((saved, index) => (
    index === matchIndex ? { ...saved, ...entry } : saved
  ));
}

export function upsertPlayersInLibrary(players: Player[]) {
  let next = loadPlayerLibrary();
  for (const player of players) next = upsertPlayerInLibrary(player, next);
  if (players.some(player => isRealPlayerName(player.name))) savePlayerLibrary(next);
  return next;
}