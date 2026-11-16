import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  FastForward,
  Flame,
  Pause,
  Play,
  RefreshCw,
  Shield,
  SkipForward,
  Sparkles,
  UserCheck,
  Zap,
} from 'lucide-react';
import { getStadiumByTeamId, StadiumProfile } from '../data/stadiums';
import {
  buildLineupAndPitching,
  clamp,
  getHitterSlash,
  getPitcherRatios,
} from '../engine/baseballEngine';
import { Player, Team } from '../types/baseball';
import { PlayerAvatarSvg } from './PlayerAvatarSvg';
import { RatingBadge, TeamBadge } from './SharedBadges';

export interface LiveGameResult {
  homeTeamId: string;
  awayTeamId: string;
  homeRuns: number;
  awayRuns: number;
  homeWon: boolean;
  statDeltas: Record<string, Record<string, number>>;
}

interface LiveGameCanvasProps {
  year: number;
  currentDay: number;
  homeTeam: Team;
  awayTeam: Team;
  userTeamId: string;
  homeRoster: Player[];
  awayRoster: Player[];
  onCompleteGame: (result: LiveGameResult) => void;
  onExit: () => void;
}

type HalfInning = 'TOP' | 'BOT';
type PacingMode = 'IDLE' | 'PITCH_1X' | 'AT_BAT_4X';
type PlayOutcomeKind =
  | 'BALL'
  | 'CALLED_STRIKE'
  | 'SWINGING_STRIKE'
  | 'FOUL'
  | 'WALK'
  | 'IBB'
  | 'STRIKEOUT'
  | 'SINGLE'
  | 'DOUBLE'
  | 'TRIPLE'
  | 'HOMERUN'
  | 'GROUNDOUT'
  | 'FLYOUT'
  | 'FOUL_OUT'
  | 'STEAL_SAFE'
  | 'STEAL_OUT';

interface PlayLogEntry {
  id: number;
  inningLabel: string;
  text: string;
  tone: 'normal' | 'hit' | 'hr' | 'out' | 'manager' | 'hl';
}

interface InningScore {
  top: number | null;
  bot: number | null;
}

interface ActiveGameState {
  inning: number;
  half: HalfInning;
  outs: number;
  balls: number;
  strikes: number;
  bases: [Player | null, Player | null, Player | null];
  homeRuns: number;
  awayRuns: number;
  homeHits: number;
  awayHits: number;
  homeErrors: number;
  awayErrors: number;
  inningScores: InningScore[];
  homeOrder: Player[];
  awayOrder: Player[];
  homeBench: Player[];
  awayBench: Player[];
  homeBullpen: Player[];
  awayBullpen: Player[];
  homeSP: Player;
  awaySP: Player;
  homePitcher: Player;
  awayPitcher: Player;
  homePitchCount: number;
  awayPitchCount: number;
  homePitcherOuts: number;
  awayPitcherOuts: number;
  homePitcherRuns: number;
  awayPitcherRuns: number;
  homeBatterIdx: number;
  awayBatterIdx: number;
  usedPitcherIds: string[];
  usedBenchIds: string[];
  infieldIn: boolean;
  isFinal: boolean;
  highLeveragePaused: boolean;
  statDeltas: Record<string, Record<string, number>>;
  lastPlayBanner: string;
  logs: PlayLogEntry[];
}

interface FieldCoord {
  x: number;
  y: number;
}

interface FieldAnimState {
  active: boolean;
  kind: 'PITCH' | 'BATTED' | 'STEAL';
  startMs: number;
  durationMs: number;
  outcome: PlayOutcomeKind;
  sprayDeg: number;
  landDistFt: number;
  peakHeightFt: number;
  isHomeRun: boolean;
  nearestPos: string;
  runnerFromBase: number; // 0 for 1B, 1 for 2B
  runnerSpeed: number;
  advancingRunners: Array<{ from: number; to: number }>; // 0=home,1=1B,2=2B,3=3B,4=home
}

// ============================================================================
// FIELD COORDINATE & STADIUM GEOMETRY HELPERS (CANVAS 760 x 460)
// ============================================================================

const CW = 760;
const CH = 460;
const HOME_PX = CW / 2;
const HOME_PY = 414;
const FT_TO_PX = 0.86;

function polarFieldToCanvas(angleDeg: number, distFt: number): FieldCoord {
  const rad = (angleDeg * Math.PI) / 180;
  // Slightly foreshortened Y for 2.5D broadcast perspective
  const rx = distFt * FT_TO_PX;
  const ry = distFt * FT_TO_PX * 0.88;
  return {
    x: HOME_PX + Math.sin(rad) * rx,
    y: HOME_PY - Math.cos(rad) * ry,
  };
}

function getFenceAtAngle(stadium: StadiumProfile, angleDeg: number): { dist: number; wallHt: number } {
  const clamped = Math.max(-45, Math.min(45, angleDeg));
  const { lf, lc, cf, rc, rf } = stadium.dimensions;
  const h = stadium.wallHeights;
  const stops: Array<{ deg: number; d: number; ht: number }> = [
    { deg: -45, d: lf, ht: h.lf },
    { deg: -22.5, d: lc, ht: h.lc },
    { deg: 0, d: cf, ht: h.cf },
    { deg: 22.5, d: rc, ht: h.rc },
    { deg: 45, d: rf, ht: h.rf },
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i].deg && clamped <= stops[i + 1].deg) {
      const t = (clamped - stops[i].deg) / (stops[i + 1].deg - stops[i].deg);
      return {
        dist: stops[i].d + (stops[i + 1].d - stops[i].d) * t,
        wallHt: stops[i].ht + (stops[i + 1].ht - stops[i].ht) * t,
      };
    }
  }
  return { dist: cf, wallHt: h.cf };
}

function getBasePositions(): FieldCoord[] {
  return [
    { x: HOME_PX, y: HOME_PY },
    polarFieldToCanvas(45, 90),
    polarFieldToCanvas(0, 127.3),
    polarFieldToCanvas(-45, 90),
  ];
}

function getDefenderBaseCoords(
  batterHand: 'L' | 'R',
  infieldIn: boolean
): Record<string, FieldCoord> {
  // Subtle L/R shift in degrees
  const shift = batterHand === 'L' ? 4.5 : -4.5;
  const infPull = infieldIn ? 0.8 : 1;

  return {
    P: polarFieldToCanvas(0, 60.5),
    C: { x: HOME_PX, y: HOME_PY + 16 },
    '1B': polarFieldToCanvas(36 + shift * 0.6, 108 * infPull),
    '2B': polarFieldToCanvas(14 + shift * 0.9, 146 * infPull),
    SS: polarFieldToCanvas(-14 + shift * 0.9, 148 * infPull),
    '3B': polarFieldToCanvas(-35 + shift * 0.6, 108 * infPull),
    LF: polarFieldToCanvas(-30 + shift * 0.7, 278),
    CF: polarFieldToCanvas(0 + shift * 0.6, 315),
    RF: polarFieldToCanvas(30 + shift * 0.7, 278),
  };
}

function resolveBatterSide(batter: Player, pitcher: Player): 'L' | 'R' {
  if (batter.bats === 'S') return pitcher.throws === 'R' ? 'L' : 'R';
  return batter.bats;
}

function cloneStatDeltas(src: Record<string, Record<string, number>>) {
  const out: Record<string, Record<string, number>> = {};
  for (const k of Object.keys(src)) out[k] = { ...src[k] };
  return out;
}

function ensurePlayerDelta(
  deltas: Record<string, Record<string, number>>,
  p: Player
): Record<string, number> {
  if (!deltas[p.id]) {
    deltas[p.id] = p.isPitcher
      ? { g: 0, gs: 0, w: 0, l: 0, sv: 0, ipOuts: 0, h: 0, er: 0, bb: 0, so: 0 }
      : { g: 0, ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0, sb: 0 };
  }
  return deltas[p.id];
}

function createInitialGameState(
  homeRoster: Player[],
  awayRoster: Player[],
  currentDay: number,
  homeTeam: Team,
  awayTeam: Team,
  stadium: StadiumProfile
): ActiveGameState {
  const homeSetup = buildLineupAndPitching(homeRoster);
  const awaySetup = buildLineupAndPitching(awayRoster);

  const homeSP = homeSetup.rotation[currentDay % Math.max(1, homeSetup.rotation.length)] || homeRoster[0];
  const awaySP = awaySetup.rotation[currentDay % Math.max(1, awaySetup.rotation.length)] || awayRoster[0];

  const deltas: Record<string, Record<string, number>> = {};
  homeSetup.lineup.forEach((p) => { ensurePlayerDelta(deltas, p).g = 1; });
  awaySetup.lineup.forEach((p) => { ensurePlayerDelta(deltas, p).g = 1; });
  if (homeSP) {
    const d = ensurePlayerDelta(deltas, homeSP);
    d.g = 1;
    d.gs = 1;
  }
  if (awaySP) {
    const d = ensurePlayerDelta(deltas, awaySP);
    d.g = 1;
    d.gs = 1;
  }

  return {
    inning: 1,
    half: 'TOP',
    outs: 0,
    balls: 0,
    strikes: 0,
    bases: [null, null, null],
    homeRuns: 0,
    awayRuns: 0,
    homeHits: 0,
    awayHits: 0,
    homeErrors: 0,
    awayErrors: 0,
    inningScores: Array.from({ length: 9 }, () => ({ top: null, bot: null })),
    homeOrder: homeSetup.lineup,
    awayOrder: awaySetup.lineup,
    homeBench: homeSetup.bench,
    awayBench: awaySetup.bench,
    homeBullpen: homeSetup.bullpen,
    awayBullpen: awaySetup.bullpen,
    homeSP,
    awaySP,
    homePitcher: homeSP,
    awayPitcher: awaySP,
    homePitchCount: 0,
    awayPitchCount: 0,
    homePitcherOuts: 0,
    awayPitcherOuts: 0,
    homePitcherRuns: 0,
    awayPitcherRuns: 0,
    homeBatterIdx: 0,
    awayBatterIdx: 0,
    usedPitcherIds: [homeSP?.id, awaySP?.id].filter(Boolean) as string[],
    usedBenchIds: [],
    infieldIn: false,
    isFinal: false,
    highLeveragePaused: false,
    statDeltas: deltas,
    lastPlayBanner: `First pitch ready at ${stadium.name} (${awayTeam.id} @ ${homeTeam.id})`,
    logs: [
      {
        id: 1,
        inningLabel: 'PRE',
        text: `Play ball at ${stadium.name}. Starters: ${awaySP?.name || 'SP'} (${awayTeam.id}) vs. ${homeSP?.name || 'SP'} (${homeTeam.id}).`,
        tone: 'normal',
      },
    ],
  };
}

