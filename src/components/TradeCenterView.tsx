import React, { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { DraftPick, Player, Team } from '../types/baseball';
import { getDraftPickTradeValue, getPlayerTradeValue } from '../engine/baseballEngine';
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
    const uPlayerVal = userSelPlayers.reduce((sum, id) => {
      const p = userRoster.find((x) => x.id === id);
      return sum + (p ? getPlayerTradeValue(p) : 0);
    }, 0);
    const uPickVal = userSelPicks.reduce((sum, id) => {
      const pk = userPicks.find((x) => x.id === id);
      return sum + (pk ? getDraftPickTradeValue(pk, teams, year) : 0);
    }, 0);

    const aPlayerVal = aiSelPlayers.reduce((sum, id) => {
      const p = partnerRoster.find((x) => x.id === id);
      return sum + (p ? getPlayerTradeValue(p) : 0);
    }, 0);
    const aPickVal = aiSelPicks.reduce((sum, id) => {
      const pk = partnerPicks.find((x) => x.id === id);
      return sum + (pk ? getDraftPickTradeValue(pk, teams, year) : 0);
    }, 0);

    const userTotal = uPlayerVal + uPickVal;
    const aiTotal = aPlayerVal + aPickVal;
    const hasAssets = userTotal > 0 && aiTotal > 0;

    const starTax = aiSelPlayers.some(
      (id) => (partnerRoster.find((p) => p.id === id)?.ovr || 0) >= 84
    )
      ? 1.08
      : 1.0;
    const ratio = aiTotal > 0 ? userTotal / (aiTotal * starTax) : 0;

    let status: 'EMPTY' | 'ACCEPT' | 'CLOSE' | 'REJECT' = 'EMPTY';
    let message =
      'Select players and/or future draft picks on both sides to construct a trade proposal.';
    if (hasAssets) {
      if (ratio >= 0.96) {
        status = 'ACCEPT';
        message = `${partnerTeam?.city} GM: "This deal aligns with our organizational timeline. We accept."`;
      } else if (ratio >= 0.82) {
        status = 'CLOSE';
        message = `${partnerTeam?.city} GM: "We are close, but need slightly more value—add a mid-round pick or upgrade a prospect."`;
      } else {
        status = 'REJECT';
        message = `${partnerTeam?.city} GM: "We cannot justify moving these assets for that return."`;
      }
    }

    return { userTotal, aiTotal, ratio, status, message };
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
              Package up to 4 players and 4 future draft picks per side. Keep resulting rosters at or below 30 players.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-semibold">Trade Partner:</span>
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

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 items-center">
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400">You Send ({userTeam?.id})</div>
              <div className="text-lg font-extrabold text-white font-mono">{evaluation.userTotal} pts</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-400">You Receive ({partnerId})</div>
              <div className="text-lg font-extrabold text-sky-400 font-mono">{evaluation.aiTotal} pts</div>
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
                style={{ width: `${Math.min(100, Math.round(evaluation.ratio * 85))}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-300 mt-1.5">{evaluation.message}</p>
          </div>

          <div className="flex justify-end">
            <button
              disabled={evaluation.status !== 'ACCEPT'}
              onClick={handlePropose}
              className="w-full lg:w-auto px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-35 disabled:cursor-not-allowed text-slate-950 font-extrabold text-xs transition cursor-pointer"
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
                Active Roster ({side.roster.length}/30)
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/70 border border-slate-800 rounded-lg">
                {side.roster.map((p) => {
                  const active = side.selPlayers.includes(p.id);
                  const val = getPlayerTradeValue(p);
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
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-mono text-slate-400">{val}p</span>
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
