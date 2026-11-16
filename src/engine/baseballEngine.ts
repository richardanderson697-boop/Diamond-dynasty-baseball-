import {
  DraftPick,
  DivisionSnapshotTeam,
  HitterPosition,
  LeagueRecord,
  Player,
  PlayerPosition,
  PlayoffResults,
  SeasonSnapshot,
  SeriesResult,
  Team,
} from '../types/baseball';
import { getStadiumByTeamId } from '../data/stadiums';

export const FIRST_NAMES = [
  'Marcus', 'Jalen', 'Bryce', 'Shohei', 'Mookie', 'Freddie', 'Gerrit', 'Corbin',
  'Gunnar', 'Bobby', 'Elly', 'Julio', 'Ronald', 'Juan', 'Aaron', 'Trea', 'Corey',
  'Zack', 'Logan', 'Tarik', 'Paul', 'Spencer', 'Dylan', 'Cole', 'Max', 'Austin',
  'Matt', 'Pete', 'Rafael', 'Bo', 'Vladimir', 'Kyle', 'Yordan', 'Jose', 'Manny',
  'Fernando', 'Ketel', 'Christian', 'William', 'Adley', 'Cal', 'Will', 'Salvador',
  'J.T.', 'Gabriel', 'Francisco', 'Dansby', 'Willy', 'Oneil', 'CJ', 'Jackson',
  'Wyatt', 'Junior', 'Marcelo', 'Roman', 'Ethan', 'Walker', 'Chase', 'Hagen',
  'Charlie', 'Travis', 'Jac', 'Nick', 'Braden', 'Cam', 'Colt', 'Mason', 'Emmanuel',
  'Devin', 'Josh', 'Edwin', 'Raisel', 'Kenley', 'Camilo', 'Andres', 'Ryan', 'Felix',
  'Clay', 'Tanner', 'Kirby', 'Lucas', 'Hunter', 'Garrett', 'Shota', 'Yoshinobu',
  'Kodai', 'Roki', 'Yu', 'Luis', 'Framber', 'Cristian', 'Pablo', 'Sandy', 'Eury',
  'Jesus', 'Brayan', 'Nolan', 'Alex', 'Isaac', 'Royce', 'Byron', 'Carlos', 'George',
  'Teoscar', 'Lourdes', 'Anthony', 'Jazz',
];

export const LAST_NAMES = [
  'Trout', 'Judge', 'Betts', 'Ohtani', 'Freeman', 'Harper', 'Soto', 'Acuna',
  'Witt', 'Henderson', 'De La Cruz', 'Rodriguez', 'Carroll', 'Tucker', 'Alvarez',
  'Ramirez', 'Machado', 'Tatis', 'Lindor', 'Seager', 'Semien', 'Olson', 'Riley',
  'Alonso', 'Devers', 'Guerrero', 'Bichette', 'Rutschman', 'Smith', 'Contreras',
  'Raleigh', 'Perez', 'Cole', 'Burnes', 'Wheeler', 'Skubal', 'Skenes', 'Webb',
  'Strider', 'Cease', 'Ragans', 'Fried', 'Snell', 'Glasnow', 'Yamamoto', 'Imanaga',
  'Castillo', 'Valdez', 'Lopez', 'Alcantara', 'Gallen', 'Nola', 'Verlander', 'Scherzer',
  'Kershaw', 'Sale', 'Clase', 'Hader', 'Diaz', 'Williams', 'Helsley', 'Munoz',
  'Bautista', 'Miller', 'Duran', 'Chapman', 'Arenado', 'Goldschmidt', 'Bregman',
  'Correa', 'Buxton', 'Springer', 'Hernandez', 'Santander', 'Ozuna', 'Schwarber',
  'Realmuto', 'Turner', 'Swanson', 'Adames', 'Cruz', 'Abrams', 'Merrill', 'Chourio',
  'Langford', 'Crews', 'Holliday', 'Caminero', 'Mayer', 'Anthony', 'Bazzana',
  'Condon', 'Caglianone', 'Kurtz', 'Burns', 'Montgomery', 'Rooker', 'Bleday',
];

export interface TeamConfig {
  id: string;
  city: string;
  name: string;
  league: 'AL' | 'NL';
  division: 'East' | 'Central' | 'West';
  color: string;
  accent: string;
}

