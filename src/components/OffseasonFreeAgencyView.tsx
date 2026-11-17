import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Search, Sparkles, UserPlus } from 'lucide-react';
import { DraftSlot, Player, Team } from '../types/baseball';
import {
  calculateExtensionOffer,
  computeReleaseDeadCap,
  formatMoney,
  getPlayerContractYears,
  getPlayerSalary,
  getRookieContractSalary,
  getTeamPayrollSummary,
  HARD_SALARY_CAP,
  roundMoney,
  SALARY_FLOOR,
} from '../engine/baseballEngine';
import { RatingBadge, TeamBadge } from './SharedBadges';

interface OffseasonFreeAgencyViewProps {
  year: number;
  userTeam: Team | undefined;
  teams: Team[];
  players: Player[];
  userRoster: Player[];
  freeAgents: Player[];
  draftOrder: DraftSlot[];
  onSignFreeAgent: (playerId: string, years: number) => void;
  onReleasePlayer: (playerId: string) => void;
  onProceedToDraft: () => void;
  onSelectPlayer: (p: Player) => void;
}

export function OffseasonFreeAgencyView({
  year,
  userTeam,
  teams,
  players,
  userRoster,
  freeAgents,
  draftOrder,
  onSignFreeAgent,
  onReleasePlayer,
  onProceedToDraft,
  onSelectPlayer,
}: OffseasonFreeAgencyViewProps) {
  const [subTab, setSubTab] = useState<'RESIGN' | 'MARKET' | 'ROSTER' | 'LEAGUE'>('RESIGN');
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [termByPlayer, setTermByPlayer] = useState<Record<string, number>>({});

  const userSummary = useMemo(
    () => getTeamPayrollSummary(userTeam, userRoster),
    [userTeam, userRoster]
  );

  const userRookieReserve = useMemo(() => {
    const mySlots = draftOrder.filter((s) => s.teamId === userTeam?.id);
    return roundMoney(mySlots.reduce((s, slot) => s + getRookieContractSalary(slot.round), 0));
  }, [draftOrder, userTeam?.id]);

  const expiringUserPlayers = useMemo(
    () =>
      freeAgents
        .filter((p) => p.previousTeamId === userTeam?.id)
        .sort((a, b) => b.ovr - a.ovr),
    [freeAgents, userTeam?.id]
  );

  const filteredMarket = useMemo(() => {
    return freeAgents
      .filter((p) => {
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (posFilter === 'HITTERS' && p.isPitcher) return false;
        if (posFilter === 'PITCHERS' && !p.isPitcher) return false;
        if (!['ALL', 'HITTERS', 'PITCHERS'].includes(posFilter) && p.position !== posFilter) return false;
        return true;
      })
      .slice(0, 120);
  }, [freeAgents, search, posFilter]);

  const leagueCapRows = useMemo(() => {
    const byTeam: Record<string, Player[]> = {};
    teams.forEach((t) => {
      byTeam[t.id] = [];
    });
    players.forEach((p) => {
      if (p.teamId && byTeam[p.teamId]) byTeam[p.teamId].push(p);
    });
    return teams
      .map((t) => {
        const roster = byTeam[t.id] || [];
        return {
          team: t,
          rosterCount: roster.length,
          summary: getTeamPayrollSummary(t, roster),
        };
      })
      .sort((a, b) => b.summary.totalPayroll - a.summary.totalPayroll);
  }, [teams, players]);

  const getSelectedTerm = (p: Player, defaultYears = 2) =>
    termByPlayer[p.id] ?? (p.age >= 34 ? 1 : defaultYears);

  const capPct = Math.min(100, Math.round((userSummary.totalPayroll / HARD_SALARY_CAP) * 100));

  return (
    <div className="space-y-5">
      {/* Offseason Cap & Floor Command Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-sky-400 mb-0.5">
              {year} Offseason · Pre-Draft Re-Sign &amp; Free Agency
            </div>
            <h2 className="font-display text-2xl font-extrabold text-white">
              {userTeam?.city} {userTeam?.name} Cap &amp; Contract Room
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Re-sign expiring veterans or add free agents strictly under the{' '}
              <span className="font-mono text-white">$180.00M</span> hard cap before entering the 5-round Rookie Draft.
            </p>
          </div>

          <button
            onClick={onProceedToDraft}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            Lock Free Agency &amp; Start {year} Rookie Draft
          </button>
        </div>

        {/* Cap Telemetry Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Total Payroll</div>
            <div
              className={`text-lg font-extrabold font-mono tabular-nums mt-0.5 ${
                userSummary.overCap
                  ? 'text-rose-400'
                  : userSummary.underFloor
                  ? 'text-amber-300'
                  : 'text-white'
              }`}
            >
              {formatMoney(userSummary.totalPayroll)}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500">
              Active {formatMoney(userSummary.activePayroll)}
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Cap Space ($180M)</div>
            <div
              className={`text-lg font-extrabold font-mono tabular-nums mt-0.5 ${
                userSummary.capSpace < 5 ? 'text-amber-300' : 'text-emerald-400'
              }`}
            >
              {formatMoney(userSummary.capSpace)}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500">
              Draft Reserve ~{formatMoney(userRookieReserve)}
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Dead Cap</div>
            <div className="text-lg font-extrabold font-mono tabular-nums text-rose-300 mt-0.5">
              {formatMoney(userSummary.deadCap)}
            </div>
            <div className="text-[11px] text-slate-500">50% of cut multi-yr deals</div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">$90.0M Floor Status</div>
            <div
              className={`text-sm font-bold font-mono tabular-nums mt-1 ${
                userSummary.underFloor ? 'text-amber-300' : 'text-emerald-400'
              }`}
            >
              {userSummary.underFloor
                ? `Short ${formatMoney(userSummary.floorShortfall)}`
                : 'Compliant (>= $90M)'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Floor target {formatMoney(SALARY_FLOOR)}</div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Roster &amp; Expiring</div>
            <div className="text-lg font-extrabold font-mono tabular-nums text-white mt-0.5">
              {userRoster.length}/30
            </div>
            <div className="text-[11px] font-mono tabular-nums text-sky-400">
              {expiringUserPlayers.length} Expiring FAs
            </div>
          </div>
        </div>

        {/* Cap Progress Bar with $90M Floor Marker */}
        <div>
          <div className="relative w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                userSummary.overCap
                  ? 'bg-rose-500'
                  : userSummary.totalPayroll > 155
                  ? 'bg-amber-400'
                  : 'bg-sky-500'
              }`}
              style={{ width: `${capPct}%` }}
            />
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-emerald-400/80"
              style={{ left: '50%' }}
              title="$90.0M Salary Floor"
            />
          </div>
          <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500 mt-1">
            <span>$0</span>
            <span className="text-emerald-400/90">$90.0M Floor</span>
            <span>$180.0M Hard Cap</span>
          </div>
        </div>

        {userSummary.underFloor && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Your payroll is {formatMoney(userSummary.floorShortfall)} below the $90.00M league floor. Re-sign expiring players or add free agents before Opening Day.
            </span>
          </div>
        )}
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl p-1.5">
        {[
          { id: 'RESIGN' as const, label: `Expiring Re-Signs (${expiringUserPlayers.length})` },
          { id: 'MARKET' as const, label: `Free Agent Market (${freeAgents.length})` },
          { id: 'ROSTER' as const, label: `Your Active Contracts (${userRoster.length}/30)` },
          { id: 'LEAGUE' as const, label: '32-Team Cap Ledger' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              subTab === tab.id
                ? 'bg-sky-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Re-Sign Expiring Own Players */}
      {subTab === 'RESIGN' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h3 className="font-bold text-white text-sm">
              Your Expiring Free Agents ({expiringUserPlayers.length})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Players whose contracts expired after {year - 1}. Choose a contract length (1–5 years) to bring them back under your $180.00M cap.
            </p>
          </div>
          {expiringUserPlayers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No unsigned expiring players remaining from your {year - 1} roster. Check the Free Agent Market tab or proceed to the Rookie Draft.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-4">Pos</th>
                    <th className="py-2.5 px-3">Player</th>
                    <th className="py-2.5 px-2 text-center">Age</th>
                    <th className="py-2.5 px-2 text-center">OVR</th>
                    <th className="py-2.5 px-2 text-center">POT</th>
                    <th className="py-2.5 px-3">Term</th>
                    <th className="py-2.5 px-3 text-right">Offer AAV</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {expiringUserPlayers.map((p) => {
                    const yrs = getSelectedTerm(p, p.ovr >= 75 ? 4 : 2);
                    const offer = calculateExtensionOffer(p, yrs);
                    const overCap = roundMoney(userSummary.totalPayroll + offer.salary) > HARD_SALARY_CAP;
                    const rosterFull = userRoster.length >= 30;
                    const disabled = overCap || rosterFull;
                    return (
                      <tr key={p.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-mono font-bold text-sky-400">{p.position}</td>
                        <td
                          className="py-2.5 px-3 font-bold text-white cursor-pointer hover:text-sky-400"
                          onClick={() => onSelectPlayer(p)}
                        >
                          {p.name}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono tabular-nums">{p.age}</td>
                        <td className="py-2.5 px-2 text-center">
                          <RatingBadge value={p.ovr} />
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono tabular-nums text-amber-300">
                          {p.potential}
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            value={yrs}
                            onChange={(e) =>
                              setTermByPlayer((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))
                            }
                            className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs font-mono text-white"
                          >
                            {[1, 2, 3, 4, 5].map((y) => (
                              <option key={y} value={y}>
                                {y} yr{y > 1 ? 's' : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-white">
                          {formatMoney(offer.salary)}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            disabled={disabled}
                            onClick={() => onSignFreeAgent(p.id, yrs)}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-35 disabled:cursor-not-allowed text-slate-950 font-bold text-[11px] cursor-pointer whitespace-nowrap"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {overCap ? 'Over $180M Cap' : rosterFull ? 'Roster Full' : 'Re-Sign'}
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
      )}

      {/* Tab 2: Free Agent Market */}
      {subTab === 'MARKET' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-white text-sm">Open Free Agent Market ({freeAgents.length})</h3>
              <p className="text-xs text-slate-400">
                Sign available players under the $180.00M hard cap. AI teams will also fill rosters when you lock Free Agency.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search free agent..."
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
            </div>
          </div>

          <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 text-[11px] sticky top-0">
                <tr>
                  <th className="py-2.5 px-4">Pos</th>
                  <th className="py-2.5 px-3">Player</th>
                  <th className="py-2.5 px-2 text-center">Age</th>
                  <th className="py-2.5 px-2 text-center">OVR</th>
                  <th className="py-2.5 px-2 text-center">POT</th>
                  <th className="py-2.5 px-3">Term</th>
                  <th className="py-2.5 px-3 text-right">Asking AAV</th>
                  <th className="py-2.5 px-4 text-right">Sign</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredMarket.map((p) => {
                  const yrs = getSelectedTerm(p, 2);
                  const offer = calculateExtensionOffer(p, yrs);
                  const overCap = roundMoney(userSummary.totalPayroll + offer.salary) > HARD_SALARY_CAP;
                  const rosterFull = userRoster.length >= 30;
                  const disabled = overCap || rosterFull;
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-mono font-bold text-sky-400">{p.position}</td>
                      <td
                        className="py-2.5 px-3 font-bold text-white cursor-pointer hover:text-sky-400"
                        onClick={() => onSelectPlayer(p)}
                      >
                        {p.name}
                        {p.previousTeamId === userTeam?.id && (
                          <span className="ml-2 text-[10px] font-mono text-amber-300">Expiring</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono tabular-nums">{p.age}</td>
                      <td className="py-2.5 px-2 text-center">
                        <RatingBadge value={p.ovr} />
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono tabular-nums text-amber-300">
                        {p.potential}
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={yrs}
                          onChange={(e) =>
                            setTermByPlayer((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))
                          }
                          className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs font-mono text-white"
                        >
                          {[1, 2, 3, 4].map((y) => (
                            <option key={y} value={y}>
                              {y} yr{y > 1 ? 's' : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-white font-semibold">
                        {formatMoney(offer.salary)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          disabled={disabled}
                          onClick={() => onSignFreeAgent(p.id, yrs)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-35 disabled:cursor-not-allowed text-slate-950 font-bold text-[11px] cursor-pointer whitespace-nowrap"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          {overCap ? 'Over Cap' : rosterFull ? '30/30 Full' : 'Sign FA'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Your Active Contracts (with Release / Dead Cap Preview) */}
      {subTab === 'ROSTER' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h3 className="font-bold text-white text-sm">
              Under-Contract Roster ({userRoster.length}/30)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Releasing a player with more than 1 year remaining applies 50% of their remaining total contract value to current-year Dead Cap.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">Pos</th>
                  <th className="py-2.5 px-3">Player</th>
                  <th className="py-2.5 px-2 text-center">Age</th>
                  <th className="py-2.5 px-2 text-center">OVR</th>
                  <th className="py-2.5 px-3 text-right">Salary</th>
                  <th className="py-2.5 px-2 text-center">Yrs</th>
                  <th className="py-2.5 px-4 text-right">Release / Dead Cap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {userRoster.map((p) => {
                  const sal = getPlayerSalary(p);
                  const yrs = getPlayerContractYears(p);
                  const deadHit = computeReleaseDeadCap(p);
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-mono font-bold text-sky-400">{p.position}</td>
                      <td
                        className="py-2.5 px-3 font-bold text-white cursor-pointer hover:text-sky-400"
                        onClick={() => onSelectPlayer(p)}
                      >
                        {p.name}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono tabular-nums">{p.age}</td>
                      <td className="py-2.5 px-2 text-center">
                        <RatingBadge value={p.ovr} />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-white font-semibold">
                        {formatMoney(sal)}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono tabular-nums text-slate-300">
                        {yrs}y
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() => onReleasePlayer(p.id)}
                          className="px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                        >
                          {deadHit > 0 ? `Waive (+${formatMoney(deadHit)} Dead)` : 'Waive ($0 Dead)'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: 32-Team League Cap Ledger */}
      {subTab === 'LEAGUE' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h3 className="font-bold text-white text-sm">32-Team Salary Cap &amp; Floor Ledger</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Live league payroll distribution ($90.00M Floor · $180.00M Hard Cap).
            </p>
          </div>
          <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 text-[11px] sticky top-0">
                <tr>
                  <th className="py-2.5 px-4">Franchise</th>
                  <th className="py-2.5 px-2 text-center">Roster</th>
                  <th className="py-2.5 px-3 text-right">Active Payroll</th>
                  <th className="py-2.5 px-3 text-right">Dead Cap</th>
                  <th className="py-2.5 px-3 text-right">Total Payroll</th>
                  <th className="py-2.5 px-3 text-right">Cap Space</th>
                  <th className="py-2.5 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono tabular-nums">
                {leagueCapRows.map(({ team, rosterCount, summary }) => {
                  const isUser = team.id === userTeam?.id;
                  return (
                    <tr
                      key={team.id}
                      className={isUser ? 'bg-sky-500/10 font-semibold' : 'hover:bg-slate-800/35'}
                    >
                      <td className="py-2 px-4 font-sans">
                        <div className="flex items-center gap-2">
                          <TeamBadge team={team} size="sm" />
                          <span className="text-white font-semibold">
                            {team.city} {team.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-center text-slate-300">{rosterCount}/30</td>
                      <td className="py-2 px-3 text-right text-slate-300">
                        {formatMoney(summary.activePayroll)}
                      </td>
                      <td className="py-2 px-3 text-right text-rose-300">
                        {formatMoney(summary.deadCap)}
                      </td>
                      <td className="py-2 px-3 text-right text-white font-bold">
                        {formatMoney(summary.totalPayroll)}
                      </td>
                      <td
                        className={`py-2 px-3 text-right ${
                          summary.capSpace < 5 ? 'text-amber-300' : 'text-emerald-400'
                        }`}
                      >
                        {formatMoney(summary.capSpace)}
                      </td>
                      <td className="py-2 px-4 text-right text-[11px]">
                        {summary.overCap ? (
                          <span className="text-rose-400">Over Cap</span>
                        ) : summary.underFloor ? (
                          <span className="text-amber-300">Under Floor</span>
                        ) : summary.overReliefThreshold ? (
                          <span className="text-sky-300">Cap Tight (&gt;$155M)</span>
                        ) : (
                          <span className="text-emerald-400">Compliant</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
