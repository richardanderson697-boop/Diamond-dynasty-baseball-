import React, { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { ChampionHistoryEntry, SeasonSnapshot, Team } from '../types/baseball';
import { TeamBadge } from './SharedBadges';

interface TrendsDashboardViewProps {
  year: number;
  currentDay: number;
  userTeam: Team | undefined;
  teams: Team[];
  snapshots: SeasonSnapshot[];
  championsHistory: ChampionHistoryEntry[];
  canSaveToCloud: boolean;
}

export function TrendsDashboardView({
  year,
  currentDay,
  userTeam,
  teams,
  snapshots,
  championsHistory,
  canSaveToCloud,
}: TrendsDashboardViewProps) {
  const availableYears = useMemo(() => {
    const yrs = Array.from(new Set(snapshots.map((s) => s.year)));
    if (!yrs.includes(year)) yrs.push(year);
    return yrs.sort((a, b) => b - a);
  }, [snapshots, year]);

  const [selectedYear, setSelectedYear] = useState<number>(year);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const yearSnapshots = useMemo(() => {
    return snapshots
      .filter((s) => s.year === selectedYear)
      .sort((a, b) => a.day - b.day);
  }, [snapshots, selectedYear]);

  const seasonEndSnapshots = useMemo(() => {
    return snapshots
      .filter((s) => s.isSeasonEnd)
      .sort((a, b) => a.year - b.year);
  }, [snapshots]);

  // Division teams color map for multi-line division race
  const divisionTeams = useMemo(() => {
    if (!userTeam) return [];
    return teams.filter(
      (t) => t.league === userTeam.league && t.division === userTeam.division
    );
  }, [teams, userTeam]);

  const divisionColors = ['#38BDF8', '#10B981', '#F59E0B', '#F43F5E', '#A78BFA', '#94A3B8'];

  // SVG Win% Chart Geometry
  const chartW = 720;
  const chartH = 240;
  const padL = 44;
  const padR = 20;
  const padT = 18;
  const padB = 30;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const getX = (day: number) => padL + (Math.min(162, Math.max(0, day)) / 162) * innerW;
  const getPctY = (pct: number) => padT + (1 - Math.min(1, Math.max(0, pct))) * innerH;

  // Run Diff bounds
  const runDiffBounds = useMemo(() => {
    const vals = yearSnapshots.map((s) => s.userRunDiff);
    if (vals.length === 0) return { min: -50, max: 50 };
    const maxAbs = Math.max(25, ...vals.map((v) => Math.abs(v)));
    return { min: -maxAbs, max: maxAbs };
  }, [yearSnapshots]);

  const getDiffY = (diff: number) => {
    const span = runDiffBounds.max - runDiffBounds.min || 1;
    const norm = (diff - runDiffBounds.min) / span;
    return padT + (1 - norm) * innerH;
  };

  const userWinPath = yearSnapshots
    .map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(s.day).toFixed(1)} ${getPctY(s.userWinPct).toFixed(1)}`)
    .join(' ');

  const leaderWinPath = yearSnapshots
    .map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(s.day).toFixed(1)} ${getPctY(s.divisionLeaderWinPct).toFixed(1)}`)
    .join(' ');

  const runDiffPath = yearSnapshots
    .map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(s.day).toFixed(1)} ${getDiffY(s.userRunDiff).toFixed(1)}`)
    .join(' ');

  const hoveredSnap = hoverIdx !== null && yearSnapshots[hoverIdx] ? yearSnapshots[hoverIdx] : null;

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-sky-400" />
            Historical Performance Trends
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {canSaveToCloud
              ? 'Checkpoints sync in real time to Firebase as games progress across each 162-game season.'
              : 'Live session trend checkpoints across game days and completed seasons.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Season:</span>
          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
            {availableYears.map((yr) => (
              <button
                key={yr}
                onClick={() => {
                  setSelectedYear(yr);
                  setHoverIdx(null);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition cursor-pointer whitespace-nowrap ${
                  selectedYear === yr ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>
      </div>

      {yearSnapshots.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-200">
            No game checkpoints recorded for {selectedYear} yet.
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Simulate games, weeks, or months from the top bar (currently Day {currentDay}/162) to plot win percentage trajectories, run differentials, and division race trends.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Chart 1: Win Percentage Trajectory vs Division Leader */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Win % Pace vs Division Leader ({selectedYear})
                </h3>
                <p className="text-xs text-slate-400">
                  {userTeam?.city} {userTeam?.name} (Sky) vs {userTeam?.league} {userTeam?.division} Leader (Amber)
                </p>
              </div>
              {hoveredSnap && (
                <div className="text-xs font-mono text-slate-200 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded">
                  Day {hoveredSnap.day}: {hoveredSnap.userWins}-{hoveredSnap.userLosses} ({hoveredSnap.userWinPct.toFixed(3).replace(/^0/, '')})
                </div>
              )}
            </div>

            <div className="w-full overflow-x-auto">
              <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto min-w-[460px]">
                {[0.25, 0.5, 0.75].map((tick) => {
                  const y = getPctY(tick);
                  return (
                    <g key={tick}>
                      <line
                        x1={padL}
                        y1={y}
                        x2={chartW - padR}
                        y2={y}
                        stroke={tick === 0.5 ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.12)'}
                        strokeDasharray={tick === 0.5 ? '4 4' : undefined}
                      />
                      <text
                        x={padL - 8}
                        y={y + 3}
                        textAnchor="end"
                        fill="#94A3B8"
                        fontSize="10"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {tick.toFixed(3).replace(/^0/, '')}
                      </text>
                    </g>
                  );
                })}

                {[1, 40, 81, 120, 162].map((d) => (
                  <text
                    key={d}
                    x={getX(d)}
                    y={chartH - 8}
                    textAnchor="middle"
                    fill="#64748B"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    D{d}
                  </text>
                ))}

                {leaderWinPath && (
                  <path
                    d={leaderWinPath}
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                  />
                )}
                {userWinPath && (
                  <path d={userWinPath} fill="none" stroke="#38BDF8" strokeWidth={2.5} />
                )}

                {yearSnapshots.map((s, idx) => (
                  <g
                    key={s.id}
                    onMouseEnter={() => setHoverIdx(idx)}
                    onMouseLeave={() => setHoverIdx(null)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={getX(s.day)}
                      cy={getPctY(s.userWinPct)}
                      r={hoverIdx === idx ? 5 : 3}
                      fill="#38BDF8"
                    />
                    <circle
                      cx={getX(s.day)}
                      cy={getPctY(s.divisionLeaderWinPct)}
                      r={2.5}
                      fill="#F59E0B"
                    />
                  </g>
                ))}
              </svg>
            </div>
          </div>

          {/* Chart 2: Cumulative Run Differential */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Cumulative Run Differential ({selectedYear})
                </h3>
                <p className="text-xs text-slate-400">
                  Scoring margin progression across season checkpoints
                </p>
              </div>
              {yearSnapshots.length > 0 && (
                <div className="text-xs font-mono font-bold text-emerald-400">
                  Latest: {yearSnapshots[yearSnapshots.length - 1].userRunDiff >= 0 ? '+' : ''}
                  {yearSnapshots[yearSnapshots.length - 1].userRunDiff}
                </div>
              )}
            </div>

            <div className="w-full overflow-x-auto">
              <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto min-w-[460px]">
                {/* Zero baseline */}
                <line
                  x1={padL}
                  y1={getDiffY(0)}
                  x2={chartW - padR}
                  y2={getDiffY(0)}
                  stroke="rgba(148,163,184,0.35)"
                  strokeDasharray="4 4"
                />
                {[runDiffBounds.min, 0, runDiffBounds.max].map((val) => (
                  <text
                    key={val}
                    x={padL - 8}
                    y={getDiffY(val) + 3}
                    textAnchor="end"
                    fill="#94A3B8"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {val > 0 ? `+${val}` : val}
                  </text>
                ))}

                {[1, 40, 81, 120, 162].map((d) => (
                  <text
                    key={d}
                    x={getX(d)}
                    y={chartH - 8}
                    textAnchor="middle"
                    fill="#64748B"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    D{d}
                  </text>
                ))}

                {runDiffPath && (
                  <path d={runDiffPath} fill="none" stroke="#10B981" strokeWidth={2.5} />
                )}

                {yearSnapshots.map((s) => (
                  <circle
                    key={s.id}
                    cx={getX(s.day)}
                    cy={getDiffY(s.userRunDiff)}
                    r={3.5}
                    fill={s.userRunDiff >= 0 ? '#10B981' : '#F43F5E'}
                  />
                ))}
              </svg>
            </div>
          </div>

          {/* Chart 3: Division Race Multi-Team Trajectory */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {userTeam?.league} {userTeam?.division} Division Race ({selectedYear})
                </h3>
                <p className="text-xs text-slate-400">
                  Win percentage comparison across every club in your division
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                {divisionTeams.map((t, i) => (
                  <span key={t.id} className="inline-flex items-center gap-1.5 text-slate-300">
                    <span
                      className="w-2.5 h-2.5 rounded-sm inline-block"
                      style={{ backgroundColor: divisionColors[i % divisionColors.length] }}
                    />
                    {t.id}
                  </span>
                ))}
              </div>
            </div>

            <div className="w-full overflow-x-auto">
              <svg viewBox={`0 0 ${chartW * 1.35} ${chartH}`} className="w-full h-auto min-w-[540px]">
                {[0.3, 0.5, 0.7].map((tick) => {
                  const y = getPctY(tick);
                  return (
                    <g key={tick}>
                      <line
                        x1={padL}
                        y1={y}
                        x2={chartW * 1.35 - padR}
                        y2={y}
                        stroke={tick === 0.5 ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.12)'}
                        strokeDasharray={tick === 0.5 ? '4 4' : undefined}
                      />
                      <text
                        x={padL - 8}
                        y={y + 3}
                        textAnchor="end"
                        fill="#94A3B8"
                        fontSize="10"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {tick.toFixed(3).replace(/^0/, '')}
                      </text>
                    </g>
                  );
                })}

                {divisionTeams.map((t, tIdx) => {
                  const pts = yearSnapshots
                    .map((s) => {
                      const found = s.divisionSnapshots.find((ds) => ds.teamId === t.id);
                      if (!found) return null;
                      const x = padL + (Math.min(162, Math.max(0, s.day)) / 162) * (chartW * 1.35 - padL - padR);
                      const y = getPctY(found.winPct);
                      return { x, y };
                    })
                    .filter((pt): pt is { x: number; y: number } => pt !== null);

                  if (pts.length === 0) return null;
                  const pathD = pts
                    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
                    .join(' ');
                  const color = divisionColors[tIdx % divisionColors.length];
                  return (
                    <g key={t.id}>
                      <path
                        d={pathD}
                        fill="none"
                        stroke={color}
                        strokeWidth={t.id === userTeam?.id ? 3 : 1.75}
                        opacity={t.id === userTeam?.id ? 1 : 0.75}
                      />
                      {pts.map((pt, idx) => (
                        <circle key={idx} cx={pt.x} cy={pt.y} r={t.id === userTeam?.id ? 3.5 : 2} fill={color} />
                      ))}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Season Franchise Dynasty Ledger */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Multi-Season Franchise Ledger</h3>
            <p className="text-xs text-slate-400">
              Completed season records, division finishes, and league statistical champions
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {seasonEndSnapshots.length} Completed Seasons
          </span>
        </div>

        {seasonEndSnapshots.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Complete a 162-game regular season to archive your first annual franchise ledger entry.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400">
                <tr>
                  <th className="py-3 px-4">Year</th>
                  <th className="py-3 px-3">Team</th>
                  <th className="py-3 px-3 text-right">W-L</th>
                  <th className="py-3 px-3 text-right">Win%</th>
                  <th className="py-3 px-3 text-right">Run Diff</th>
                  <th className="py-3 px-3 text-center">Div / Lg Rank</th>
                  <th className="py-3 px-3">HR Leader</th>
                  <th className="py-3 px-3">ERA Leader</th>
                  <th className="py-3 px-4 text-right">Champion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {seasonEndSnapshots.map((s) => {
                  const champ = championsHistory.find((c) => c.year === s.year);
                  return (
                    <tr key={s.id} className="hover:bg-slate-800/35">
                      <td className="py-2.5 px-4 font-mono font-bold text-white">{s.year}</td>
                      <td className="py-2.5 px-3 font-mono text-sky-400 font-semibold">{s.userTeamId}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{s.userWins}-{s.userLosses}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{s.userWinPct.toFixed(3).replace(/^0/, '')}</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${s.userRunDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {s.userRunDiff >= 0 ? `+${s.userRunDiff}` : s.userRunDiff}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-300">
                        #{s.divisionRank} Div · #{s.leagueRank} Lg
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 truncate max-w-[180px]">{s.topHrLeader}</td>
                      <td className="py-2.5 px-3 text-slate-300 truncate max-w-[180px]">{s.topEraLeader}</td>
                      <td className="py-2.5 px-4 text-right">
                        {champ ? (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-amber-300">
                            <TeamBadge
                              team={{
                                id: champ.championId,
                                color: champ.championColor,
                                accent: champ.championAccent,
                              }}
                            />
                            {champ.championId}
                          </span>
                        ) : (
                          <span className="font-mono text-slate-400">{s.championTeamId || '-'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
