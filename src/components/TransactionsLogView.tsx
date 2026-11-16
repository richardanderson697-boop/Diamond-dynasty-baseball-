import React from 'react';
import { Trophy } from 'lucide-react';
import { ChampionHistoryEntry, TransactionEntry } from '../types/baseball';
import { TeamBadge } from './SharedBadges';

interface TransactionsLogViewProps {
  transactions: TransactionEntry[];
  championsHistory: ChampionHistoryEntry[];
}

export function TransactionsLogView({
  transactions,
  championsHistory,
}: TransactionsLogViewProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="font-display text-xl font-bold text-white mb-4">
          Front Office Transactions & League Wire
        </h2>
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex items-start gap-3 text-xs"
            >
              <span className="font-mono font-bold text-sky-400 text-[11px] shrink-0 mt-0.5 w-16">
                {tx.category}
              </span>
              <div className="flex-1 text-slate-200 leading-relaxed">{tx.summary}</div>
              <span className="text-slate-500 font-mono text-[11px] shrink-0">
                {tx.year} D{tx.day}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="font-display text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          World Series Champions
        </h2>
        {championsHistory.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-8 border border-dashed border-slate-800 rounded-lg">
            Complete Season 1 (162 Games) to crown your first World Series Champion.
          </div>
        ) : (
          <div className="space-y-3">
            {championsHistory.map((c) => (
              <div key={c.year} className="p-3 rounded-lg bg-slate-950 border border-amber-500/30">
                <div className="text-xs font-mono font-bold text-amber-400">{c.year} World Series</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <TeamBadge
                    team={{
                      id: c.championId,
                      color: c.championColor,
                      accent: c.championAccent,
                    }}
                  />
                  <span className="text-sm font-extrabold text-white">
                    {c.championCity} {c.championName}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Defeated {c.runnerUpCity} {c.runnerUpName} ({c.score})
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
