import React, { useState } from 'react';
import { Calendar, Star, TrendingUp, Trophy } from 'lucide-react';
import {
  DraftPick,
  GamePhase,
  LeagueRecord,
  Player,
  PlayoffResults,
  RecentGameEntry,
  SeasonSnapshot,
  Team,
  TransactionEntry,
} from '../types/baseball';
import { getHitterSlash, getPitcherRatios } from '../engine/baseballEngine';
import { getStadiumByTeamId } from '../data/stadiums';
import { RatingBadge, TeamBadge } from './SharedBadges';
import { StadiumPreviewCard } from './StadiumPreviewCard';

interface DashboardViewProps {
  year: number;
  phase: GamePhase;
  currentDay: number;
  userTeam: Team | undefined;
  userRoster: Player[];
  teams: Team[];
  teamMap: Record<string, Team>;
  recentGames: RecentGameEntry[];
  transactions: TransactionEntry[];
  playoffResults: PlayoffResults | null;
  draftPicks: DraftPick[];
  snapshots: SeasonSnapshot[];
  records: LeagueRecord[];
  onAdvanceOffseason: () => void;
  onSelectPlayer: (p: Player) => void;
  onNavigate: (tab: string) => void;
  onPlayLiveGame?: () => void;
  nextMatchupLabel?: string;
}

