export type GamePhase =
  | 'SETUP'
  | 'INAUGURAL_DRAFT'
  | 'REGULAR_SEASON'
  | 'PLAYOFFS_COMPLETE'
  | 'ROOKIE_DRAFT'
  | 'ROSTER_CUTS';

export type LeagueId = 'AL' | 'NL';
export type DivisionName = 'East' | 'Central' | 'West';
export type HitterPosition = 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH';
export type PitcherPosition = 'SP' | 'RP';
export type PlayerPosition = HitterPosition | PitcherPosition;
export type CardTheme = 'CHROME' | 'GOLD' | 'EMERALD' | 'OBSIDIAN';

export interface HitterStats {
  g: number;
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  so: number;
  sb: number;
}

export interface PitcherStats {
  g: number;
  gs: number;
  w: number;
  l: number;
  sv: number;
  ipOuts: number;
  h: number;
  er: number;
  bb: number;
  so: number;
}

export type PlayerSeasonStats = HitterStats | PitcherStats;

export interface PlayerSeasonHistoryEntry {
  year: number;
  teamId: string;
  ovr: number;
  stats: Record<string, number>;
}

export interface Player {
  id: string;
  name: string;
  age: number;
  bats: 'L' | 'R' | 'S';
  throws: 'L' | 'R';
  isPitcher: boolean;
  position: PlayerPosition;
  teamId: string | null;
  ovr: number;
  potential: number;
  power?: number;
  speed?: number;
  glove?: number;
  velocity?: number;
  control?: number;
  finesse?: number;
  fatigue?: number;
  draftYear?: number;
  seasonStats: Record<string, number>;
  careerStats: Record<string, number>;
  seasonHistory?: PlayerSeasonHistoryEntry[];
}

export interface Team {
  id: string;
  city: string;
  name: string;
  league: LeagueId;
  division: DivisionName;
  color: string;
  accent: string;
  wins: number;
  losses: number;
  runsScored: number;
  runsAllowed: number;
  streak: number;
  last10: string[];
  championships: number;
}

export interface DraftPick {
  id: string;
  year: number;
  round: number;
  originalTeamId: string;
  ownerTeamId: string;
}

export interface DraftSlot {
  pickNum: number;
  round: number;
  teamId: string;
  originalTeamId: string;
  pickId?: string;
}

export interface DraftHistoryEntry extends DraftSlot {
  player: Player;
}

export interface SeriesResult {
  winnerId: string;
  winnerCity: string;
  winnerName: string;
  loserId: string;
  loserCity: string;
  loserName: string;
  score: string;
}

export interface PlayoffResults {
  alSeeds: string[];
  nlSeeds: string[];
  rounds: {
    wildCard: SeriesResult[];
    divisional: SeriesResult[];
    championship: SeriesResult[];
    worldSeries: SeriesResult;
  };
  championId: string;
  championCity: string;
  championName: string;
  runnerUpId: string;
  runnerUpCity: string;
  runnerUpName: string;
}

export interface ChampionHistoryEntry {
  year: number;
  championId: string;
  championCity: string;
  championName: string;
  championColor: string;
  championAccent: string;
  runnerUpId: string;
  runnerUpCity: string;
  runnerUpName: string;
  score: string;
}

export interface TransactionEntry {
  id: string;
  year: number;
  day: number;
  category: string;
  summary: string;
}

export interface RecentGameEntry {
  day: number;
  homeId: string;
  awayId: string;
  homeRuns: number;
  awayRuns: number;
  userWon: boolean;
}

export interface SavedPlayerCard {
  id: string;
  ownerId: string;
  franchiseId: string;
  playerId: string;
  name: string;
  age: number;
  bats: 'L' | 'R' | 'S';
  throws: 'L' | 'R';
  isPitcher: boolean;
  position: PlayerPosition;
  teamId: string;
  ovr: number;
  potential: number;
  power?: number;
  speed?: number;
  glove?: number;
  velocity?: number;
  control?: number;
  finesse?: number;
  cardTheme: CardTheme;
  notes: string;
  isCustom: boolean;
  seasonStats: Record<string, number>;
  careerStats: Record<string, number>;
  seasonHistory: PlayerSeasonHistoryEntry[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DivisionSnapshotTeam {
  teamId: string;
  wins: number;
  losses: number;
  winPct: number;
  runDiff: number;
}

export interface SeasonSnapshot {
  id: string;
  ownerId: string;
  franchiseId: string;
  year: number;
  day: number;
  isSeasonEnd: boolean;
  userTeamId: string;
  userWins: number;
  userLosses: number;
  userWinPct: number;
  userRunDiff: number;
  divisionLeaderWinPct: number;
  divisionRank: number;
  leagueRank: number;
  divisionSnapshots: DivisionSnapshotTeam[];
  topHrLeader: string;
  topEraLeader: string;
  championTeamId?: string;
  createdAt?: unknown;
}

export interface LeagueRecord {
  id: string;
  ownerId: string;
  franchiseId: string;
  recordKey: string;
  scope: 'LEAGUE' | 'AL' | 'NL' | 'DIVISION';
  scopeLabel: string;
  category: 'TEAM' | 'BATTING' | 'PITCHING';
  title: string;
  holderName: string;
  teamId: string;
  value: number;
  displayValue: string;
  year: number;
  day: number;
  updatedAt?: unknown;
}

export interface FranchiseSummary {
  id: string;
  ownerId: string;
  name: string;
  userTeamId: string;
  year: number;
  phase: GamePhase;
  currentDay: number;
  currentPickIdx: number;
  teams: Team[];
  championsHistory: ChampionHistoryEntry[];
  transactions: TransactionEntry[];
  recentGames: RecentGameEntry[];
  playoffResults?: PlayoffResults | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}
