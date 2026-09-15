export type AppTheme = {
  id: string;
  name: string;
  description: string;
  /** Couleur d'accent (boutons actifs, sélections) — triplet HSL pour les tokens shadcn. */
  accentHsl: string;
  /** Texte posé sur l'accent. */
  accentForegroundHsl: string;
  /** Couleur des bordures de cadre et focus. */
  focusHsl: string;
  focusHex: string;
  accentHex: string;
  /** Dégradé du header / des barres. */
  headerGradient: string;
  /** Dégradé des onglets actifs et du logo. */
  activeGradient: string;
  /** Fond des dialogs. */
  panelGradient: string;
};

export const THEMES: AppTheme[] = [
  {
    id: "emerald",
    name: "Émeraude Néon",
    description: "Violet → bleu → vert, le thème signature",
    accentHsl: "262 84% 62%",
    accentForegroundHsl: "0 0% 100%",
    focusHsl: "160 84% 39%",
    focusHex: "#10b981",
    accentHex: "#7c3aed",
    headerGradient: "linear-gradient(90deg, #0d0a1a 0%, #0a1020 45%, #081410 100%)",
    activeGradient: "linear-gradient(135deg, #7c3aed 0%, #3b82f6 55%, #10b981 130%)",
    panelGradient: "linear-gradient(160deg, #0d0a1a 0%, #0a1020 45%, #081410 100%)",
  },
  {
    id: "ocean",
    name: "Océan Profond",
    description: "Bleus marins et cyans glacés",
    accentHsl: "199 89% 48%",
    accentForegroundHsl: "0 0% 100%",
    focusHsl: "187 85% 53%",
    focusHex: "#22d3ee",
    accentHex: "#0ea5e9",
    headerGradient: "linear-gradient(90deg, #020617 0%, #082f49 55%, #164e63 100%)",
    activeGradient: "linear-gradient(135deg, #0369a1 0%, #0ea5e9 60%, #22d3ee 130%)",
    panelGradient: "linear-gradient(160deg, #020617 0%, #082f49 50%, #164e63 100%)",
  },
  {
    id: "sunset",
    name: "Soleil Couchant",
    description: "Orange brûlé et rose crépusculaire",
    accentHsl: "24 95% 53%",
    accentForegroundHsl: "0 0% 100%",
    focusHsl: "350 89% 60%",
    focusHex: "#fb7185",
    accentHex: "#f97316",
    headerGradient: "linear-gradient(90deg, #1c0a09 0%, #431407 50%, #831843 100%)",
    activeGradient: "linear-gradient(135deg, #ea580c 0%, #f43f5e 60%, #fbbf24 130%)",
    panelGradient: "linear-gradient(160deg, #1c0a09 0%, #431407 45%, #500724 100%)",
  },
  {
    id: "royal",
    name: "Pourpre Royal",
    description: "Violet impérial rehaussé d'or",
    accentHsl: "271 91% 65%",
    accentForegroundHsl: "0 0% 100%",
    focusHsl: "45 96% 56%",
    focusHex: "#fbbf24",
    accentHex: "#a855f7",
    headerGradient: "linear-gradient(90deg, #17082d 0%, #2e1065 50%, #422006 100%)",
    activeGradient: "linear-gradient(135deg, #7e22ce 0%, #a855f7 55%, #f59e0b 130%)",
    panelGradient: "linear-gradient(160deg, #17082d 0%, #2e1065 50%, #422006 100%)",
  },
  {
    id: "forest",
    name: "Forêt Sombre",
    description: "Verts profonds et citronnelle",
    accentHsl: "142 71% 55%",
    accentForegroundHsl: "0 0% 0%",
    focusHsl: "82 84% 50%",
    focusHex: "#84cc16",
    accentHex: "#22c55e",
    headerGradient: "linear-gradient(90deg, #05140b 0%, #052e16 50%, #1a2e05 100%)",
    activeGradient: "linear-gradient(135deg, #15803d 0%, #22c55e 60%, #a3e635 130%)",
    panelGradient: "linear-gradient(160deg, #05140b 0%, #052e16 50%, #14532d 100%)",
  },
  {
    id: "midnight",
    name: "Minuit Glacé",
    description: "Ardoise froide et bleu cristal",
    accentHsl: "198 93% 60%",
    accentForegroundHsl: "0 0% 0%",
    focusHsl: "197 92% 74%",
    focusHex: "#7dd3fc",
    accentHex: "#38bdf8",
    headerGradient: "linear-gradient(90deg, #020617 0%, #0f172a 55%, #1e293b 100%)",
    activeGradient: "linear-gradient(135deg, #334155 0%, #0ea5e9 65%, #7dd3fc 130%)",
    panelGradient: "linear-gradient(160deg, #020617 0%, #0f172a 50%, #1e293b 100%)",
  },
  {
    id: "lava",
    name: "Lave Ardente",
    description: "Rouge braise sur basalte noir",
    accentHsl: "0 84% 60%",
    accentForegroundHsl: "0 0% 100%",
    focusHsl: "24 95% 53%",
    focusHex: "#f97316",
    accentHex: "#ef4444",
    headerGradient: "linear-gradient(90deg, #0c0404 0%, #450a0a 50%, #7f1d1d 100%)",
    activeGradient: "linear-gradient(135deg, #b91c1c 0%, #ef4444 55%, #f97316 130%)",
    panelGradient: "linear-gradient(160deg, #0c0404 0%, #450a0a 50%, #7c2d12 100%)",
  },
];

