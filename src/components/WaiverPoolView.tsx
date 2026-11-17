import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Player, Team } from '../types/baseball';
import {
  computeReleaseDeadCap,
  formatMoney,
  getPlayerContractYears,
  getPlayerEffectiveCapHit,
  getPlayerSalary,
  getTeamPayrollSummary,
  isActiveWaiverClaim,
  isCapMoveLegal,
  isPlayerOnIL,
  MIN_PLAYER_SALARY,
  roundMoney,
} from '../engine/baseballEngine';
import { RatingBadge, TeamBadge } from './SharedBadges';

interface WaiverPoolViewProps {
  waiverPool: Player[];
  currentDay: number;
  teamMap: Record<string, Team>;
  userTeam: Team | undefined;
  userRoster: Player[];
  onClaimAndDrop: (claimId: string, dropId: string | null) => void;
  onSelectPlayer: (p: Player) => void;
}

export function WaiverPoolView({
  waiverPool,
  currentDay,
  teamMap,
  userTeam,
  userRoster,
  onClaimAndDrop,
  onSelectPlayer,
}: WaiverPoolViewProps) {
  const [poolTab, setPoolTab] = useState<'WAIVERS' | 'FREE_AGENTS'>('WAIVERS');
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [handFilter, setHandFilter] = useState('ALL');
  const [claimingPlayer, setClaimingPlayer] = useState<Player | null>(null);
  const [selectedDropId, setSelectedDropId] = useState('');

  const summary = useMemo(
    () => getTeamPayrollSummary(userTeam, userRoster),
    [userTeam, userRoster]
  );

  const activeRoster = useMemo(
    () => userRoster.filter((p) => !isPlayerOnIL(p)),
    [userRoster]
  );

  const activeWaivers = useMemo(
    () => waiverPool.filter((p) => isActiveWaiverClaim(p, currentDay)),
    [waiverPool, currentDay]
  );

  const freeAgentsPool = useMemo(
    () => waiverPool.filter((p) => !isActiveWaiverClaim(p, currentDay)),
    [waiverPool, currentDay]
  );

  const activeList = poolTab === 'WAIVERS' ? activeWaivers : freeAgentsPool;

  const filteredList = useMemo(() => {
    return activeList
      .filter((p) => {
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (posFilter === 'PITCHERS' && !p.isPitcher) return false;
        if (posFilter === 'HITTERS' && p.isPitcher) return false;
        if (!['ALL', 'PITCHERS', 'HITTERS'].includes(posFilter) && p.position !== posFilter) return false;
        if (handFilter !== 'ALL' && p.throws !== handFilter && p.bats !== handFilter) return false;
        return true;
      })
      .slice(0, 120);
  }, [activeList, search, posFilter, handFilter]);

  const openClaimModal = (player: Player) => {
    setClaimingPlayer(player);
    const lowest = [...activeRoster].sort((a, b) => a.ovr - b.ovr)[0];
    setSelectedDropId(lowest ? lowest.id : '');
  };

  const selectedDropPlayer =
    activeRoster.length >= 30
      ? activeRoster.find((rp) => rp.id === selectedDropId) || null
      : null;

  const isClaimActiveWaiver = claimingPlayer
    ? isActiveWaiverClaim(claimingPlayer, currentDay)
    : false;
  const claimSalary = claimingPlayer
    ? isClaimActiveWaiver
      ? getPlayerSalary(claimingPlayer)
      : MIN_PLAYER_SALARY
    : 0;
  const dropSalary = selectedDropPlayer ? getPlayerEffectiveCapHit(selectedDropPlayer) : 0;
  const dropDeadCap = selectedDropPlayer ? computeReleaseDeadCap(selectedDropPlayer) : 0;
  const postClaimPayroll = claimingPlayer
    ? roundMoney(summary.totalPayroll + claimSalary - dropSalary + dropDeadCap)
    : summary.totalPayroll;
  const claimLegal = isCapMoveLegal(summary.totalPayroll, postClaimPayroll);
  const claimBlockedByCap = !claimLegal;
  const isOverCapReduction =
    summary.overCap && claimLegal && postClaimPayroll < summary.totalPayroll;

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              Waiver Wire &amp; Undrafted Free Agents
            </h2>
            <p className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
              Active Spots: <span className="text-white">{activeRoster.length}/30</span> · Cap Space:{' '}
              <span className={summary.capSpace < 0 ? 'text-rose-400' : summary.capSpace < 2 ? 'text-amber-300' : 'text-emerald-400'}>
                {formatMoney(summary.capSpace)}
              </span>{' '}
              · Payroll {formatMoney(summary.totalPayroll)} / $180.00M
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search player..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <select
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
            >
              <option value="ALL">All Positions</option>
              <option value="HITTERS">All Hitters</option>
              <option value="PITCHERS">All Pitchers</option>
              {['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP', 'RP'].map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>

            <select
              value={handFilter}
              onChange={(e) => setHandFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
            >
              <option value="ALL">L / R / S</option>
              <option value="L">Left-Handed (L)</option>
              <option value="R">Right-Handed (R)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800">
            <button
              onClick={() => setPoolTab('WAIVERS')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                poolTab === 'WAIVERS'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Active Waivers ({activeWaivers.length})
            </button>
            <button
              onClick={() => setPoolTab('FREE_AGENTS')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                poolTab === 'FREE_AGENTS'
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Undrafted / Free Agents ({freeAgentsPool.length})
            </button>
          </div>
          <span className="text-[11px] text-slate-400">
            {poolTab === 'WAIVERS'
              ? 'Released within 2 days — claiming assumes existing AAV/yrs and wipes waiving team dead cap to $0.'
              : 'Cleared waivers & undrafted pool — signable immediately to 1-yr $0.75M minimum deals.'}
          </span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {filteredList.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            {poolTab === 'WAIVERS'
              ? 'No players currently on the 2-day Active Waiver Wire. Check Undrafted / Free Agents for $0.75M minimum depth signings.'
              : 'No matching free agents found.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 text-[11px]">
                <tr>
                  <th className="py-3 px-4">Pos</th>
                  <th className="py-3 px-3">Player</th>
                  {poolTab === 'WAIVERS' && <th className="py-3 px-3">Waived By</th>}
                  <th className="py-3 px-2 text-center">Age</th>
                  <th className="py-3 px-2 text-center">B/T</th>
                  <th className="py-3 px-2 text-center">OVR</th>
                  <th className="py-3 px-2 text-center">POT</th>
                  <th className="py-3 px-3 text-right">
                    {poolTab === 'WAIVERS' ? 'Contract AAV' : 'Min Deal'}
                  </th>
                  <th className="py-3 px-3">Scouting Grades</th>
                  <th className="py-3 px-4 text-right">Transaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredList.map((p) => {
                  const sal = poolTab === 'WAIVERS' ? getPlayerSalary(p) : MIN_PLAYER_SALARY;
                  const yrs = poolTab === 'WAIVERS' ? getPlayerContractYears(p) : 1;
                  const daysLeft =
                    typeof p.waiverExpiresDay === 'number'
                      ? Math.max(0, p.waiverExpiresDay - currentDay)
                      : 0;
                  const waivingTeam = p.waivedByTeamId ? teamMap[p.waivedByTeamId] : null;
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-mono font-bold text-sky-400">{p.position}</td>
                      <td
                        className="py-2.5 px-3 font-bold text-white cursor-pointer hover:text-sky-400"
                        onClick={() => onSelectPlayer(p)}
                      >
                        {p.name}
                      </td>
                      {poolTab === 'WAIVERS' && (
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <TeamBadge team={waivingTeam} size="sm" />
                            <span className="font-mono text-[11px] text-amber-300">
                              Clears D{p.waiverExpiresDay} ({daysLeft}d)
                            </span>
                          </div>
                        </td>
                      )}
                      <td className="py-2.5 px-2 text-center font-mono tabular-nums">{p.age}</td>
                      <td className="py-2.5 px-2 text-center font-mono text-slate-400">
                        {p.bats}/{p.throws}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <RatingBadge value={p.ovr} />
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono tabular-nums text-amber-300">
                        {p.potential}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className={poolTab === 'FREE_AGENTS' ? 'text-emerald-300 font-semibold' : 'text-white font-semibold'}>
                          {formatMoney(sal)}
                        </span>
                        <span className="text-slate-400 ml-1">· {yrs}y</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-300">
                        {p.isPitcher
                          ? `VEL ${p.velocity} · CTL ${p.control} · FIN ${p.finesse}`
                          : `POW ${p.power} · SPD ${p.speed} · GLV ${p.glove}`}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() => openClaimModal(p)}
                          className={`px-3 py-1 rounded-lg font-semibold text-xs transition cursor-pointer whitespace-nowrap border ${
                            poolTab === 'WAIVERS'
                              ? 'bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border-amber-500/40'
                              : 'bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border-emerald-500/40'
                          }`}
                        >
                          {poolTab === 'WAIVERS' ? 'Claim Waiver' : 'Sign Min ($0.75M)'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {claimingPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-lg font-bold text-white">
                {isClaimActiveWaiver ? 'Complete Active Waiver Claim' : 'Sign Minimum Free Agent'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {isClaimActiveWaiver ? 'Claiming' : 'Signing'}{' '}
                <strong className="text-emerald-400">
                  {claimingPlayer.position} {claimingPlayer.name} ({claimingPlayer.ovr} OVR · {formatMoney(claimSalary)} /{' '}
                  {isClaimActiveWaiver ? `${getPlayerContractYears(claimingPlayer)}y` : '1y Min'})
                </strong>
                .
                {activeRoster.length >= 30
                  ? ' Select a player from your 30-man active roster to waive:'
                  : ' You have an open active roster spot.'}
              </p>
            </div>

            {activeRoster.length >= 30 && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Player to Waive / Drop
                </label>
                <select
                  value={selectedDropId}
                  onChange={(e) => setSelectedDropId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                >
                  {[...activeRoster]
                    .sort((a, b) => a.ovr - b.ovr)
                    .map((rp) => {
                      const dead = computeReleaseDeadCap(rp);
                      return (
                        <option key={rp.id} value={rp.id}>
                          [{rp.position}] {rp.name} — {rp.ovr} OVR · {formatMoney(getPlayerSalary(rp))} (+{formatMoney(dead)} dead)
                        </option>
                      );
                    })}
                </select>
              </div>
            )}

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono tabular-nums space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Current Payroll</span>
                <span className="text-slate-200">{formatMoney(summary.totalPayroll)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Incoming Salary</span>
                <span className="text-emerald-400">+{formatMoney(claimSalary)}</span>
              </div>
              {selectedDropPlayer && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Waived Salary Relief</span>
                    <span className="text-sky-400">-{formatMoney(dropSalary)}</span>
                  </div>
                  {dropDeadCap > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Dead Cap (50% 1yr, $0 if claimed)</span>
                      <span className="text-rose-400">+{formatMoney(dropDeadCap)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between border-t border-slate-800 pt-1.5">
                <span className="text-slate-300 font-bold">Post-Move Payroll</span>
                <span
                  className={
                    claimBlockedByCap
                      ? 'text-rose-400 font-bold'
                      : isOverCapReduction
                      ? 'text-emerald-400 font-bold'
                      : 'text-white font-bold'
                  }
                >
                  {formatMoney(postClaimPayroll)} / $180.00M
                </span>
              </div>
            </div>

            {isOverCapReduction && (
              <div className="text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5">
                Over-Cap Reduction Allowed: Move lowers payroll by{' '}
                {formatMoney(roundMoney(summary.totalPayroll - postClaimPayroll))}.
              </div>
            )}

            {claimBlockedByCap && (
              <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5">
                {summary.overCap
                  ? 'Blocked: Already over $180.00M — post-move payroll must be lower than current payroll.'
                  : 'Blocked: This move pushes your payroll over the $180.00M Hard Cap.'}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setClaimingPlayer(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={claimBlockedByCap}
                onClick={() => {
                  onClaimAndDrop(claimingPlayer.id, activeRoster.length >= 30 ? selectedDropId : null);
                  setClaimingPlayer(null);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-bold cursor-pointer"
              >
                Confirm {isClaimActiveWaiver ? 'Waiver Claim' : 'Signing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


