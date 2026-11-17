import {
  DraftPick,
  DraftSlot,
  DivisionSnapshotTeam,
  HitterPosition,
  InjurySeverity,
  LeagueRecord,
  Player,
  PlayerInjury,
  PlayerPosition,
  PlayoffResults,
  RetiredPlayerSummary,
  SeasonSnapshot,
  SeriesResult,
  Team,
} from '../types/baseball';
import { getStadiumByTeamId } from '../data/stadiums';

export const HARD_SALARY_CAP = 180.0;
export const SALARY_FLOOR = 90.0;
export const MIN_PLAYER_SALARY = 0.75;
export const AI_CAP_RELIEF_THRESHOLD = 155.0;
export const ROOKIE_CONTRACT_YEARS = 3;
export const WAIVER_PERIOD_DAYS = 2;

export function roundMoney(val: number): number {
  if (!Number.isFinite(val)) return MIN_PLAYER_SALARY;
  return Math.round(val * 100) / 100;
}

export function formatMoney(val: number): string {
  const safe = Number.isFinite(val) ? val : 0;
  return `$${safe.toFixed(2)}M`;
}

export function getRookieContractSalary(round: number): number {
  if (round === 1) return 3.5;
  if (round === 2) return 1.75;
  return MIN_PLAYER_SALARY;
}

export function calculateFairSalary(
  ovr: number,
  age: number,
  potential: number,
  isRookie = false
): number {
  if (isRookie) return MIN_PLAYER_SALARY;
  const safeOvr = Number.isFinite(ovr) ? ovr : 55;
  const safeAge = Number.isFinite(age) ? age : 27;
  const safePot = Number.isFinite(potential) ? potential : safeOvr;

  if (safeOvr <= 57) {
    return MIN_PLAYER_SALARY;
  }

  const t = safeOvr - 57;
  let salary = MIN_PLAYER_SALARY + Math.pow(t, 1.72) * 0.056;

  // Youth pre-arbitration discount vs prime/upside premium
  if (safeAge <= 22 && safeOvr < 72) {
    salary *= 0.72;
  } else if (safeAge <= 24 && safePot >= 80 && safeOvr < 76) {
    salary *= 0.85;
  } else if (safeAge >= 35) {
    salary *= 0.84;
  }

  return roundMoney(Math.max(MIN_PLAYER_SALARY, Math.min(34.0, salary)));
}

function hashIdToInt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getPlayerSalary(
  player: Pick<Player, 'salary' | 'ovr' | 'age' | 'potential'>
): number {
  if (
    typeof player.salary === 'number' &&
    Number.isFinite(player.salary) &&
    player.salary >= MIN_PLAYER_SALARY
  ) {
    return roundMoney(player.salary);
  }
  return calculateFairSalary(player.ovr ?? 55, player.age ?? 27, player.potential ?? 60);
}

export function getPlayerContractYears(player: Pick<Player, 'contractYears' | 'id'>): number {
  if (
    typeof player.contractYears === 'number' &&
    Number.isFinite(player.contractYears) &&
    player.contractYears >= 1
  ) {
    return Math.min(5, Math.max(1, Math.round(player.contractYears)));
  }
  return (hashIdToInt(player.id || 'plr') % 4) + 1;
}

export function getTeamDeadCap(team: Pick<Team, 'deadCap'> | undefined): number {
  if (typeof team?.deadCap === 'number' && Number.isFinite(team.deadCap) && team.deadCap > 0) {
    return roundMoney(team.deadCap);
  }
  return 0;
}

export function getPlayerILRelief(player: Pick<Player, 'salary' | 'ovr' | 'age' | 'potential' | 'injury'>): number {
  const sal = getPlayerSalary(player);
  if (player.injury?.onIL === '60') return sal;
  if (player.injury?.onIL === '15') return roundMoney(sal * 0.5);
  return 0;
}

export function getPlayerEffectiveCapHit(player: Pick<Player, 'salary' | 'ovr' | 'age' | 'potential' | 'injury'>): number {
  const sal = getPlayerSalary(player);
  if (player.injury?.onIL === '60') return 0;
  if (player.injury?.onIL === '15') return roundMoney(sal * 0.5);
  return sal;
}

export function isPlayerOnIL(player: Pick<Player, 'injury'>): boolean {
  return player.injury?.onIL === '15' || player.injury?.onIL === '60';
}

export function isCapMoveLegal(prePayroll: number, postPayroll: number): boolean {
  const pre = roundMoney(prePayroll);
  const post = roundMoney(postPayroll);
  if (post <= HARD_SALARY_CAP) return true;
  return pre > HARD_SALARY_CAP && post < pre;
}

export function isActiveWaiverClaim(player: Pick<Player, 'teamId' | 'waiverExpiresDay'>, currentDay: number): boolean {
  return (
    !player.teamId &&
    typeof player.waiverExpiresDay === 'number' &&
    Number.isFinite(player.waiverExpiresDay) &&
    currentDay <= player.waiverExpiresDay
  );
}

export interface TeamPayrollSummary {
  grossPayroll: number;
  ilRelief: number;
  activePayroll: number;
  deadCap: number;
  totalPayroll: number;
  capSpace: number;
  floorShortfall: number;
  underFloor: boolean;
  overCap: boolean;
  overReliefThreshold: boolean;
}

export function getTeamPayrollSummary(
  team: Team | undefined,
  roster: Player[]
): TeamPayrollSummary {
  const grossPayroll = roundMoney(roster.reduce((sum, p) => sum + getPlayerSalary(p), 0));
  const ilRelief = roundMoney(roster.reduce((sum, p) => sum + getPlayerILRelief(p), 0));
  const activePayroll = roundMoney(Math.max(0, grossPayroll - ilRelief));
  const deadCap = getTeamDeadCap(team);
  const totalPayroll = roundMoney(activePayroll + deadCap);
  const capSpace = roundMoney(HARD_SALARY_CAP - totalPayroll);
  const floorShortfall = roundMoney(Math.max(0, SALARY_FLOOR - totalPayroll));
  return {
    grossPayroll,
    ilRelief,
    activePayroll,
    deadCap,
    totalPayroll,
    capSpace,
    floorShortfall,
    underFloor: totalPayroll < SALARY_FLOOR,
    overCap: totalPayroll > HARD_SALARY_CAP,
    overReliefThreshold: totalPayroll > AI_CAP_RELIEF_THRESHOLD,
  };
}

export function computeReleaseDeadCap(player: Player): number {
  return roundMoney(getPlayerSalary(player) * 0.5);
}

