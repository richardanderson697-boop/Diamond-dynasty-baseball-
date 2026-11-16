import React, { useState } from 'react';
import { Bookmark, Check, X } from 'lucide-react';
import { CardTheme, Player, SavedPlayerCard, Team } from '../types/baseball';
import { formatIP, getHitterSlash, getPitcherRatios } from '../engine/baseballEngine';
import { AttributeRadarSvg, getCardThemeClasses, RatingBadge, TeamBadge } from './SharedBadges';

interface PlayerCardModalProps {
  player: Player;
  team?: Team | null;
  isSavedAlready?: boolean;
  canSaveToCloud: boolean;
  onSaveCard: (player: Player, theme: CardTheme, notes: string) => Promise<void>;
  onClose: () => void;
}

export function PlayerCardModal({
  player,
  team,
  isSavedAlready = false,
  canSaveToCloud,
  onSaveCard,
  onClose,
}: PlayerCardModalProps) {
  const [theme, setTheme] = useState<CardTheme>('CHROME');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(isSavedAlready);

  const slash = !player.isPitcher ? getHitterSlash(player.seasonStats) : null;
  const ratios = player.isPitcher ? getPitcherRatios(player.seasonStats) : null;
  const themeStyle = getCardThemeClasses(theme);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveCard(player, theme, notes);
      setSavedNotice(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={`rounded-2xl border max-w-3xl w-full shadow-2xl text-slate-100 overflow-hidden ${themeStyle.frame}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-6 py-4 flex items-start justify-between gap-4 ${themeStyle.headerBg}`}>
          <div className="flex items-center gap-3.5 min-w-0">
            <TeamBadge team={team} size="lg" />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="font-display text-2xl font-extrabold tracking-tight text-white truncate">
                  {player.name}
                </h3>
                <span className="text-xs font-mono font-bold text-sky-300">
                  {player.position}
                </span>
                <RatingBadge value={player.ovr} size="lg" />
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                <span>{team ? `${team.city} ${team.name}` : 'Waiver Wire / Free Agent'}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">Age {player.age}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">B/T {player.bats}/{player.throws}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-amber-300">POT {player.potential}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close player card"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Dynamic SVG Radar */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex flex-col items-center">
              <div className="w-full flex items-center justify-between text-xs text-slate-400 mb-1">
                <span className="font-semibold text-slate-300">Scouting Profile</span>
                <span className="font-mono">{player.isPitcher ? 'Pitching Radar' : '5-Tool Radar'}</span>
              </div>
              <AttributeRadarSvg player={player} theme={theme} size={200} />
            </div>

            {/* Dynamic Stat Visual Gauges */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-300">Attribute Breakdown (20–99 Scale)</div>
              {(player.isPitcher
                ? [
                    { label: 'Velocity', val: player.velocity ?? 50, color: 'bg-sky-500' },
                    { label: 'Control', val: player.control ?? 50, color: 'bg-emerald-500' },
                    { label: 'Finesse', val: player.finesse ?? 50, color: 'bg-indigo-400' },
                    { label: 'Ceiling Potential', val: player.potential, color: 'bg-amber-400' },
                  ]
                : [
                    { label: 'Power', val: player.power ?? 50, color: 'bg-emerald-500' },
                    { label: 'Speed', val: player.speed ?? 50, color: 'bg-sky-500' },
                    { label: 'Glove / Fielding', val: player.glove ?? 50, color: 'bg-indigo-400' },
                    { label: 'Ceiling Potential', val: player.potential, color: 'bg-amber-400' },
                  ]
              ).map((attr) => (
                <div key={attr.label} className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-slate-300">{attr.label}</span>
                    <span className="font-mono font-bold text-white">{attr.val}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${attr.color}`} style={{ width: `${attr.val}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dynamic Season Slash / Pitching Ratios Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {player.isPitcher && ratios ? (
              <>
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">Earned Run Avg</div>
                  <div className="text-xl font-bold font-mono text-white mt-0.5">{ratios.era}</div>
                </div>
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">WHIP</div>
                  <div className="text-xl font-bold font-mono text-sky-400 mt-0.5">{ratios.whip}</div>
                </div>
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">K / 9 IP</div>
                  <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">{ratios.k9}</div>
                </div>
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">W - L / SV</div>
                  <div className="text-xl font-bold font-mono text-amber-300 mt-0.5">
                    {player.seasonStats.w || 0}-{player.seasonStats.l || 0} / {player.seasonStats.sv || 0}
                  </div>
                </div>
              </>
            ) : slash ? (
              <>
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">Batting Avg</div>
                  <div className="text-xl font-bold font-mono text-white mt-0.5">{slash.avg}</div>
                </div>
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">On-Base + Slugging</div>
                  <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">{slash.ops}</div>
                </div>
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">Home Runs / RBI</div>
                  <div className="text-xl font-bold font-mono text-sky-400 mt-0.5">
                    {player.seasonStats.hr || 0} / {player.seasonStats.rbi || 0}
                  </div>
                </div>
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">Stolen Bases</div>
                  <div className="text-xl font-bold font-mono text-amber-300 mt-0.5">
                    {player.seasonStats.sb || 0}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {/* Season & Career Splits Table */}
          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            {player.isPitcher && ratios ? (
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-950 text-slate-400">
                  <tr>
                    <th className="py-2 px-3 text-left">Split</th>
                    <th className="py-2 px-2">G</th>
                    <th className="py-2 px-2">GS</th>
                    <th className="py-2 px-2">W</th>
                    <th className="py-2 px-2">L</th>
                    <th className="py-2 px-2">SV</th>
                    <th className="py-2 px-2">IP</th>
                    <th className="py-2 px-2">SO</th>
                    <th className="py-2 px-2">BB</th>
                    <th className="py-2 px-2">ERA</th>
                    <th className="py-2 px-3">WHIP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  <tr>
                    <td className="py-2 px-3 text-left font-sans font-semibold text-sky-400">Current Season</td>
                    <td className="px-2">{player.seasonStats.g || 0}</td>
                    <td className="px-2">{player.seasonStats.gs || 0}</td>
                    <td className="px-2">{player.seasonStats.w || 0}</td>
                    <td className="px-2">{player.seasonStats.l || 0}</td>
                    <td className="px-2">{player.seasonStats.sv || 0}</td>
                    <td className="px-2">{ratios.ipStr}</td>
                    <td className="px-2">{player.seasonStats.so || 0}</td>
                    <td className="px-2">{player.seasonStats.bb || 0}</td>
                    <td className="px-2 font-bold text-white">{ratios.era}</td>
                    <td className="px-3">{ratios.whip}</td>
                  </tr>
                  <tr className="bg-slate-950/40">
                    <td className="py-2 px-3 text-left font-sans text-slate-400">Career Totals</td>
                    <td className="px-2">{(player.careerStats.g || 0) + (player.seasonStats.g || 0)}</td>
                    <td className="px-2">{(player.careerStats.gs || 0) + (player.seasonStats.gs || 0)}</td>
                    <td className="px-2">{(player.careerStats.w || 0) + (player.seasonStats.w || 0)}</td>
                    <td className="px-2">{(player.careerStats.l || 0) + (player.seasonStats.l || 0)}</td>
                    <td className="px-2">{(player.careerStats.sv || 0) + (player.seasonStats.sv || 0)}</td>
                    <td className="px-2">{formatIP((player.careerStats.ipOuts || 0) + (player.seasonStats.ipOuts || 0))}</td>
                    <td className="px-2">{(player.careerStats.so || 0) + (player.seasonStats.so || 0)}</td>
                    <td className="px-2">{(player.careerStats.bb || 0) + (player.seasonStats.bb || 0)}</td>
                    <td className="px-2">
                      {
                        getPitcherRatios({
                          ipOuts: (player.careerStats.ipOuts || 0) + (player.seasonStats.ipOuts || 0),
                          er: (player.careerStats.er || 0) + (player.seasonStats.er || 0),
                          h: (player.careerStats.h || 0) + (player.seasonStats.h || 0),
                          bb: (player.careerStats.bb || 0) + (player.seasonStats.bb || 0),
                        }).era
                      }
                    </td>
                    <td className="px-3">
                      {
                        getPitcherRatios({
                          ipOuts: (player.careerStats.ipOuts || 0) + (player.seasonStats.ipOuts || 0),
                          er: (player.careerStats.er || 0) + (player.seasonStats.er || 0),
                          h: (player.careerStats.h || 0) + (player.seasonStats.h || 0),
                          bb: (player.careerStats.bb || 0) + (player.seasonStats.bb || 0),
                        }).whip
                      }
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : slash ? (
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-950 text-slate-400">
                  <tr>
                    <th className="py-2 px-3 text-left">Split</th>
                    <th className="py-2 px-2">G</th>
                    <th className="py-2 px-2">AB</th>
                    <th className="py-2 px-2">H</th>
                    <th className="py-2 px-2">HR</th>
                    <th className="py-2 px-2">RBI</th>
                    <th className="py-2 px-2">SB</th>
                    <th className="py-2 px-2">AVG</th>
                    <th className="py-2 px-2">OBP</th>
                    <th className="py-2 px-3">SLG</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  <tr>
                    <td className="py-2 px-3 text-left font-sans font-semibold text-emerald-400">Current Season</td>
                    <td className="px-2">{player.seasonStats.g || 0}</td>
                    <td className="px-2">{player.seasonStats.ab || 0}</td>
                    <td className="px-2">{player.seasonStats.h || 0}</td>
                    <td className="px-2">{player.seasonStats.hr || 0}</td>
                    <td className="px-2">{player.seasonStats.rbi || 0}</td>
                    <td className="px-2">{player.seasonStats.sb || 0}</td>
                    <td className="px-2 font-bold text-white">{slash.avg}</td>
                    <td className="px-2">{slash.obp}</td>
                    <td className="px-3">{slash.slg}</td>
                  </tr>
                  <tr className="bg-slate-950/40">
                    <td className="py-2 px-3 text-left font-sans text-slate-400">Career Totals</td>
                    <td className="px-2">{(player.careerStats.g || 0) + (player.seasonStats.g || 0)}</td>
                    <td className="px-2">{(player.careerStats.ab || 0) + (player.seasonStats.ab || 0)}</td>
                    <td className="px-2">{(player.careerStats.h || 0) + (player.seasonStats.h || 0)}</td>
                    <td className="px-2">{(player.careerStats.hr || 0) + (player.seasonStats.hr || 0)}</td>
                    <td className="px-2">{(player.careerStats.rbi || 0) + (player.seasonStats.rbi || 0)}</td>
                    <td className="px-2">{(player.careerStats.sb || 0) + (player.seasonStats.sb || 0)}</td>
                    <td className="px-2">
                      {
                        getHitterSlash({
                          ab: (player.careerStats.ab || 0) + (player.seasonStats.ab || 0),
                          h: (player.careerStats.h || 0) + (player.seasonStats.h || 0),
                          bb: (player.careerStats.bb || 0) + (player.seasonStats.bb || 0),
                          doubles: (player.careerStats.doubles || 0) + (player.seasonStats.doubles || 0),
                          triples: (player.careerStats.triples || 0) + (player.seasonStats.triples || 0),
                          hr: (player.careerStats.hr || 0) + (player.seasonStats.hr || 0),
                        }).avg
                      }
                    </td>
                    <td className="px-2">
                      {
                        getHitterSlash({
                          ab: (player.careerStats.ab || 0) + (player.seasonStats.ab || 0),
                          h: (player.careerStats.h || 0) + (player.seasonStats.h || 0),
                          bb: (player.careerStats.bb || 0) + (player.seasonStats.bb || 0),
                          doubles: (player.careerStats.doubles || 0) + (player.seasonStats.doubles || 0),
                          triples: (player.careerStats.triples || 0) + (player.seasonStats.triples || 0),
                          hr: (player.careerStats.hr || 0) + (player.seasonStats.hr || 0),
                        }).obp
                      }
                    </td>
                    <td className="px-3">
                      {
                        getHitterSlash({
                          ab: (player.careerStats.ab || 0) + (player.seasonStats.ab || 0),
                          h: (player.careerStats.h || 0) + (player.seasonStats.h || 0),
                          bb: (player.careerStats.bb || 0) + (player.seasonStats.bb || 0),
                          doubles: (player.careerStats.doubles || 0) + (player.seasonStats.doubles || 0),
                          triples: (player.careerStats.triples || 0) + (player.seasonStats.triples || 0),
                          hr: (player.careerStats.hr || 0) + (player.seasonStats.hr || 0),
                        }).slg
                      }
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : null}
          </div>

          {/* Save Player Card to Vault Controls */}
          <div className="bg-slate-950/75 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-200">Save to Player Card Vault</span>
              <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800">
                {(['CHROME', 'GOLD', 'EMERALD', 'OBSIDIAN'] as CardTheme[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                      theme === t ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                maxLength={280}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional front office scouting note..."
                className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0"
              >
                {savedNotice ? <Check className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                {saving ? 'Saving...' : savedNotice ? 'Update Saved Card' : canSaveToCloud ? 'Save Card to Firebase' : 'Save Card Locally'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
