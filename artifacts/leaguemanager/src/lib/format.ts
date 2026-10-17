export function fmtDate(timestamp: number): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(timestamp: number): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Horloge de match : 90 minutes réglementaires puis les prolongations. */
export function fmtMinute(minute: number): string {
  if (minute <= 90) return `${minute}'`;
  return `+${minute - 90}'`;
}

export function fmtRatio(value: number): string {
  return `${Math.round(value * 100)} %`;
}

export function scoreText(homeScore: number | null, awayScore: number | null): string {
  if (homeScore === null || awayScore === null) return "—";
  return `${homeScore} – ${awayScore}`;
}

export function diffText(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}