export function DashboardView({
  year,
  phase,
  currentDay,
  userTeam,
  userRoster,
  teams,
  teamMap,
  recentGames,
  transactions,
  playoffResults,
  draftPicks,
  snapshots,
  records,
  onAdvanceOffseason,
  onSelectPlayer,
  onNavigate,
  onPlayLiveGame,
  nextMatchupLabel,
}: DashboardViewProps) {
  const [scoutStadiumTeamId, setScoutStadiumTeamId] = useState<string | null>(null);
  const activeStadiumTeamId = scoutStadiumTeamId || userTeam?.id || 'NYY';
  const activeStadium = getStadiumByTeamId(activeStadiumTeamId);
  const activeStadiumTeam = teamMap[activeStadiumTeamId] || userTeam;
  const hitters = userRoster.filter((p) => !p.isPitcher);
  const pitchers = userRoster.filter((p) => p.isPitcher);
  const avgHitterOvr = hitters.length
    ? Math.round(hitters.reduce((s, p) => s + p.ovr, 0) / hitters.length)
    : 0;
  const avgPitcherOvr = pitchers.length
    ? Math.round(pitchers.reduce((s, p) => s + p.ovr, 0) / pitchers.length)
    : 0;
  const teamOvr = Math.round((avgHitterOvr + avgPitcherOvr) / 2);

  const divTeams = teams
    .filter((t) => t.league === userTeam?.league && t.division === userTeam?.division)
    .sort((a, b) => b.wins - a.wins || b.runsScored - b.runsAllowed - (a.runsScored - a.runsAllowed));

  const userPicks = draftPicks
    .filter((pk) => pk.ownerTeamId === userTeam?.id)
    .sort((a, b) => a.year - b.year || a.round - b.round);

  const yearSnaps = snapshots
    .filter((s) => s.year === year)
    .sort((a, b) => a.day - b.day);

  const champTeam = playoffResults ? teamMap[playoffResults.championId] : null;
  const runDiff = (userTeam?.runsScored || 0) - (userTeam?.runsAllowed || 0);

  return (
    <div className="space-y-6">
      {phase === 'PLAYOFFS_COMPLETE' && playoffResults && (
        <div className="bg-gradient-to-r from-amber-500/15 via-slate-900 to-emerald-500/15 border border-amber-500/40 rounded-xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-amber-400 text-xs font-semibold mb-1">
                <Trophy className="w-4 h-4" /> {year} World Series Champions
              </div>
              <h2 className="font-display text-2xl font-extrabold text-white flex items-center gap-3 flex-wrap">
                <TeamBadge team={champTeam} size="lg" />
                {playoffResults.championCity} {playoffResults.championName}
                <span className="text-sm font-sans font-normal text-slate-300">
                  def. {playoffResults.runnerUpCity} {playoffResults.runnerUpName} ({playoffResults.rounds.worldSeries.score})
                </span>
              </h2>
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-300 font-mono">
                <span>
                  ALCS: {playoffResults.rounds.championship[0]?.winnerId} def.{' '}
                  {playoffResults.rounds.championship[0]?.loserId} ({playoffResults.rounds.championship[0]?.score})
                </span>
                <span>
                  NLCS: {playoffResults.rounds.championship[1]?.winnerId} def.{' '}
                  {playoffResults.rounds.championship[1]?.loserId} ({playoffResults.rounds.championship[1]?.score})
                </span>
              </div>
            </div>
            <button
              onClick={onAdvanceOffseason}
              className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer whitespace-nowrap shrink-0"
            >
              Proceed to {year + 1} Rookie Draft
            </button>
          </div>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium">Season Record</div>
          <div className="text-2xl font-extrabold font-mono text-white mt-1">
            {userTeam?.wins ?? 0}-{userTeam?.losses ?? 0}
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono">
            PCT:{' '}
            {userTeam && userTeam.wins + userTeam.losses > 0
              ? (userTeam.wins / (userTeam.wins + userTeam.losses)).toFixed(3).replace(/^0/, '')
              : '.000'}{' '}
            · STK:{' '}
            {userTeam?.streak && userTeam.streak > 0
              ? `W${userTeam.streak}`
              : userTeam?.streak && userTeam.streak < 0
              ? `L${Math.abs(userTeam.streak)}`
              : '-'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium">Franchise Overall</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-extrabold font-mono text-white">{teamOvr}</span>
            <RatingBadge value={teamOvr} />
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono">
            OFF <span className="text-emerald-400 font-semibold">{avgHitterOvr}</span> · PIT{' '}
            <span className="text-sky-400 font-semibold">{avgPitcherOvr}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium">Run Differential</div>
          <div
            className={`text-2xl font-extrabold font-mono mt-1 ${
              runDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {runDiff >= 0 ? `+${runDiff}` : runDiff}
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono">
            RS {userTeam?.runsScored ?? 0} · RA {userTeam?.runsAllowed ?? 0}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium">Schedule & Records</div>
          <div className="text-2xl font-extrabold font-mono text-white mt-1">
            {currentDay} <span className="text-sm font-normal text-slate-400">/ 162</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-sky-500 rounded-full" style={{ width: `${(currentDay / 162) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Main 3-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Division Standings & Mini Trend */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                {userTeam?.league} {userTeam?.division} Standings
              </h3>
              <button
                onClick={() => onNavigate('standings')}
                className="text-xs text-sky-400 hover:underline cursor-pointer"
              >
                Full League
              </button>
            </div>
            <table className="w-full text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 text-left">Team</th>
                  <th className="py-2 text-right">W</th>
                  <th className="py-2 text-right">L</th>
                  <th className="py-2 text-right">GB</th>
                  <th className="py-2 text-right">DIFF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {divTeams.map((t, idx) => {
                  const leader = divTeams[0];
                  const gb =
                    idx === 0
                      ? '-'
                      : ((leader.wins - t.wins + (t.losses - leader.losses)) / 2).toFixed(1);
                  const diff = t.runsScored - t.runsAllowed;
                  return (
                    <tr key={t.id} className={t.id === userTeam?.id ? 'bg-sky-500/10 font-semibold' : ''}>
                      <td className="py-2 flex items-center gap-2">
                        <TeamBadge team={t} />
                        <span className="truncate">{t.city}</span>
                      </td>
                      <td className="py-2 text-right font-mono">{t.wins}</td>
                      <td className="py-2 text-right font-mono">{t.losses}</td>
                      <td className="py-2 text-right font-mono text-slate-400">{gb}</td>
                      <td className={`py-2 text-right font-mono ${diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {diff >= 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mini Win% Sparkline */}
          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                {year} Win% Trajectory ({yearSnaps.length} pts)
              </span>
              <button
                onClick={() => onNavigate('trends')}
                className="text-xs text-sky-400 hover:underline cursor-pointer"
              >
                Open Trends
              </button>
            </div>
            {yearSnaps.length >= 2 ? (
              <svg viewBox="0 0 280 64" className="w-full h-16 bg-slate-950/70 border border-slate-800 rounded-lg">
                <line x1="0" y1="32" x2="280" y2="32" stroke="rgba(148,163,184,0.2)" strokeDasharray="3 3" />
                <path
                  d={yearSnaps
                    .map((s, i) => {
                      const x = 10 + (s.day / 162) * 260;
                      const y = 56 - s.userWinPct * 48;
                      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth={2}
                />
              </svg>
            ) : (
              <div className="text-[11px] text-slate-500 py-3 px-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                Simulate multiple days or weeks to plot season trajectory.
              </div>
            )}
          </div>

          {/* Draft Capital */}
          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300">Owned Draft Capital ({userPicks.length})</span>
              <button
                onClick={() => onNavigate('trades')}
                className="text-xs text-sky-400 hover:underline cursor-pointer"
              >
                Trade Picks
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {userPicks.slice(0, 10).map((pk) => (
                <span
                  key={pk.id}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                    pk.originalTeamId !== userTeam?.id
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-slate-950 text-slate-300 border-slate-800'
                  }`}
                >
                  {pk.year} R{pk.round} ({pk.originalTeamId})
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Core Roster Stars */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Star className="w-4 h-4 text-sky-400" />
              Core Roster Stars
            </h3>
            <button
              onClick={() => onNavigate('roster')}
              className="text-xs text-sky-400 hover:underline cursor-pointer"
            >
              Full 30-Man
            </button>
          </div>
          <div className="space-y-2">
            {userRoster.slice(0, 8).map((p) => {
              const summaryStat = p.isPitcher
                ? `${p.seasonStats.w || 0}-${p.seasonStats.l || 0} · ${getPitcherRatios(p.seasonStats).era} ERA · ${p.seasonStats.so || 0} SO`
                : `${getHitterSlash(p.seasonStats).avg} AVG · ${p.seasonStats.hr || 0} HR · ${p.seasonStats.rbi || 0} RBI`;
              return (
                <div
                  key={p.id}
                  onClick={() => onSelectPlayer(p)}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/70 hover:bg-slate-800/80 border border-slate-800/80 cursor-pointer transition"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold text-sky-400 w-7">
                        {p.position}
                      </span>
                      <span className="text-xs font-bold text-white truncate">{p.name}</span>
                      <span className="text-[11px] font-mono text-slate-500">({p.age})</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 pl-9 font-mono">{summaryStat}</div>
                  </div>
                  <RatingBadge value={p.ovr} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Game Results & Record Benchmarks */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-emerald-400" />
              Recent Game Results
            </h3>
            {recentGames.length === 0 ? (
              <div className="text-xs text-slate-500 py-8 text-center border border-dashed border-slate-800 rounded-lg">
                No games played yet. Use the simulation controls above to start Opening Day.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {recentGames.slice(0, 10).map((g, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded bg-slate-950/70 border border-slate-800/70"
                  >
                    <span className="text-slate-500 font-mono">D{g.day}</span>
                    <span className="font-mono font-semibold text-slate-200">
                      {g.awayId} {g.awayRuns} @ {g.homeId} {g.homeRuns}
                    </span>
                    <span
                      className={`font-mono font-bold text-[11px] ${
                        g.userWon ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {g.userWon ? 'WIN' : 'LOSS'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300">
                Active Record Benchmarks ({records.length})
              </span>
              <button
                onClick={() => onNavigate('standings')}
                className="text-xs text-sky-400 hover:underline cursor-pointer"
              >
                Record Book
              </button>
            </div>
            <div className="space-y-1.5">
              {transactions.slice(0, 3).map((tx) => (
                <div
                  key={tx.id}
                  className="text-[11px] text-slate-400 bg-slate-950/60 p-2 rounded border border-slate-800/60 leading-snug"
                >
                  {tx.summary}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Ballpark Geometry, Turf & Park Factors */}
      <StadiumPreviewCard
        stadium={activeStadium}
        team={activeStadiumTeam}
        allTeams={teams}
        selectedTeamId={activeStadiumTeamId}
        onSelectTeamId={setScoutStadiumTeamId}
        onPlayLiveGame={onPlayLiveGame}
        canPlayLiveGame={phase === 'REGULAR_SEASON' && currentDay < 162}
        nextOpponentText={nextMatchupLabel}
      />
    </div>
  );
}