export const TEAM_CONFIGS: TeamConfig[] = [
  // American League (16 teams: 6 East, 5 Central, 5 West)
  { id: 'NYY', city: 'New York', name: 'Empires', league: 'AL', division: 'East', color: '#1E3A8A', accent: '#E2E8F0' },
  { id: 'BOS', city: 'Boston', name: 'Pilgrims', league: 'AL', division: 'East', color: '#991B1B', accent: '#F8FAFC' },
  { id: 'TOR', city: 'Toronto', name: 'Falcons', league: 'AL', division: 'East', color: '#1D4ED8', accent: '#38BDF8' },
  { id: 'BAL', city: 'Baltimore', name: 'Clippers', league: 'AL', division: 'East', color: '#C2410C', accent: '#FDBA74' },
  { id: 'TBR', city: 'Tampa Bay', name: 'Stingrays', league: 'AL', division: 'East', color: '#0F766E', accent: '#5EEAD4' },
  { id: 'MTL', city: 'Montreal', name: 'Royals', league: 'AL', division: 'East', color: '#0369A1', accent: '#F43F5E' },

  { id: 'CLE', city: 'Cleveland', name: 'Spiders', league: 'AL', division: 'Central', color: '#B91C1C', accent: '#1E293B' },
  { id: 'MIN', city: 'Minnesota', name: 'North Stars', league: 'AL', division: 'Central', color: '#1E40AF', accent: '#DC2626' },
  { id: 'KCR', city: 'Kansas City', name: 'Monarchs', league: 'AL', division: 'Central', color: '#1D4ED8', accent: '#FACC15' },
  { id: 'DET', city: 'Detroit', name: 'Motors', league: 'AL', division: 'Central', color: '#1E293B', accent: '#EA580C' },
  { id: 'CHW', city: 'Chicago', name: 'Sox', league: 'AL', division: 'Central', color: '#18181B', accent: '#D4D4D8' },

  { id: 'HOU', city: 'Houston', name: 'Apollos', league: 'AL', division: 'West', color: '#C2410C', accent: '#1E3A8A' },
  { id: 'SEA', city: 'Seattle', name: 'Cascades', league: 'AL', division: 'West', color: '#0F766E', accent: '#38BDF8' },
  { id: 'TEX', city: 'Texas', name: 'Marshals', league: 'AL', division: 'West', color: '#1D4ED8', accent: '#DC2626' },
  { id: 'LAA', city: 'Anaheim', name: 'Halos', league: 'AL', division: 'West', color: '#B91C1C', accent: '#FDE047' },
  { id: 'OAK', city: 'Las Vegas', name: 'Aces', league: 'AL', division: 'West', color: '#15803D', accent: '#FACC15' },

  // National League (16 teams: 6 East, 5 Central, 5 West)
  { id: 'ATL', city: 'Atlanta', name: 'Hammers', league: 'NL', division: 'East', color: '#991B1B', accent: '#1E3A8A' },
  { id: 'PHI', city: 'Philadelphia', name: 'Founders', league: 'NL', division: 'East', color: '#B91C1C', accent: '#60A5FA' },
  { id: 'NYM', city: 'Queens', name: 'Metros', league: 'NL', division: 'East', color: '#1D4ED8', accent: '#EA580C' },
  { id: 'MIA', city: 'Miami', name: 'Sharks', league: 'NL', division: 'East', color: '#0284C7', accent: '#F43F5E' },
  { id: 'WSN', city: 'Washington', name: 'Senators', league: 'NL', division: 'East', color: '#991B1B', accent: '#E2E8F0' },
  { id: 'CHA', city: 'Charlotte', name: 'Flight', league: 'NL', division: 'East', color: '#4338CA', accent: '#2DD4BF' },

  { id: 'MIL', city: 'Milwaukee', name: 'Barons', league: 'NL', division: 'Central', color: '#1E3A8A', accent: '#EAB308' },
  { id: 'CHC', city: 'Chicago', name: 'Bruins', league: 'NL', division: 'Central', color: '#1D4ED8', accent: '#EF4444' },
  { id: 'STL', city: 'St. Louis', name: 'Archers', league: 'NL', division: 'Central', color: '#B91C1C', accent: '#FACC15' },
  { id: 'CIN', city: 'Cincinnati', name: 'Steamers', league: 'NL', division: 'Central', color: '#DC2626', accent: '#F8FAFC' },
  { id: 'PIT', city: 'Pittsburgh', name: 'Forgers', league: 'NL', division: 'Central', color: '#18181B', accent: '#EAB308' },

  { id: 'LAD', city: 'Los Angeles', name: 'Knights', league: 'NL', division: 'West', color: '#1D4ED8', accent: '#F8FAFC' },
  { id: 'SDP', city: 'San Diego', name: 'Surf', league: 'NL', division: 'West', color: '#78350F', accent: '#FACC15' },
  { id: 'ARI', city: 'Arizona', name: 'Vipers', league: 'NL', division: 'West', color: '#9F1239', accent: '#14B8A6' },
  { id: 'SFG', city: 'San Francisco', name: 'Baymen', league: 'NL', division: 'West', color: '#C2410C', accent: '#18181B' },
  { id: 'COL', city: 'Colorado', name: 'Peaks', league: 'NL', division: 'West', color: '#581C87', accent: '#CBD5E1' },
];

export const HITTER_POSITIONS: HitterPosition[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
export const PITCHER_POSITIONS = ['SP', 'RP'] as const;

export const clamp = (val: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(val)));

function randGaussian(mean: number, stdDev: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * stdDev + mean;
}

export function calculateOverall(player: {
  isPitcher: boolean;
  position: PlayerPosition;
  velocity?: number;
  control?: number;
  finesse?: number;
  power?: number;
  speed?: number;
  glove?: number;
}): number {
  if (player.isPitcher) {
    const raw =
      (player.velocity ?? 50) * 0.36 +
      (player.control ?? 50) * 0.34 +
      (player.finesse ?? 50) * 0.30;
    return clamp(raw, 20, 99);
  }
  const pos = player.position;
  let wPow = 0.4;
  let wSpd = 0.3;
  let wGlv = 0.3;
  if (pos === 'DH' || pos === '1B') {
    wPow = 0.55;
    wSpd = 0.2;
    wGlv = 0.25;
  } else if (pos === 'C' || pos === 'SS' || pos === 'CF') {
    wPow = 0.32;
    wSpd = 0.3;
    wGlv = 0.38;
  }
  const raw =
    (player.power ?? 50) * wPow +
    (player.speed ?? 50) * wSpd +
    (player.glove ?? 50) * wGlv;
  return clamp(raw, 20, 99);
}

export function createEmptySeasonStats(isPitcher: boolean): Record<string, number> {
  if (isPitcher) {
    return { g: 0, gs: 0, w: 0, l: 0, sv: 0, ipOuts: 0, h: 0, er: 0, bb: 0, so: 0 };
  }
  return { g: 0, ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0, sb: 0 };
}

let globalPlayerCounter = 1;

export function resetPlayerCounter(val = 1): void {
  globalPlayerCounter = val;
}

