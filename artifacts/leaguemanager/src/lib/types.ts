export type Sport = "football" | "hockey";
export type RatingMode = "classic" | "advanced";
export type CompetitionFormat = "league" | "cup" | "custom";
export type Engine = "fast" | "detail";

export type ClubRating = {
  overall: number;
  attack: number;
  midfield: number;
  defense: number;
};

export type Club = {
  id: string;
  name: string;
  shortName: string;
  city: string;
  country: string;
  sport: Sport;
  logo?: string;
  primaryColor: string;
  secondaryColor: string;
  ratingMode: RatingMode;
  rating: ClubRating;
};

export type CompetitionSettings = {
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  doubleRound: boolean;
  legs: 1 | 2;
  extraTime: boolean;
  penalties: boolean;
  groupCount: number;
  teamsPerGroup: number;
  qualifyPerGroup: number;
  seed: number;
  homeAdvantage: number;
};

export type MatchEvent = {
  minute: number;
  type: "goal" | "shot" | "save" | "card" | "injury" | "penalty";
  clubId: string;
  label: string;
};

export type Fixture = {
  id: string;
  stage: string;
  round: number;
  group?: string;
  homeId: string;
  awayId: string | null;
  leg: number;
  played: boolean;
  homeScore: number | null;
  awayScore: number | null;
  homePens: number | null;
  awayPens: number | null;
  extraTime: boolean;
  events: MatchEvent[];
};

export type StandingRow = {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  diff: number;
  points: number;
  form: ("V" | "N" | "D")[];
};

export type Competition = {
  id: string;
  name: string;
  sport: Sport;
  format: CompetitionFormat;
  settings: CompetitionSettings;
  clubIds: string[];
  fixtures: Fixture[];
  createdAt: number;
  updatedAt: number;
};

export type CompetitionDetail = Competition & {
  standings: StandingRow[];
  clubs: Club[];
};

export const DEFAULT_SETTINGS: CompetitionSettings = {
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  doubleRound: true,
  legs: 1,
  extraTime: true,
  penalties: true,
  groupCount: 2,
  teamsPerGroup: 4,
  qualifyPerGroup: 2,
  seed: 20261017,
  homeAdvantage: 0.15,
};

export const FORMAT_LABELS: Record<CompetitionFormat, string> = {
  league: "Ligue",
  cup: "Coupe",
  custom: "Personnalisé",
};

export const SPORT_LABELS: Record<Sport, string> = {
  football: "Football",
  hockey: "Hockey",
};

export function newClub(sport: Sport = "football"): Club {
  return {
    id: `club-${Math.random().toString(36).slice(2, 10)}`,
    name: "",
    shortName: "",
    city: "",
    country: "ISTANMUSTA",
    sport,
    primaryColor: "#c8ff3d",
    secondaryColor: "#0b0c0f",
    ratingMode: "classic",
    rating: { overall: 75, attack: 75, midfield: 75, defense: 75 },
  };
}

export function newCompetition(): Competition {
  return {
    id: `comp-${Math.random().toString(36).slice(2, 10)}`,
    name: "",
    sport: "football",
    format: "league",
    settings: { ...DEFAULT_SETTINGS },
    clubIds: [],
    fixtures: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