// ============================================================================
// PLATE APPEARANCE & PITCH SIMULATION ENGINE
// ============================================================================

function getBatterAndPitcher(state: ActiveGameState) {
  const isTop = state.half === 'TOP';
  const order = isTop ? state.awayOrder : state.homeOrder;
  const idx = isTop ? state.awayBatterIdx : state.homeBatterIdx;
  const batter = order[idx % order.length];
  const pitcher = isTop ? state.homePitcher : state.awayPitcher;
  const defenseOrder = isTop ? state.homeOrder : state.awayOrder;
  return { isTop, batter, pitcher, order, defenseOrder };
}

function finalizeWinnerStats(state: ActiveGameState): ActiveGameState {
  const deltas = cloneStatDeltas(state.statDeltas);
  // Prevent ties if somehow 15 innings finished tied
  let hRuns = state.homeRuns;
  let aRuns = state.awayRuns;
  if (hRuns === aRuns) {
    if (Math.random() < 0.52) hRuns++;
    else aRuns++;
  }
  const homeWon = hRuns > aRuns;
  if (homeWon) {
    const winP = state.homePitcherOuts >= 15 ? state.homeSP : state.homePitcher;
    if (winP) ensurePlayerDelta(deltas, winP).w = 1;
    if (state.awaySP) ensurePlayerDelta(deltas, state.awaySP).l = 1;
    if (
      state.homePitcher &&
      winP &&
      state.homePitcher.id !== winP.id &&
      hRuns - aRuns <= 3
    ) {
      ensurePlayerDelta(deltas, state.homePitcher).sv = 1;
    }
  } else {
    const winP = state.awayPitcherOuts >= 15 ? state.awaySP : state.awayPitcher;
    if (winP) ensurePlayerDelta(deltas, winP).w = 1;
    if (state.homeSP) ensurePlayerDelta(deltas, state.homeSP).l = 1;
    if (
      state.awayPitcher &&
      winP &&
      state.awayPitcher.id !== winP.id &&
      aRuns - hRuns <= 3
    ) {
      ensurePlayerDelta(deltas, state.awayPitcher).sv = 1;
    }
  }
  return {
    ...state,
    homeRuns: hRuns,
    awayRuns: aRuns,
    isFinal: true,
    statDeltas: deltas,
    lastPlayBanner: `FINAL: ${homeWon ? 'HOME' : 'AWAY'} VICTORY (${aRuns} - ${hRuns})`,
  };
}

function maybeAutoSwitchAIPitcher(state: ActiveGameState, userTeamId: string, homeId: string, awayId: string): ActiveGameState {
  const isTop = state.half === 'TOP';
  const defTeamId = isTop ? homeId : awayId;
  if (defTeamId === userTeamId) return state; // User manages their own pitching changes

  const pitcher = isTop ? state.homePitcher : state.awayPitcher;
  const sp = isTop ? state.homeSP : state.awaySP;
  const outs = isTop ? state.homePitcherOuts : state.awayPitcherOuts;
  const pRuns = isTop ? state.homePitcherRuns : state.awayPitcherRuns;
  const pCount = isTop ? state.homePitchCount : state.awayPitchCount;
  const bullpen = isTop ? state.homeBullpen : state.awayBullpen;

  const isCloseLate = state.inning >= 9 && Math.abs(state.homeRuns - state.awayRuns) <= 3;
  const shouldPullStarter =
    pitcher.id === sp.id && (outs >= 18 || pRuns >= 5 || pCount >= 98 || state.inning >= 7);
  const shouldBringCloser =
    pitcher.id !== sp.id && isCloseLate && bullpen[0] && pitcher.id !== bullpen[0].id;

  if (!shouldPullStarter && !shouldBringCloser) return state;

  const available = bullpen.filter((r) => !state.usedPitcherIds.includes(r.id));
  if (available.length === 0) return state;

  const nextP = isCloseLate ? available[0] : available[Math.floor(Math.random() * Math.min(3, available.length))];
  const deltas = cloneStatDeltas(state.statDeltas);
  ensurePlayerDelta(deltas, nextP).g = 1;

  const nextLogs: PlayLogEntry[] = [
    {
      id: Date.now() + Math.random(),
      inningLabel: `${isTop ? 'T' : 'B'}${state.inning}`,
      text: `${defTeamId} pitching change: ${nextP.name} (${nextP.ovr} OVR) enters from the bullpen.`,
      tone: 'manager',
    },
    ...state.logs.slice(0, 79),
  ];

  return {
    ...state,
    homePitcher: isTop ? nextP : state.homePitcher,
    awayPitcher: isTop ? state.awayPitcher : nextP,
    homePitchCount: isTop ? 0 : state.homePitchCount,
    awayPitchCount: isTop ? state.awayPitchCount : 0,
    usedPitcherIds: [...state.usedPitcherIds, nextP.id],
    statDeltas: deltas,
    logs: nextLogs,
  };
}

function advanceHalfInning(
  state: ActiveGameState,
  userTeamId: string,
  homeId: string,
  awayId: string
): ActiveGameState {
  // Check walk-off or home-ahead-after-top-9+
  if (state.inning >= 9 && state.half === 'BOT' && state.homeRuns > state.awayRuns) {
    return finalizeWinnerStats(state);
  }
  if (state.inning >= 9 && state.half === 'TOP' && state.homeRuns > state.awayRuns) {
    return finalizeWinnerStats(state);
  }
  if (state.inning >= 9 && state.half === 'BOT' && state.homeRuns !== state.awayRuns) {
    return finalizeWinnerStats(state);
  }
  if (state.inning >= 15 && state.half === 'BOT') {
    return finalizeWinnerStats(state);
  }

  let nextInning = state.inning;
  let nextHalf: HalfInning = state.half === 'TOP' ? 'BOT' : 'TOP';
  if (state.half === 'BOT') {
    nextInning = state.inning + 1;
  }

  const nextScores = [...state.inningScores];
  while (nextScores.length < nextInning) {
    nextScores.push({ top: null, bot: null });
  }
  if (nextHalf === 'TOP' && nextScores[nextInning - 1].top === null) {
    nextScores[nextInning - 1] = { ...nextScores[nextInning - 1], top: 0 };
  }
  if (nextHalf === 'BOT' && nextScores[nextInning - 1].bot === null) {
    nextScores[nextInning - 1] = { ...nextScores[nextInning - 1], bot: 0 };
  }

  const switched: ActiveGameState = {
    ...state,
    inning: nextInning,
    half: nextHalf,
    outs: 0,
    balls: 0,
    strikes: 0,
    bases: [null, null, null],
    infieldIn: false,
    inningScores: nextScores,
    lastPlayBanner: `${nextHalf === 'TOP' ? 'Top' : 'Bottom'} of Inning ${nextInning}`,
  };

  return maybeAutoSwitchAIPitcher(switched, userTeamId, homeId, awayId);
}

interface StepOutcome {
  nextState: ActiveGameState;
  anim: Omit<FieldAnimState, 'active' | 'startMs' | 'durationMs'>;
}

