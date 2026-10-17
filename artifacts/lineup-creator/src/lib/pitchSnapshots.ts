import type { Player } from "@/lib/formations";

/**
 * Snapshots de composition : copie rapide de l'état du terrain que l'on
 * peut restaurer en un clic (par exemple avant d'essayer le Best XI).
 */

export type PitchSnapshot = {
  id: string;
  name: string;
  savedAt: number;
  data: {
    sport: "football" | "hockey";
    formation: string;
    title: string;
    players: Player[];
    bench: Player[];
    jerseyColor: string;
    secondaryColor: string;
    accentColor: string;
    numberColor: string;
    jerseyStyle: string;
    backgroundId: string;
  };
};

const KEY = "istan-pitch-snapshots";

export function loadSnapshots(): PitchSnapshot[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw.slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function saveSnapshots(list: PitchSnapshot[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* quota dépassé : on garde les snapshots en mémoire pour la session */
  }
}

export function makeSnapshot(
  name: string,
  data: PitchSnapshot["data"],
): PitchSnapshot {
  return {
    id: `snap-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: name.trim() || `Snapshot ${new Date().toLocaleTimeString()}`,
    savedAt: Date.now(),
    data,
  };
}

/** Restaure un snapshot en extrayant uniquement les champs connus. */
export function snapshotToState(snapshot: PitchSnapshot): PitchSnapshot["data"] {
  return snapshot.data;
}