export const DEFAULT_THEME = THEMES[0];

export function themeById(id: string | null | undefined): AppTheme {
  return THEMES.find(theme => theme.id === id) ?? DEFAULT_THEME;
}

/**
 * Applique le thème à tout le site en réécrivant les variables CSS utilisées
 * par Tailwind v4 (les utilitaires `emerald-*` et `violet-*` référencent ces
 * variables) : panneaux, bordures, halos et dégradés suivent le thème sans
 * toucher au markup.
 */
export function applyTheme(theme: AppTheme) {
  const root = document.documentElement;
  const set = (name: string, value: string) => root.style.setProperty(name, value);
  // Couleur d'accent principale (boutons actifs, onglets, sélections).
  set("--primary", theme.accentHsl);
  set("--primary-foreground", theme.accentForegroundHsl);
  set("--ring", theme.focusHsl);
  // Familles de couleurs utilisées par les cadres « verts » et les dégradés
  // violet des panneaux Clubs/Effectif : on les remape vers le thème.
  set("--color-emerald-300", theme.focusHex);
  set("--color-emerald-400", theme.focusHex);
  set("--color-emerald-500", theme.focusHex);
  set("--color-emerald-950", theme.panelGradient.split("#").length > 2 ? hexBehind(theme.panelGradient) : theme.focusHex);
  set("--color-violet-950", theme.panelGradient.split("#").length > 1 ? hexLeading(theme.panelGradient) : theme.accentHex);
  set("--color-violet-900", mix(theme.accentHex, "#020617", 0.82));
  set("--color-violet-800", mix(theme.accentHex, "#020617", 0.64));
  set("--color-violet-400", theme.accentHex);
  set("--color-violet-300", mix(theme.accentHex, "#ffffff", 0.35));
  // Dégradés inline (header, barres, onglet actif, dialogs, logo).
  set("--theme-header", theme.headerGradient);
  set("--theme-active-gradient", theme.activeGradient);
  set("--theme-panel", theme.panelGradient);
}

/** Premier hex d'un dégradé CSS (fond sombre du panneau). */
function hexLeading(gradient: string) {
  const match = /#([0-9a-fA-F]{6})/.exec(gradient);
  return match ? `#${match[1]}` : "#0d0a1a";
}

/** Dernier hex d'un dégradé CSS (teinte profonde du panneau). */
function hexBehind(gradient: string) {
  const matches = [...gradient.matchAll(/#([0-9a-fA-F]{6})/g)];
  return matches.length ? `#${matches[matches.length - 1][1]}` : "#081410";
}

/** Mélange deux couleurs hex (ratio = part de a). */
function mix(a: string, b: string, ratio: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const va = (pa >> shift) & 0xff;
    const vb = (pb >> shift) & 0xff;
    return Math.round(va * ratio + vb * (1 - ratio));
  };
  return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`;
}

const STORAGE_KEY = "istan-theme";

export function loadTheme(): AppTheme {
  try {
    return themeById(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: AppTheme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme.id);
  } catch {
    /* stockage indisponible : le thème reste actif pour la session */
  }
}
