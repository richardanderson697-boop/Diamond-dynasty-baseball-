import React, { useMemo, useState } from 'react';
import { Award } from 'lucide-react';
import { LeagueRecord, Player, Team } from '../types/baseball';
import { getHitterSlash, getPitcherRatios } from '../engine/baseballEngine';
import { RatingBadge, TeamBadge } from './SharedBadges';

interface StandingsAndRecordsViewProps {
  teams: Team[];
  players: Player[];
  teamMap: Record<string, Team>;
  userTeamId: string;
  currentDay: number;
  records: LeagueRecord[];
  onSelectPlayer: (p: Player) => void;
}

export function StandingsAndRecordsView({
  teams,
  players,
  teamMap,
  userTeamId,
  currentDay,
  records,
  onSelectPlayer,
}: StandingsAndRecordsViewProps) {
  const [subTab, setSubTab] = useState<'standings' | 'hitters' | 'pitchers' | 'records'>('standings');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'AL' | 'NL' | 'DIV'>('ALL');
  const [hitterSort, setHitterSort] = useState<'hr' | 'avg' | 'rbi' | 'ops' | 'sb'>('hr');
  const [pitcherSort, setPitcherSort] = useState<'w' | 'era' | 'so' | 'sv' | 'whip'>('w');
  const [recordScope, setRecordScope] = useState<'ALL' | 'LEAGUE' | 'AL' | 'NL' | 'DIVISION'>('ALL');

  const userTeam = teamMap[userTeamId];

  const scopedTeamIds = useMemo(() => {
    const filtered = teams.filter((t) => {
      if (scopeFilter === 'AL') return t.league === 'AL';
      if (scopeFilter === 'NL') return t.league === 'NL';
      if (scopeFilter === 'DIV' && userTeam) {
        return t.league === userTeam.league && t.division === userTeam.division;
      }
      return true;
    });
    return new Set(filtered.map((t) => t.id));
  }, [teams, scopeFilter, userTeam]);

  const topHitters = useMemo(() => {
    const minAB = Math.max(1, Math.floor(currentDay * 1.5));
    return players
      .filter((p) => !p.isPitcher && (p.seasonStats.ab || 0) > 0 && p.teamId && scopedTeamIds.has(p.teamId))
      .filter((p) => (hitterSort === 'avg' || hitterSort === 'ops' ? (p.seasonStats.ab || 0) >= minAB : true))
      .sort((a, b) => {
        if (hitterSort === 'avg') return getHitterSlash(b.seasonStats).rawAvg - getHitterSlash(a.seasonStats).rawAvg;
        if (hitterSort === 'ops') return getHitterSlash(b.seasonStats).rawOps - getHitterSlash(a.seasonStats).rawOps;
        if (hitterSort === 'rbi') return (b.seasonStats.rbi || 0) - (a.seasonStats.rbi || 0);
        if (hitterSort === 'sb') return (b.seasonStats.sb || 0) - (a.seasonStats.sb || 0);
        return (b.seasonStats.hr || 0) - (a.seasonStats.hr || 0) || (b.seasonStats.h || 0) - (a.seasonStats.h || 0);
      })
      .slice(0, 40);
  }, [players, scopedTeamIds, hitterSort, currentDay]);

  const topPitchers = useMemo(() => {
    const minOuts = Math.max(3, Math.floor(currentDay * 1.2));
    return players
      .filter((p) => p.isPitcher && (p.seasonStats.ipOuts || 0) > 0 && p.teamId && scopedTeamIds.has(p.teamId))
      .filter((p) => (pitcherSort === 'era' || pitcherSort === 'whip' ? (p.seasonStats.ipOuts || 0) >= minOuts : true))
      .sort((a, b) => {
        if (pitcherSort === 'era') return getPitcherRatios(a.seasonStats).rawEra - getPitcherRatios(b.seasonStats).rawEra;
        if (pitcherSort === 'whip') return getPitcherRatios(a.seasonStats).rawWhip - getPitcherRatios(b.seasonStats).rawWhip;
        if (pitcherSort === 'so') return (b.seasonStats.so || 0) - (a.seasonStats.so || 0);
        if (pitcherSort === 'sv') return (b.seasonStats.sv || 0) - (a.seasonStats.sv || 0);
        return (b.seasonStats.w || 0) - (a.seasonStats.w || 0) || getPitcherRatios(a.seasonStats).rawEra - getPitcherRatios(b.seasonStats).rawEra;
      })
      .slice(0, 40);
  }, [players, scopedTeamIds, pitcherSort, currentDay]);

  // Playoff seeds per league (#1-#3 Div winners, #4-#6 Wild Cards)
  const playoffSeedsByLeague = useMemo(() => {
    const res: Record<string, Record<string, number>> = { AL: {}, NL: {} };
    (['AL', 'NL'] as const).forEach((lg) => {
      const lgTeams = teams.filter((t) => t.league === lg);
      const divWinners = (['East', 'Central', 'West'] as const)
        .map((div) =>
          lgTeams
            .filter((t) => t.division === div)
            .sort((a, b) => b.wins - a.wins || b.runsScored - b.runsAllowed - (a.runsScored - a.runsAllowed))[0]
        )
        .filter(Boolean)
        .sort((a, b) => b.wins - a.wins);
      const winnerIds = new Set(divWinners.map((t) => t.id));
      const wildCards = lgTeams
        .filter((t) => !winnerIds.has(t.id))
        .sort((a, b) => b.wins - a.wins || b.runsScored - b.runsAllowed - (a.runsScored - a.runsAllowed))
        .slice(0, 3);
      [...divWinners, ...wildCards].forEach((t, idx) => {
        res[lg][t.id] = idx + 1;
      });
    });
    return res;
  }, [teams]);

  const filteredRecords = useMemo(() => {
    return records
      .filter((r) => (recordScope === 'ALL' ? true : r.scope === recordScope))
      .sort((a, b) => a.scope.localeCompare(b.scope) || a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  }, [records, recordScope]);

  return (
    <div className="space-y-5">
      {/* Sub-navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
          {[
            { id: 'standings', label: 'Division & League Standings' },
            { id: 'hitters', label: 'Batting Leaders' },
            { id: 'pitchers', label: 'Pitching Leaders' },
            { id: 'records', label: `Record Book (${records.length})` },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id as typeof subTab)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                subTab === t.id ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {(subTab === 'hitters' || subTab === 'pitchers') && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
              {[
                { id: 'ALL', label: 'MLB' },
                { id: 'AL', label: 'AL' },
                { id: 'NL', label: 'NL' },
                { id: 'DIV', label: 'My Div' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setScopeFilter(f.id as typeof scopeFilter)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                    scopeFilter === f.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {subTab === 'standings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(['AL', 'NL'] as const).map((lg) => (
            <div key={lg} className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-display text-lg font-extrabold text-white">
                  {lg === 'AL' ? 'American League' : 'National League'}
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">
                  #1–3 Div Winners · #4–6 Wild Cards
                </span>
              </div>
              {(['East', 'Central', 'West'] as const).map((div) => {
                const divTeams = teams
                  .filter((t) => t.league === lg && t.division === div)
                  .sort((a, b) => b.wins - a.wins || b.runsScored - b.runsAllowed - (a.runsScored - a.runsAllowed));
                return (
                  <div key={div} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="bg-slate-950 px-4 py-2 text-xs font-semibold text-sky-400 border-b border-slate-800">
                      {lg} {div}
                    </div>
                    <table className="w-full text-xs">
                      <thead className="text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-4 text-left">Franchise</th>
                          <th className="py-2 px-2 text-right">W</th>
                          <th className="py-2 px-2 text-right">L</th>
                          <th className="py-2 px-2 text-right">PCT</th>
                          <th className="py-2 px-2 text-right">GB</th>
                          <th className="py-2 px-2 text-right">L10</th>
                          <th className="py-2 px-4 text-right">DIFF</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {divTeams.map((t, idx) => {
                          const leader = divTeams[0];
                          const gb =
                            idx === 0
                              ? '-'
                              : ((leader.wins - t.wins + (t.losses - leader.losses)) / 2).toFixed(1);
                          const pct =
                            t.wins + t.losses > 0
                              ? (t.wins / (t.wins + t.losses)).toFixed(3).replace(/^0/, '')
                              : '.000';
                          const diff = t.runsScored - t.runsAllowed;
                          const seed = playoffSeedsByLeague[lg][t.id];
                          const l10W = t.last10.filter((x) => x === 'W').length;
                          const l10L = t.last10.length - l10W;

                          return (
                            <tr key={t.id} className={t.id === userTeamId ? 'bg-sky-500/10 font-semibold' : ''}>
                              <td className="py-2 px-4 flex items-center gap-2">
                                <TeamBadge team={t} />
                                <span className="truncate">{t.city} {t.name}</span>
                                {seed && (t.wins + t.losses > 0) && (
                                  <span className="font-mono text-[10px] text-amber-300 shrink-0">
                                    #{seed}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right font-mono">{t.wins}</td>
                              <td className="py-2 px-2 text-right font-mono">{t.losses}</td>
                              <td className="py-2 px-2 text-right font-mono">{pct}</td>
                              <td className="py-2 px-2 text-right font-mono text-slate-400">{gb}</td>
                              <td className="py-2 px-2 text-right font-mono text-slate-400">
                                {t.last10.length > 0 ? `${l10W}-${l10L}` : '-'}
                              </td>
                              <td className={`py-2 px-4 text-right font-mono ${diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {diff >= 0 ? `+${diff}` : diff}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {subTab === 'hitters' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300">Sort Batting Leaderboard By:</span>
            <div className="flex items-center gap-1">
              {[
                { id: 'hr', label: 'Home Runs' },
                { id: 'avg', label: 'Batting AVG' },
                { id: 'ops', label: 'OPS' },
                { id: 'rbi', label: 'RBI' },
                { id: 'sb', label: 'Stolen Bases' },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => setHitterSort(s.id as typeof hitterSort)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                    hitterSort === s.id ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {topHitters.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Simulate games to populate batting leaderboards.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-950/60 text-slate-400 text-[11px]">
                  <tr>
                    <th className="py-3 px-4 text-left">#</th>
                    <th className="py-3 px-3 text-left">Player</th>
                    <th className="py-3 px-2 text-left">Team</th>
                    <th className="py-3 px-2 text-center">Pos</th>
                    <th className="py-3 px-2 text-center">OVR</th>
                    <th className="py-3 px-2">G</th>
                    <th className="py-3 px-2">AB</th>
                    <th className="py-3 px-2">H</th>
                    <th className="py-3 px-2">HR</th>
                    <th className="py-3 px-2">RBI</th>
                    <th className="py-3 px-2">SB</th>
                    <th className="py-3 px-2">AVG</th>
                    <th className="py-3 px-4">OPS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono">
                  {topHitters.map((p, idx) => {
                    const s = getHitterSlash(p.seasonStats);
                    return (
                      <tr key={p.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 text-left text-slate-500">{idx + 1}</td>
                        <td
                          className="py-2.5 px-3 text-left font-sans font-bold text-white cursor-pointer hover:text-sky-400"
                          onClick={() => onSelectPlayer(p)}
                        >
                          {p.name}
                        </td>
                        <td className="py-2.5 px-2 text-left font-sans">{p.teamId || 'FA'}</td>
                        <td className="py-2.5 px-2 text-center font-sans">{p.position}</td>
                        <td className="py-2.5 px-2 text-center">
                          <RatingBadge value={p.ovr} />
                        </td>
                        <td className="px-2">{p.seasonStats.g}</td>
                        <td className="px-2">{p.seasonStats.ab}</td>
                        <td className="px-2">{p.seasonStats.h}</td>
                        <td className="px-2 font-bold text-emerald-400">{p.seasonStats.hr}</td>
                        <td className="px-2">{p.seasonStats.rbi}</td>
                        <td className="px-2">{p.seasonStats.sb}</td>
                        <td className="px-2 font-bold text-white">{s.avg}</td>
                        <td className="px-4 text-sky-300">{s.ops}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'pitchers' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300">Sort Pitching Leaderboard By:</span>
            <div className="flex items-center gap-1">
              {[
                { id: 'w', label: 'Wins' },
                { id: 'era', label: 'ERA' },
                { id: 'so', label: 'Strikeouts' },
                { id: 'sv', label: 'Saves' },
                { id: 'whip', label: 'WHIP' },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => setPitcherSort(s.id as typeof pitcherSort)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                    pitcherSort === s.id ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {topPitchers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Simulate games to populate pitching leaderboards.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-950/60 text-slate-400 text-[11px]">
                  <tr>
                    <th className="py-3 px-4 text-left">#</th>
                    <th className="py-3 px-3 text-left">Pitcher</th>
                    <th className="py-3 px-2 text-left">Team</th>
                    <th className="py-3 px-2 text-center">Role</th>
                    <th className="py-3 px-2 text-center">OVR</th>
                    <th className="py-3 px-2">G</th>
                    <th className="py-3 px-2">W</th>
                    <th className="py-3 px-2">L</th>
                    <th className="py-3 px-2">SV</th>
                    <th className="py-3 px-2">IP</th>
                    <th className="py-3 px-2">SO</th>
                    <th className="py-3 px-2">ERA</th>
                    <th className="py-3 px-4">WHIP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono">
                  {topPitchers.map((p, idx) => {
                    const r = getPitcherRatios(p.seasonStats);
                    return (
                      <tr key={p.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 text-left text-slate-500">{idx + 1}</td>
                        <td
                          className="py-2.5 px-3 text-left font-sans font-bold text-white cursor-pointer hover:text-sky-400"
                          onClick={() => onSelectPlayer(p)}
                        >
                          {p.name}
                        </td>
                        <td className="py-2.5 px-2 text-left font-sans">{p.teamId || 'FA'}</td>
                        <td className="py-2.5 px-2 text-center font-sans">{p.position}</td>
                        <td className="py-2.5 px-2 text-center">
                          <RatingBadge value={p.ovr} />
                        </td>
                        <td className="px-2">{p.seasonStats.g}</td>
                        <td className="px-2 font-bold text-sky-400">{p.seasonStats.w}</td>
                        <td className="px-2">{p.seasonStats.l}</td>
                        <td className="px-2">{p.seasonStats.sv}</td>
                        <td className="px-2">{r.ipStr}</td>
                        <td className="px-2">{p.seasonStats.so}</td>
                        <td className="px-2 font-bold text-white">{r.era}</td>
                        <td className="px-4">{r.whip}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'records' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                Division & League Record Book
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                All-time franchise simulation milestones updated automatically as games progress.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
              {(['ALL', 'LEAGUE', 'AL', 'NL', 'DIVISION'] as const).map((sc) => (
                <button
                  key={sc}
                  onClick={() => setRecordScope(sc)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                    recordScope === sc ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {sc === 'ALL' ? 'All Scopes' : sc}
                </button>
              ))}
            </div>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-xs text-slate-500">
              Simulate regular season games to establish initial division and league records.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRecords.map((rec) => {
                const t = teamMap[rec.teamId];
                return (
                  <div
                    key={rec.recordKey}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] text-slate-400">
                          {rec.scopeLabel} · {rec.category}
                        </div>
                        <div className="text-sm font-bold text-white mt-0.5">{rec.title}</div>
                      </div>
                      <span className="font-mono text-base font-extrabold text-amber-300 shrink-0">
                        {rec.displayValue}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/80 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <TeamBadge team={t} />
                        <span className="font-semibold text-slate-200 truncate">{rec.holderName}</span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500 shrink-0">
                        {rec.year} · D{rec.day}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
