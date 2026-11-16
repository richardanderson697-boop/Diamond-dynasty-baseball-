import React, { useMemo, useState } from 'react';
import { GamePhase, Player, Team } from '../types/baseball';
import { formatIP, getHitterSlash, getPitcherRatios } from '../engine/baseballEngine';
import { RatingBadge } from './SharedBadges';

interface RosterViewProps {
  userTeam: Team | undefined;
  userRoster: Player[];
  phase: GamePhase;
  onReleasePlayer: (id: string) => void;
  onConfirmCuts: () => void;
  onSelectPlayer: (p: Player) => void;
}

export function RosterView({
  userTeam,
  userRoster,
  phase,
  onReleasePlayer,
  onConfirmCuts,
  onSelectPlayer,
}: RosterViewProps) {
  const [filterType, setFilterType] = useState<'ALL' | 'HITTERS' | 'PITCHERS'>('ALL');
  const [sortBy, setSortBy] = useState<'ovr' | 'potential' | 'age'>('ovr');

  const filtered = useMemo(() => {
    let list = [...userRoster];
    if (filterType === 'HITTERS') list = list.filter((p) => !p.isPitcher);
    if (filterType === 'PITCHERS') list = list.filter((p) => p.isPitcher);
    list.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
    return list;
  }, [userRoster, filterType, sortBy]);

  const hitterCount = userRoster.filter((p) => !p.isPitcher).length;
  const pitcherCount = userRoster.filter((p) => p.isPitcher).length;

  return (
    <div className="space-y-5">
      {phase === 'ROSTER_CUTS' && (
        <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-amber-200">
            <strong>Offseason Roster Compliance:</strong> Your roster currently has{' '}
            <strong>{userRoster.length}</strong> players. Release {Math.max(0, userRoster.length - 30)}{' '}
            player(s) to the Waiver Pool to reach the 30-man limit.
          </div>
          <button
            onClick={onConfirmCuts}
            disabled={userRoster.length > 30}
            className="px-4 py-2 rounded-lg bg-emerald-500 disabled:opacity-40 text-slate-950 font-bold text-xs cursor-pointer"
          >
            Confirm 30-Man Roster
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div>
          <h2 className="font-display text-xl font-bold text-white">
            {userTeam?.city} {userTeam?.name} · Active Roster ({userRoster.length}/30)
          </h2>
          <p className="text-xs text-slate-400">
            {hitterCount} Position Players · {pitcherCount} Pitchers · Click any player to open their dynamic scouting card
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
          {(['ALL', 'HITTERS', 'PITCHERS'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterType(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                filterType === tab ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 text-[11px]">
              <tr>
                <th className="py-3 px-4">Pos</th>
                <th className="py-3 px-3">Player</th>
                <th
                  className="py-3 px-2 text-center cursor-pointer hover:text-white"
                  onClick={() => setSortBy('age')}
                >
                  Age
                </th>
                <th className="py-3 px-2 text-center">B/T</th>
                <th
                  className="py-3 px-2 text-center cursor-pointer hover:text-white"
                  onClick={() => setSortBy('ovr')}
                >
                  OVR
                </th>
                <th
                  className="py-3 px-2 text-center cursor-pointer hover:text-white"
                  onClick={() => setSortBy('potential')}
                >
                  POT
                </th>
                <th className="py-3 px-3">Tool Grades</th>
                <th className="py-3 px-3 text-right">Season Stats</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.map((p) => {
                const statText = p.isPitcher
                  ? `${p.seasonStats.w || 0}-${p.seasonStats.l || 0} | ${getPitcherRatios(p.seasonStats).era} ERA | ${formatIP(p.seasonStats.ipOuts || 0)} IP | ${p.seasonStats.so || 0} SO | ${p.seasonStats.sv || 0} SV`
                  : `${getHitterSlash(p.seasonStats).avg}/${getHitterSlash(p.seasonStats).obp}/${getHitterSlash(p.seasonStats).slg} | ${p.seasonStats.hr || 0} HR | ${p.seasonStats.rbi || 0} RBI | ${p.seasonStats.sb || 0} SB`;
                return (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-4 font-mono font-bold text-sky-400">{p.position}</td>
                    <td
                      className="py-2.5 px-3 font-bold text-white cursor-pointer hover:text-sky-400"
                      onClick={() => onSelectPlayer(p)}
                    >
                      {p.name}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono text-slate-300">{p.age}</td>
                    <td className="py-2.5 px-2 text-center font-mono text-slate-400">
                      {p.bats}/{p.throws}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <RatingBadge value={p.ovr} />
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono text-amber-300">{p.potential}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-300">
                      {p.isPitcher
                        ? `VEL ${p.velocity} · CTL ${p.control} · FIN ${p.finesse}`
                        : `POW ${p.power} · SPD ${p.speed} · GLV ${p.glove}`}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-300">{statText}</td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => onReleasePlayer(p.id)}
                        className="px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition cursor-pointer"
                      >
                        Waive
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