function resolvePlateOutcome(
  state: ActiveGameState,
  outcome: PlayOutcomeKind,
  stadium: StadiumProfile,
  userTeamId: string,
  homeId: string,
  awayId: string
): StepOutcome {
  const { isTop, batter, pitcher, defenseOrder } = getBatterAndPitcher(state);
  const deltas = cloneStatDeltas(state.statDeltas);
  const bStat = ensurePlayerDelta(deltas, batter);
  const pStat = ensurePlayerDelta(deltas, pitcher);

  const nextScores = [...state.inningScores];
  while (nextScores.length < state.inning) {
    nextScores.push({ top: null, bot: null });
  }
  const curInnScore = { ...nextScores[state.inning - 1] };
  if (isTop && curInnScore.top === null) curInnScore.top = 0;
  if (!isTop && curInnScore.bot === null) curInnScore.bot = 0;

  let outs = state.outs;
  let balls = state.balls;
  let strikes = state.strikes;
  let bases: [Player | null, Player | null, Player | null] = [...state.bases];
  let runsScored = 0;
  let hitsAdd = 0;
  let logText = '';
  let logTone: PlayLogEntry['tone'] = 'normal';
  let advanceBatter = false;

  const bSide = resolveBatterSide(batter, pitcher);
  const pullBias = bSide === 'L' ? 14 : -14;
  let sprayDeg = clamp(pullBias + (Math.random() - 0.5) * 62, -43, 43);
  let landDistFt = 220;
  let peakHeightFt = 22;
  let isHomeRun = false;
  let nearestPos = 'CF';
  const advancingRunners: Array<{ from: number; to: number }> = [];

  const scoreRunner = (runner: Player | null) => {
    if (!runner) return;
    runsScored++;
    ensurePlayerDelta(deltas, runner).r++;
  };

  const bSpd = batter.speed ?? 50;

  // Pitch count increment
  const pitchAdd = outcome === 'IBB' ? 4 : 1;
  const homePitchCount = isTop ? state.homePitchCount + pitchAdd : state.homePitchCount;
  const awayPitchCount = !isTop ? state.awayPitchCount + pitchAdd : state.awayPitchCount;

  if (outcome === 'BALL') {
    balls++;
    if (balls >= 4) {
      outcome = 'WALK';
    } else {
      logText = `Ball ${balls} to ${batter.name} (${balls}-${strikes}).`;
    }
  } else if (outcome === 'CALLED_STRIKE' || outcome === 'SWINGING_STRIKE') {
    strikes++;
    if (strikes >= 3) {
      outcome = 'STRIKEOUT';
    } else {
      logText = `${outcome === 'CALLED_STRIKE' ? 'Called strike' : 'Swinging strike'} ${strikes} on ${batter.name} (${balls}-${strikes}).`;
    }
  } else if (outcome === 'FOUL') {
    if (strikes < 2) strikes++;
    sprayDeg = bSide === 'L' ? -56 - Math.random() * 16 : 56 + Math.random() * 16;
    landDistFt = 130 + Math.random() * 70;
    peakHeightFt = 45;
    logText = `${batter.name} fouls one off (${balls}-${strikes}).`;
  }

  if (outcome === 'WALK' || outcome === 'IBB') {
    bStat.bb++;
    pStat.bb++;
    advanceBatter = true;
    const prev = [...bases];
    if (prev[0] && prev[1] && prev[2]) {
      scoreRunner(prev[2]);
      bStat.rbi++;
      pStat.er++;
      advancingRunners.push({ from: 3, to: 4 }, { from: 2, to: 3 }, { from: 1, to: 2 }, { from: 0, to: 1 });
      bases = [batter, prev[0], prev[1]];
    } else if (prev[0] && prev[1]) {
      advancingRunners.push({ from: 2, to: 3 }, { from: 1, to: 2 }, { from: 0, to: 1 });
      bases = [batter, prev[0], prev[1]];
    } else if (prev[0]) {
      advancingRunners.push({ from: 1, to: 2 }, { from: 0, to: 1 });
      bases = [batter, prev[0], prev[2]];
    } else {
      advancingRunners.push({ from: 0, to: 1 });
      bases = [batter, prev[1], prev[2]];
    }
    logText =
      outcome === 'IBB'
        ? `Intentional walk issued to ${batter.name}.${runsScored ? ' A run forces home!' : ''}`
        : `${batter.name} draws a 4-ball walk.${runsScored ? ' Bases-loaded walk scores a run!' : ''}`;
    logTone = runsScored ? 'hit' : 'normal';
  } else if (outcome === 'STRIKEOUT') {
    bStat.ab++;
    bStat.so++;
    pStat.so++;
    pStat.ipOuts++;
    outs++;
    advanceBatter = true;
    logText = `${batter.name} strikes out (${outs} out${outs === 1 ? '' : 's'}).`;
    logTone = 'out';
  } else if (outcome === 'HOMERUN') {
    bStat.ab++;
    bStat.h++;
    bStat.hr++;
    pStat.h++;
    hitsAdd = 1;
    advanceBatter = true;
    isHomeRun = true;
    const fence = getFenceAtAngle(stadium, sprayDeg);
    landDistFt = fence.dist + 18 + Math.random() * 44;
    peakHeightFt = 92 + Math.random() * 32;
    nearestPos = sprayDeg < -16 ? 'LF' : sprayDeg > 16 ? 'RF' : 'CF';

    let rbi = 1;
    if (bases[2]) { scoreRunner(bases[2]); rbi++; advancingRunners.push({ from: 3, to: 4 }); }
    if (bases[1]) { scoreRunner(bases[1]); rbi++; advancingRunners.push({ from: 2, to: 4 }); }
    if (bases[0]) { scoreRunner(bases[0]); rbi++; advancingRunners.push({ from: 1, to: 4 }); }
    scoreRunner(batter);
    advancingRunners.push({ from: 0, to: 4 });
    bStat.rbi += rbi;
    pStat.er += rbi;
    bases = [null, null, null];
    logText = `HOME RUN! ${batter.name} crushes a ${Math.round(landDistFt)}-ft drive over the ${Math.round(fence.wallHt)}-ft wall (${rbi} RBI)!`;
    logTone = 'hr';
  } else if (outcome === 'TRIPLE') {
    bStat.ab++;
    bStat.h++;
    bStat.triples++;
    pStat.h++;
    hitsAdd = 1;
    advanceBatter = true;
    sprayDeg = Math.random() < 0.5 ? -22 - Math.random() * 14 : 22 + Math.random() * 14;
    const fence = getFenceAtAngle(stadium, sprayDeg);
    landDistFt = fence.dist - 6;
    peakHeightFt = 56;
    nearestPos = sprayDeg < 0 ? 'LF' : 'RF';

    let rbi = 0;
    if (bases[2]) { scoreRunner(bases[2]); rbi++; advancingRunners.push({ from: 3, to: 4 }); }
    if (bases[1]) { scoreRunner(bases[1]); rbi++; advancingRunners.push({ from: 2, to: 4 }); }
    if (bases[0]) { scoreRunner(bases[0]); rbi++; advancingRunners.push({ from: 1, to: 4 }); }
    advancingRunners.push({ from: 0, to: 3 });
    bStat.rbi += rbi;
    pStat.er += rbi;
    bases = [null, null, batter];
    logText = `TRIPLE! ${batter.name} splits the ${Math.round(fence.dist)}-ft gap into the alley${rbi ? ` (${rbi} RBI)` : ''}!`;
    logTone = 'hit';
  } else if (outcome === 'DOUBLE') {
    bStat.ab++;
    bStat.h++;
    bStat.doubles++;
    pStat.h++;
    hitsAdd = 1;
    advanceBatter = true;
    const fence = getFenceAtAngle(stadium, sprayDeg);
    landDistFt = Math.min(fence.dist - 5, 290 + Math.random() * 85);
    peakHeightFt = 48 + (fence.wallHt > 15 ? 18 : 0);
    nearestPos = sprayDeg < -16 ? 'LF' : sprayDeg > 16 ? 'RF' : 'CF';

    let rbi = 0;
    if (bases[2]) { scoreRunner(bases[2]); rbi++; advancingRunners.push({ from: 3, to: 4 }); }
    if (bases[1]) { scoreRunner(bases[1]); rbi++; advancingRunners.push({ from: 2, to: 4 }); }
    const firstScores = Boolean(bases[0] && ((bases[0]?.speed ?? 50) > 65 || Math.random() < 0.42));
    if (bases[0]) {
      if (firstScores) {
        scoreRunner(bases[0]);
        rbi++;
        advancingRunners.push({ from: 1, to: 4 });
      } else {
        advancingRunners.push({ from: 1, to: 3 });
      }
    }
    advancingRunners.push({ from: 0, to: 2 });
    bStat.rbi += rbi;
    pStat.er += rbi;
    bases = [null, batter, bases[0] && !firstScores ? bases[0] : null];
    logText = `DOUBLE! ${batter.name} drives one off the wall at ${Math.round(landDistFt)} ft${rbi ? ` (${rbi} RBI)` : ''}!`;
    logTone = 'hit';
  } else if (outcome === 'SINGLE') {
    bStat.ab++;
    bStat.h++;
    pStat.h++;
    hitsAdd = 1;
    advanceBatter = true;
    landDistFt = 148 + Math.random() * 95;
    peakHeightFt = 22;
    nearestPos = sprayDeg < -18 ? 'LF' : sprayDeg > 18 ? 'RF' : 'CF';

    let rbi = 0;
    const prev = [...bases];
    if (prev[2]) { scoreRunner(prev[2]); rbi++; advancingRunners.push({ from: 3, to: 4 }); }
    const secondScores = Boolean(prev[1] && ((prev[1]?.speed ?? 50) > 62 || Math.random() < 0.55));
    if (prev[1]) {
      if (secondScores) {
        scoreRunner(prev[1]);
        rbi++;
        advancingRunners.push({ from: 2, to: 4 });
      } else {
        advancingRunners.push({ from: 2, to: 3 });
      }
    }
    if (prev[0]) advancingRunners.push({ from: 1, to: 2 });
    advancingRunners.push({ from: 0, to: 1 });

    bStat.rbi += rbi;
    pStat.er += rbi;
    bases = [batter, prev[0], prev[1] && !secondScores ? prev[1] : null];
    logText = `Single by ${batter.name} into ${nearestPos === 'CF' ? 'center' : nearestPos === 'LF' ? 'left' : 'right'}${rbi ? ` (${rbi} RBI)` : ''}.`;
    logTone = 'hit';
  } else if (outcome === 'GROUNDOUT' || outcome === 'FLYOUT' || outcome === 'FOUL_OUT') {
    bStat.ab++;
    pStat.ipOuts++;
    outs++;
    advanceBatter = true;

    if (outcome === 'GROUNDOUT') {
      landDistFt = 92 + Math.random() * 48;
      peakHeightFt = 5;
      nearestPos =
        sprayDeg < -20 ? '3B' : sprayDeg < 0 ? 'SS' : sprayDeg < 22 ? '2B' : '1B';
      // Runner on 3B scoring on groundout (reduced if infieldIn!)
      if (bases[2] && outs < 3) {
        const scoreProb = state.infieldIn ? 0.16 : 0.44;
        if (Math.random() < scoreProb) {
          scoreRunner(bases[2]);
          bStat.rbi++;
          pStat.er++;
          advancingRunners.push({ from: 3, to: 4 });
          bases[2] = null;
        }
      }
      logText = `${batter.name} grounds out to ${nearestPos}.${runsScored ? ' Runner scores from 3rd!' : ''}`;
    } else if (outcome === 'FOUL_OUT') {
      sprayDeg = bSide === 'L' ? -55 : 55;
      landDistFt = 115 + Math.random() * 55;
      peakHeightFt = 52;
      nearestPos = sprayDeg < 0 ? '3B' : '1B';
      logText = `${batter.name} pops up in foul territory — caught for out #${outs}.`;
    } else {
      const fence = getFenceAtAngle(stadium, sprayDeg);
      landDistFt = Math.min(fence.dist - 12, 235 + Math.random() * 115);
      peakHeightFt = 68;
      nearestPos = sprayDeg < -16 ? 'LF' : sprayDeg > 16 ? 'RF' : 'CF';
      // Sac fly
      if (bases[2] && outs < 3 && landDistFt > 260 && Math.random() < 0.62) {
        scoreRunner(bases[2]);
        bStat.rbi++;
        pStat.er++;
        advancingRunners.push({ from: 3, to: 4 });
        bases[2] = null;
        logText = `${batter.name} lifts a sacrifice fly to ${nearestPos} — runner tags and scores!`;
      } else {
        logText = `${batter.name} flies out to ${nearestPos} (${outs} out${outs === 1 ? '' : 's'}).`;
      }
    }
    logTone = 'out';
  }

  // Update team totals
  const homeRuns = state.homeRuns + (!isTop ? runsScored : 0);
  const awayRuns = state.awayRuns + (isTop ? runsScored : 0);
  const homeHits = state.homeHits + (!isTop ? hitsAdd : 0);
  const awayHits = state.awayHits + (isTop ? hitsAdd : 0);
  const homePitcherOuts = isTop ? state.homePitcherOuts + (outs > state.outs ? 1 : 0) : state.homePitcherOuts;
  const awayPitcherOuts = !isTop ? state.awayPitcherOuts + (outs > state.outs ? 1 : 0) : state.awayPitcherOuts;
  const homePitcherRuns = isTop ? state.homePitcherRuns + runsScored : state.homePitcherRuns;
  const awayPitcherRuns = !isTop ? state.awayPitcherRuns + runsScored : state.awayPitcherRuns;

  if (isTop) curInnScore.top = (curInnScore.top ?? 0) + runsScored;
  else curInnScore.bot = (curInnScore.bot ?? 0) + runsScored;
  nextScores[state.inning - 1] = curInnScore;

  const fielderObj = defenseOrder.find((d) => d.position === nearestPos);
  const nearestSpeed = fielderObj?.speed ?? 62;

  let nextState: ActiveGameState = {
    ...state,
    outs,
    balls: advanceBatter ? 0 : balls,
    strikes: advanceBatter ? 0 : strikes,
    bases,
    homeRuns,
    awayRuns,
    homeHits,
    awayHits,
    homePitchCount,
    awayPitchCount,
    homePitcherOuts,
    awayPitcherOuts,
    homePitcherRuns,
    awayPitcherRuns,
    inningScores: nextScores,
    homeBatterIdx: !isTop && advanceBatter ? state.homeBatterIdx + 1 : state.homeBatterIdx,
    awayBatterIdx: isTop && advanceBatter ? state.awayBatterIdx + 1 : state.awayBatterIdx,
    statDeltas: deltas,
    lastPlayBanner: logText,
    logs: [
      {
        id: Date.now() + Math.random(),
        inningLabel: `${isTop ? 'T' : 'B'}${state.inning}`,
        text: logText,
        tone: logTone,
      },
      ...state.logs.slice(0, 79),
    ],
  };

  // Walk-off check immediately on scoring in Bot 9+
  if (nextState.inning >= 9 && nextState.half === 'BOT' && nextState.homeRuns > nextState.awayRuns) {
    nextState = finalizeWinnerStats({
      ...nextState,
      logs: [
        {
          id: Date.now() + 99,
          inningLabel: `B${nextState.inning}`,
          text: `WALK-OFF VICTORY! ${homeId} wins ${nextState.homeRuns}-${nextState.awayRuns}!`,
          tone: 'hr',
        },
        ...nextState.logs.slice(0, 79),
      ],
    });
  } else if (outs >= 3) {
    nextState = advanceHalfInning(nextState, userTeamId, homeId, awayId);
  }

  const isBallInPlay =
    outcome === 'SINGLE' ||
    outcome === 'DOUBLE' ||
    outcome === 'TRIPLE' ||
    outcome === 'HOMERUN' ||
    outcome === 'GROUNDOUT' ||
    outcome === 'FLYOUT' ||
    outcome === 'FOUL_OUT' ||
    outcome === 'FOUL';

  return {
    nextState,
    anim: {
      kind: isBallInPlay ? 'BATTED' : 'PITCH',
      outcome,
      sprayDeg,
      landDistFt,
      peakHeightFt,
      isHomeRun,
      nearestPos,
      runnerFromBase: -1,
      runnerSpeed: nearestSpeed,
      advancingRunners: isBallInPlay || outcome === 'WALK' || outcome === 'IBB' ? advancingRunners : [],
    },
  };
}