export function generatePlayer(options: {
  isRookie?: boolean;
  forcedPitcher?: boolean | null;
  forcedPos?: PlayerPosition | null;
  talentTier?: 'generational' | 'high' | 'mid' | 'low' | null;
} = {}): Player {
  const { isRookie = false, forcedPitcher = null, forcedPos = null, talentTier = null } = options;
  const id = `PLR-${globalPlayerCounter++}-${Math.random().toString(36).substring(2, 6)}`;
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];

  const isPitcher = forcedPitcher !== null ? forcedPitcher : Math.random() < 0.45;
  let position: PlayerPosition;
  if (forcedPos) {
    position = forcedPos;
  } else if (isPitcher) {
    position = Math.random() < 0.45 ? 'SP' : 'RP';
  } else {
    position = HITTER_POSITIONS[Math.floor(Math.random() * HITTER_POSITIONS.length)];
  }

  const age = isRookie
    ? clamp(Math.floor(18 + Math.random() * 5), 18, 22)
    : clamp(Math.round(randGaussian(27.5, 4.3)), 18, 38);

  const throws: 'L' | 'R' = Math.random() < 0.28 ? 'L' : 'R';
  let bats: 'L' | 'R' | 'S' = 'R';
  if (isPitcher) {
    bats = throws;
  } else {
    const r = Math.random();
    if (r < 0.32) bats = 'L';
    else if (r < 0.42) bats = 'S';
    else bats = 'R';
  }

  let baseSkill: number;
  if (talentTier === 'generational') baseSkill = randGaussian(78, 5);
  else if (talentTier === 'high') baseSkill = randGaussian(68, 6);
  else if (talentTier === 'mid') baseSkill = randGaussian(56, 7);
  else if (talentTier === 'low') baseSkill = randGaussian(44, 7);
  else baseSkill = randGaussian(60, 13.5);

  const ageFactor = age < 23 ? -4 : age > 33 ? -3 : 1;
  const potential = clamp(
    baseSkill + (isRookie ? Math.random() * 14 + 4 : Math.max(0, (27 - age) * 1.4)),
    40,
    99
  );

  const player: Player = {
    id,
    name: `${firstName} ${lastName}`,
    age,
    bats,
    throws,
    isPitcher,
    position,
    teamId: null,
    ovr: 50,
    potential,
    seasonStats: createEmptySeasonStats(isPitcher),
    careerStats: createEmptySeasonStats(isPitcher),
    seasonHistory: [],
  };

  if (isPitcher) {
    player.velocity = clamp(baseSkill + ageFactor + randGaussian(0, 9), 25, 99);
    player.control = clamp(baseSkill + ageFactor + randGaussian(0, 9), 25, 99);
    player.finesse = clamp(baseSkill + ageFactor + randGaussian(0, 9), 25, 99);
    player.fatigue = 0;
  } else {
    let spdMod = 0;
    let powMod = 0;
    let glvMod = 0;
    if (position === '1B' || position === 'DH') {
      powMod = 6;
      spdMod = -6;
    }
    if (position === 'SS' || position === 'CF' || position === 'C') glvMod = 6;
    if (position === 'CF' || position === '2B' || position === 'LF') spdMod = 5;

    player.speed = clamp(baseSkill + ageFactor + spdMod + randGaussian(0, 9), 25, 99);
    player.power = clamp(baseSkill + ageFactor + powMod + randGaussian(0, 9), 25, 99);
    player.glove = clamp(baseSkill + ageFactor + glvMod + randGaussian(0, 9), 25, 99);
  }

  player.ovr = calculateOverall(player);
  return player;
}

export function generateInitialPlayerPool(): Player[] {
  const pool: Player[] = [];
  const positionQuotas: { pos: PlayerPosition; isP: boolean; count: number }[] = [
    { pos: 'C', isP: false, count: 96 },
    { pos: '1B', isP: false, count: 96 },
    { pos: '2B', isP: false, count: 96 },
    { pos: '3B', isP: false, count: 96 },
    { pos: 'SS', isP: false, count: 96 },
    { pos: 'LF', isP: false, count: 96 },
    { pos: 'CF', isP: false, count: 96 },
    { pos: 'RF', isP: false, count: 96 },
    { pos: 'DH', isP: false, count: 64 },
    { pos: 'SP', isP: true, count: 256 },
    { pos: 'RP', isP: true, count: 256 },
  ];

  for (const q of positionQuotas) {
    for (let i = 0; i < q.count; i++) {
      pool.push(generatePlayer({ isRookie: false, forcedPitcher: q.isP, forcedPos: q.pos }));
    }
  }
  return pool.sort((a, b) => b.ovr - a.ovr);
}

export function generateRookieClass(year: number): Player[] {
  const prospects: Player[] = [];
  const tiers: Array<'generational' | 'high' | 'mid' | 'low'> = [
    ...Array(12).fill('generational'),
    ...Array(36).fill('high'),
    ...Array(64).fill('mid'),
    ...Array(48).fill('low'),
  ];
  for (let i = 0; i < 160; i++) {
    const p = generatePlayer({ isRookie: true, talentTier: tiers[i] });
    p.draftYear = year;
    prospects.push(p);
  }
  return prospects.sort((a, b) => b.ovr - a.ovr);
}

export function createInitialLeague(startYear = 2026): { teams: Team[]; draftPicks: DraftPick[] } {
  const teams: Team[] = TEAM_CONFIGS.map((cfg) => ({
    ...cfg,
    wins: 0,
    losses: 0,
    runsScored: 0,
    runsAllowed: 0,
    streak: 0,
    last10: [],
    championships: 0,
  }));

  const draftPicks: DraftPick[] = [];
  for (let yr = startYear + 1; yr <= startYear + 3; yr++) {
    for (let round = 1; round <= 5; round++) {
      for (const team of teams) {
        draftPicks.push({
          id: `PICK-${yr}-R${round}-${team.id}`,
          year: yr,
          round,
          originalTeamId: team.id,
          ownerTeamId: team.id,
        });
      }
    }
  }

  return { teams, draftPicks };
}

export function formatIP(ipOuts: number): string {
  const full = Math.floor(ipOuts / 3);
  const rem = ipOuts % 3;
  return `${full}.${rem}`;
}

export function getHitterSlash(s: Record<string, number>) {
  const ab = s.ab || 0;
  const h = s.h || 0;
  const bb = s.bb || 0;
  const doubles = s.doubles || 0;
  const triples = s.triples || 0;
  const hr = s.hr || 0;

  const avg = ab > 0 ? h / ab : 0;
  const pa = ab + bb;
  const obp = pa > 0 ? (h + bb) / pa : 0;
  const singles = h - doubles - triples - hr;
  const tb = singles + doubles * 2 + triples * 3 + hr * 4;
  const slg = ab > 0 ? tb / ab : 0;
  return {
    avg: avg.toFixed(3).replace(/^0/, ''),
    obp: obp.toFixed(3).replace(/^0/, ''),
    slg: slg.toFixed(3).replace(/^0/, ''),
    ops: (obp + slg).toFixed(3).replace(/^0/, ''),
    rawAvg: avg,
    rawOps: obp + slg,
  };
}

export function getPitcherRatios(s: Record<string, number>) {
  const ipOuts = s.ipOuts || 0;
  const er = s.er || 0;
  const h = s.h || 0;
  const bb = s.bb || 0;
  const so = s.so || 0;
  const ip = ipOuts / 3;
  const era = ip > 0 ? (er * 9) / ip : 0;
  const whip = ip > 0 ? (h + bb) / ip : 0;
  const k9 = ip > 0 ? (so * 9) / ip : 0;
  return {
    ipStr: formatIP(ipOuts),
    era: era.toFixed(2),
    whip: whip.toFixed(2),
    k9: k9.toFixed(1),
    rawEra: ip > 0 ? era : 99.99,
    rawWhip: ip > 0 ? whip : 9.99,
  };
}

export function getRatingColor(val: number): string {
  if (val >= 85) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';
  if (val >= 75) return 'bg-sky-500/15 text-sky-300 border-sky-500/35';
  if (val >= 65) return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/35';
  if (val >= 52) return 'bg-slate-800 text-slate-200 border-slate-700';
  return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
}

