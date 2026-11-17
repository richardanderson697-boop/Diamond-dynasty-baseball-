import React, { useMemo, useState } from 'react';
import {
  DraftHistoryEntry,
  DraftPick,
  DraftSlot,
  GamePhase,
  Player,
  Team,
} from '../types/baseball';
import {
  formatMoney,
  getPlayerContractYears,
  getPlayerSalary,
  getRookieContractSalary,
  getTeamPayrollSummary,
  getTeamRosterNeeds,
  HARD_SALARY_CAP,
  MIN_PLAYER_SALARY,
  ROOKIE_CONTRACT_YEARS,
  roundMoney,
} from '../engine/baseballEngine';
import { RatingBadge, TeamBadge } from './SharedBadges';

interface DraftRoomViewProps {
  year: number;
  phase: GamePhase;
  userTeamId: string;
  userTeam: Team | undefined;
  teamMap: Record<string, Team>;
  draftOrder: DraftSlot[];
  currentPickIdx: number;
  draftPool: Player[];
  draftHistory: DraftHistoryEntry[];
  userRoster: Player[];
  draftPicks: DraftPick[];
  onUserPick: (playerId: string) => void;
  onPassPick: () => void;
  onSimNext: () => void;
  onSimToUser: () => void;
  onAutoDraftAll: () => void;
  onSelectPlayer: (p: Player) => void;
}

