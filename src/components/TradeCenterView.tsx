import React, { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { DraftPick, Player, Team } from '../types/baseball';
import {
  evaluateTradeProposal,
  formatMoney,
  getDraftPickTradeValue,
  getPlayerContractYears,
  getPlayerEffectiveCapHit,
  getPlayerTradeValue,
  HARD_SALARY_CAP,
  isCapMoveLegal,
  isPlayerOnIL,
} from '../engine/baseballEngine';
import { RatingBadge } from './SharedBadges';

interface TradeCenterViewProps {
  year: number;
  userTeam: Team | undefined;
  teams: Team[];
  teamMap: Record<string, Team>;
  playersByTeam: Record<string, Player[]>;
  draftPicks: DraftPick[];
  onExecuteTrade: (
    partnerId: string,
    userPlayerIds: string[],
    userPickIds: string[],
    aiPlayerIds: string[],
    aiPickIds: string[]
  ) => boolean;
  onSelectPlayer: (p: Player) => void;
}

export function TradeCenterView({
  year,
  userTeam,
  teams,
  teamMap,
  playersByTeam,
  draftPicks,
  onExecuteTrade,
  onSelectPlayer,
}: TradeCenterViewProps) {
  const aiTeams = useMemo(() => teams.filter((t) => t.id !== userTeam?.id), [teams, userTeam]);
  const [partnerId, setPartnerId] = useState(aiTeams[0]?.id || 'BOS');

  const [userSelPlayers, setUserSelPlayers] = useState<string[]>([]);
  const [userSelPicks, setUserSelPicks] = useState<string[]>([]);
  const [aiSelPlayers, setAiSelPlayers] = useState<string[]>([]);
  const [aiSelPicks, setAiSelPicks] = useState<string[]>([]);

  const handleChangePartner = (newId: string) => {
    setPartnerId(newId);
    setAiSelPlayers([]);
    setAiSelPicks([]);
  };

  const toggleItem = (
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    id: string
  ) => {
    if (list.includes(id)) setList(list.filter((x) => x !== id));
    else if (list.length < 4) setList([...list, id]);
  };

  const partnerTeam = teamMap[partnerId];
  const userRoster = playersByTeam[userTeam?.id || ''] || [];
  const partnerRoster = playersByTeam[partnerId] || [];

  const userPicks = draftPicks
    .filter((pk) => pk.ownerTeamId === userTeam?.id)
    .sort((a, b) => a.year - b.year || a.round - b.round);
  const partnerPicks = draftPicks
    .filter((pk) => pk.ownerTeamId === partnerId)
    .sort((a, b) => a.year - b.year || a.round - b.round);

  const evaluation = useMemo(() => {
    const userSendPlayers = userRoster.filter((p) => userSelPlayers.includes(p.id));
    const userSendPicks = userPicks.filter((pk) => userSelPicks.includes(pk.id));
    const aiSendPlayers = partnerRoster.filter((p) => aiSelPlayers.includes(p.id));
    const aiSendPicks = partnerPicks.filter((pk) => aiSelPicks.includes(pk.id));

    return evaluateTradeProposal({
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
    });
  }, [
    userSelPlayers,
    userSelPicks,
    aiSelPlayers,
    aiSelPicks,
    userRoster,
    partnerRoster,
    userPicks,
    partnerPicks,
    teams,
    year,
    userTeam,
    partnerTeam,
  ]);

  const handlePropose = () => {
    if (evaluation.status !== 'ACCEPT') return;
    const ok = onExecuteTrade(partnerId, userSelPlayers, userSelPicks, aiSelPlayers, aiSelPicks);
    if (ok) {
      setUserSelPlayers([]);
      setUserSelPicks([]);
      setAiSelPlayers([]);
      setAiSelPicks([]);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-sky-400" />
              Front Office Trade Center
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Package up to 4 players &amp; 4 picks per side. Teams over the $180.00M Hard Cap may trade freely if the move reduces payroll.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-semibold whitespace-nowrap">Trade Partner:</span>
            <select
              value={partnerId}
              onChange={(e) => handleChangePartner(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs font-bold text-white"
            >
              {aiTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.city} {t.name} ({t.wins}-{t.losses})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Cap Comparison Strip for Both Teams */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              label: `${userTeam?.id || 'YOU'} Payroll Sheet`,
              pre: evaluation.userPreSummary,
              postPayroll: evaluation.userPostPayroll,
            },
            {
              label: `${partnerId} Payroll Sheet`,
              pre: evaluation.partnerPreSummary,
              postPayroll: evaluation.partnerPostPayroll,
            },
          ].map((sheet) => {
            const postSpace = HARD_SALARY_CAP - sheet.postPayroll;
            const capIllegal = !isCapMoveLegal(sheet.pre.totalPayroll, sheet.postPayroll);
            const overCapDumpAllowed =
              sheet.pre.overCap && sheet.postPayroll < sheet.pre.totalPayroll;
            return (
              <div
                key={sheet.label}
                className="bg-slate-950/75 border border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono tabular-nums"
              >
                <div>
                  <div className="font-sans font-bold text-slate-200">{sheet.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Payroll {formatMoney(sheet.pre.totalPayroll)} · Space{' '}
                    <span className={sheet.pre.capSpace < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                      {formatMoney(sheet.pre.capSpace)}
                    </span>{' '}
                    · Dead <span className="text-rose-300">{formatMoney(sheet.pre.deadCap)}</span>
                    {sheet.pre.ilRelief > 0 && (
                      <span className="text-sky-300"> · IL +{formatMoney(sheet.pre.ilRelief)}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-400">
                    {overCapDumpAllowed ? 'Post-Trade (Dump Legal)' : 'Post-Trade'}
                  </div>
                  <div
                    className={`font-bold ${
                      capIllegal
                        ? 'text-rose-400'
                        : overCapDumpAllowed
                        ? 'text-emerald-400'
                        : 'text-white'
                    }`}
                  >
                    {formatMoney(sheet.postPayroll)}{' '}
                    <span className={capIllegal ? 'text-rose-400' : overCapDumpAllowed ? 'text-emerald-300' : 'text-slate-400'}>
                      ({postSpace >= 0 ? `${formatMoney(postSpace)} free` : `${formatMoney(Math.abs(postSpace))} over`})
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 items-center">
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400">You Send ({userTeam?.id})</div>
              <div className="text-lg font-extrabold text-white font-mono tabular-nums">
                {evaluation.userBasePts} pts
              </div>
              {evaluation.userOfferScoreForAI !== evaluation.userBasePts && (
                <div className="text-[11px] font-mono text-sky-400">
                  AI Eval: {evaluation.userOfferScoreForAI} pts
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-400">You Receive ({partnerId})</div>
              <div className="text-lg font-extrabold text-sky-400 font-mono tabular-nums">
                {evaluation.aiBasePts} pts
              </div>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-slate-400">AI GM Interest Meter</span>
              <span
                className={`font-bold font-mono ${
                  evaluation.status === 'ACCEPT'
                    ? 'text-emerald-400'
                    : evaluation.status === 'CLOSE'
                    ? 'text-amber-400'
                    : evaluation.status === 'BLOCKED'
                    ? 'text-rose-400'
                    : 'text-slate-400'
                }`}
              >
                {evaluation.status}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  evaluation.status === 'ACCEPT'
                    ? 'bg-emerald-500'
                    : evaluation.status === 'CLOSE'
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{
                  width: `${
                    evaluation.status === 'BLOCKED'
                      ? 100
                      : Math.min(100, Math.round(evaluation.ratio * 85))
                  }%`,
                }}
              />
            </div>
            <p
              className={`text-[11px] mt-1.5 ${
                evaluation.status === 'BLOCKED' ? 'text-rose-300 font-semibold' : 'text-slate-300'
              }`}
            >
              {evaluation.message}
            </p>
            {evaluation.aiReasons.length > 0 && (
              <div className="mt-1 text-[11px] text-sky-300 font-mono">
                {evaluation.aiReasons.join(' · ')}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              disabled={evaluation.status !== 'ACCEPT'}
              onClick={handlePropose}
              className="w-full lg:w-auto px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-35 disabled:cursor-not-allowed text-slate-950 font-extrabold text-xs transition cursor-pointer whitespace-nowrap"
            >
              Execute Trade Proposal
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[
          {
            title: `${userTeam?.city} ${userTeam?.name} (Your Assets)`,
            roster: userRoster,
            picks: userPicks,
            selPlayers: userSelPlayers,
            setSelPlayers: setUserSelPlayers,
            selPicks: userSelPicks,
            setSelPicks: setUserSelPicks,
          },
          {
            title: `${partnerTeam?.city} ${partnerTeam?.name} (${partnerId} Assets)`,
            roster: partnerRoster,
            picks: partnerPicks,
            selPlayers: aiSelPlayers,
            setSelPlayers: setAiSelPlayers,
            selPicks: aiSelPicks,
            setSelPicks: setAiSelPicks,
          },
        ].map((side, idx) => (
          <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
            <h3 className="font-bold text-white text-sm border-b border-slate-800 pb-2">{side.title}</h3>

            <div>
              <div className="text-[11px] font-semibold text-slate-400 mb-2">
                Future Draft Picks (Click to Include)
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {side.picks.map((pk) => {
                  const active = side.selPicks.includes(pk.id);
                  const val = getDraftPickTradeValue(pk, teams, year);
                  return (
                    <button
                      key={pk.id}
                      onClick={() => toggleItem(side.selPicks, side.setSelPicks, pk.id)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono border transition cursor-pointer ${
                        active
                          ? 'bg-sky-500 text-slate-950 border-sky-400 font-bold'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      {pk.year} R{pk.round} ({pk.originalTeamId}) · {val}p
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-400 mb-2">
                Active Roster ({side.roster.filter((p) => !isPlayerOnIL(p)).length}/30
                {side.roster.some((p) => isPlayerOnIL(p))
                  ? ` + ${side.roster.filter((p) => isPlayerOnIL(p)).length} IL`
                  : ''}
                )
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/70 border border-slate-800 rounded-lg">
                {side.roster.map((p) => {
                  const active = side.selPlayers.includes(p.id);
                  const val = getPlayerTradeValue(p);
                  const effSal = getPlayerEffectiveCapHit(p);
                  const yrs = getPlayerContractYears(p);
                  const onIL = isPlayerOnIL(p);
                  return (
                    <div
                      key={p.id}
                      onClick={() => toggleItem(side.selPlayers, side.setSelPlayers, p.id)}
                      className={`flex items-center justify-between px-3 py-2 text-xs cursor-pointer transition ${
                        active ? 'bg-sky-500/20 text-white' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input type="checkbox" checked={active} readOnly className="rounded accent-sky-500" />
                        <span className="font-mono text-sky-400 font-bold text-[11px] w-6">
                          {p.position}
                        </span>
                        <span
                          className="font-semibold truncate hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectPlayer(p);
                          }}
                        >
                          {p.name}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">({p.age}y)</span>
                        {onIL && (
                          <span className="px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-[10px]">
                            {p.injury?.onIL}d IL
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                        <span className="text-[11px] text-slate-300">
                          {formatMoney(effSal)}/{yrs}y
                        </span>
                        <span className="text-[11px] text-slate-500">{val}p</span>
                        <RatingBadge value={p.ovr} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