export function calculateExtensionOffer(
  player: Player,
  years: number
): { salary: number; years: number } {
  const safeYears = Math.min(5, Math.max(1, Math.round(years)));
  const fair = calculateFairSalary(player.ovr, player.age, player.potential);
  // Longer commitment gives slight AAV stability/discount for team, or modest bump for prime stars
  const termMult =
    safeYears === 1 ? 1.06 : safeYears === 2 ? 1.02 : safeYears === 3 ? 0.98 : safeYears === 4 ? 0.95 : 0.92;
  return {
    salary: roundMoney(Math.max(MIN_PLAYER_SALARY, fair * termMult)),
    years: safeYears,
  };
}

export function normalizeLoadedTeams(teams: Team[]): Team[] {
  return (teams || []).map((t) => ({
    ...t,
    deadCap: getTeamDeadCap(t),
  }));
}

export function normalizeLoadedPlayers(players: Player[]): Player[] {
  return (players || []).map((p) => ({
    ...p,
    salary: getPlayerSalary(p),
    contractYears: getPlayerContractYears(p),
    previousTeamId: p.previousTeamId ?? null,
    waivedByTeamId: p.waivedByTeamId ?? null,
    waivedDeadCapHit:
      typeof p.waivedDeadCapHit === 'number' && Number.isFinite(p.waivedDeadCapHit)
        ? roundMoney(p.waivedDeadCapHit)
        : 0,
    waiverExpiresDay:
      typeof p.waiverExpiresDay === 'number' && Number.isFinite(p.waiverExpiresDay)
        ? p.waiverExpiresDay
        : null,
    injury: p.injury ?? null,
  }));
}

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
  player.salary = calculateFairSalary(player.ovr, player.age, player.potential, isRookie);
  if (isRookie) {
    player.contractYears = ROOKIE_CONTRACT_YEARS;
  } else {
    // Weighted 1-5 year contracts: stars/prime get longer deals, older/fringe skew shorter
    const r = Math.random();
    if (player.ovr >= 78 && age <= 30) {
      player.contractYears = r < 0.2 ? 2 : r < 0.5 ? 3 : r < 0.8 ? 4 : 5;
    } else if (age >= 33 || player.ovr < 56) {
      player.contractYears = r < 0.55 ? 1 : r < 0.85 ? 2 : 3;
    } else {
      player.contractYears = r < 0.28 ? 1 : r < 0.58 ? 2 : r < 0.82 ? 3 : r < 0.94 ? 4 : 5;
    }
  }
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
    deadCap: 0,
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

  const baseTalentPts = (ovrFactor * 0.45 + potBonus) * ageMult;
  const salary = getPlayerSalary(player);
  const years = getPlayerContractYears(player);

  // Surplus value for cheap multi-year rookie/team-controlled contracts
  let contractAdj = 0;
  if (years >= 2 && salary <= 3.5) {
    contractAdj += (4.0 - salary) * years * 12;
  } else {
    const fair = calculateFairSalary(player.ovr, player.age, player.potential);
    if (salary > fair * 1.3 && years >= 2) {
      contractAdj -= (salary - fair) * years * 3.2;
    }
  }

  return Math.max(10, Math.round(baseTalentPts + contractAdj));
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

export interface TradeEvaluationResult {
  userBasePts: number;
  aiBasePts: number;
  userOfferScoreForAI: number;
  aiOfferScoreForUser: number;
  ratio: number;
  status: 'EMPTY' | 'ACCEPT' | 'CLOSE' | 'REJECT' | 'BLOCKED';
  capBlocked: boolean;
  rosterBlocked: boolean;
  capBlockReason: string | null;
  message: string;
  aiReasons: string[];
  userPreSummary: TeamPayrollSummary;
  partnerPreSummary: TeamPayrollSummary;
  userPostPayroll: number;
  partnerPostPayroll: number;
}