export function getPlayerTradeValue(player: Player): number {
  const ovrFactor = Math.pow(Math.max(30, player.ovr) - 25, 2.05);
  const potBonus = Math.max(0, player.potential - player.ovr) * (player.age <= 24 ? 9 : 3);
  let ageMult = 1.0;
  if (player.age <= 23) ageMult = 1.28;
  else if (player.age <= 27) ageMult = 1.15;
  else if (player.age <= 30) ageMult = 0.95;
  else if (player.age <= 33) ageMult = 0.72;
  else ageMult = 0.48;

  return Math.round((ovrFactor * 0.45 + potBonus) * ageMult);
}

export function getDraftPickTradeValue(pick: DraftPick, teams: Team[], currentYear: number): number {
  const sorted = [...teams].sort((a, b) => {
    const pctA = a.wins + a.losses > 0 ? a.wins / (a.wins + a.losses) : 0.5;
    const pctB = b.wins + b.losses > 0 ? b.wins / (b.wins + b.losses) : 0.5;
    return pctA - pctB;
  });
  const slot = Math.max(1, sorted.findIndex((t) => t.id === pick.originalTeamId) + 1);
  const roundBase = [0, 420, 230, 130, 75, 45][pick.round] || 30;
  const slotMult = 1.35 - (slot / 32) * 0.65;
  const yearDiscount = Math.pow(0.86, Math.max(0, pick.year - currentYear - 1));
  return Math.round(roundBase * slotMult * yearDiscount);
}

export function getTeamRosterNeeds(roster: Player[]) {
  const counts: Record<string, number> = {
    C: 0, '1B': 0, '2B': 0, '3B': 0, SS: 0, LF: 0, CF: 0, RF: 0, DH: 0, SP: 0, RP: 0,
  };
  roster.forEach((p) => {
    counts[p.position] = (counts[p.position] || 0) + 1;
  });
  const totalHitters = roster.filter((p) => !p.isPitcher).length;
  const totalPitchers = roster.filter((p) => p.isPitcher).length;
  return { counts, totalHitters, totalPitchers };
}

export function selectBestDraftPickForAI(availablePlayers: Player[], teamRoster: Player[]): Player {
  const { counts, totalHitters, totalPitchers } = getTeamRosterNeeds(teamRoster);
  const topCandidates = availablePlayers.slice(0, 28);
  let bestPlayer = topCandidates[0];
  let bestScore = -9999;

  for (const p of topCandidates) {
    let score = p.ovr * 1.6 + (p.potential - p.ovr) * 0.45 - Math.max(0, p.age - 28) * 1.5;

    if (p.isPitcher) {
      if (totalPitchers >= 15) score -= 45;
      else if (totalPitchers < 13 && teamRoster.length > 22) score += 18;
      if (p.position === 'SP' && counts.SP < 6) score += 12;
      if (p.position === 'RP' && counts.RP < 7) score += 10;
    } else {
      if (totalHitters >= 17) score -= 45;
      else if (totalHitters < 15 && teamRoster.length > 22) score += 18;
      if ((counts[p.position] || 0) === 0) score += 16;
      else if ((counts[p.position] || 0) === 1 && p.position !== 'DH') score += 6;
      else if ((counts[p.position] || 0) >= 3) score -= 22;
    }

    score += (Math.random() - 0.5) * 6;
    if (score > bestScore) {
      bestScore = score;
      bestPlayer = p;
    }
  }
  return bestPlayer;
}

export type ScheduleDay = Array<[string, string]>;

export function generateSeasonSchedule(teams: Team[]): ScheduleDay[] {
  const ids = teams.map((t) => t.id);
  const n = ids.length;
  const schedule: ScheduleDay[] = [];

  const fixed = ids[0];
  let rotating = ids.slice(1);

  const singleRoundRobin: ScheduleDay[] = [];
  for (let round = 0; round < n - 1; round++) {
    const dayGames: ScheduleDay = [];
    const p1 = fixed;
    const p2 = rotating[0];
    dayGames.push(round % 2 === 0 ? [p1, p2] : [p2, p1]);

    for (let i = 1; i < n / 2; i++) {
      const tA = rotating[i];
      const tB = rotating[n - 1 - i];
      dayGames.push((round + i) % 2 === 0 ? [tA, tB] : [tB, tA]);
    }
    singleRoundRobin.push(dayGames);
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, rotating.length - 1)];
  }

  for (let d = 0; d < 162; d++) {
    const template = singleRoundRobin[d % singleRoundRobin.length];
    const flipHome = Math.floor(d / singleRoundRobin.length) % 2 === 1;
    schedule.push(template.map(([h, a]) => (flipHome ? [a, h] : [h, a])));
  }
  return schedule;
}

export function buildLineupAndPitching(roster: Player[]) {
  const hitters = roster.filter((p) => !p.isPitcher).sort((a, b) => b.ovr - a.ovr);
  const sps = roster.filter((p) => p.position === 'SP').sort((a, b) => b.ovr - a.ovr);
  const rps = roster.filter((p) => p.position === 'RP').sort((a, b) => b.ovr - a.ovr);

  const usedIds = new Set<string>();
  const lineup: Player[] = [];
  for (const pos of HITTER_POSITIONS) {
    const match = hitters.find((h) => h.position === pos && !usedIds.has(h.id));
    if (match) {
      usedIds.add(match.id);
      lineup.push(match);
    }
  }
  for (const h of hitters) {
    if (lineup.length >= 9) break;
    if (!usedIds.has(h.id)) {
      usedIds.add(h.id);
      lineup.push(h);
    }
  }
  const bench = hitters.filter((h) => !usedIds.has(h.id));
  const rotation = sps.length > 0 ? sps.slice(0, 5) : rps.slice(0, 5);
  const bullpen = rps.length > 0 ? rps : sps.slice(5);

  return { lineup, bench, rotation, bullpen };
}

