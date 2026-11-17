import React from 'react';
import { Award, X } from 'lucide-react';
import { RetiredPlayerSummary, Team } from '../types/baseball';
import { formatMoney } from '../engine/baseballEngine';
import { RatingBadge, TeamBadge } from './SharedBadges';

interface RetirementsModalProps {
  year: number;
  retirements: RetiredPlayerSummary[];
  teamMap: Record<string, Team>;
  expiringUserCount: number;
  aiReSignedCount: number;
  onClose: () => void;
}

export function RetirementsModal({
  year,
  retirements,
  teamMap,
  expiringUserCount,
  aiReSignedCount,
  onClose,
}: RetirementsModalProps) {
  const notable = retirements.slice(0, 40);
  const rosteredCount = retirements.filter((r) => r.teamId !== null).length;
  const faCount = retirements.length - rosteredCount;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full shadow-2xl text-slate-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
              <Award className="w-4 h-4" />
              {year} Offseason Rollover Complete
            </div>
            <h3 className="font-display text-2xl font-extrabold text-white mt-0.5">
              Retirements & Contract Ledger Summary
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
              {retirements.length} Retired ({rosteredCount} Rostered · {faCount} FA) ·{' '}
              {expiringUserCount} User Expiring · {aiReSignedCount} AI Re-Signed
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close retirements summary"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[72vh] overflow-y-auto">
          {retirements.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400 border border-dashed border-slate-800 rounded-xl">
              No players elected to retire following the {year - 1} campaign.
            </div>
          ) : (
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Player</th>
                    <th className="py-2.5 px-2 text-center">Pos</th>
                    <th className="py-2.5 px-2 text-center">Age</th>
                    <th className="py-2.5 px-2 text-center">OVR</th>
                    <th className="py-2.5 px-3">Last Team</th>
                    <th className="py-2.5 px-3">Career Line</th>
                    <th className="py-2.5 px-3 text-right">Final AAV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {notable.map((r) => {
                    const team = r.teamId ? teamMap[r.teamId] : undefined;
                    return (
                      <tr key={r.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-white">{r.name}</div>
                          <div className="text-[11px] text-slate-500">{r.reason}</div>
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono font-bold text-sky-400">
                          {r.position}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono tabular-nums text-slate-300">
                          {r.age}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <RatingBadge value={r.ovr} />
                        </td>
                        <td className="py-2.5 px-3">
                          {team ? (
                            <div className="flex items-center gap-1.5">
                              <TeamBadge team={team} size="sm" />
                              <span className="font-mono text-slate-300">{team.id}</span>
                            </div>
                          ) : (
                            <span className="font-mono text-slate-500">FA</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-slate-300">
                          {r.careerLine}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-400">
                          {formatMoney(r.salary)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {retirements.length > notable.length && (
            <div className="text-xs text-slate-400 text-center font-mono">
              Showing top {notable.length} of {retirements.length} total offseason retirements.
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-4">
          <span className="text-xs text-slate-400">
            Asymmetric aging applied: youth progressed toward POT; age 30+ speed &amp; velocity declined fastest.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer whitespace-nowrap shrink-0"
          >
            Enter {year} Free Agency
          </button>
        </div>
      </div>
    </div>
  );
}
