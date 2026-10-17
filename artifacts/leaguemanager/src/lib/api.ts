import type { Club, Competition, CompetitionDetail, Engine } from "./types";

async function request<T>(path: string, init?: RequestInit, timeoutMs = 8_000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
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
    throw new Error("Serveur LeagueManager injoignable.");
  } finally {
    window.clearTimeout(timer);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(payload.message || `Requête refusée (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/* ------------------------------- Clubs ------------------------------- */

export async function getClubs(): Promise<Club[]> {
  const result = await request<{ clubs: Club[] }>("/league/clubs");
  return result.clubs;
}

export async function saveClub(club: Club): Promise<Club> {
  const result = await request<{ club: Club }>(`/league/clubs/${encodeURIComponent(club.id)}`, {
    method: "PUT",
    body: JSON.stringify(club),
  });
  return result.club;
}

export function deleteClub(id: string): Promise<void> {
  return request<void>(`/league/clubs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/* --------------------------- Compétitions ---------------------------- */

export async function getCompetitions(): Promise<Competition[]> {
  const result = await request<{ competitions: Competition[] }>("/league/competitions");
  return result.competitions;
}

export async function getCompetition(id: string): Promise<CompetitionDetail> {
  const result = await request<{ competition: CompetitionDetail }>(
    `/league/competitions/${encodeURIComponent(id)}`,
  );
  return result.competition;
}

export async function saveCompetition(competition: Competition): Promise<CompetitionDetail> {
  const result = await request<{ competition: CompetitionDetail }>(
    `/league/competitions/${encodeURIComponent(competition.id)}`,
    { method: "PUT", body: JSON.stringify(competition), }, 12_000,
  );
  return result.competition;
}

export function deleteCompetition(id: string): Promise<void> {
  return request<void>(`/league/competitions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function resetCompetition(id: string): Promise<CompetitionDetail> {
  const result = await request<{ competition: CompetitionDetail }>(
    `/league/competitions/${encodeURIComponent(id)}/reset`,
    { method: "POST", body: "{}" },
    15_000,
  );
  return result.competition;
}

export type SimulateOptions = {
  engine: Engine;
  step?: boolean;
  replay?: boolean;
};

export async function simulateCompetition(
  id: string,
  options: SimulateOptions,
): Promise<{ competition: CompetitionDetail; played: number }> {
  return request<{ competition: CompetitionDetail; played: number }>(
    `/league/competitions/${encodeURIComponent(id)}/simulate`,
    { method: "POST", body: JSON.stringify(options) },
    20_000,
  );
}

/**
 * Envoie un logo (data URL base64) au serveur, qui le stocke dans son dossier
 * d'uploads et renvoie son URL publique. En cas d'échec, l'appelant garde le
 * data URL local : le club reste utilisable.
 */
export async function uploadLogo(dataUrl: string): Promise<string> {
  const result = await request<{ url: string }>("/uploads", {
    method: "POST",
    body: JSON.stringify({ data: dataUrl }),
  }, 20_000);
  return result.url;
}
