export type Background = {
  id: string;
  label: string;
  cssClass: string;
  sport: "football" | "hockey" | "both";
};

export const BACKGROUNDS: Background[] = [
  { id: "football-standard", label: "Standard",    cssClass: "pitch-bg",           sport: "football" },
  { id: "football-night",    label: "Nuit",         cssClass: "pitch-bg-night",     sport: "football" },
  { id: "football-retro",    label: "Rétro",        cssClass: "pitch-bg-retro",     sport: "football" },
  { id: "football-indoor",   label: "Indoor",       cssClass: "pitch-bg-indoor",    sport: "football" },
  { id: "football-red",      label: "Rouge",        cssClass: "pitch-bg-red",       sport: "football" },
  { id: "football-minimal",  label: "Minimal",      cssClass: "pitch-bg-minimal",   sport: "football" },
  { id: "football-gold",     label: "Or",           cssClass: "pitch-bg-gold",      sport: "football" },
  { id: "football-navy",     label: "Marine",       cssClass: "pitch-bg-navy",      sport: "football" },
  { id: "football-purple",   label: "Violet",       cssClass: "pitch-bg-purple",    sport: "football" },
  { id: "football-dark",     label: "Ardoise",      cssClass: "pitch-bg-dark",      sport: "football" },
  { id: "football-orange",   label: "Orange",       cssClass: "pitch-bg-orange",    sport: "football" },
  { id: "football-teal",     label: "Turquoise",    cssClass: "pitch-bg-teal",      sport: "football" },

  { id: "hockey-blue",       label: "Glace Bleue",  cssClass: "rink-bg",            sport: "hockey" },
  { id: "hockey-white",      label: "Glace Blanche",cssClass: "rink-bg-white",      sport: "hockey" },
  { id: "hockey-dark",       label: "Nuit",         cssClass: "rink-bg-dark",       sport: "hockey" },
  { id: "hockey-vintage",    label: "Vintage",      cssClass: "rink-bg-vintage",    sport: "hockey" },
  { id: "hockey-red",        label: "Rouge",        cssClass: "rink-bg-red",        sport: "hockey" },
  { id: "hockey-gold",       label: "Or",           cssClass: "rink-bg-gold",       sport: "hockey" },
];

export function getDefaultBackground(sport: "football" | "hockey"): string {
  return sport === "football" ? "football-standard" : "hockey-blue";
}

export function getBackgroundsForSport(sport: "football" | "hockey"): Background[] {
  return BACKGROUNDS.filter(b => b.sport === sport);
}