function chooseSinglePitchOutcome(
  state: ActiveGameState,
  stadium: StadiumProfile
): PlayOutcomeKind {
  const { batter, pitcher, defenseOrder } = getBatterAndPitcher(state);
  const { hrFactor, doublesFactor, triplesFactor, foulOutFactor, kFactor } = stadium.parkFactors;

  let platoonEdge = 0;
  if (batter.bats === 'S') platoonEdge = 2.5;
  else if (batter.bats !== pitcher.throws) platoonEdge = 3.5;
  else platoonEdge = -2.5;

  const pVel = pitcher.velocity ?? 50;
  const pCtl = pitcher.control ?? 50;
  const pFin = pitcher.finesse ?? 50;
  const bPow = batter.power ?? 50;
  const bSpd = batter.speed ?? 50;
  const bGlv = batter.glove ?? 50;
  const defGlove =
    defenseOrder.reduce((acc, p) => acc + (p.glove ?? 50), 0) / Math.max(1, defenseOrder.length);

  const pitchSkill = pVel * 0.36 + pCtl * 0.34 + pFin * 0.3;
  const hitSkill = bPow * 0.45 + bSpd * 0.25 + bGlv * 0.1 + 15;
  const diff = (hitSkill + platoonEdge - pitchSkill) / 100;

  // Per-pitch breakdown calibrated to ~4 pitches/PA
  const ballProb = clamp(32 + (60 - pCtl) * 0.15 + diff * 3.5, 22, 46) / 100;
  const strikeProb = clamp(24 + (pVel * 0.5 + pFin * 0.5 - 60) * 0.14 * kFactor - diff * 5, 16, 36) / 100;
  const foulProb = 0.18;

  const r = Math.random();
  if (r < ballProb) return 'BALL';
  if (r < ballProb + strikeProb) {
    return Math.random() < 0.46 ? 'CALLED_STRIKE' : 'SWINGING_STRIKE';
  }
  if (r < ballProb + strikeProb + foulProb) {
    if (Math.random() < 0.045 * foulOutFactor) return 'FOUL_OUT';
    return 'FOUL';
  }

  // Ball put in play!
  const infieldHitMod = state.infieldIn ? 0.032 : 0;
  const hitInPlayProb = clamp(
    0.31 + diff * 0.12 - (defGlove - 60) * 0.0012 + infieldHitMod - (foulOutFactor - 1) * 0.04,
    0.18,
    0.46
  );

  if (Math.random() < hitInPlayProb) {
    const hrProb = (clamp(7 + (bPow - 55) * 0.24 - (pFin - 60) * 0.08, 2, 26) / 100) * hrFactor;
    const tripleProb = (clamp(1.5 + (bSpd - 60) * 0.06, 0.3, 6) / 100) * triplesFactor;
    const doubleProb =
      (clamp(17 + (bPow * 0.5 + bSpd * 0.5 - 60) * 0.15, 8, 28) / 100) * doublesFactor;

    const hr = Math.random();
    if (hr < hrProb) return 'HOMERUN';
    if (hr < hrProb + tripleProb) return 'TRIPLE';
    if (hr < hrProb + tripleProb + doubleProb) return 'DOUBLE';
    return 'SINGLE';
  }

  return Math.random() < 0.48 ? 'GROUNDOUT' : 'FLYOUT';
}

function resolveFullAtBatOutcome(
  state: ActiveGameState,
  stadium: StadiumProfile
): PlayOutcomeKind {
  const { batter, pitcher, defenseOrder } = getBatterAndPitcher(state);
  const { hrFactor, doublesFactor, triplesFactor, foulOutFactor, kFactor } = stadium.parkFactors;

  let platoonEdge = 0;
  if (batter.bats === 'S') platoonEdge = 2.5;
  else if (batter.bats !== pitcher.throws) platoonEdge = 3.5;
  else platoonEdge = -2.5;

  const pVel = pitcher.velocity ?? 50;
  const pCtl = pitcher.control ?? 50;
  const pFin = pitcher.finesse ?? 50;
  const bPow = batter.power ?? 50;
  const bSpd = batter.speed ?? 50;
  const bGlv = batter.glove ?? 50;
  const defGlove =
    defenseOrder.reduce((acc, p) => acc + (p.glove ?? 50), 0) / Math.max(1, defenseOrder.length);

  const pitchSkill = pVel * 0.36 + pCtl * 0.34 + pFin * 0.3;
  const hitSkill = bPow * 0.45 + bSpd * 0.25 + bGlv * 0.1 + 15;
  const diff = (hitSkill + platoonEdge - pitchSkill) / 100;

  const bbProb = clamp(7.5 + (60 - pCtl) * 0.11 + diff * 4, 3, 18) / 100;
  const soProb =
    (clamp(21.5 + (pVel * 0.55 + pFin * 0.45 - 60) * 0.18 - diff * 8, 9, 38) / 100) * kFactor;
  const infieldHitMod = state.infieldIn ? 2.5 : 0;
  const hitProb =
    clamp(
      24.5 + diff * 13 - (defGlove - 60) * 0.08 - (foulOutFactor - 1) * 7.5 + infieldHitMod,
      13,
      39
    ) / 100;

  const r = Math.random();
  if (r < bbProb) return 'WALK';
  if (r < bbProb + soProb) return 'STRIKEOUT';
  if (r < bbProb + soProb + hitProb) {
    const hrProb = (clamp(7 + (bPow - 55) * 0.24 - (pFin - 60) * 0.08, 2, 26) / 100) * hrFactor;
    const tripleProb = (clamp(1.5 + (bSpd - 60) * 0.06, 0.3, 6) / 100) * triplesFactor;
    const doubleProb =
      (clamp(17 + (bPow * 0.5 + bSpd * 0.5 - 60) * 0.15, 8, 28) / 100) * doublesFactor;

    const hr = Math.random();
    if (hr < hrProb) return 'HOMERUN';
    if (hr < hrProb + tripleProb) return 'TRIPLE';
    if (hr < hrProb + tripleProb + doubleProb) return 'DOUBLE';
    return 'SINGLE';
  }

  if (Math.random() < 0.07 * foulOutFactor) return 'FOUL_OUT';
  return Math.random() < 0.48 ? 'GROUNDOUT' : 'FLYOUT';
}