export function simulateSingleGame(
  homeTeam: Team,
  awayTeam: Team,
  homeRoster: Player[],
  awayRoster: Player[],
  gameDay: number
) {
  const stadium = getStadiumByTeamId(homeTeam.id);
  const { hrFactor, doublesFactor, triplesFactor, foulOutFactor, kFactor } = stadium.parkFactors;
  const homeSetup = buildLineupAndPitching(homeRoster);
  const awaySetup = buildLineupAndPitching(awayRoster);

  const homeSP = homeSetup.rotation[gameDay % Math.max(1, homeSetup.rotation.length)] || homeRoster[0];
  const awaySP = awaySetup.rotation[gameDay % Math.max(1, awaySetup.rotation.length)] || awayRoster[0];

  const homeGlove =
    homeSetup.lineup.reduce((acc, p) => acc + (p.glove ?? 50), 0) / Math.max(1, homeSetup.lineup.length);
  const awayGlove =
    awaySetup.lineup.reduce((acc, p) => acc + (p.glove ?? 50), 0) / Math.max(1, awaySetup.lineup.length);

  let homeRuns = 0;
  let awayRuns = 0;

  const statDeltas: Record<string, Record<string, number>> = {};
  const ensureDelta = (p: Player) => {
    if (!statDeltas[p.id]) {
      statDeltas[p.id] = p.isPitcher
        ? { g: 0, gs: 0, w: 0, l: 0, sv: 0, ipOuts: 0, h: 0, er: 0, bb: 0, so: 0 }
        : { g: 0, ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0, sb: 0 };
    }
    return statDeltas[p.id];
  };

  homeSetup.lineup.forEach((p) => { ensureDelta(p).g = 1; });
  awaySetup.lineup.forEach((p) => { ensureDelta(p).g = 1; });
  if (homeSP) {
    const d = ensureDelta(homeSP);
    d.g = 1;
    d.gs = 1;
  }
  if (awaySP) {
    const d = ensureDelta(awaySP);
    d.g = 1;
    d.gs = 1;
  }

  let homePitcher = homeSP;
  let awayPitcher = awaySP;
  let homePitcherOuts = 0;
  let awayPitcherOuts = 0;
  let homePitcherRuns = 0;
  let awayPitcherRuns = 0;

  const pickReliever = (bullpen: Player[], currentP: Player, isCloseLate: boolean) => {
    if (!bullpen || bullpen.length === 0) return currentP;
    if (isCloseLate) return bullpen[0];
    const pool = bullpen.slice(1);
    if (pool.length === 0) return bullpen[0];
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const simHalfInning = (
    battingLineup: Player[],
    batterIdxRef: { idx: number },
    pitchingTeamPitcher: Player,
    fieldGlove: number
  ) => {
    let outs = 0;
    let runners = [false, false, false];
    let runsThisInning = 0;
    let safety = 0;

    while (outs < 3 && safety < 25) {
      safety++;
      const batter = battingLineup[batterIdxRef.idx % battingLineup.length];
      batterIdxRef.idx++;
      const bStat = ensureDelta(batter);
      const pStat = ensureDelta(pitchingTeamPitcher);

      let platoonEdge = 0;
      if (batter.bats === 'S') platoonEdge = 2.5;
      else if (batter.bats !== pitchingTeamPitcher.throws) platoonEdge = 3.5;
      else platoonEdge = -2.5;

      const pVel = pitchingTeamPitcher.velocity ?? 50;
      const pCtl = pitchingTeamPitcher.control ?? 50;
      const pFin = pitchingTeamPitcher.finesse ?? 50;

      const bPow = batter.power ?? 50;
      const bSpd = batter.speed ?? 50;
      const bGlv = batter.glove ?? 50;

      const pitchSkill = pVel * 0.36 + pCtl * 0.34 + pFin * 0.3;
      const hitSkill = bPow * 0.45 + bSpd * 0.25 + bGlv * 0.1 + 15;
      const diff = (hitSkill + platoonEdge - pitchSkill) / 100;

      const bbProb = clamp(7.5 + (60 - pCtl) * 0.11 + diff * 4, 3, 18) / 100;
      const soProb =
        (clamp(21.5 + (pVel * 0.55 + pFin * 0.45 - 60) * 0.18 - diff * 8, 9, 38) / 100) *
        kFactor;
      const hitProb =
        clamp(
          24.5 + diff * 13 - (fieldGlove - 60) * 0.08 - (foulOutFactor - 1) * 7.5,
          13,
          37
        ) / 100;

      const roll = Math.random();
      if (roll < bbProb) {
        bStat.bb++;
        pStat.bb++;
        if (runners[0] && runners[1] && runners[2]) {
          runsThisInning++;
          bStat.rbi++;
          pStat.er++;
        } else if (runners[0] && runners[1]) {
          runners[2] = true;
        } else if (runners[0]) {
          runners[1] = true;
        } else {
          runners[0] = true;
        }
      } else if (roll < bbProb + soProb) {
        bStat.ab++;
        bStat.so++;
        pStat.so++;
        pStat.ipOuts++;
        outs++;
      } else if (roll < bbProb + soProb + hitProb) {
        bStat.ab++;
        bStat.h++;
        pStat.h++;

        const hrProb =
          (clamp(7 + (bPow - 55) * 0.24 - (pFin - 60) * 0.08, 2, 26) / 100) * hrFactor;
        const tripleProb =
          (clamp(1.5 + (bSpd - 60) * 0.06, 0.3, 6) / 100) * triplesFactor;
        const doubleProb =
          (clamp(17 + (bPow * 0.5 + bSpd * 0.5 - 60) * 0.15, 8, 28) / 100) * doublesFactor;

        const hitRoll = Math.random();
        if (hitRoll < hrProb) {
          bStat.hr++;
          const rbi = 1 + (runners[0] ? 1 : 0) + (runners[1] ? 1 : 0) + (runners[2] ? 1 : 0);
          runsThisInning += rbi;
          bStat.rbi += rbi;
          bStat.r++;
          pStat.er += rbi;
          runners = [false, false, false];
        } else if (hitRoll < hrProb + tripleProb) {
          bStat.triples++;
          const rbi = (runners[0] ? 1 : 0) + (runners[1] ? 1 : 0) + (runners[2] ? 1 : 0);
          runsThisInning += rbi;
          bStat.rbi += rbi;
          pStat.er += rbi;
          runners = [false, false, true];
        } else if (hitRoll < hrProb + tripleProb + doubleProb) {
          bStat.doubles++;
          let rbi = (runners[2] ? 1 : 0) + (runners[1] ? 1 : 0);
          const firstScores = runners[0] && bSpd > 65 && Math.random() < 0.45;
          if (firstScores) rbi++;
          runsThisInning += rbi;
          bStat.rbi += rbi;
          pStat.er += rbi;
          runners = [false, true, runners[0] && !firstScores];
        } else {
          let rbi = runners[2] ? 1 : 0;
          const secondScores = runners[1] && Math.random() < 0.55;
          if (secondScores) rbi++;
          runsThisInning += rbi;
          bStat.rbi += rbi;
          pStat.er += rbi;
          runners = [true, runners[0], runners[1] && !secondScores];
        }

        if (runners[0] && !runners[1] && outs < 2 && bSpd >= 68 && Math.random() < (bSpd - 55) * 0.006) {
          if (Math.random() < 0.76) {
            bStat.sb++;
            runners[0] = false;
            runners[1] = true;
          } else {
            runners[0] = false;
            outs++;
            pStat.ipOuts++;
          }
        }
      } else {
        bStat.ab++;
        pStat.ipOuts++;
        outs++;
        if (runners[2] && outs < 3 && Math.random() < 0.28) {
          runners[2] = false;
          runsThisInning++;
          bStat.rbi++;
          pStat.er++;
        }
      }
    }
    return { runs: runsThisInning, outsRecorded: outs };
  };

  const homeIdxRef = { idx: 0 };
  const awayIdxRef = { idx: 0 };

  let inning = 1;
  while (inning <= 15) {
    if (homePitcher === homeSP && (homePitcherOuts >= 18 || homePitcherRuns >= 5 || inning >= 7)) {
      homePitcher = pickReliever(
        homeSetup.bullpen,
        homePitcher,
        inning >= 9 && Math.abs(homeRuns - awayRuns) <= 3
      );
      ensureDelta(homePitcher).g = 1;
    } else if (homePitcher !== homeSP && inning >= 9 && Math.abs(homeRuns - awayRuns) <= 3) {
      homePitcher = pickReliever(homeSetup.bullpen, homePitcher, true);
      ensureDelta(homePitcher).g = 1;
    }

    const topRes = simHalfInning(awaySetup.lineup, awayIdxRef, homePitcher, homeGlove);
    awayRuns += topRes.runs;
    if (homePitcher === homeSP) {
      homePitcherOuts += topRes.outsRecorded;
      homePitcherRuns += topRes.runs;
    }

    if (inning >= 9 && homeRuns > awayRuns) break;

    if (awayPitcher === awaySP && (awayPitcherOuts >= 18 || awayPitcherRuns >= 5 || inning >= 7)) {
      awayPitcher = pickReliever(
        awaySetup.bullpen,
        awayPitcher,
        inning >= 9 && Math.abs(homeRuns - awayRuns) <= 3
      );
      ensureDelta(awayPitcher).g = 1;
    } else if (awayPitcher !== awaySP && inning >= 9 && Math.abs(homeRuns - awayRuns) <= 3) {
      awayPitcher = pickReliever(awaySetup.bullpen, awayPitcher, true);
      ensureDelta(awayPitcher).g = 1;
    }

    const botRes = simHalfInning(homeSetup.lineup, homeIdxRef, awayPitcher, awayGlove);
    homeRuns += botRes.runs;
    if (awayPitcher === awaySP) {
      awayPitcherOuts += botRes.outsRecorded;
      awayPitcherRuns += botRes.runs;
    }

    if (inning >= 9 && homeRuns !== awayRuns) break;
    inning++;
  }

  if (homeRuns === awayRuns) {
    if (Math.random() < 0.52) homeRuns++;
    else awayRuns++;
  }

  const homeWon = homeRuns > awayRuns;

  if (homeWon) {
    if (homeSP) ensureDelta(homeSP).w = 1;
    if (awaySP) ensureDelta(awaySP).l = 1;
    if (homePitcher && homeSP && homePitcher.id !== homeSP.id && homeRuns - awayRuns <= 3) {
      ensureDelta(homePitcher).sv = 1;
    }
  } else {
    if (awaySP) ensureDelta(awaySP).w = 1;
    if (homeSP) ensureDelta(homeSP).l = 1;
    if (awayPitcher && awaySP && awayPitcher.id !== awaySP.id && awayRuns - homeRuns <= 3) {
      ensureDelta(awayPitcher).sv = 1;
    }
  }

  return {
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    homeRuns,
    awayRuns,
    homeWon,
    statDeltas,
  };
}

export function simulatePlayoffs(teams: Team[], playersByTeam: Record<string, Player[]>): PlayoffResults {
  const buildLeagueBracket = (league: 'AL' | 'NL') => {
    const lgTeams = teams.filter((t) => t.league === league);
    const divisions: Array<'East' | 'Central' | 'West'> = ['East', 'Central', 'West'];
    const divWinners = divisions
      .map((div) => {
        const divTeams = lgTeams
          .filter((t) => t.division === div)
          .sort((a, b) => b.wins - a.wins || b.runsScored - b.runsAllowed - (a.runsScored - a.runsAllowed));
        return divTeams[0];
      })
      .sort((a, b) => b.wins - a.wins);

    const winnerIds = new Set(divWinners.map((t) => t.id));
    const wildCards = lgTeams
      .filter((t) => !winnerIds.has(t.id))
      .sort((a, b) => b.wins - a.wins || b.runsScored - b.runsAllowed - (a.runsScored - a.runsAllowed))
      .slice(0, 3);

    return [...divWinners, ...wildCards];
  };

  const simSeries = (teamA: Team, teamB: Team, bestOf: number): { winner: Team; loser: Team; result: SeriesResult } => {
    const needed = Math.ceil(bestOf / 2);
    let wA = 0;
    let wB = 0;
    const rosterA = playersByTeam[teamA.id] || [];
    const rosterB = playersByTeam[teamB.id] || [];
    let g = 0;
    while (wA < needed && wB < needed) {
      const isAHome = g % 2 === 0;
      const res = isAHome
        ? simulateSingleGame(teamA, teamB, rosterA, rosterB, g)
        : simulateSingleGame(teamB, teamA, rosterB, rosterA, g);
      const aWon = isAHome ? res.homeWon : !res.homeWon;
      if (aWon) wA++;
      else wB++;
      g++;
    }
    const winner = wA > wB ? teamA : teamB;
    const loser = wA > wB ? teamB : teamA;
    return {
      winner,
      loser,
      result: {
        winnerId: winner.id,
        winnerCity: winner.city,
        winnerName: winner.name,
        loserId: loser.id,
        loserCity: loser.city,
        loserName: loser.name,
        score: `${Math.max(wA, wB)}-${Math.min(wA, wB)}`,
      },
    };
  };

  const alSeeds = buildLeagueBracket('AL');
  const nlSeeds = buildLeagueBracket('NL');

  const alWC1 = simSeries(alSeeds[2], alSeeds[5], 3);
  const alWC2 = simSeries(alSeeds[3], alSeeds[4], 3);
  const nlWC1 = simSeries(nlSeeds[2], nlSeeds[5], 3);
  const nlWC2 = simSeries(nlSeeds[3], nlSeeds[4], 3);

  const alDS1 = simSeries(alSeeds[0], alWC2.winner, 5);
  const alDS2 = simSeries(alSeeds[1], alWC1.winner, 5);
  const nlDS1 = simSeries(nlSeeds[0], nlWC2.winner, 5);
  const nlDS2 = simSeries(nlSeeds[1], nlWC1.winner, 5);

  const alCS = simSeries(alDS1.winner, alDS2.winner, 7);
  const nlCS = simSeries(nlDS1.winner, nlDS2.winner, 7);
  const worldSeries = simSeries(alCS.winner, nlCS.winner, 7);

  return {
    alSeeds: alSeeds.map((t) => t.id),
    nlSeeds: nlSeeds.map((t) => t.id),
    rounds: {
      wildCard: [alWC1.result, alWC2.result, nlWC1.result, nlWC2.result],
      divisional: [alDS1.result, alDS2.result, nlDS1.result, nlDS2.result],
      championship: [alCS.result, nlCS.result],
      worldSeries: worldSeries.result,
    },
    championId: worldSeries.winner.id,
    championCity: worldSeries.winner.city,
    championName: worldSeries.winner.name,
    runnerUpId: worldSeries.loser.id,
    runnerUpCity: worldSeries.loser.city,
    runnerUpName: worldSeries.loser.name,
  };
}

// ============================================================================
// HISTORICAL TREND SNAPSHOTS & DIVISION/LEAGUE RECORD BOOK COMPUTATION
// ============================================================================

export function buildSeasonSnapshotData(params: {
  ownerId: string;
  franchiseId: string;
  year: number;
  day: number;
  isSeasonEnd: boolean;
  userTeamId: string;
  teams: Team[];
  players: Player[];
  championTeamId?: string;
}): Omit<SeasonSnapshot, 'id' | 'createdAt'> {
  const { ownerId, franchiseId, year, day, isSeasonEnd, userTeamId, teams, players, championTeamId } = params;
  const userTeam = teams.find((t) => t.id === userTeamId) || teams[0];

  const divTeams = teams
    .filter((t) => t.league === userTeam.league && t.division === userTeam.division)
    .sort((a, b) => b.wins - a.wins || b.runsScored - b.runsAllowed - (a.runsScored - a.runsAllowed));

  const lgTeams = teams
    .filter((t) => t.league === userTeam.league)
    .sort((a, b) => b.wins - a.wins || b.runsScored - b.runsAllowed - (a.runsScored - a.runsAllowed));

  const userDivRank = Math.max(1, divTeams.findIndex((t) => t.id === userTeam.id) + 1);
  const userLgRank = Math.max(1, lgTeams.findIndex((t) => t.id === userTeam.id) + 1);
  const userGames = userTeam.wins + userTeam.losses;
  const userWinPct = userGames > 0 ? Number((userTeam.wins / userGames).toFixed(3)) : 0.5;
  const leader = divTeams[0];
  const leaderGames = leader.wins + leader.losses;
  const divisionLeaderWinPct = leaderGames > 0 ? Number((leader.wins / leaderGames).toFixed(3)) : 0.5;

  const divisionSnapshots: DivisionSnapshotTeam[] = divTeams.map((t) => {
    const g = t.wins + t.losses;
    return {
      teamId: t.id,
      wins: t.wins,
      losses: t.losses,
      winPct: g > 0 ? Number((t.wins / g).toFixed(3)) : 0.5,
      runDiff: t.runsScored - t.runsAllowed,
    };
  });

  const topHr = players
    .filter((p) => !p.isPitcher && (p.seasonStats.hr || 0) > 0)
    .sort((a, b) => (b.seasonStats.hr || 0) - (a.seasonStats.hr || 0))[0];

  const minOuts = Math.max(9, Math.floor(day * 1.2));
  const topEra = players
    .filter((p) => p.isPitcher && (p.seasonStats.ipOuts || 0) >= minOuts)
    .sort((a, b) => getPitcherRatios(a.seasonStats).rawEra - getPitcherRatios(b.seasonStats).rawEra)[0];

  const base: Omit<SeasonSnapshot, 'id' | 'createdAt'> = {
    ownerId,
    franchiseId,
    year,
    day,
    isSeasonEnd,
    userTeamId: userTeam.id,
    userWins: userTeam.wins,
    userLosses: userTeam.losses,
    userWinPct,
    userRunDiff: userTeam.runsScored - userTeam.runsAllowed,
    divisionLeaderWinPct,
    divisionRank: userDivRank,
    leagueRank: userLgRank,
    divisionSnapshots,
    topHrLeader: topHr ? `${topHr.name} (${topHr.teamId || 'FA'}) · ${topHr.seasonStats.hr} HR` : 'No qualified HR leader',
    topEraLeader: topEra
      ? `${topEra.name} (${topEra.teamId || 'FA'}) · ${getPitcherRatios(topEra.seasonStats).era} ERA`
      : 'No qualified ERA leader',
  };

  if (championTeamId) {
    base.championTeamId = championTeamId;
  }

  return base;
}

export function computeUpdatedRecords(params: {
  ownerId: string;
  franchiseId: string;
  year: number;
  day: number;
  teams: Team[];
  players: Player[];
  userTeamId: string;
  existingRecords: LeagueRecord[];
}): Array<Omit<LeagueRecord, 'id' | 'updatedAt'>> {
  const { ownerId, franchiseId, year, day, teams, players, userTeamId, existingRecords } = params;
  if (day <= 0) return [];

  const existingByKey: Record<string, LeagueRecord> = {};
  existingRecords.forEach((r) => {
    existingByKey[r.recordKey] = r;
  });

  const userTeam = teams.find((t) => t.id === userTeamId) || teams[0];
  const teamLookup: Record<string, Team> = {};
  teams.forEach((t) => {
    teamLookup[t.id] = t;
  });

  const candidates: Array<Omit<LeagueRecord, 'id' | 'updatedAt'> & { lowerIsBetter?: boolean }> = [];

  const addTeamBest = (
    recordKey: string,
    scope: 'LEAGUE' | 'AL' | 'NL' | 'DIVISION',
    scopeLabel: string,
    title: string,
    pool: Team[],
    metricFn: (t: Team) => { val: number; display: string }
  ) => {
    if (pool.length === 0) return;
    let bestT = pool[0];
    let bestM = metricFn(bestT);
    for (const t of pool.slice(1)) {
      const m = metricFn(t);
      if (m.val > bestM.val) {
        bestM = m;
        bestT = t;
      }
    }
    if (bestM.val <= -9999) return;
    candidates.push({
      ownerId,
      franchiseId,
      recordKey,
      scope,
      scopeLabel,
      category: 'TEAM',
      title,
      holderName: `${bestT.city} ${bestT.name}`,
      teamId: bestT.id,
      value: bestM.val,
      displayValue: bestM.display,
      year,
      day,
    });
  };

  const addPlayerBest = (
    recordKey: string,
    scope: 'LEAGUE' | 'AL' | 'NL' | 'DIVISION',
    scopeLabel: string,
    category: 'BATTING' | 'PITCHING',
    title: string,
    pool: Player[],
    metricFn: (p: Player) => { val: number; display: string } | null,
    lowerIsBetter = false
  ) => {
    let bestP: Player | null = null;
    let bestM: { val: number; display: string } | null = null;
    for (const p of pool) {
      const m = metricFn(p);
      if (!m) continue;
      if (!bestM || (lowerIsBetter ? m.val < bestM.val : m.val > bestM.val)) {
        bestM = m;
        bestP = p;
      }
    }
    if (!bestP || !bestM) return;
    candidates.push({
      ownerId,
      franchiseId,
      recordKey,
      scope,
      scopeLabel,
      category,
      title,
      holderName: bestP.name,
      teamId: bestP.teamId || 'FA',
      value: bestM.val,
      displayValue: bestM.display,
      year,
      day,
      lowerIsBetter,
    });
  };

  // League & Division Team Records
  const scopes: Array<{
    keyPrefix: string;
    scope: 'LEAGUE' | 'AL' | 'NL' | 'DIVISION';
    label: string;
    teamFilter: (t: Team) => boolean;
  }> = [
    { keyPrefix: 'MLB', scope: 'LEAGUE', label: 'All MLB (32 Teams)', teamFilter: () => true },
    { keyPrefix: 'AL', scope: 'AL', label: 'American League', teamFilter: (t) => t.league === 'AL' },
    { keyPrefix: 'NL', scope: 'NL', label: 'National League', teamFilter: (t) => t.league === 'NL' },
    {
      keyPrefix: `DIV_${userTeam.league}_${userTeam.division.toUpperCase()}`,
      scope: 'DIVISION',
      label: `${userTeam.league} ${userTeam.division}`,
      teamFilter: (t) => t.league === userTeam.league && t.division === userTeam.division,
    },
  ];

  const minAB = Math.max(15, Math.floor(day * 2.2));
  const minOuts = Math.max(9, Math.floor(day * 1.5));

  for (const sc of scopes) {
    const scTeams = teams.filter(sc.teamFilter);
    const scTeamIds = new Set(scTeams.map((t) => t.id));
    const scPlayers = players.filter((p) => p.teamId && scTeamIds.has(p.teamId));
    const scHitters = scPlayers.filter((p) => !p.isPitcher);
    const scPitchers = scPlayers.filter((p) => p.isPitcher);

    addTeamBest(`${sc.keyPrefix}_MOST_WINS`, sc.scope, sc.label, 'Most Wins in a Season', scTeams, (t) => ({
      val: t.wins,
      display: `${t.wins} W`,
    }));

    addTeamBest(`${sc.keyPrefix}_BEST_RUN_DIFF`, sc.scope, sc.label, 'Best Team Run Differential', scTeams, (t) => {
      const diff = t.runsScored - t.runsAllowed;
      return { val: diff, display: `${diff >= 0 ? '+' : ''}${diff}` };
    });

    addPlayerBest(`${sc.keyPrefix}_MOST_HR`, sc.scope, sc.label, 'BATTING', 'Single-Season Home Runs', scHitters, (p) => {
      const hr = p.seasonStats.hr || 0;
      return hr > 0 ? { val: hr, display: `${hr} HR` } : null;
    });

    addPlayerBest(`${sc.keyPrefix}_MOST_RBI`, sc.scope, sc.label, 'BATTING', 'Single-Season RBIs', scHitters, (p) => {
      const rbi = p.seasonStats.rbi || 0;
      return rbi > 0 ? { val: rbi, display: `${rbi} RBI` } : null;
    });

    addPlayerBest(`${sc.keyPrefix}_BEST_AVG`, sc.scope, sc.label, 'BATTING', 'Highest Batting Average', scHitters, (p) => {
      if ((p.seasonStats.ab || 0) < minAB) return null;
      const slash = getHitterSlash(p.seasonStats);
      return { val: Number(slash.rawAvg.toFixed(4)), display: slash.avg };
    });

    addPlayerBest(`${sc.keyPrefix}_MOST_SO`, sc.scope, sc.label, 'PITCHING', 'Single-Season Strikeouts', scPitchers, (p) => {
      const so = p.seasonStats.so || 0;
      return so > 0 ? { val: so, display: `${so} SO` } : null;
    });

    addPlayerBest(`${sc.keyPrefix}_MOST_SV`, sc.scope, sc.label, 'PITCHING', 'Single-Season Saves', scPitchers, (p) => {
      const sv = p.seasonStats.sv || 0;
      return sv > 0 ? { val: sv, display: `${sv} SV` } : null;
    });

    addPlayerBest(
      `${sc.keyPrefix}_LOWEST_ERA`,
      sc.scope,
      sc.label,
      'PITCHING',
      'Lowest Qualified ERA',
      scPitchers,
      (p) => {
        if ((p.seasonStats.ipOuts || 0) < minOuts) return null;
        const ratios = getPitcherRatios(p.seasonStats);
        return { val: Number(ratios.rawEra.toFixed(3)), display: `${ratios.era} ERA` };
      },
      true
    );
  }

  // Only emit updates if record doesn't exist yet OR was broken/updated by a higher/better value (or current year update)
  const updates: Array<Omit<LeagueRecord, 'id' | 'updatedAt'>> = [];
  for (const cand of candidates) {
    const prev = existingByKey[cand.recordKey];
    const { lowerIsBetter, ...cleanRecord } = cand;
    if (!prev) {
      updates.push(cleanRecord);
    } else if (lowerIsBetter) {
      // For ERA, if same year and same holder/team or beaten
      if (cand.value < prev.value || (prev.year === year && prev.holderName === cand.holderName && cand.value !== prev.value)) {
        updates.push(cleanRecord);
      }
    } else {
      if (cand.value > prev.value) {
        updates.push(cleanRecord);
      }
    }
  }

  return updates;
}
