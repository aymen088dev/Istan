/**
 * Sauvegarde complète : exporte tout le contenu local (clubs, effectifs,
 * compositions, bibliothèque, snapshots) dans un fichier JSON, et le
 * restaure depuis ce même fichier. Pratique pour migrer de serveur ou
 * garder une copie de sécurité.
 */

import { loadClubs } from "@/components/ClubsManager";
import { loadCompositions } from "@/components/CompositionLibrary";
import { loadPlayerLibrary, PLAYER_LIBRARY_KEY } from "@/lib/playerLibrary";
import { loadSnapshots } from "@/lib/pitchSnapshots";

export type BackupPayload = {
  format: "istan-backup";
  version: 1;
  exportedAt: string;
  clubs: unknown;
  compositions: unknown;
  players: unknown;
  snapshots: unknown;
};

export function buildBackup(): BackupPayload {
  return {
    format: "istan-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    clubs: loadClubs(),
    compositions: loadCompositions(),
    players: loadPlayerLibrary(),
    snapshots: loadSnapshots(),
  };
}

export function downloadBackup() {
  const payload = buildBackup();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `istan-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export type ImportSummary = { clubs: number; compositions: number; players: number; snapshots: number };

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Restaure une sauvegarde. Fusionne plutôt qu'écraser quand possible. */
export function restoreBackup(payload: unknown): ImportSummary {
  const data = payload as Partial<BackupPayload>;
  if (!data || data.format !== "istan-backup") {
    throw new Error("Fichier de sauvegarde invalide");
  }

  const clubs = asArray(data.clubs);
  const compositions = asArray(data.compositions);
  const players = asArray(data.players);
  const snapshots = asArray(data.snapshots);

  if (clubs.length > 0) {
    try {
      const existing = loadClubs();
      const byId = new Map(existing.map(c => [c.id, c]));
      for (const club of clubs) {
        const imported = club as { id?: string };
        if (imported?.id) byId.set(imported.id, club as never);
      }
      localStorage.setItem("istan-clubs-v1", JSON.stringify([...byId.values()]));
    } catch {
      /* clubs indisponibles : on continue avec le reste */
    }
  }

  if (compositions.length > 0) {
    try {
      const existing = loadCompositions();
      const byId = new Map(existing.map(c => [c.id, c]));
      for (const compo of compositions) {
        const imported = compo as { id?: string };
        if (imported?.id) byId.set(imported.id, compo as never);
      }
      localStorage.setItem("lineup-saved-compositions", JSON.stringify([...byId.values()]));
    } catch {
      /* compositions indisponibles */
    }
  }

  if (players.length > 0) {
    try {
      const existing = asArray(JSON.parse(localStorage.getItem(PLAYER_LIBRARY_KEY) || "[]"));
      const seen = new Set(existing.map(p => (p as { name?: string }).name?.toLowerCase()));
      const merged = [...existing, ...players.filter(p => {
        const name = (p as { name?: string }).name?.toLowerCase();
        return name && !seen.has(name);
      })];
      localStorage.setItem(PLAYER_LIBRARY_KEY, JSON.stringify(merged));
    } catch {
      /* bibliothèque indisponible */
    }
  }

  if (snapshots.length > 0) {
    try {
      const existing = loadSnapshots();
      const byId = new Map(existing.map(s => [s.id, s]));
      for (const snap of snapshots) {
        const imported = snap as { id?: string };
        if (imported?.id) byId.set(imported.id, snap as never);
      }
      localStorage.setItem("istan-pitch-snapshots", JSON.stringify([...byId.values()]));
    } catch {
      /* snapshots indisponibles */
    }
  }

  return {
    clubs: clubs.length,
    compositions: compositions.length,
    players: players.length,
    snapshots: snapshots.length,
  };
}

export function readBackupFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch {
        reject(new Error("JSON illisible"));
      }
    };
    reader.onerror = () => reject(new Error("Lecture impossible"));
    reader.readAsText(file);
  });
}
