import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Player } from '../types/baseball';
import { RatingBadge } from './SharedBadges';

interface WaiverPoolViewProps {
  waiverPool: Player[];
  userRoster: Player[];
  onClaimAndDrop: (claimId: string, dropId: string | null) => void;
  onSelectPlayer: (p: Player) => void;
}

export function WaiverPoolView({
  waiverPool,
  userRoster,
  onClaimAndDrop,
  onSelectPlayer,
}: WaiverPoolViewProps) {
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [handFilter, setHandFilter] = useState('ALL');
  const [claimingPlayer, setClaimingPlayer] = useState<Player | null>(null);
  const [selectedDropId, setSelectedDropId] = useState('');

  const filteredWaivers = useMemo(() => {
    return waiverPool
      .filter((p) => {
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (posFilter === 'PITCHERS' && !p.isPitcher) return false;
        if (posFilter === 'HITTERS' && p.isPitcher) return false;
        if (!['ALL', 'PITCHERS', 'HITTERS'].includes(posFilter) && p.position !== posFilter) return false;
        if (handFilter !== 'ALL' && p.throws !== handFilter && p.bats !== handFilter) return false;
        return true;
      })
      .slice(0, 120);
  }, [waiverPool, search, posFilter, handFilter]);

  const openClaimModal = (player: Player) => {
    setClaimingPlayer(player);
    const lowest = [...userRoster].sort((a, b) => a.ovr - b.ovr)[0];
    setSelectedDropId(lowest ? lowest.id : '');
  };

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-white">
            League Waiver Wire & Free Agent Pool ({waiverPool.length})
          </h2>
          <p className="text-xs text-slate-400">
            Claim any available player by simultaneously designating a player from your 30-man roster to waive.
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

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 text-[11px]">
              <tr>
                <th className="py-3 px-4">Pos</th>
                <th className="py-3 px-3">Player</th>
                <th className="py-3 px-2 text-center">Age</th>
                <th className="py-3 px-2 text-center">B/T</th>
                <th className="py-3 px-2 text-center">OVR</th>
                <th className="py-3 px-2 text-center">POT</th>
                <th className="py-3 px-3">Scouting Grades</th>
                <th className="py-3 px-4 text-right">Transaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredWaivers.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 font-mono font-bold text-sky-400">{p.position}</td>
                  <td
                    className="py-2.5 px-3 font-bold text-white cursor-pointer hover:text-sky-400"
                    onClick={() => onSelectPlayer(p)}
                  >
                    {p.name}
                  </td>
                  <td className="py-2.5 px-2 text-center font-mono">{p.age}</td>
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
                  <td className="py-2.5 px-4 text-right">
                    <button
                      onClick={() => openClaimModal(p)}
                      className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border border-emerald-500/40 font-semibold text-xs transition cursor-pointer"
                    >
                      Claim Player
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {claimingPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Complete Waiver Claim</h3>
            <p className="text-xs text-slate-400 mt-1">
              Claiming{' '}
              <strong className="text-emerald-400">
                {claimingPlayer.position} {claimingPlayer.name} ({claimingPlayer.ovr} OVR)
              </strong>
              .
              {userRoster.length >= 30
                ? ' Select a player from your 30-man active roster to release:'
                : ' You have an open roster spot.'}
            </p>

            {userRoster.length >= 30 && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Player to Waive / Drop
                </label>
                <select
                  value={selectedDropId}
                  onChange={(e) => setSelectedDropId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                >
                  {[...userRoster]
                    .sort((a, b) => a.ovr - b.ovr)
                    .map((rp) => (
                      <option key={rp.id} value={rp.id}>
                        [{rp.position}] {rp.name} — {rp.ovr} OVR (Age {rp.age})
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setClaimingPlayer(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onClaimAndDrop(claimingPlayer.id, userRoster.length >= 30 ? selectedDropId : null);
                  setClaimingPlayer(null);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer"
              >
                Confirm Claim & Move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