export function DraftRoomView({
  year,
  phase,
  userTeamId,
  userTeam,
  teamMap,
  draftOrder,
  currentPickIdx,
  draftPool,
  draftHistory,
  userRoster,
  draftPicks,
  onUserPick,
  onPassPick,
  onSimNext,
  onSimToUser,
  onAutoDraftAll,
  onSelectPlayer,
}: DraftRoomViewProps) {
  const [posFilter, setPosFilter] = useState('ALL');
  const isLiveDraft = phase === 'INAUGURAL_DRAFT' || phase === 'ROOKIE_DRAFT';
  const currentSlot = draftOrder[currentPickIdx];
  const isUserTurn = isLiveDraft && currentSlot?.teamId === userTeamId;

  const { counts, totalHitters, totalPitchers } = useMemo(
    () => getTeamRosterNeeds(userRoster),
    [userRoster]
  );

  const capSummary = useMemo(
    () => getTeamPayrollSummary(userTeam, userRoster),
    [userTeam, userRoster]
  );

  const rookieSlotSalary =
    phase === 'ROOKIE_DRAFT' && currentSlot ? getRookieContractSalary(currentSlot.round) : 0;
  const remainingInauguralReserve =
    phase === 'INAUGURAL_DRAFT'
      ? roundMoney(Math.max(0, 30 - userRoster.length - 1) * MIN_PLAYER_SALARY)
      : 0;
  const maxSpendThisPick =
    phase === 'INAUGURAL_DRAFT'
      ? roundMoney(HARD_SALARY_CAP - capSummary.totalPayroll - remainingInauguralReserve)
      : capSummary.capSpace;

  const rookieSlotBlockedByCap =
    isUserTurn &&
    phase === 'ROOKIE_DRAFT' &&
    roundMoney(capSummary.totalPayroll + rookieSlotSalary) > HARD_SALARY_CAP;

  const visiblePool = useMemo(() => {
    return draftPool
      .filter((p) => {
        if (posFilter === 'ALL') return true;
        if (posFilter === 'HITTERS') return !p.isPitcher;
        if (posFilter === 'PITCHERS') return p.isPitcher;
        return p.position === posFilter;
      })
      .slice(0, 120);
  }, [draftPool, posFilter]);

  if (!isLiveDraft) {
    return (
      <div className="space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-xl font-bold text-white mb-1">
            Future Draft Picks &amp; Recent Draft Log
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Annual 5-round Rookie Draft order is strictly determined by reverse regular-season standings. Rookie contracts are 3 years ($3.50M Rd 1, $1.75M Rd 2, $0.75M Rds 3–5).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[year + 1, year + 2, year + 3].map((yr) => {
              const owned = draftPicks.filter(
                (pk) => pk.year === yr && pk.ownerTeamId === userTeamId
              );
              return (
                <div key={yr} className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                  <div className="text-sm font-bold text-sky-400 mb-2">
                    {yr} Rookie Draft Picks ({owned.length})
                  </div>
                  <div className="space-y-1.5">
                    {owned.map((pk) => (
                      <div key={pk.id} className="text-xs flex justify-between text-slate-300 font-mono tabular-nums">
                        <span>
                          Round {pk.round} ({formatMoney(getRookieContractSalary(pk.round))}/3y)
                        </span>
                        <span>
                          {pk.originalTeamId === userTeamId ? 'Own Pick' : `via ${pk.originalTeamId}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {draftHistory.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-bold text-white mb-3">Most Recent Draft Selections</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 max-h-96 overflow-y-auto">
              {draftHistory.slice(0, 64).map((h) => (
                <div
                  key={h.pickNum}
                  className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs flex items-center justify-between"
                >
                  <div className="truncate">
                    <span className="text-slate-500 font-mono mr-1.5">#{h.pickNum}</span>
                    <strong className="text-sky-400 mr-1.5 font-mono">{h.teamId}</strong>
                    <span className="text-white font-semibold">{h.player.name}</span>
                  </div>
                  <RatingBadge value={h.player.ovr} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-emerald-400 mb-1">
              {phase === 'INAUGURAL_DRAFT'
                ? '30-Round Inaugural Fantasy Draft ($180.0M Hard Cap)'
                : `${year} 5-Round Rookie Prospect Draft (${formatMoney(rookieSlotSalary)} · ${ROOKIE_CONTRACT_YEARS}y slot)`}
            </div>
            <h2 className="font-display text-2xl font-extrabold text-white flex items-center gap-2.5 flex-wrap">
              On the Clock:
              {currentSlot && (
                <>
                  <TeamBadge team={teamMap[currentSlot.teamId]} size="lg" />
                  <span>
                    {teamMap[currentSlot.teamId]?.city} {teamMap[currentSlot.teamId]?.name}
                  </span>
                  <span className="text-sm font-mono font-normal text-slate-400">
                    (Rd {currentSlot.round} · Pick #{currentSlot.pickNum} of {draftOrder.length})
                  </span>
                </>
              )}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {rookieSlotBlockedByCap && (
              <button
                onClick={onPassPick}
                className="px-3.5 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                Pass Pick (Cap Full)
              </button>
            )}
            <button
              onClick={onSimNext}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 cursor-pointer whitespace-nowrap"
            >
              Sim Next Pick
            </button>
            <button
              onClick={onSimToUser}
              className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              Sim to My Turn
            </button>
            <button
              onClick={onAutoDraftAll}
              className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              Auto-Draft Rest
            </button>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-300 mr-1 font-mono tabular-nums">
            Roster ({userRoster.length}/30 · {totalHitters}H / {totalPitchers}P) · Payroll {formatMoney(capSummary.totalPayroll)} · Cap Space{' '}
            <span className={capSummary.capSpace < 5 ? 'text-amber-300' : 'text-emerald-400'}>
              {formatMoney(capSummary.capSpace)}
            </span>
            {phase === 'INAUGURAL_DRAFT' && (
              <span className="text-slate-400"> · Max Pick Budget {formatMoney(maxSpendThisPick)}</span>
            )}
          </span>
        </div>

        {rookieSlotBlockedByCap && (
          <div className="mt-3 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3.5 py-2 text-xs text-rose-200">
            Insufficient cap space for Round {currentSlot?.round} rookie slot ({formatMoney(rookieSlotSalary)}). Release a player in Roster tab or pass this pick.
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          {['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP', 'RP'].map((pos) => (
            <span
              key={pos}
              className={`px-2 py-0.5 rounded font-mono border ${
                (counts[pos] || 0) === 0
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : 'bg-slate-950 text-slate-300 border-slate-800'
              }`}
            >
              {pos}: {counts[pos] || 0}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-white text-sm">
              Available Draft Pool ({draftPool.length} Remaining)
            </h3>
            <div className="flex flex-wrap gap-1">
              {['ALL', 'HITTERS', 'PITCHERS', 'C', '1B', '2B', '3B', 'SS', 'SP', 'RP'].map((f) => (
                <button
                  key={f}
                  onClick={() => setPosFilter(f)}
                  className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                    posFilter === f ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Pos</th>
                  <th className="py-2.5 px-3">Player</th>
                  <th className="py-2.5 px-2 text-center">Age</th>
                  <th className="py-2.5 px-2 text-center">B/T</th>
                  <th className="py-2.5 px-2 text-center">OVR</th>
                  <th className="py-2.5 px-2 text-center">POT</th>
                  <th className="py-2.5 px-3 text-right">Contract</th>
                  <th className="py-2.5 px-3">Attributes</th>
                  <th className="py-2.5 px-3 text-right">Draft</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {visiblePool.map((p) => {
                  const sal =
                    phase === 'ROOKIE_DRAFT' ? rookieSlotSalary : getPlayerSalary(p);
                  const yrs =
                    phase === 'ROOKIE_DRAFT' ? ROOKIE_CONTRACT_YEARS : getPlayerContractYears(p);
                  const unaffordable =
                    isUserTurn &&
                    (phase === 'ROOKIE_DRAFT'
                      ? rookieSlotBlockedByCap
                      : sal > maxSpendThisPick + 0.001);
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-mono font-bold text-sky-400">{p.position}</td>
                      <td
                        className="py-2 px-3 font-bold text-white cursor-pointer hover:text-sky-400"
                        onClick={() => onSelectPlayer(p)}
                      >
                        {p.name}
                      </td>
                      <td className="py-2 px-2 text-center font-mono tabular-nums">{p.age}</td>
                      <td className="py-2 px-2 text-center font-mono text-slate-400">
                        {p.bats}/{p.throws}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <RatingBadge value={p.ovr} />
                      </td>
                      <td className="py-2 px-2 text-center font-mono tabular-nums text-amber-300">
                        {p.potential}
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                          unaffordable ? 'text-rose-400' : 'text-slate-200'
                        }`}
                      >
                        {formatMoney(sal)} · {yrs}y
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {p.isPitcher
                          ? `VEL ${p.velocity} · CTL ${p.control} · FIN ${p.finesse}`
                          : `POW ${p.power} · SPD ${p.speed} · GLV ${p.glove}`}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          disabled={!isUserTurn || unaffordable}
                          onClick={() => onUserPick(p.id)}
                          className="px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed text-slate-950 font-bold text-[11px] cursor-pointer whitespace-nowrap"
                        >
                          {unaffordable ? 'Over Cap' : 'Draft'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col">
          <h3 className="font-bold text-white text-sm mb-3">Draft Ticker</h3>
          <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
            {draftHistory.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-8">Waiting for Pick #1...</div>
            ) : (
              draftHistory.slice(0, 60).map((entry) => (
                <div
                  key={entry.pickNum}
                  className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                    entry.teamId === userTeamId
                      ? 'bg-sky-500/15 border-sky-500/40'
                      : 'bg-slate-950/70 border-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                      Rd {entry.round} · #{entry.pickNum} · <strong className="text-white">{entry.teamId}</strong> · {formatMoney(getPlayerSalary(entry.player))}
                    </div>
                    <div className="font-bold text-slate-100 truncate mt-0.5">
                      [{entry.player.position}] {entry.player.name}{' '}
                      <span className="text-slate-400 font-normal">({entry.player.age}y)</span>
                    </div>
                  </div>
                  <RatingBadge value={entry.player.ovr} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