export function evaluateTradeProposal(params: {
  userTeam: Team | undefined;
  partnerTeam: Team | undefined;
  userRoster: Player[];
  partnerRoster: Player[];
  userSendPlayers: Player[];
  userSendPicks: DraftPick[];
  aiSendPlayers: Player[];
  aiSendPicks: DraftPick[];
  teams: Team[];
  year: number;
}): TradeEvaluationResult {
  const {
    userTeam,
    partnerTeam,
    userRoster,
    partnerRoster,
    userSendPlayers,
    userSendPicks,
    aiSendPlayers,
    aiSendPicks,
    teams,
    year,
  } = params;

  const userPreSummary = getTeamPayrollSummary(userTeam, userRoster);
  const partnerPreSummary = getTeamPayrollSummary(partnerTeam, partnerRoster);

  const userOutSalary = roundMoney(userSendPlayers.reduce((s, p) => s + getPlayerEffectiveCapHit(p), 0));
  const aiOutSalary = roundMoney(aiSendPlayers.reduce((s, p) => s + getPlayerEffectiveCapHit(p), 0));

  const userPostPayroll = roundMoney(userPreSummary.totalPayroll - userOutSalary + aiOutSalary);
  const partnerPostPayroll = roundMoney(partnerPreSummary.totalPayroll - aiOutSalary + userOutSalary);

  const userActiveCount = userRoster.filter((p) => !isPlayerOnIL(p)).length;
  const partnerActiveCount = partnerRoster.filter((p) => !isPlayerOnIL(p)).length;
  const userOutActive = userSendPlayers.filter((p) => !isPlayerOnIL(p)).length;
  const aiOutActive = aiSendPlayers.filter((p) => !isPlayerOnIL(p)).length;

  const userNewCount = userActiveCount - userOutActive + aiOutActive;
  const partnerNewCount = partnerActiveCount - aiOutActive + userOutActive;

  const userBasePts =
    userSendPlayers.reduce((s, p) => s + getPlayerTradeValue(p), 0) +
    userSendPicks.reduce((s, pk) => s + getDraftPickTradeValue(pk, teams, year), 0);
  const aiBasePts =
    aiSendPlayers.reduce((s, p) => s + getPlayerTradeValue(p), 0) +
    aiSendPicks.reduce((s, pk) => s + getDraftPickTradeValue(pk, teams, year), 0);

  const hasAssets = userBasePts > 0 && aiBasePts > 0;
  const aiReasons: string[] = [];

  // AI Cap-Awareness & Rookie Value Adjustments
  let aiCapBonus = 0;
  const partnerOverRelief = partnerPreSummary.totalPayroll > AI_CAP_RELIEF_THRESHOLD;
  if (partnerOverRelief) {
    const netSalaryShed = roundMoney(aiOutSalary - userOutSalary);
    if (netSalaryShed > 0) {
      aiCapBonus += Math.round(netSalaryShed * 14);
      aiReasons.push(
        `AI > $${AI_CAP_RELIEF_THRESHOLD.toFixed(0)}M payroll: values $${netSalaryShed.toFixed(2)}M immediate cap relief`
      );
    } else if (netSalaryShed < -2) {
      aiCapBonus += Math.round(netSalaryShed * 10);
      aiReasons.push(
        `AI > $${AI_CAP_RELIEF_THRESHOLD.toFixed(0)}M payroll: reluctant to add $${Math.abs(netSalaryShed).toFixed(2)}M payroll`
      );
    }

    const expiringIn = userSendPlayers.filter((p) => getPlayerContractYears(p) === 1);
    const multiYrOut = aiSendPlayers.filter((p) => getPlayerContractYears(p) >= 2 && getPlayerSalary(p) >= 6);
    if (expiringIn.length > 0 && multiYrOut.length > 0) {
      const expiringBonus = Math.round(
        expiringIn.reduce((s, p) => s + 18 + getPlayerSalary(p) * 3.5, 0)
      );
      aiCapBonus += expiringBonus;
      aiReasons.push('Expiring deal(s) clear future cap books');
    }
  }

  const cheapRookieIncoming = userSendPlayers.filter(
    (p) => getPlayerContractYears(p) >= 2 && getPlayerSalary(p) <= 3.5
  );
  if (cheapRookieIncoming.length > 0) {
    aiCapBonus += cheapRookieIncoming.length * 24;
    aiReasons.push(`Values ${cheapRookieIncoming.length} cheap team-controlled rookie/bridge deal(s)`);
  }

  const userCapLegal = isCapMoveLegal(userPreSummary.totalPayroll, userPostPayroll);
  const partnerCapLegal = isCapMoveLegal(partnerPreSummary.totalPayroll, partnerPostPayroll);
  const capBlocked = hasAssets && (!userCapLegal || !partnerCapLegal);
  const rosterBlocked = hasAssets && (userNewCount > 30 || partnerNewCount > 30);

  let capBlockReason: string | null = null;
  if (!userCapLegal && !partnerCapLegal) {
    capBlockReason = `Both teams violate the $${HARD_SALARY_CAP.toFixed(1)}M Hard Cap (${userTeam?.id}: $${userPostPayroll.toFixed(2)}M, ${partnerTeam?.id}: $${partnerPostPayroll.toFixed(2)}M).`;
  } else if (!userCapLegal) {
    capBlockReason = userPreSummary.overCap
      ? `Blocked: ${userTeam?.id} is over the $180.0M cap ($${userPreSummary.totalPayroll.toFixed(2)}M) — trade must reduce payroll (post: $${userPostPayroll.toFixed(2)}M).`
      : `Blocked: ${userTeam?.id} post-trade payroll ($${userPostPayroll.toFixed(2)}M) exceeds the $${HARD_SALARY_CAP.toFixed(1)}M Hard Cap.`;
  } else if (!partnerCapLegal) {
    capBlockReason = partnerPreSummary.overCap
      ? `Blocked: ${partnerTeam?.id} is over the $180.0M cap ($${partnerPreSummary.totalPayroll.toFixed(2)}M) — trade must reduce payroll (post: $${partnerPostPayroll.toFixed(2)}M).`
      : `Blocked: ${partnerTeam?.id} post-trade payroll ($${partnerPostPayroll.toFixed(2)}M) exceeds the $${HARD_SALARY_CAP.toFixed(1)}M Hard Cap.`;
  } else if (rosterBlocked) {
    capBlockReason = `Blocked: Resulting active roster exceeds 30 players (${userTeam?.id}: ${userNewCount}, ${partnerTeam?.id}: ${partnerNewCount}).`;
  }

  const starTax = aiSendPlayers.some((p) => p.ovr >= 84) ? 1.08 : 1.0;
  const userOfferScoreForAI = Math.max(0, userBasePts + aiCapBonus);
  const aiOfferScoreForUser = aiBasePts;
  const ratio = aiBasePts > 0 ? userOfferScoreForAI / (aiBasePts * starTax) : 0;

  let status: TradeEvaluationResult['status'] = 'EMPTY';
  let message = 'Select players and/or future draft picks on both sides to construct a trade proposal.';

  if (hasAssets) {
    if (capBlocked || rosterBlocked) {
      status = 'BLOCKED';
      message = capBlockReason || 'Trade violates league cap or roster limits.';
    } else if (ratio >= 0.96) {
      status = 'ACCEPT';
      if (userPreSummary.overCap && userPostPayroll < userPreSummary.totalPayroll) {
        message = `${partnerTeam?.city} GM: "We accept — this salary-dump trims $${(userPreSummary.totalPayroll - userPostPayroll).toFixed(2)}M off your over-cap payroll."`;
      } else {
        message = `${partnerTeam?.city} GM: "This deal fits our roster timeline and $180.0M cap sheet. We accept."`;
      }
    } else if (ratio >= 0.82) {
      status = 'CLOSE';
      message = `${partnerTeam?.city} GM: "We are close—add a mid-round pick, prospect, or extra cap relief to get it done."`;
    } else {
      status = 'REJECT';
      message = `${partnerTeam?.city} GM: "We cannot justify moving these assets for that return."`;
    }
  }

  return {
    userBasePts,
    aiBasePts,
    userOfferScoreForAI,
    aiOfferScoreForUser,
    ratio,
    status,
    capBlocked,
    rosterBlocked,
    capBlockReason,
    message,
    aiReasons,
    userPreSummary,
    partnerPreSummary,
    userPostPayroll,
    partnerPostPayroll,
  };
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

export function selectBestDraftPickForAI(
  availablePlayers: Player[],
  teamRoster: Player[],
  options?: {
    team?: Team;
    isRookieDraft?: boolean;
    round?: number;
    targetRosterSize?: number;
  }
): Player | null {
  if (availablePlayers.length === 0) return null;

  const { counts, totalHitters, totalPitchers } = getTeamRosterNeeds(teamRoster);
  const summary = getTeamPayrollSummary(options?.team, teamRoster);

  const isRookie = Boolean(options?.isRookieDraft);
  const rookieSlotCost = isRookie ? getRookieContractSalary(options?.round ?? 3) : 0;

  // Hard cap check for rookie draft slots
  if (isRookie && roundMoney(summary.totalPayroll + rookieSlotCost) > HARD_SALARY_CAP) {
    return null;
  }

  const targetSize = options?.targetRosterSize ?? (isRookie ? teamRoster.length + 1 : 30);
  const remainingFutureSlots = isRookie ? 0 : Math.max(0, targetSize - teamRoster.length - 1);
  const maxAffordableSalary = isRookie
    ? rookieSlotCost
    : roundMoney(HARD_SALARY_CAP - summary.totalPayroll - remainingFutureSlots * MIN_PLAYER_SALARY);

  const affordablePool = isRookie
    ? availablePlayers
    : availablePlayers.filter((p) => getPlayerSalary(p) <= maxAffordableSalary + 0.001);

  const candidatePool =
    affordablePool.length > 0
      ? affordablePool.slice(0, 28)
      : [...availablePlayers].sort((a, b) => getPlayerSalary(a) - getPlayerSalary(b)).slice(0, 1);

  let bestPlayer = candidatePool[0];
  let bestScore = -9999;

  for (const p of candidatePool) {
    const sal = isRookie ? rookieSlotCost : getPlayerSalary(p);
    let score = p.ovr * 1.6 + (p.potential - p.ovr) * 0.45 - Math.max(0, p.age - 28) * 1.5;

    // Slight value efficiency bonus in inaugural draft so AI doesn't overpay for declining vets
    if (!isRookie) {
      if (sal <= 3.5 && p.age <= 25) score += 5;
      if (summary.totalPayroll > 125 && sal > 12) score -= (sal - 12) * 0.9;
    }

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

// ============================================================================
// OFFSEASON PIPELINE: RETIREMENTS -> ASYMMETRIC AGING -> CONTRACTS & FA
// ============================================================================

export function getRetirementProbability(player: Player, nextAge: number): number {
  if (nextAge < 33) return 0;
  let prob = 0;
  if (nextAge === 33) prob = 0.06;
  else if (nextAge === 34) prob = 0.12;
  else if (nextAge === 35) prob = 0.22;
  else if (nextAge === 36) prob = 0.34;
  else if (nextAge === 37) prob = 0.48;
  else if (nextAge === 38) prob = 0.64;
  else if (nextAge === 39) prob = 0.80;
  else prob = 0.92;

  if (player.ovr < 62) prob += 0.26;
  else if (player.ovr < 68) prob += 0.1;

  if (!player.teamId) prob += 0.22;
  if (player.ovr >= 80 && player.teamId && nextAge <= 37) prob -= 0.12;

  return Math.max(0.02, Math.min(0.97, prob));
}

function formatCareerLine(p: Player, stats: Record<string, number>): string {
  if (p.isPitcher) {
    const ratios = getPitcherRatios(stats);
    return `${stats.w || 0}-${stats.l || 0} · ${ratios.era} ERA · ${stats.so || 0} SO · ${stats.sv || 0} SV`;
  }
  const slash = getHitterSlash(stats);
  return `${slash.avg} AVG · ${stats.hr || 0} HR · ${stats.rbi || 0} RBI · ${stats.sb || 0} SB`;
}

export function runOffseasonRollover(params: {
  nextYear: number;
  teams: Team[];
  players: Player[];
  draftPicks: DraftPick[];
  userTeamId: string;
}): {
  teams: Team[];
  players: Player[];
  draftPicks: DraftPick[];
  orderedRookiePicks: DraftSlot[];
  schedule: ScheduleDay[];
  retirements: RetiredPlayerSummary[];
  expiringUserCount: number;
  expiringLeagueCount: number;
  aiReSignedCount: number;
} {
  const { nextYear, teams, players, draftPicks, userTeamId } = params;

  // 1. Capture reverse-standings draft order BEFORE resetting records
  const reverseStandings = [...teams].sort((a, b) => {
    if (a.wins !== b.wins) return a.wins - b.wins;
    return a.runsScored - a.runsAllowed - (b.runsScored - b.runsAllowed);
  });
  const slotByOrigTeam: Record<string, number> = {};
  reverseStandings.forEach((t, idx) => {
    slotByOrigTeam[t.id] = idx + 1;
  });

  const yearPicks = draftPicks.filter((pk) => pk.year === nextYear);
  const orderedRookiePicks: DraftSlot[] = [];
  for (let r = 1; r <= 5; r++) {
    const roundPicks = yearPicks
      .filter((pk) => pk.round === r)
      .sort((a, b) => (slotByOrigTeam[a.originalTeamId] || 16) - (slotByOrigTeam[b.originalTeamId] || 16));

    roundPicks.forEach((pk, idx) => {
      orderedRookiePicks.push({
        pickNum: (r - 1) * 32 + idx + 1,
        round: r,
        teamId: pk.ownerTeamId,
        originalTeamId: pk.originalTeamId,
        pickId: pk.id,
      });
    });
  }

  // 2. Retirements + Asymmetric Aging + Stat Archiving
  const retirements: RetiredPlayerSummary[] = [];
  const survivors: Player[] = [];

  for (const p of players) {
    const mergedCareer: Record<string, number> = {};
    for (const k of Object.keys(p.careerStats)) {
      mergedCareer[k] = (p.careerStats[k] || 0) + (p.seasonStats[k] || 0);
    }

    const nextAge = p.age + 1;
    const retireProb = getRetirementProbability(p, nextAge);
    if (retireProb > 0 && Math.random() < retireProb) {
      let reason = `Age ${nextAge} veteran retirement`;
      if (!p.teamId) reason = 'Retired as unrostered free agent';
      else if (p.ovr < 62) reason = 'Declining skills / below 62 OVR';
      retirements.push({
        id: p.id,
        name: p.name,
        position: p.position,
        isPitcher: p.isPitcher,
        age: nextAge,
        ovr: p.ovr,
        teamId: p.teamId,
        salary: getPlayerSalary(p),
        reason,
        careerLine: formatCareerLine(p, mergedCareer),
      });
      continue;
    }

    const historyEntry =
      (p.seasonStats.g || 0) > 0 && p.teamId
        ? [
            ...(p.seasonHistory || []).slice(-14),
            {
              year: nextYear - 1,
              teamId: p.teamId,
              ovr: p.ovr,
              stats: { ...p.seasonStats },
            },
          ]
        : p.seasonHistory || [];

    const aged: Player = {
      ...p,
      age: nextAge,
      salary: getPlayerSalary(p),
      contractYears: getPlayerContractYears(p),
      waivedByTeamId: null,
      waivedDeadCapHit: 0,
      waiverExpiresDay: null,
      injury: null,
      careerStats: mergedCareer,
      seasonStats: createEmptySeasonStats(p.isPitcher),
      seasonHistory: historyEntry,
    };

    // Asymmetric aging curves:
    // <26: growth toward potential
    // 26-29: prime stability
    // 30+: Speed & Velocity decline ~2x faster than Power / Control / Finesse
    if (nextAge <= 25) {
      const gap = Math.max(0, aged.potential - aged.ovr);
      const baseGain = gap > 0 ? Math.min(gap, Math.round(1 + Math.random() * (2 + gap * 0.28))) : Math.round(Math.random() * 2);
      if (aged.isPitcher) {
        aged.velocity = clamp((aged.velocity ?? 50) + baseGain + Math.round((Math.random() - 0.35) * 2), 20, 99);
        aged.control = clamp((aged.control ?? 50) + baseGain + Math.round((Math.random() - 0.3) * 2), 20, 99);
        aged.finesse = clamp((aged.finesse ?? 50) + baseGain + Math.round((Math.random() - 0.3) * 2), 20, 99);
      } else {
        aged.power = clamp((aged.power ?? 50) + baseGain + Math.round((Math.random() - 0.3) * 2), 20, 99);
        aged.speed = clamp((aged.speed ?? 50) + Math.round(baseGain * 0.85) + Math.round((Math.random() - 0.35) * 2), 20, 99);
        aged.glove = clamp((aged.glove ?? 50) + baseGain + Math.round((Math.random() - 0.3) * 2), 20, 99);
      }
    } else if (nextAge <= 29) {
      const minorShift = () => Math.round((Math.random() - 0.42) * 2.4);
      if (aged.isPitcher) {
        aged.velocity = clamp((aged.velocity ?? 50) + minorShift(), 20, 99);
        aged.control = clamp((aged.control ?? 50) + Math.round((Math.random() - 0.32) * 2.2), 20, 99);
        aged.finesse = clamp((aged.finesse ?? 50) + Math.round((Math.random() - 0.35) * 2.2), 20, 99);
      } else {
        aged.power = clamp((aged.power ?? 50) + Math.round((Math.random() - 0.35) * 2.2), 20, 99);
        aged.speed = clamp((aged.speed ?? 50) + Math.round((Math.random() - 0.52) * 2.2), 20, 99);
        aged.glove = clamp((aged.glove ?? 50) + minorShift(), 20, 99);
      }
    } else {
      const severity = nextAge <= 32 ? 1.0 : nextAge <= 35 ? 1.8 : 2.7;
      if (aged.isPitcher) {
        // Velocity declines faster than Control & Finesse
        const velDrop = Math.round(severity * (1.7 + Math.random() * 1.8));
        const ctlDelta = Math.round((nextAge <= 33 ? 0.5 : -0.3) - Math.random() * severity * 0.85);
        const finDelta = Math.round((nextAge <= 32 ? 0.4 : -0.35) - Math.random() * severity * 0.95);
        aged.velocity = clamp((aged.velocity ?? 50) - velDrop, 20, 99);
        aged.control = clamp((aged.control ?? 50) + ctlDelta, 20, 99);
        aged.finesse = clamp((aged.finesse ?? 50) + finDelta, 20, 99);
      } else {
        // Speed declines faster than Power & Glove
        const spdDrop = Math.round(severity * (1.8 + Math.random() * 1.8));
        const powDelta = Math.round((nextAge <= 32 ? 0.4 : -0.3) - Math.random() * severity * 1.05);
        const glvDelta = -Math.round(severity * (0.65 + Math.random() * 1.0));
        aged.speed = clamp((aged.speed ?? 50) - spdDrop, 20, 99);
        aged.power = clamp((aged.power ?? 50) + powDelta, 20, 99);
        aged.glove = clamp((aged.glove ?? 50) + glvDelta, 20, 99);
      }
    }

    aged.ovr = calculateOverall(aged);
    survivors.push(aged);
  }

  retirements.sort((a, b) => b.ovr - a.ovr || b.age - a.age);

  // 3. Reset Teams (including Dead Cap = 0 for new league year)
  const resetTeams: Team[] = teams.map((t) => ({
    ...t,
    wins: 0,
    losses: 0,
    runsScored: 0,
    runsAllowed: 0,
    streak: 0,
    last10: [],
    deadCap: 0,
  }));

  // 4. Contract Rollover & AI Immediate Re-Signings
  const activePayrollByTeam: Record<string, number> = {};
  const rosterCountByTeam: Record<string, number> = {};
  resetTeams.forEach((t) => {
    activePayrollByTeam[t.id] = 0;
    rosterCountByTeam[t.id] = 0;
  });

  const expiringAIPool: Player[] = [];
  const rolledPlayers: Player[] = [];
  let expiringUserCount = 0;
  let expiringLeagueCount = 0;
  let aiReSignedCount = 0;

  for (const p of survivors) {
    const yrsLeft = getPlayerContractYears(p) - 1;
    if (p.teamId && yrsLeft >= 1) {
      const kept: Player = {
        ...p,
        contractYears: yrsLeft,
        previousTeamId: p.teamId,
      };
      activePayrollByTeam[p.teamId] = roundMoney((activePayrollByTeam[p.teamId] || 0) + getPlayerSalary(kept));
      rosterCountByTeam[p.teamId] = (rosterCountByTeam[p.teamId] || 0) + 1;
      rolledPlayers.push(kept);
    } else if (p.teamId && yrsLeft <= 0) {
      expiringLeagueCount++;
      const marketSal = calculateFairSalary(p.ovr, p.age, p.potential);
      if (p.teamId === userTeamId) {
        expiringUserCount++;
        rolledPlayers.push({
          ...p,
          teamId: null,
          previousTeamId: userTeamId,
          salary: marketSal,
          contractYears: 1,
        });
      } else {
        expiringAIPool.push({
          ...p,
          previousTeamId: p.teamId,
          salary: marketSal,
          contractYears: 1,
        });
      }
    } else {
      // Already a Free Agent: refresh asking salary
      rolledPlayers.push({
        ...p,
        teamId: null,
        previousTeamId: null,
        salary: calculateFairSalary(p.ovr, p.age, p.potential),
        contractYears: 1,
      });
    }
  }

  // AI evaluates its expiring players sorted by value; re-signs core guys strictly under $167M budget
  // (reserving ~$13M headroom for Free Agency + Rookie Draft slots)
  expiringAIPool.sort((a, b) => b.ovr - a.ovr);
  for (const p of expiringAIPool) {
    const origTeam = p.previousTeamId;
    if (!origTeam) continue;
    const curPay = activePayrollByTeam[origTeam] || 0;
    const curCount = rosterCountByTeam[origTeam] || 0;
    const desiredTerm = p.age >= 32 ? 2 : p.ovr >= 78 ? 4 : 3;
    const offer = calculateExtensionOffer(p, desiredTerm);

    const worthKeeping = p.ovr >= 67 || (p.age <= 25 && p.potential >= 74);
    if (worthKeeping && curCount < 27 && roundMoney(curPay + offer.salary) <= 167.0) {
      activePayrollByTeam[origTeam] = roundMoney(curPay + offer.salary);
      rosterCountByTeam[origTeam] = curCount + 1;
      aiReSignedCount++;
      rolledPlayers.push({
        ...p,
        teamId: origTeam,
        salary: offer.salary,
        contractYears: offer.years,
      });
    } else {
      rolledPlayers.push({
        ...p,
        teamId: null,
        contractYears: 1,
      });
    }
  }

  // 5. Future Draft Picks (+3 years out)
  const newFutureYear = nextYear + 3;
  const addedFuturePicks: DraftPick[] = [];
  for (let r = 1; r <= 5; r++) {
    for (const t of resetTeams) {
      addedFuturePicks.push({
        id: `PICK-${newFutureYear}-R${r}-${t.id}`,
        year: newFutureYear,
        round: r,
        originalTeamId: t.id,
        ownerTeamId: t.id,
      });
    }
  }
  const nextDraftPicks = [...draftPicks.filter((pk) => pk.year > nextYear), ...addedFuturePicks];
  const schedule = generateSeasonSchedule(resetTeams);

  return {
    teams: resetTeams,
    players: rolledPlayers,
    draftPicks: nextDraftPicks,
    orderedRookiePicks,
    schedule,
    retirements,
    expiringUserCount,
    expiringLeagueCount,
    aiReSignedCount,
  };
}

export function runAIOffseasonFreeAgency(params: {
  teams: Team[];
  players: Player[];
  userTeamId: string;
  draftOrder: DraftSlot[];
}): { players: Player[]; signings: string[] } {
  const { teams, players, userTeamId, draftOrder } = params;
  const workingPlayers = players.map((p) => ({ ...p }));
  const signings: string[] = [];

  // Compute rookie draft salary reserve needed per team
  const rookieReserveByTeam: Record<string, number> = {};
  draftOrder.forEach((slot) => {
    rookieReserveByTeam[slot.teamId] = roundMoney(
      (rookieReserveByTeam[slot.teamId] || 0) + getRookieContractSalary(slot.round)
    );
  });

  const aiTeams = teams.filter((t) => t.id !== userTeamId);
  const rosterByTeam: Record<string, Player[]> = {};
  teams.forEach((t) => {
    rosterByTeam[t.id] = [];
  });
  workingPlayers.forEach((p) => {
    if (p.teamId && rosterByTeam[p.teamId]) {
      rosterByTeam[p.teamId].push(p);
    }
  });

  const faPool = workingPlayers
    .filter((p) => !p.teamId)
    .sort((a, b) => b.ovr - a.ovr || b.potential - a.potential);

  // Two passes:
  // Pass 1: Teams under $90M floor or under 24 players fill roster & reach floor
  // Pass 2: Contenders/cap-rich teams upgrade weak spots up to 27 players pre-draft
  for (let pass = 1; pass <= 2; pass++) {
    // Shuffle AI order slightly for fairness
    const orderedAI = [...aiTeams].sort((a, b) => {
      const sumA = getTeamPayrollSummary(a, rosterByTeam[a.id]);
      const sumB = getTeamPayrollSummary(b, rosterByTeam[b.id]);
      if (pass === 1) return sumA.totalPayroll - sumB.totalPayroll;
      return Math.random() - 0.5;
    });

    for (const aiTeam of orderedAI) {
      const reserve = rookieReserveByTeam[aiTeam.id] || 3.5;
      const picksForTeam = draftOrder.filter((s) => s.teamId === aiTeam.id).length;
      const maxPreDraftRoster =
        pass === 1 ? Math.max(22, 30 - Math.min(5, picksForTeam)) : Math.min(27, Math.max(25, 30 - Math.min(4, picksForTeam)));

      for (let attempt = 0; attempt < 12; attempt++) {
        const roster = rosterByTeam[aiTeam.id];
        const summary = getTeamPayrollSummary(aiTeam, roster);
        const effectiveCapRoom = roundMoney(HARD_SALARY_CAP - summary.totalPayroll - reserve);

        if (roster.length >= maxPreDraftRoster || effectiveCapRoom < MIN_PLAYER_SALARY) break;
        if (pass === 1 && !summary.underFloor && roster.length >= 24) break;
        if (pass === 2 && (summary.totalPayroll >= 168.0 || roster.length >= maxPreDraftRoster)) break;

        const needs = getTeamRosterNeeds(roster);
        // Find best affordable FA fitting positional balance (scan full pool so depth guys remain visible)
        let bestIdx = -1;
        let bestScore = -9999;
        let evaluated = 0;

        for (let i = 0; i < faPool.length && evaluated < 90; i++) {
          const cand = faPool[i];
          if (cand.teamId) continue;
          const sal = getPlayerSalary(cand);
          if (sal > effectiveCapRoom) continue;
          if (roundMoney(summary.totalPayroll + sal + reserve) > HARD_SALARY_CAP) continue;
          evaluated++;

          // If pass 1 & under floor, favor fair-value starters to help climb toward $90M
          let score = cand.ovr * 1.5 + (cand.potential - cand.ovr) * 0.3;
          if (cand.isPitcher) {
            if (needs.totalPitchers < 11) score += 14;
            else if (needs.totalPitchers >= 14) score -= 25;
            if (cand.position === 'SP' && needs.counts.SP < 5) score += 10;
          } else {
            if ((needs.counts[cand.position] || 0) === 0) score += 16;
            else if ((needs.counts[cand.position] || 0) >= 3) score -= 20;
            if (needs.totalHitters >= 16) score -= 25;
          }
          if (pass === 1 && summary.underFloor && sal >= 4) score += 6;

          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }

        if (bestIdx === -1) break;
        const signed = faPool[bestIdx];
        const term = signed.age >= 33 ? 1 : signed.ovr >= 74 ? 3 : 2;
        const offer = calculateExtensionOffer(signed, term);
        if (roundMoney(summary.totalPayroll + offer.salary + reserve) > HARD_SALARY_CAP) {
          // Fallback to base salary if slightly higher
          if (roundMoney(summary.totalPayroll + getPlayerSalary(signed) + reserve) > HARD_SALARY_CAP) break;
          signed.salary = getPlayerSalary(signed);
        } else {
          signed.salary = offer.salary;
        }
        signed.contractYears = term;
        signed.teamId = aiTeam.id;
        signed.previousTeamId = aiTeam.id;
        roster.push(signed);

        if (signed.ovr >= 68) {
          signings.push(
            `${aiTeam.id} signed FA ${signed.position} ${signed.name} (${signed.ovr} OVR) — $${signed.salary.toFixed(2)}M / ${term}yr.`
          );
        }
      }
    }
  }

  return { players: workingPlayers, signings };
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
  const isHealthy = (p: Player) => !p.injury || (p.injury.daysRemaining <= 0 && !p.injury.onIL);
  const allHitters = roster.filter((p) => !p.isPitcher).sort((a, b) => b.ovr - a.ovr);
  const allPitchers = roster.filter((p) => p.isPitcher).sort((a, b) => b.ovr - a.ovr);

  const healthyHitters = allHitters.filter(isHealthy);
  const healthyPitchers = allPitchers.filter(isHealthy);

  // Emergency fallback only if team lacks 9 healthy hitters or 2 healthy pitchers
  const hitters =
    healthyHitters.length >= 9
      ? healthyHitters
      : [
          ...healthyHitters,
          ...allHitters.filter((h) => !healthyHitters.includes(h) && !isPlayerOnIL(h)),
          ...allHitters.filter((h) => !healthyHitters.includes(h) && isPlayerOnIL(h)),
        ];
  const pitchers =
    healthyPitchers.length >= 2
      ? healthyPitchers
      : [
          ...healthyPitchers,
          ...allPitchers.filter((p) => !healthyPitchers.includes(p) && !isPlayerOnIL(p)),
          ...allPitchers.filter((p) => !healthyPitchers.includes(p) && isPlayerOnIL(p)),
        ];

  const sps = pitchers.filter((p) => p.position === 'SP');
  const rps = pitchers.filter((p) => p.position === 'RP');

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

// ============================================================================
// AGE-SCALED INJURIES, 15/60-DAY IL & REVERSE-STANDINGS WAIVER WIRE
// ============================================================================

const HITTER_INJURY_NAMES: Record<InjurySeverity, string[]> = {
  DTD: ['Tight Hamstring', 'Bruised Wrist', 'Quad Soreness', 'Back Spasms', 'Foul Tip Contusion'],
  IL15: ['Oblique Strain', 'Hamstring Strain', 'Ankle Sprain', 'Groin Strain', 'Shoulder Inflammation'],
  IL60: ['Fractured Wrist', 'Torn Meniscus', 'Achilles Strain', 'Broken Collarbone', 'Labrum Tear'],
};

const PITCHER_INJURY_NAMES: Record<InjurySeverity, string[]> = {
  DTD: ['Forearm Tightness', 'Bicep Fatigue', 'Blister on Pitching Hand', 'Back Stiffness', 'Neck Spasms'],
  IL15: ['Shoulder Inflammation', 'Lat Strain', 'Elbow Tendinitis', 'Oblique Strain', 'Hip Impingement'],
  IL60: ['UCL Tear / Elbow Rehab', 'Rotator Cuff Strain', 'Flexor Tendon Strain', 'Torn Labrum', 'Stress Fracture'],
};

export function getDailyInjuryProbability(age: number, isPitcher: boolean): number {
  let base = 0.0006; // <27 low
  if (age >= 36) base = 0.0038; // 36+ very high
  else if (age >= 32) base = 0.0022; // 32-35 high
  else if (age >= 27) base = 0.0012; // 27-31 moderate
  return isPitcher ? base * 1.3 : base;
}

export function rollPlayerInjury(player: Player): PlayerInjury | null {
  const prob = getDailyInjuryProbability(player.age, player.isPitcher);
  if (Math.random() >= prob) return null;

  const r = Math.random();
  let severity: InjurySeverity = 'DTD';
  let daysRemaining = 2 + Math.floor(Math.random() * 4); // 2-5d
  if (r >= 0.88) {
    severity = 'IL60';
    daysRemaining = 45 + Math.floor(Math.random() * 46); // 45-90d
  } else if (r >= 0.55) {
    severity = 'IL15';
    daysRemaining = 10 + Math.floor(Math.random() * 16); // 10-25d
  }

  const catalog = player.isPitcher ? PITCHER_INJURY_NAMES[severity] : HITTER_INJURY_NAMES[severity];
  const type = catalog[Math.floor(Math.random() * catalog.length)];
  return {
    type,
    severity,
    daysRemaining,
    onIL: null,
  };
}

export function clearExpiredWaiverTags(players: Player[], nextDay: number): void {
  for (const p of players) {
    if (!p.teamId && typeof p.waiverExpiresDay === 'number' && nextDay > p.waiverExpiresDay) {
      p.waivedByTeamId = null;
      p.waivedDeadCapHit = 0;
      p.waiverExpiresDay = null;
      p.salary = MIN_PLAYER_SALARY;
      p.contractYears = 1;
    }
  }
}

export function processDailyInjuriesAndWaivers(params: {
  nextDay: number;
  teams: Team[];
  players: Player[];
  tLookup: Record<string, Team>;
  rosterLookup: Record<string, Player[]>;
  userTeamId: string;
  year: number;
}): Array<{ id: string; year: number; day: number; category: string; summary: string }> {
  const { nextDay, teams, players, tLookup, rosterLookup, userTeamId, year } = params;
  const logs: Array<{ id: string; year: number; day: number; category: string; summary: string }> = [];

  // 1. Recovery tick for existing injuries
  for (const p of players) {
    if (!p.injury) continue;
    if (p.injury.daysRemaining > 0) {
      p.injury = { ...p.injury, daysRemaining: p.injury.daysRemaining - 1 };
    }
    if (p.injury.daysRemaining <= 0) {
      if (!p.injury.onIL) {
        p.injury = null;
      } else if (p.teamId && p.teamId !== userTeamId) {
        // AI auto-activates healed IL player if active roster & cap permit (cutting weakest depth if full)
        const team = tLookup[p.teamId];
        const allTeamPlayers = rosterLookup[p.teamId] || [];
        const activePlayers = allTeamPlayers.filter((x) => !isPlayerOnIL(x));
        const preSummary = getTeamPayrollSummary(team, allTeamPlayers);
        const activationAddedCost = getPlayerILRelief(p);

        if (activePlayers.length < 30) {
          const post = roundMoney(preSummary.totalPayroll + activationAddedCost);
          if (isCapMoveLegal(preSummary.totalPayroll, post)) {
            p.injury = null;
          }
        } else {
          const weakest = [...activePlayers].sort((a, b) => a.ovr - b.ovr)[0];
          if (weakest && weakest.ovr < p.ovr) {
            const deadHit = computeReleaseDeadCap(weakest);
            const post = roundMoney(
              preSummary.totalPayroll + activationAddedCost - getPlayerEffectiveCapHit(weakest) + deadHit
            );
            if (isCapMoveLegal(preSummary.totalPayroll, post) && team) {
              team.deadCap = roundMoney((team.deadCap || 0) + deadHit);
              weakest.teamId = null;
              weakest.waivedByTeamId = team.id;
              weakest.waivedDeadCapHit = deadHit;
              weakest.waiverExpiresDay = nextDay + WAIVER_PERIOD_DAYS;
              weakest.injury = null;
              rosterLookup[team.id] = allTeamPlayers.filter((x) => x.id !== weakest.id);
              p.injury = null;
            }
          }
        }
      }
    }
  }

  // 2. Age-scaled daily injury rolls for active non-injured players
  for (const team of teams) {
    const teamAll = rosterLookup[team.id] || [];
    const healthyActive = teamAll.filter((p) => !isPlayerOnIL(p) && !p.injury);
    if (healthyActive.length <= 14) continue; // protect minimum playable depth

    let activeAvailableCount = teamAll.filter((p) => !isPlayerOnIL(p)).length;
    for (const plr of healthyActive) {
      if (activeAvailableCount <= 14) break;
      const inj = rollPlayerInjury(plr);
      if (!inj) continue;

      if (team.id !== userTeamId && (inj.severity === 'IL15' || inj.severity === 'IL60')) {
        inj.onIL = inj.severity === 'IL60' ? '60' : '15';
      }
      plr.injury = inj;
      if (inj.onIL) activeAvailableCount--;

      if (team.id === userTeamId || (inj.severity === 'IL60' && plr.ovr >= 78)) {
        const tag = inj.severity === 'DTD' ? 'DTD' : inj.severity === 'IL15' ? '15d IL' : '60d IL';
        logs.push({
          id: `inj-${nextDay}-${plr.id}`,
          year,
          day: nextDay,
          category: 'INJURY',
          summary: `${team.id} ${plr.position} ${plr.name} (${plr.ovr} OVR, Age ${plr.age}) injured: ${inj.type} (${tag}, ${inj.daysRemaining}d).`,
        });
      }
    }

    // AI replacement fill-in signing from cleared FA pool when active roster < 26
    if (team.id !== userTeamId) {
      const updatedAll = rosterLookup[team.id] || [];
      let activeNow = updatedAll.filter((p) => !isPlayerOnIL(p)).length;
      if (activeNow < 26) {
        const faCandidates = players
          .filter((p) => !p.teamId && !isActiveWaiverClaim(p, nextDay))
          .sort((a, b) => b.ovr - a.ovr);
        const fillIn = faCandidates[0];
        if (fillIn) {
          const sum = getTeamPayrollSummary(team, updatedAll);
          const post = roundMoney(sum.totalPayroll + MIN_PLAYER_SALARY);
          if (isCapMoveLegal(sum.totalPayroll, post)) {
            fillIn.teamId = team.id;
            fillIn.previousTeamId = team.id;
            fillIn.salary = MIN_PLAYER_SALARY;
            fillIn.contractYears = 1;
            fillIn.waivedByTeamId = null;
            fillIn.waivedDeadCapHit = 0;
            fillIn.waiverExpiresDay = null;
            fillIn.injury = null;
            updatedAll.push(fillIn);
            rosterLookup[team.id] = updatedAll;
            activeNow++;
          }
        }
      }
    }
  }

  // 3. Reverse-standings AI evaluation of Active Waivers (within 2-day claim window)
  const activeWaivers = players
    .filter((p) => isActiveWaiverClaim(p, nextDay) && p.ovr >= 63)
    .sort((a, b) => b.ovr - a.ovr);

  if (activeWaivers.length > 0) {
    // Worst win% claims first (reverse standings order)
    const reverseOrderAI = teams
      .filter((t) => t.id !== userTeamId)
      .sort((a, b) => {
        const gA = a.wins + a.losses;
        const gB = b.wins + b.losses;
        const pctA = gA > 0 ? a.wins / gA : 0.5;
        const pctB = gB > 0 ? b.wins / gB : 0.5;
        if (pctA !== pctB) return pctA - pctB;
        return a.runsScored - a.runsAllowed - (b.runsScored - b.runsAllowed);
      });

    for (const cand of activeWaivers) {
      if (cand.teamId) continue;
      for (const aiTeam of reverseOrderAI) {
        if (cand.waivedByTeamId === aiTeam.id) continue;
        const teamAll = rosterLookup[aiTeam.id] || [];
        const activeRoster = teamAll.filter((p) => !isPlayerOnIL(p)).sort((a, b) => a.ovr - b.ovr);
        const weakest = activeRoster[0];
        const hasOpenSlot = activeRoster.length < 30;
        const isUpgrade = hasOpenSlot ? cand.ovr >= 63 : Boolean(weakest && cand.ovr >= weakest.ovr + 3);
        if (!isUpgrade) continue;

        const aiSummary = getTeamPayrollSummary(aiTeam, teamAll);
        const claimSal = getPlayerSalary(cand);

        if (hasOpenSlot) {
          const post = roundMoney(aiSummary.totalPayroll + claimSal);
          if (!isCapMoveLegal(aiSummary.totalPayroll, post)) continue;
        } else if (weakest) {
          const cutDead = computeReleaseDeadCap(weakest);
          const post = roundMoney(aiSummary.totalPayroll + claimSal - getPlayerEffectiveCapHit(weakest) + cutDead);
          if (!isCapMoveLegal(aiSummary.totalPayroll, post)) continue;
        } else {
          continue;
        }

        // Execute waiver claim & wipe waiving team's remaining dead cap for this player
        const waivingTeam = cand.waivedByTeamId ? tLookup[cand.waivedByTeamId] : undefined;
        const rebatedDead = cand.waivedDeadCapHit || 0;
        if (waivingTeam && rebatedDead > 0) {
          waivingTeam.deadCap = Math.max(0, roundMoney((waivingTeam.deadCap || 0) - rebatedDead));
        }

        let droppedSummary = '';
        if (!hasOpenSlot && weakest) {
          const cutDead = computeReleaseDeadCap(weakest);
          aiTeam.deadCap = roundMoney((aiTeam.deadCap || 0) + cutDead);
          weakest.teamId = null;
          weakest.waivedByTeamId = aiTeam.id;
          weakest.waivedDeadCapHit = cutDead;
          weakest.waiverExpiresDay = nextDay + WAIVER_PERIOD_DAYS;
          weakest.injury = null;
          rosterLookup[aiTeam.id] = teamAll.filter((p) => p.id !== weakest.id);
          droppedSummary = ` and waived ${weakest.name}`;
        }

        cand.teamId = aiTeam.id;
        cand.previousTeamId = aiTeam.id;
        cand.waivedByTeamId = null;
        cand.waivedDeadCapHit = 0;
        cand.waiverExpiresDay = null;
        if (cand.injury) cand.injury = { ...cand.injury, onIL: null };
        rosterLookup[aiTeam.id] = [...(rosterLookup[aiTeam.id] || []), cand];

        const rebateNote =
          waivingTeam && rebatedDead > 0
            ? ` (${waivingTeam.id} saved ${formatMoney(rebatedDead)} dead cap)`
            : '';
        logs.push({
          id: `wvclaim-${nextDay}-${aiTeam.id}-${cand.id}`,
          year,
          day: nextDay,
          category: 'WAIVER',
          summary: `WAIVER CLAIM: ${aiTeam.id} claimed ${cand.position} ${cand.name} (${cand.ovr} OVR · ${formatMoney(claimSal)})${droppedSummary}${rebateNote}.`,
        });
        break;
      }
    }
  }

  // 4. Expire 2-day waiver windows for unclaimed players -> Open Free Agents ($0.75M / 1yr)
  clearExpiredWaiverTags(players, nextDay);

  return logs;
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
