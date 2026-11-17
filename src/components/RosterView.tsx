import React, { useMemo, useState } from 'react';
import { GamePhase, Player, Team } from '../types/baseball';
import {
  calculateExtensionOffer,
  computeReleaseDeadCap,
  formatIP,
  formatMoney,
  getHitterSlash,
  getPitcherRatios,
  getPlayerContractYears,
  getPlayerEffectiveCapHit,
  getPlayerSalary,
  getTeamPayrollSummary,
  HARD_SALARY_CAP,
  isCapMoveLegal,
  isPlayerOnIL,
  roundMoney,
} from '../engine/baseballEngine';
import { RatingBadge } from './SharedBadges';

interface RosterViewProps {
  userTeam: Team | undefined;
  userRoster: Player[];
  phase: GamePhase;
  onReleasePlayer: (id: string) => void;
  onExtendPlayer: (id: string, years: number) => void;
  onPlaceOnIL: (id: string, tier: '15' | '60') => void;
  onActivateFromIL: (id: string) => void;
  onConfirmCuts: () => void;
  onSelectPlayer: (p: Player) => void;
}

export function RosterView({
  userTeam,
  userRoster,
  phase,
  onReleasePlayer,
  onExtendPlayer,
  onPlaceOnIL,
  onActivateFromIL,
  onConfirmCuts,
  onSelectPlayer,
}: RosterViewProps) {
  const [filterType, setFilterType] = useState<'ALL' | 'HITTERS' | 'PITCHERS' | 'IL'>('ALL');
  const [sortBy, setSortBy] = useState<'ovr' | 'potential' | 'age' | 'salary'>('ovr');
  const [extendingPlayer, setExtendingPlayer] = useState<Player | null>(null);
  const [extendYears, setExtendYears] = useState(3);

  const summary = useMemo(
    () => getTeamPayrollSummary(userTeam, userRoster),
    [userTeam, userRoster]
  );

  const activeRoster = useMemo(
    () => userRoster.filter((p) => !isPlayerOnIL(p)),
    [userRoster]
  );
  const ilRoster = useMemo(
    () => userRoster.filter((p) => isPlayerOnIL(p)),
    [userRoster]
  );

  const filtered = useMemo(() => {
    let list = [...userRoster];
    if (filterType === 'HITTERS') list = list.filter((p) => !p.isPitcher && !isPlayerOnIL(p));
    if (filterType === 'PITCHERS') list = list.filter((p) => p.isPitcher && !isPlayerOnIL(p));
    if (filterType === 'IL') list = list.filter((p) => isPlayerOnIL(p));
    list.sort((a, b) => {
      if (sortBy === 'salary') return getPlayerSalary(b) - getPlayerSalary(a);
      return (b[sortBy] || 0) - (a[sortBy] || 0);
    });
    return list;
  }, [userRoster, filterType, sortBy]);

  const hitterCount = activeRoster.filter((p) => !p.isPitcher).length;
  const pitcherCount = activeRoster.filter((p) => p.isPitcher).length;
  const injuredActiveCount = activeRoster.filter((p) => Boolean(p.injury && p.injury.daysRemaining > 0)).length;

  const extendOffer = extendingPlayer
    ? calculateExtensionOffer(extendingPlayer, extendYears)
    : null;
  const extendPostPayroll =
    extendingPlayer && extendOffer
      ? roundMoney(
          summary.totalPayroll - getPlayerEffectiveCapHit(extendingPlayer) + extendOffer.salary
        )
      : summary.totalPayroll;
  const extendBlockedByCap = !isCapMoveLegal(summary.totalPayroll, extendPostPayroll);

  return (
    <div className="space-y-5">
      {phase === 'ROSTER_CUTS' && (
        <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-amber-200">
            <strong>Offseason Roster Compliance:</strong> Your active roster currently has{' '}
            <strong className="font-mono">{activeRoster.length}</strong> players and{' '}
            <strong className="font-mono">{formatMoney(summary.totalPayroll)}</strong> payroll.
            {activeRoster.length > 30 &&
              ` Release ${activeRoster.length - 30} player(s) to reach the 30-man limit.`}
            {summary.overCap &&
              ` Trim ${formatMoney(roundMoney(summary.totalPayroll - HARD_SALARY_CAP))} to get under the $180.00M hard cap.`}
          </div>
          <button
            onClick={onConfirmCuts}
            disabled={activeRoster.length > 30 || summary.overCap}
            className="px-4 py-2 rounded-lg bg-emerald-500 disabled:opacity-40 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap"
          >
            Confirm 30-Man Roster
          </button>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              {userTeam?.city} {userTeam?.name} · Active Roster ({activeRoster.length}/30)
              {ilRoster.length > 0 && (
                <span className="ml-2 text-sm font-mono text-amber-300">
                  + {ilRoster.length} IL
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400">
              {hitterCount} Active Hitters · {pitcherCount} Active Pitchers
              {injuredActiveCount > 0 && (
                <span className="text-amber-300"> · {injuredActiveCount} Injured (Eligible for IL/Rest)</span>
              )}
              {' · '}Click any player for their scouting card
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
            {(['ALL', 'HITTERS', 'PITCHERS', 'IL'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilterType(tab)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  filterType === tab ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab === 'IL' ? `IL (${ilRoster.length})` : tab}
              </button>
            ))}
          </div>
        </div>

        {/* Payroll & Cap Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-slate-800">
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-[11px] text-slate-400">Total Payroll</div>
            <div
              className={`text-sm font-extrabold font-mono tabular-nums ${
                summary.overCap ? 'text-rose-400' : summary.underFloor ? 'text-amber-300' : 'text-white'
              }`}
            >
              {formatMoney(summary.totalPayroll)} <span className="text-slate-500 font-normal">/ $180.0M</span>
            </div>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-[11px] text-slate-400">Cap Space</div>
            <div
              className={`text-sm font-extrabold font-mono tabular-nums ${
                summary.capSpace < 0 ? 'text-rose-400' : summary.capSpace < 5 ? 'text-amber-300' : 'text-emerald-400'
              }`}
            >
              {formatMoney(summary.capSpace)}
            </div>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-[11px] text-slate-400">IL Cap Relief</div>
            <div className="text-sm font-extrabold font-mono tabular-nums text-sky-300">
              {summary.ilRelief > 0 ? `+${formatMoney(summary.ilRelief)}` : '$0.00M'}
            </div>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-[11px] text-slate-400">Dead Cap</div>
            <div className="text-sm font-extrabold font-mono tabular-nums text-rose-300">
              {formatMoney(summary.deadCap)}
            </div>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-[11px] text-slate-400">$90.0M Floor Check</div>
            <div
              className={`text-xs font-bold font-mono tabular-nums mt-0.5 ${
                summary.underFloor ? 'text-amber-300' : 'text-emerald-400'
              }`}
            >
              {summary.underFloor ? `Short ${formatMoney(summary.floorShortfall)}` : 'Compliant'}
            </div>
          </div>
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
                <th className="py-3 px-2 text-center">Status</th>
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
                <th
                  className="py-3 px-3 text-right cursor-pointer hover:text-white"
                  onClick={() => setSortBy('salary')}
                >
                  Contract
                </th>
                <th className="py-3 px-3">Tool Grades</th>
                <th className="py-3 px-3 text-right">Season Stats</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.map((p) => {
                const sal = getPlayerSalary(p);
                const effCap = getPlayerEffectiveCapHit(p);
                const yrs = getPlayerContractYears(p);
                const deadHit = computeReleaseDeadCap(p);
                const inj = p.injury;
                const onIL = isPlayerOnIL(p);
                const statText = p.isPitcher
                  ? `${p.seasonStats.w || 0}-${p.seasonStats.l || 0} | ${getPitcherRatios(p.seasonStats).era} ERA | ${formatIP(p.seasonStats.ipOuts || 0)} IP | ${p.seasonStats.so || 0} SO`
                  : `${getHitterSlash(p.seasonStats).avg}/${getHitterSlash(p.seasonStats).ops} | ${p.seasonStats.hr || 0} HR | ${p.seasonStats.rbi || 0} RBI`;
                return (
                  <tr
                    key={p.id}
                    className={`transition ${
                      onIL ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono font-bold text-sky-400">{p.position}</td>
                    <td
                      className="py-2.5 px-3 font-bold text-white cursor-pointer hover:text-sky-400"
                      onClick={() => onSelectPlayer(p)}
                    >
                      <div>{p.name}</div>
                      {inj && (
                        <div className="text-[10px] font-normal text-amber-300 mt-0.5">
                          {inj.type}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono tabular-nums text-slate-300">
                      {p.age}
                    </td>
                    <td className="py-2.5 px-2 text-center whitespace-nowrap">
                      {inj ? (
                        inj.onIL ? (
                          <span
                            className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border ${
                              inj.daysRemaining <= 0
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                            }`}
                          >
                            {inj.daysRemaining <= 0
                              ? `${inj.onIL}d IL · READY`
                              : `${inj.onIL}d IL · ${inj.daysRemaining}d`}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/35">
                            {inj.severity} · {inj.daysRemaining}d
                          </span>
                        )
                      ) : (
                        <span className="text-[11px] font-mono text-slate-400">
                          {p.bats}/{p.throws}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <RatingBadge value={p.ovr} />
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono tabular-nums text-amber-300">
                      {p.potential}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <span className="text-white font-semibold">{formatMoney(sal)}</span>
                      <span className="text-slate-400 ml-1">· {yrs}y</span>
                      {onIL && effCap !== sal && (
                        <div className="text-[10px] text-sky-300">Cap Hit {formatMoney(effCap)}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {p.isPitcher
                        ? `VEL ${p.velocity} · CTL ${p.control} · FIN ${p.finesse}`
                        : `POW ${p.power} · SPD ${p.speed} · GLV ${p.glove}`}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {statText}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {inj && !inj.onIL && (inj.severity === 'IL15' || inj.severity === 'IL60') && (
                          <button
                            onClick={() => onPlaceOnIL(p.id, inj.severity === 'IL60' ? '60' : '15')}
                            title={
                              inj.severity === 'IL60'
                                ? 'Place on 60-Day IL: frees 1 active roster spot & refunds 100% salary to Cap Space'
                                : 'Place on 15-Day IL: frees 1 active roster spot & refunds 50% salary to Cap Space'
                            }
                            className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-500/40 text-[11px] font-bold transition cursor-pointer"
                          >
                            {inj.severity === 'IL60' ? '60d IL (100%)' : '15d IL (50%)'}
                          </button>
                        )}
                        {inj && inj.onIL && (
                          <button
                            disabled={inj.daysRemaining > 0}
                            onClick={() => onActivateFromIL(p.id)}
                            title={
                              inj.daysRemaining > 0
                                ? `Rehabbing: ${inj.daysRemaining} day(s) remaining before activation`
                                : 'Activate player back onto 30-man active roster'
                            }
                            className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/35 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-300 border border-emerald-500/40 text-[11px] font-bold transition cursor-pointer"
                          >
                            {inj.daysRemaining > 0 ? `IL (${inj.daysRemaining}d)` : 'Activate'}
                          </button>
                        )}
                        {yrs <= 2 && !onIL && (
                          <button
                            onClick={() => {
                              setExtendingPlayer(p);
                              setExtendYears(3);
                            }}
                            className="px-2 py-1 rounded bg-sky-500/15 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 text-[11px] font-semibold transition cursor-pointer"
                          >
                            Extend
                          </button>
                        )}
                        <button
                          onClick={() => onReleasePlayer(p.id)}
                          title={`Removes 100% active salary and adds ${formatMoney(deadHit)} (50% current-yr salary) to Dead Cap. Wiped to $0 if claimed off waivers within 2 days.`}
                          className="px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition cursor-pointer"
                        >
                          Waive (+{formatMoney(deadHit)})
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contract Extension Modal */}
      {extendingPlayer && extendOffer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setExtendingPlayer(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-lg font-bold text-white">Contract Extension Offer</h3>
              <p className="text-xs text-slate-400 mt-1">
                {extendingPlayer.position} <strong className="text-white">{extendingPlayer.name}</strong> ({extendingPlayer.ovr} OVR · Age {extendingPlayer.age})
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono tabular-nums space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Current Deal</span>
                <span className="text-slate-200">
                  {formatMoney(getPlayerSalary(extendingPlayer))} / {getPlayerContractYears(extendingPlayer)} yr(s)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Proposed Extension</span>
                <span className="text-sky-400 font-bold">
                  {formatMoney(extendOffer.salary)} / {extendYears} yr(s)
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-1.5">
                <span className="text-slate-400">Post-Extension Payroll</span>
                <span className={extendBlockedByCap ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {formatMoney(extendPostPayroll)} / $180.00M
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Extension Length</label>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((y) => (
                  <button
                    key={y}
                    onClick={() => setExtendYears(y)}
                    className={`py-2 rounded-lg text-xs font-mono font-bold border cursor-pointer ${
                      extendYears === y
                        ? 'bg-sky-500 text-slate-950 border-sky-400'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    {y}y
                  </button>
                ))}
              </div>
            </div>

            {extendBlockedByCap && (
              <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5">
                Extension blocked: exceeds the $180.00M Hard Salary Cap without lowering payroll.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setExtendingPlayer(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={extendBlockedByCap}
                onClick={() => {
                  onExtendPlayer(extendingPlayer.id, extendYears);
                  setExtendingPlayer(null);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-bold cursor-pointer"
              >
                Sign Extension
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


