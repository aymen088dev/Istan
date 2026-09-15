import type { Club } from "@/components/ClubsManager";
import type { SavedComposition } from "@/components/CompositionLibrary";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4_000);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      signal: controller.signal,
    });
  } catch {
    throw new Error("Synchronisation serveur indisponible");
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`Synchronisation impossible (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getSharedClubs(): Promise<Club[]> {
  const result = await request<{ clubs: Club[] }>("/clubs");
  return result.clubs;
}

export async function saveSharedClub(club: Club): Promise<Club> {
  const result = await request<{ club: Club }>(`/clubs/${encodeURIComponent(club.id)}`, {
    method: "PUT",
    body: JSON.stringify(club),
  });
  return result.club;
}

export function deleteSharedClub(id: string) {
  return request<void>(`/clubs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getSharedCompositions(): Promise<SavedComposition[]> {
  const result = await request<{ compositions: SavedComposition[] }>("/compositions");
  return result.compositions;
}

export async function saveSharedComposition(composition: SavedComposition): Promise<SavedComposition> {
  const result = await request<{ composition: SavedComposition }>(`/compositions/${encodeURIComponent(composition.id)}`, {
    method: "PUT",
    body: JSON.stringify(composition),
  });
  return result.composition;
}

export function deleteSharedComposition(id: string) {
  return request<void>(`/compositions/${encodeURIComponent(id)}`, { method: "DELETE" });
}