function isHighLeverageMoment(state: ActiveGameState): boolean {
  if (state.isFinal) return false;
  const hasRisp = Boolean(state.bases[1] || state.bases[2]);
  return state.inning >= 7 && hasRisp && Math.abs(state.homeRuns - state.awayRuns) <= 3;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function LiveGameCanvas({
  year,
  currentDay,
  homeTeam,
  awayTeam,
  userTeamId,
  homeRoster,
  awayRoster,
  onCompleteGame,
  onExit,
}: LiveGameCanvasProps) {
  const stadium = useMemo(() => getStadiumByTeamId(homeTeam.id), [homeTeam.id]);
  const [game, setGame] = useState<ActiveGameState>(() =>
    createInitialGameState(homeRoster, awayRoster, currentDay, homeTeam, awayTeam, stadium)
  );
  const [pacing, setPacing] = useState<PacingMode>('IDLE');
  const [activeModal, setActiveModal] = useState<'NONE' | 'BULLPEN' | 'PINCH_HIT'>('NONE');
  const [animatingLock, setAnimatingLock] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  const animRef = useRef<FieldAnimState>({
    active: false,
    kind: 'PITCH',
    startMs: 0,
    durationMs: 700,
    outcome: 'BALL',
    sprayDeg: 0,
    landDistFt: 200,
    peakHeightFt: 20,
    isHomeRun: false,
    nearestPos: 'CF',
    runnerFromBase: -1,
    runnerSpeed: 60,
    advancingRunners: [],
  });

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  // Stop auto-play if game hits FINAL or High-Leverage pause
  useEffect(() => {
    if (game.isFinal && pacing !== 'IDLE') {
      setPacing('IDLE');
    }
  }, [game.isFinal, pacing]);

  const { isTop, batter, pitcher, defenseOrder } = getBatterAndPitcher(game);
  const battingTeam = isTop ? awayTeam : homeTeam;
  const fieldingTeam = isTop ? homeTeam : awayTeam;
  const isUserBatting = battingTeam.id === userTeamId;
  const isUserFielding = fieldingTeam.id === userTeamId;

  const availableBullpen = useMemo(() => {
    const bp = isTop ? game.homeBullpen : game.awayBullpen;
    return bp.filter((p) => !game.usedPitcherIds.includes(p.id));
  }, [game.homeBullpen, game.awayBullpen, game.usedPitcherIds, isTop]);

  const availableBench = useMemo(() => {
    const bn = isTop ? game.awayBench : game.homeBench;
    return bn.filter((p) => !game.usedBenchIds.includes(p.id));
  }, [game.homeBench, game.awayBench, game.usedBenchIds, isTop]);

  const canSteal = useMemo(() => {
    if (!isUserBatting || game.isFinal) return false;
    return Boolean((game.bases[0] && !game.bases[1]) || (game.bases[1] && !game.bases[2]));
  }, [isUserBatting, game.isFinal, game.bases]);

  // Trigger a single step with canvas animation
  const runAnimatedStep = useCallback(
    (mode: 'PITCH' | 'AT_BAT') => {
      const cur = gameRef.current;
      if (cur.isFinal || animatingLock) return;

      const outcome =
        mode === 'PITCH'
          ? chooseSinglePitchOutcome(cur, stadium)
          : resolveFullAtBatOutcome(cur, stadium);

      const { nextState, anim } = resolvePlateOutcome(
        cur,
        outcome,
        stadium,
        userTeamId,
        homeTeam.id,
        awayTeam.id
      );

      const durationMs = reducedMotion
        ? 40
        : anim.kind === 'BATTED'
        ? mode === 'PITCH'
          ? 1200
          : 920
        : 560;

      animRef.current = {
        ...anim,
        active: true,
        startMs: performance.now(),
        durationMs,
      };
      setAnimatingLock(true);

      setTimeout(() => {
        animRef.current.active = false;
        setGame({ ...nextState, highLeveragePaused: false });
        setAnimatingLock(false);
      }, durationMs);
    },
    [animatingLock, stadium, userTeamId, homeTeam.id, awayTeam.id, reducedMotion]
  );

  // Auto-pacing loop for 1x Pitch & 4x At-Bat
  useEffect(() => {
    if (pacing === 'IDLE' || game.isFinal || animatingLock || activeModal !== 'NONE') return;
    const delay = pacing === 'PITCH_1X' ? 320 : 220;
    const t = setTimeout(() => {
      runAnimatedStep(pacing === 'PITCH_1X' ? 'PITCH' : 'AT_BAT');
    }, delay);
    return () => clearTimeout(t);
  }, [pacing, game.isFinal, animatingLock, activeModal, runAnimatedStep]);

  // Fast-forward helpers (instant deterministic simulation loop)
  const handleSimHalfInning = () => {
    if (game.isFinal || animatingLock) return;
    setPacing('IDLE');
    setActiveModal('NONE');
    let cur = gameRef.current;
    const startInning = cur.inning;
    const startHalf = cur.half;
    let guard = 0;
    while (!cur.isFinal && cur.inning === startInning && cur.half === startHalf && guard < 40) {
      guard++;
      const out = resolveFullAtBatOutcome(cur, stadium);
      cur = resolvePlateOutcome(cur, out, stadium, userTeamId, homeTeam.id, awayTeam.id).nextState;
    }
    setGame({ ...cur, highLeveragePaused: false });
  };

  const handleSimToHighLeverage = () => {
    if (game.isFinal || animatingLock) return;
    setPacing('IDLE');
    setActiveModal('NONE');
    let cur = gameRef.current;
    let guard = 0;
    // Step at least once if already in a high-leverage moment
    if (isHighLeverageMoment(cur)) {
      const out = resolveFullAtBatOutcome(cur, stadium);
      cur = resolvePlateOutcome(cur, out, stadium, userTeamId, homeTeam.id, awayTeam.id).nextState;
    }
    while (!cur.isFinal && !isHighLeverageMoment(cur) && guard < 240) {
      guard++;
      const out = resolveFullAtBatOutcome(cur, stadium);
      cur = resolvePlateOutcome(cur, out, stadium, userTeamId, homeTeam.id, awayTeam.id).nextState;
    }
    if (!cur.isFinal && isHighLeverageMoment(cur)) {
      cur = {
        ...cur,
        highLeveragePaused: true,
        lastPlayBanner: `HIGH-LEVERAGE MOMENT: ${cur.half === 'TOP' ? 'Top' : 'Bot'} ${cur.inning} · RISP · Margin ${Math.abs(cur.homeRuns - cur.awayRuns)}`,
        logs: [
          {
            id: Date.now() + 7,
            inningLabel: `${cur.half === 'TOP' ? 'T' : 'B'}${cur.inning}`,
            text: `Manager Alert: High-leverage spot reached (Inning ${cur.inning}, RISP, close game).`,
            tone: 'hl',
          },
          ...cur.logs.slice(0, 79),
        ],
      };
    }
    setGame(cur);
  };

  const handleFinishGame = () => {
    if (game.isFinal || animatingLock) return;
    setPacing('IDLE');
    setActiveModal('NONE');
    let cur = gameRef.current;
    let guard = 0;
    while (!cur.isFinal && guard < 360) {
      guard++;
      const out = resolveFullAtBatOutcome(cur, stadium);
      cur = resolvePlateOutcome(cur, out, stadium, userTeamId, homeTeam.id, awayTeam.id).nextState;
    }
    if (!cur.isFinal) cur = finalizeWinnerStats(cur);
    setGame({ ...cur, highLeveragePaused: false });
  };

  // Managerial Controls
  const handlePitchingChange = (reliever: Player) => {
    const cur = gameRef.current;
    if (cur.isFinal) return;
    const deltas = cloneStatDeltas(cur.statDeltas);
    ensurePlayerDelta(deltas, reliever).g = 1;
    const defId = isTop ? homeTeam.id : awayTeam.id;
    const nextState: ActiveGameState = {
      ...cur,
      homePitcher: isTop ? reliever : cur.homePitcher,
      awayPitcher: isTop ? cur.awayPitcher : reliever,
      homePitchCount: isTop ? 0 : cur.homePitchCount,
      awayPitchCount: isTop ? cur.awayPitchCount : 0,
      usedPitcherIds: [...cur.usedPitcherIds, reliever.id],
      statDeltas: deltas,
      lastPlayBanner: `Manager Call: ${reliever.name} (${reliever.ovr} OVR) enters on the mound`,
      logs: [
        {
          id: Date.now(),
          inningLabel: `${isTop ? 'T' : 'B'}${cur.inning}`,
          text: `${defId} manager calls to the bullpen: ${reliever.name} (${reliever.ovr} OVR) takes over.`,
          tone: 'manager',
        },
        ...cur.logs.slice(0, 79),
      ],
    };
    setGame(nextState);
    setActiveModal('NONE');
  };

  const handlePinchHit = (pinchHitter: Player) => {
    const cur = gameRef.current;
    if (cur.isFinal) return;
    const deltas = cloneStatDeltas(cur.statDeltas);
    ensurePlayerDelta(deltas, pinchHitter).g = 1;

    const orderKey = isTop ? 'awayOrder' : 'homeOrder';
    const idx = isTop ? cur.awayBatterIdx : cur.homeBatterIdx;
    const slot = idx % cur[orderKey].length;
    const replaced = cur[orderKey][slot];
    const nextOrder = [...cur[orderKey]];
    nextOrder[slot] = { ...pinchHitter, position: replaced.position };

    const nextState: ActiveGameState = {
      ...cur,
      [orderKey]: nextOrder,
      usedBenchIds: [...cur.usedBenchIds, pinchHitter.id],
      statDeltas: deltas,
      lastPlayBanner: `Pinch Hitter: ${pinchHitter.name} steps in for ${replaced.name}`,
      logs: [
        {
          id: Date.now(),
          inningLabel: `${isTop ? 'T' : 'B'}${cur.inning}`,
          text: `Pinch hitter ${pinchHitter.name} (${pinchHitter.ovr} OVR) hits for ${replaced.name}.`,
          tone: 'manager',
        },
        ...cur.logs.slice(0, 79),
      ],
    };
    setGame(nextState);
    setActiveModal('NONE');
  };

  const handleStealAttempt = () => {
    const cur = gameRef.current;
    if (!canSteal || animatingLock || cur.isFinal) return;
    setPacing('IDLE');

    const fromIdx = cur.bases[1] && !cur.bases[2] ? 1 : 0; // 1 = 2B->3B, 0 = 1B->2B
    const runner = cur.bases[fromIdx];
    if (!runner) return;

    const catcher = defenseOrder.find((d) => d.position === 'C');
    const cGlove = catcher?.glove ?? 60;
    const rSpeed = runner.speed ?? 60;
    const pVel = pitcher.velocity ?? 60;

    const safeProb = clamp(66 + (rSpeed - cGlove) * 0.55 - (pVel - 65) * 0.12 - fromIdx * 6, 35, 92) / 100;
    const isSafe = Math.random() < safeProb;

    const deltas = cloneStatDeltas(cur.statDeltas);
    const nextBases: [Player | null, Player | null, Player | null] = [...cur.bases];
    let outs = cur.outs;
    let text = '';

    if (isSafe) {
      ensurePlayerDelta(deltas, runner).sb++;
      nextBases[fromIdx] = null;
      nextBases[fromIdx + 1] = runner;
      text = `SAFE! ${runner.name} steals ${fromIdx === 0 ? '2nd' : '3rd'} base!`;
    } else {
      ensurePlayerDelta(deltas, pitcher).ipOuts++;
      nextBases[fromIdx] = null;
      outs++;
      text = `CAUGHT STEALING! ${catcher?.name || 'Catcher'} throws out ${runner.name} at ${fromIdx === 0 ? '2nd' : '3rd'}.`;
    }

    const durationMs = reducedMotion ? 40 : 750;
    animRef.current = {
      active: true,
      kind: 'STEAL',
      startMs: performance.now(),
      durationMs,
      outcome: isSafe ? 'STEAL_SAFE' : 'STEAL_OUT',
      sprayDeg: 0,
      landDistFt: 90,
      peakHeightFt: 0,
      isHomeRun: false,
      nearestPos: '2B',
      runnerFromBase: fromIdx + 1,
      runnerSpeed: rSpeed,
      advancingRunners: isSafe ? [{ from: fromIdx + 1, to: fromIdx + 2 }] : [],
    };
    setAnimatingLock(true);

    setTimeout(() => {
      animRef.current.active = false;
      let nextState: ActiveGameState = {
        ...cur,
        bases: nextBases,
        outs,
        statDeltas: deltas,
        lastPlayBanner: text,
        logs: [
          {
            id: Date.now(),
            inningLabel: `${isTop ? 'T' : 'B'}${cur.inning}`,
            text,
            tone: isSafe ? 'hit' : 'out',
          },
          ...cur.logs.slice(0, 79),
        ],
      };
      if (outs >= 3) {
        nextState = advanceHalfInning(nextState, userTeamId, homeTeam.id, awayTeam.id);
      }
      setGame(nextState);
      setAnimatingLock(false);
    }, durationMs);
  };

  const handleIntentionalWalk = () => {
    const cur = gameRef.current;
    if (!isUserFielding || animatingLock || cur.isFinal) return;
    setPacing('IDLE');
    const { nextState } = resolvePlateOutcome(cur, 'IBB', stadium, userTeamId, homeTeam.id, awayTeam.id);
    setGame(nextState);
  };

  const handleCommitResult = () => {
    onCompleteGame({
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeRuns: game.homeRuns,
      awayRuns: game.awayRuns,
      homeWon: game.homeRuns > game.awayRuns,
      statDeltas: game.statDeltas,
    });
  };

  // ============================================================================
  // 60FPS 2.5D BROADCAST CANVAS RENDERER
  // ============================================================================

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    canvas.width = CW * dpr;
    canvas.height = CH * dpr;

    const renderFrame = (now: number) => {
      const st = gameRef.current;
      const anim = animRef.current;
      const { batter: curBatter, pitcher: curPitcher, isTop: curTop } = getBatterAndPitcher(st);
      const curBatTeam = curTop ? awayTeam : homeTeam;
      const curDefTeam = curTop ? homeTeam : awayTeam;

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Sky / Stadium Atmosphere
      const skyGrad = ctx.createLinearGradient(0, 0, 0, CH);
      if (stadium.lighting === 'DAY') {
        skyGrad.addColorStop(0, '#0284C7');
        skyGrad.addColorStop(0.32, '#0C4A6E');
        skyGrad.addColorStop(1, '#090D16');
      } else if (stadium.lighting === 'TWILIGHT') {
        skyGrad.addColorStop(0, '#7C2D12');
        skyGrad.addColorStop(0.3, '#1E1B4B');
        skyGrad.addColorStop(1, '#090D16');
      } else {
        skyGrad.addColorStop(0, '#0F172A');
        skyGrad.addColorStop(0.45, '#090D16');
        skyGrad.addColorStop(1, '#05080F');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, CW, CH);

      // Horizon Backdrop Silhouettes
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = stadium.backdrop === 'FOREST' ? '#064E3B' : stadium.backdrop === 'DESERT' ? '#451A03' : '#1E293B';
      if (stadium.backdrop === 'SKYLINE') {
        const bldgs = [
          [20, 62, 28, 70], [54, 42, 32, 90], [92, 56, 26, 76], [126, 30, 36, 102],
          [595, 36, 36, 96], [638, 52, 28, 80], [674, 28, 34, 104], [714, 58, 30, 74],
        ];
        for (const [bx, by, bw, bh] of bldgs) ctx.fillRect(bx, by, bw, bh);
      } else if (stadium.backdrop === 'MOUNTAINS') {
        ctx.beginPath();
        ctx.moveTo(0, 128);
        ctx.lineTo(110, 48);
        ctx.lineTo(220, 108);
        ctx.lineTo(380, 34);
        ctx.lineTo(540, 104);
        ctx.lineTo(660, 46);
        ctx.lineTo(760, 120);
        ctx.lineTo(760, 150);
        ctx.lineTo(0, 150);
        ctx.closePath();
        ctx.fill();
      } else if (stadium.backdrop === 'WATERFRONT') {
        ctx.fillStyle = '#0369A1';
        ctx.fillRect(0, 74, CW, 46);
      }
      ctx.restore();

      // Stadium Dome / Roof Ribbing
      if (stadium.roofType !== 'OPEN') {
        ctx.save();
        ctx.strokeStyle = 'rgba(148,163,184,0.22)';
        ctx.lineWidth = stadium.roofType === 'DOME' ? 3 : 2;
        if (stadium.roofType === 'RETRACTABLE_DOME') ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(24, 110);
        ctx.quadraticCurveTo(CW / 2, -32, CW - 24, 110);
        ctx.stroke();
        ctx.restore();
      }

      // Compute Stadium Outfield Fence Vertices
      const fencePts: Array<FieldCoord & { wallHt: number; dist: number; deg: number }> = [];
      for (let deg = -45; deg <= 45; deg += 5) {
        const f = getFenceAtAngle(stadium, deg);
        const pt = polarFieldToCanvas(deg, f.dist);
        fencePts.push({ ...pt, wallHt: f.wallHt, dist: f.dist, deg });
      }

      // Foul Territory Apron
      const foulPadFt = stadium.foulTerritory === 'SPACIOUS' ? 56 : stadium.foulTerritory === 'TIGHT' ? 24 : 40;
      const foulLeftOuter = polarFieldToCanvas(-55, stadium.dimensions.lf * 0.94);
      const foulRightOuter = polarFieldToCanvas(55, stadium.dimensions.rf * 0.94);
      ctx.save();
      ctx.fillStyle = stadium.grassPrimary;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(HOME_PX, HOME_PY + foulPadFt * 0.65);
      ctx.lineTo(foulLeftOuter.x, foulLeftOuter.y);
      for (const pt of fencePts) ctx.lineTo(pt.x, pt.y);
      ctx.lineTo(foulRightOuter.x, foulRightOuter.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 2. Fair Territory Clipped Turf + Mowing Patterns
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(HOME_PX, HOME_PY);
      for (const pt of fencePts) ctx.lineTo(pt.x, pt.y);
      ctx.closePath();
      ctx.clip();

      ctx.fillStyle = stadium.grassPrimary;
      ctx.fillRect(0, 0, CW, CH);

      ctx.fillStyle = stadium.grassSecondary;
      if (stadium.turfPattern === 'STRIPES') {
        for (let x = 40; x < CW; x += 28) {
          ctx.fillRect(x, 40, 14, CH);
        }
      } else if (stadium.turfPattern === 'CHECKERBOARD') {
        for (let x = 40; x < CW; x += 32) {
          for (let y = 40; y < CH; y += 32) {
            if (((x / 32) + (y / 32)) % 2 === 0) ctx.fillRect(x, y, 16, 16);
            else ctx.fillRect(x + 16, y + 16, 16, 16);
          }
        }
      } else if (stadium.turfPattern === 'DIAMOND') {
        ctx.save();
        ctx.translate(HOME_PX, HOME_PY);
        ctx.rotate(Math.PI / 4);
        for (let x = -480; x < 480; x += 34) {
          for (let y = -480; y < 480; y += 34) {
            if (((Math.round(x / 34) + Math.round(y / 34)) & 1) === 0) {
              ctx.fillRect(x, y, 17, 17);
            }
          }
        }
        ctx.restore();
      } else if (stadium.turfPattern === 'CONCENTRIC') {
        ctx.strokeStyle = stadium.grassSecondary;
        ctx.lineWidth = 14;
        for (let r = 80; r < 400; r += 28) {
          ctx.beginPath();
          ctx.ellipse(HOME_PX, HOME_PY, r, r * 0.88, 0, Math.PI, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Dirt Warning Track (inside fence)
      ctx.strokeStyle = stadium.dirtColor;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 15;
      ctx.beginPath();
      fencePts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Dirt Infield Arc
      ctx.fillStyle = stadium.dirtColor;
      ctx.beginPath();
      ctx.ellipse(HOME_PX, HOME_PY - 64, 96, 84, 0, 0, Math.PI * 2);
      ctx.fill();

      // Inner Infield Grass Diamond
      const bases = getBasePositions();
      ctx.fillStyle = stadium.grassSecondary;
      ctx.beginPath();
      ctx.moveTo(HOME_PX, HOME_PY - 18);
      ctx.lineTo(bases[1].x - 10, bases[1].y);
      ctx.lineTo(bases[2].x, bases[2].y + 12);
      ctx.lineTo(bases[3].x + 10, bases[3].y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 3. Outfield Wall Face (3D height extruded upwards by wallHt!)
      for (let i = 0; i < fencePts.length - 1; i++) {
        const a = fencePts[i];
        const b = fencePts[i + 1];
        const hAvg = (a.wallHt + b.wallHt) / 2;
        const hPx = Math.max(6, Math.min(26, hAvg * 0.68));
        ctx.fillStyle = stadium.wallColor;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(b.x, b.y - hPx);
        ctx.lineTo(a.x, a.y - hPx);
        ctx.closePath();
        ctx.fill();

        // Yellow top rail
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - hPx);
        ctx.lineTo(b.x, b.y - hPx);
        ctx.stroke();
      }

      // Foul Poles & Distance Markers
      const lfCorner = fencePts[0];
      const rfCorner = fencePts[fencePts.length - 1];
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lfCorner.x, lfCorner.y);
      ctx.lineTo(lfCorner.x, lfCorner.y - 34);
      ctx.moveTo(rfCorner.x, rfCorner.y);
      ctx.lineTo(rfCorner.x, rfCorner.y - 34);
      ctx.stroke();

      // Chalk Foul Lines
      ctx.strokeStyle = 'rgba(248,250,252,0.8)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(HOME_PX, HOME_PY);
      ctx.lineTo(lfCorner.x, lfCorner.y);
      ctx.moveTo(HOME_PX, HOME_PY);
      ctx.lineTo(rfCorner.x, rfCorner.y);
      ctx.stroke();

      // Fence Distance Callouts
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      [
        { deg: -45, lbl: `${stadium.dimensions.lf}'` },
        { deg: -22.5, lbl: `${stadium.dimensions.lc}'` },
        { deg: 0, lbl: `${stadium.dimensions.cf}'` },
        { deg: 22.5, lbl: `${stadium.dimensions.rc}'` },
        { deg: 45, lbl: `${stadium.dimensions.rf}'` },
      ].forEach((m) => {
        const f = getFenceAtAngle(stadium, m.deg);
        const pt = polarFieldToCanvas(m.deg, f.dist);
        const hPx = Math.max(6, Math.min(26, f.wallHt * 0.68));
        ctx.fillText(m.lbl, pt.x, pt.y - hPx - 5);
      });

      // 4. Mound, Bases & Home Plate
      const mound = polarFieldToCanvas(0, 60.5);
      ctx.fillStyle = stadium.dirtColor;
      ctx.beginPath();
      ctx.ellipse(mound.x, mound.y, 12, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(mound.x - 4, mound.y - 1.2, 8, 2.4);

      // Home Dirt Circle & Bases
      ctx.fillStyle = stadium.dirtColor;
      ctx.beginPath();
      ctx.ellipse(HOME_PX, HOME_PY, 18, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      bases.forEach((b, idx) => {
        if (idx === 0) {
          ctx.fillStyle = '#F8FAFC';
          ctx.beginPath();
          ctx.moveTo(b.x - 5, b.y - 3);
          ctx.lineTo(b.x + 5, b.y - 3);
          ctx.lineTo(b.x + 5, b.y + 1);
          ctx.lineTo(b.x, b.y + 5);
          ctx.lineTo(b.x - 5, b.y + 1);
          ctx.closePath();
          ctx.fill();
        } else {
          const occupied = Boolean(st.bases[idx - 1]);
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = occupied ? '#FBBF24' : '#F8FAFC';
          ctx.fillRect(-4.5, -4.5, 9, 9);
          ctx.restore();
        }
      });

      // Animation progress [0..1]
      const elapsed = anim.active ? Math.min(1, (now - anim.startMs) / anim.durationMs) : 0;

      // 5. Draw 9 Defensive Fielders (with L/R & Infield-In shift + pursuit toward ball)
      const batterSide = resolveBatterSide(curBatter, curPitcher);
      const defCoords = getDefenderBaseCoords(batterSide, st.infieldIn);
      const landPt = polarFieldToCanvas(anim.sprayDeg, anim.landDistFt);

      const drawPlayerSprite = (
        x: number,
        y: number,
        jerseyColor: string,
        capColor: string,
        label?: string,
        scale = 1
      ) => {
        // Ground shadow
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath();
        ctx.ellipse(x, y + 6 * scale, 6 * scale, 2.8 * scale, 0, 0, Math.PI * 2);
        ctx.fill();

        // Torso / Jersey
        ctx.fillStyle = jerseyColor;
        ctx.beginPath();
        ctx.arc(x, y, 5.2 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#090D16';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Cap / Head
        ctx.fillStyle = capColor;
        ctx.beginPath();
        ctx.arc(x, y - 3.6 * scale, 3.6 * scale, 0, Math.PI * 2);
        ctx.fill();

        if (label) {
          ctx.fillStyle = 'rgba(248,250,252,0.85)';
          ctx.font = '700 8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(label, x, y + 15 * scale);
        }
      };

      Object.entries(defCoords).forEach(([pos, baseCoord]) => {
        let px = baseCoord.x;
        let py = baseCoord.y;
        // Outfielder/infielder pursuit when batted ball is active
        if (anim.active && anim.kind === 'BATTED' && pos === anim.nearestPos && !anim.isHomeRun) {
          const pursueFactor = Math.min(1, elapsed * (0.65 + (anim.runnerSpeed / 100) * 0.45));
          px = baseCoord.x + (landPt.x - baseCoord.x) * pursueFactor;
          py = baseCoord.y + (landPt.y - baseCoord.y) * pursueFactor;
        }
        drawPlayerSprite(px, py, curDefTeam.color, curDefTeam.accent, pos);
      });

      // 6. Active Batter in Left or Right Box
      const batterX = batterSide === 'L' ? HOME_PX + 12 : HOME_PX - 12;
      drawPlayerSprite(batterX, HOME_PY - 1, curBatTeam.color, curBatTeam.accent, 'BAT');

      // 7. Baserunners (Static or Animated Base-to-Base)
      const animatedFromSet = new Set<number>();
      if (anim.active && anim.advancingRunners.length > 0) {
        anim.advancingRunners.forEach((ar) => {
          animatedFromSet.add(ar.from);
          const totalBases = ar.to - ar.from;
          const prog = elapsed * totalBases;
          const curSeg = Math.min(totalBases - 1, Math.floor(prog));
          const segT = prog - curSeg;
          const fromB = bases[(ar.from + curSeg) % 4];
          const toB = bases[(ar.from + curSeg + 1) % 4];
          const rx = fromB.x + (toB.x - fromB.x) * segT;
          const ry = fromB.y + (toB.y - fromB.y) * segT;
          drawPlayerSprite(rx, ry - 2, curBatTeam.color, curBatTeam.accent, undefined, 0.95);
        });
      }

      st.bases.forEach((r, idx) => {
        if (!r || animatedFromSet.has(idx + 1)) return;
        const b = bases[idx + 1];
        drawPlayerSprite(b.x + 7, b.y - 3, curBatTeam.color, curBatTeam.accent, r.name.split(' ').slice(-1)[0].slice(0, 6), 0.92);
      });

      // 8. Physics-Driven Ball Trajectory & Ground Shadow
      if (anim.active && (anim.kind === 'PITCH' || anim.kind === 'BATTED')) {
        if (anim.kind === 'PITCH') {
          const sx = mound.x;
          const sy = mound.y - 6;
          const ex = HOME_PX;
          const ey = HOME_PY - 2;
          const bx = sx + (ex - sx) * elapsed;
          const by = sy + (ey - sy) * elapsed;
          const arcZ = Math.sin(elapsed * Math.PI) * 5;

          // Pitch trail & ball
          ctx.strokeStyle = 'rgba(56,189,248,0.45)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(bx, by - arcZ);
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(bx, by - arcZ, 3.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Batted ball parabolic arc with ground shadow!
          const tFlight = Math.min(1, elapsed * 1.15);
          const gx = HOME_PX + (landPt.x - HOME_PX) * tFlight;
          const gy = HOME_PY + (landPt.y - HOME_PY) * tFlight;
          // Parabolic height in ft -> px
          const zPx = 4 * anim.peakHeightFt * 0.85 * tFlight * (1 - tFlight);

          // Ground shadow shows true lateral position & height separation
          ctx.fillStyle = 'rgba(0,0,0,0.48)';
          ctx.beginPath();
          ctx.ellipse(gx, gy, 4.5, 2.2, 0, 0, Math.PI * 2);
          ctx.fill();

          // Trajectory arc guide
          ctx.strokeStyle = anim.isHomeRun ? 'rgba(251,191,36,0.5)' : 'rgba(248,250,252,0.3)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(HOME_PX, HOME_PY);
          ctx.lineTo(gx, gy - zPx);
          ctx.stroke();
          ctx.setLineDash([]);

          // Baseball scaled slightly by altitude
          const ballRadius = 3.2 + Math.min(3.5, zPx * 0.032);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(gx, gy - zPx, ballRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#DC2626';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // 9. Compact Stadium Name Watermark in Canvas Corner
      ctx.fillStyle = 'rgba(15,23,42,0.72)';
      ctx.fillRect(12, CH - 34, 232, 22);
      ctx.strokeStyle = 'rgba(148,163,184,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(12, CH - 34, 232, 22);
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${stadium.name} · HR ${stadium.parkFactors.hrFactor.toFixed(2)}x`, 20, CH - 19);

      ctx.restore();
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [stadium, homeTeam, awayTeam]);

  const batterSlash = getHitterSlash(batter.seasonStats);
  const pitcherRatios = getPitcherRatios(pitcher.seasonStats);
  const totalInningsCols = Math.max(9, game.inningScores.length);

  return (
    <div className="space-y-5">
      {/* Top Broadcast Scoreboard & Linescore */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onExit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Front Office
            </button>
            <div>
              <div className="text-xs font-mono text-sky-400">
                {year} Regular Season · Day {currentDay + 1} · {stadium.name}
              </div>
              <h2 className="font-display text-xl font-extrabold text-white tracking-tight">
                {awayTeam.city} {awayTeam.name} @ {homeTeam.city} {homeTeam.name}
              </h2>
            </div>
          </div>

          {/* Count & Bases Status Pill-Free Strip */}
          <div className="flex items-center gap-4 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 font-mono text-xs tabular-nums">
            <div>
              <span className="text-slate-400 mr-1.5">INN</span>
              <span className="font-bold text-amber-300">
                {game.isFinal ? 'FINAL' : `${game.half === 'TOP' ? '▲' : '▼'} ${game.inning}`}
              </span>
            </div>
            <div className="h-4 w-px bg-slate-800" />
            <div>
              <span className="text-slate-400 mr-1.5">COUNT</span>
              <span className="font-bold text-white">{game.balls}-{game.strikes}</span>
            </div>
            <div className="h-4 w-px bg-slate-800" />
            <div>
              <span className="text-slate-400 mr-1.5">OUTS</span>
              <span className="font-bold text-rose-400">{game.outs}</span>
            </div>
          </div>
        </div>

        {/* 9+ Inning Box Linescore */}
        <div className="overflow-x-auto border border-slate-800 rounded-lg bg-slate-950">
          <table className="w-full text-xs font-mono tabular-nums text-center">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2 px-3 text-left font-sans">Team</th>
                {Array.from({ length: totalInningsCols }, (_, i) => (
                  <th key={i} className="py-2 px-2 w-8">{i + 1}</th>
                ))}
                <th className="py-2 px-3 border-l border-slate-800 text-white">R</th>
                <th className="py-2 px-3 text-slate-300">H</th>
                <th className="py-2 px-3 text-slate-400">E</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              <tr className={awayTeam.id === userTeamId ? 'bg-sky-500/10' : ''}>
                <td className="py-2 px-3 text-left flex items-center gap-2 font-sans font-bold text-white">
                  <TeamBadge team={awayTeam} size="sm" />
                  <span>{awayTeam.id}</span>
                </td>
                {Array.from({ length: totalInningsCols }, (_, i) => (
                  <td key={i} className="py-2 px-2 text-slate-300">
                    {game.inningScores[i]?.top ?? '-'}
                  </td>
                ))}
                <td className="py-2 px-3 border-l border-slate-800 font-extrabold text-white text-sm">
                  {game.awayRuns}
                </td>
                <td className="py-2 px-3 text-slate-300">{game.awayHits}</td>
                <td className="py-2 px-3 text-slate-400">{game.awayErrors}</td>
              </tr>
              <tr className={homeTeam.id === userTeamId ? 'bg-sky-500/10' : ''}>
                <td className="py-2 px-3 text-left flex items-center gap-2 font-sans font-bold text-white">
                  <TeamBadge team={homeTeam} size="sm" />
                  <span>{homeTeam.id}</span>
                </td>
                {Array.from({ length: totalInningsCols }, (_, i) => (
                  <td key={i} className="py-2 px-2 text-slate-300">
                    {game.inningScores[i]?.bot ?? '-'}
                  </td>
                ))}
                <td className="py-2 px-3 border-l border-slate-800 font-extrabold text-white text-sm">
                  {game.homeRuns}
                </td>
                <td className="py-2 px-3 text-slate-300">{game.homeHits}</td>
                <td className="py-2 px-3 text-slate-400">{game.homeErrors}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Diamond + Matchup & Dugout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: 2.5D Interactive Canvas + Pacing Bar */}
        <div className="lg:col-span-8 space-y-4">
          {/* Play Banner */}
          <div
            className={`px-4 py-2.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
              game.highLeveragePaused
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                : game.isFinal
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                : 'bg-slate-900 border-slate-800 text-slate-200'
            }`}
          >
            <span className="truncate">{game.lastPlayBanner}</span>
            {game.infieldIn && !game.isFinal && (
              <span className="text-[11px] font-mono font-bold text-amber-300 whitespace-nowrap shrink-0">
                INFIELD IN
              </span>
            )}
          </div>

          {/* Live 2.5D Ballpark Canvas */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <canvas
              ref={canvasRef}
              className="w-full h-auto block"
              aria-label="Live interactive 9-inning ballpark canvas"
            />
          </div>

          {/* Pacing & Simulation Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2.5">
            {game.isFinal ? (
              <div className="w-full flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Final Score: {awayTeam.id} {game.awayRuns} — {homeTeam.id} {game.homeRuns}
                </div>
                <button
                  onClick={handleCommitResult}
                  className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer whitespace-nowrap"
                >
                  Commit Box Score & Advance Day {currentDay + 1}
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={animatingLock}
                    onClick={() => {
                      setPacing('IDLE');
                      runAnimatedStep('PITCH');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 text-xs font-bold transition cursor-pointer whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" /> Next Pitch
                  </button>

                  <button
                    onClick={() => setPacing((p) => (p === 'PITCH_1X' ? 'IDLE' : 'PITCH_1X'))}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                      pacing === 'PITCH_1X'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                        : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                    }`}
                  >
                    {pacing === 'PITCH_1X' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    1x Auto-Pitch
                  </button>

                  <button
                    onClick={() => setPacing((p) => (p === 'AT_BAT_4X' ? 'IDLE' : 'AT_BAT_4X'))}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                      pacing === 'AT_BAT_4X'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                        : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                    }`}
                  >
                    <FastForward className="w-3.5 h-3.5" /> 4x At-Bat
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={animatingLock}
                    onClick={handleSimHalfInning}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer whitespace-nowrap"
                  >
                    <SkipForward className="w-3.5 h-3.5 text-sky-400" /> Sim Half-Inning
                  </button>
                  <button
                    disabled={animatingLock}
                    onClick={handleSimToHighLeverage}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-xs font-semibold text-amber-300 transition cursor-pointer whitespace-nowrap"
                  >
                    <Flame className="w-3.5 h-3.5" /> High-Leverage
                  </button>
                  <button
                    disabled={animatingLock}
                    onClick={handleFinishGame}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-xs font-bold text-emerald-300 transition cursor-pointer whitespace-nowrap"
                  >
                    Finish Game
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Active Matchup Portraits, Managerial Dugout & Play-by-Play */}
        <div className="lg:col-span-4 space-y-4">
          {/* Batter vs Pitcher Cards */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Live Matchup
            </div>

            {/* Batter */}
            <div className="flex items-center justify-between gap-2.5 bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <PlayerAvatarSvg player={batter} team={battingTeam} size={46} />
                <div className="min-w-0">
                  <div className="text-[10px] font-mono text-emerald-400">
                    AT BAT · {battingTeam.id} ({batter.bats})
                  </div>
                  <div className="text-xs font-bold text-white truncate">{batter.name}</div>
                  <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {batterSlash.avg} AVG · POW {batter.power ?? 50} · SPD {batter.speed ?? 50}
                  </div>
                </div>
              </div>
              <RatingBadge value={batter.ovr} />
            </div>

            {/* Pitcher */}
            <div className="flex items-center justify-between gap-2.5 bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <PlayerAvatarSvg player={pitcher} team={fieldingTeam} size={46} />
                <div className="min-w-0">
                  <div className="text-[10px] font-mono text-sky-400">
                    ON MOUND · {fieldingTeam.id} ({pitcher.throws}HP) · {(isTop ? game.homePitchCount : game.awayPitchCount)} P
                  </div>
                  <div className="text-xs font-bold text-white truncate">{pitcher.name}</div>
                  <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {pitcherRatios.era} ERA · VEL {pitcher.velocity ?? 50} · CTL {pitcher.control ?? 50}
                  </div>
                </div>
              </div>
              <RatingBadge value={pitcher.ovr} />
            </div>
          </div>

          {/* Managerial Dugout Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-sky-400" />
                {userTeamId} Managerial Dugout
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {isUserBatting ? 'Batting' : isUserFielding ? 'Fielding' : 'Neutral'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={!isUserFielding || game.isFinal || availableBullpen.length === 0}
                onClick={() => {
                  setPacing('IDLE');
                  setActiveModal((m) => (m === 'BULLPEN' ? 'NONE' : 'BULLPEN'));
                }}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5 text-sky-400" /> Pitching Change
              </button>

              <button
                disabled={!isUserBatting || game.isFinal || availableBench.length === 0}
                onClick={() => {
                  setPacing('IDLE');
                  setActiveModal((m) => (m === 'PINCH_HIT' ? 'NONE' : 'PINCH_HIT'));
                }}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> Pinch Hit
              </button>

              <button
                disabled={!canSteal || animatingLock}
                onClick={handleStealAttempt}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Steal Base
              </button>

              <button
                disabled={!isUserFielding || game.isFinal || animatingLock}
                onClick={handleIntentionalWalk}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Int. Walk
              </button>
            </div>

            <button
              disabled={!isUserFielding || game.isFinal}
              onClick={() => setGame((g) => ({ ...g, infieldIn: !g.infieldIn }))}
              className={`w-full py-2 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                game.infieldIn
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                  : 'bg-slate-950 hover:bg-slate-800 disabled:opacity-40 border-slate-700 text-slate-300'
              }`}
            >
              Infield Shift: {game.infieldIn ? 'INFIELD IN (Active)' : 'Standard Depth'}
            </button>

            {/* Bullpen / Pinch Hit Picker Drawer */}
            {activeModal === 'BULLPEN' && (
              <div className="bg-slate-950 border border-sky-500/40 rounded-lg p-3 space-y-2 max-h-44 overflow-y-auto">
                <div className="text-[11px] font-semibold text-sky-300">Select Relief Pitcher</div>
                {availableBullpen.map((rp) => (
                  <button
                    key={rp.id}
                    onClick={() => handlePitchingChange(rp)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left text-xs cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-white">{rp.name} ({rp.throws})</div>
                      <div className="text-[10px] font-mono text-slate-400">
                        VEL {rp.velocity} · CTL {rp.control} · {getPitcherRatios(rp.seasonStats).era} ERA
                      </div>
                    </div>
                    <RatingBadge value={rp.ovr} />
                  </button>
                ))}
              </div>
            )}

            {activeModal === 'PINCH_HIT' && (
              <div className="bg-slate-950 border border-emerald-500/40 rounded-lg p-3 space-y-2 max-h-44 overflow-y-auto">
                <div className="text-[11px] font-semibold text-emerald-300">
                  Pinch Hit for {batter.name}
                </div>
                {availableBench.map((ph) => (
                  <button
                    key={ph.id}
                    onClick={() => handlePinchHit(ph)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left text-xs cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-white">{ph.name} ({ph.bats})</div>
                      <div className="text-[10px] font-mono text-slate-400">
                        POW {ph.power} · SPD {ph.speed} · {getHitterSlash(ph.seasonStats).avg} AVG
                      </div>
                    </div>
                    <RatingBadge value={ph.ovr} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Play-by-Play Feed */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <div className="text-xs font-bold text-white">Play-by-Play Feed</div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {game.logs.map((item) => (
                <div
                  key={item.id}
                  className={`text-[11px] px-2.5 py-1.5 rounded border leading-snug ${
                    item.tone === 'hr'
                      ? 'bg-amber-500/15 border-amber-500/35 text-amber-200 font-semibold'
                      : item.tone === 'hit'
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                      : item.tone === 'hl'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      : item.tone === 'manager'
                      ? 'bg-sky-500/10 border-sky-500/25 text-sky-200'
                      : 'bg-slate-950/70 border-slate-800/70 text-slate-300'
                  }`}
                >
                  <span className="font-mono font-bold text-slate-400 mr-2">{item.inningLabel}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
