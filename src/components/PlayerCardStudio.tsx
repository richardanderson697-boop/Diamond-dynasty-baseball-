import React, { useMemo, useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import {
  CardTheme,
  Player,
  PlayerPosition,
  SavedPlayerCard,
  Team,
} from '../types/baseball';
import {
  calculateOverall,
  createEmptySeasonStats,
  getHitterSlash,
  getPitcherRatios,
} from '../engine/baseballEngine';
import { AttributeRadarSvg, getCardThemeClasses, RatingBadge, TeamBadge } from './SharedBadges';
import { PlayerAvatarSvg } from './PlayerAvatarSvg';

interface PlayerCardStudioProps {
  savedCards: SavedPlayerCard[];
  teamMap: Record<string, Team>;
  userTeam: Team | undefined;
  userRosterCount: number;
  canSaveToCloud: boolean;
  onCreateCustomCard: (params: {
    name: string;
    age: number;
    bats: 'L' | 'R' | 'S';
    throws: 'L' | 'R';
    position: PlayerPosition;
    power: number;
    speed: number;
    glove: number;
    velocity: number;
    control: number;
    finesse: number;
    potential: number;
    cardTheme: CardTheme;
    notes: string;
    targetDestination: 'ROSTER' | 'WAIVER' | 'VAULT_ONLY';
  }) => Promise<void>;
  onDeleteCard: (cardId: string) => Promise<void>;
  onUpdateCardTheme: (card: SavedPlayerCard, theme: CardTheme) => Promise<void>;
  onInspectPlayer?: (card: SavedPlayerCard) => void;
}

const ALL_POSITIONS: PlayerPosition[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP', 'RP'];

export function PlayerCardStudio({
  savedCards,
  teamMap,
  userTeam,
  userRosterCount,
  canSaveToCloud,
  onCreateCustomCard,
  onDeleteCard,
  onUpdateCardTheme,
}: PlayerCardStudioProps) {
  const [mode, setMode] = useState<'VAULT' | 'CREATOR'>('VAULT');
  const [filterTheme, setFilterTheme] = useState<'ALL' | CardTheme>('ALL');

  // Creator form state
  const [name, setName] = useState('Rafael Vega');
  const [age, setAge] = useState(22);
  const [position, setPosition] = useState<PlayerPosition>('SS');
  const [bats, setBats] = useState<'L' | 'R' | 'S'>('S');
  const [throws, setThrows] = useState<'L' | 'R'>('R');
  const [power, setPower] = useState(82);
  const [speed, setSpeed] = useState(84);
  const [glove, setGlove] = useState(79);
  const [velocity, setVelocity] = useState(84);
  const [control, setControl] = useState(78);
  const [finesse, setFinesse] = useState(80);
  const [potential, setPotential] = useState(92);
  const [cardTheme, setCardTheme] = useState<CardTheme>('GOLD');
  const [notes, setNotes] = useState('Dynamic five-tool franchise cornerstone prospect.');
  const [destination, setDestination] = useState<'ROSTER' | 'WAIVER' | 'VAULT_ONLY'>(
    userRosterCount < 30 ? 'ROSTER' : 'WAIVER'
  );
  const [submitting, setSubmitting] = useState(false);

  const isPitcher = position === 'SP' || position === 'RP';
  const previewOvr = useMemo(
    () =>
      calculateOverall({
        isPitcher,
        position,
        power,
        speed,
        glove,
        velocity,
        control,
        finesse,
      }),
    [isPitcher, position, power, speed, glove, velocity, control, finesse]
  );

  const previewPlayer: Player = useMemo(
    () => ({
      id: 'PREVIEW',
      name: name || 'Unnamed Prospect',
      age,
      bats,
      throws,
      isPitcher,
      position,
      teamId: destination === 'ROSTER' ? userTeam?.id || 'FA' : 'FA',
      ovr: previewOvr,
      potential: Math.max(previewOvr, potential),
      power,
      speed,
      glove,
      velocity,
      control,
      finesse,
      seasonStats: createEmptySeasonStats(isPitcher),
      careerStats: createEmptySeasonStats(isPitcher),
    }),
    [name, age, bats, throws, isPitcher, position, destination, userTeam, previewOvr, potential, power, speed, glove, velocity, control, finesse]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onCreateCustomCard({
        name: name.trim(),
        age,
        bats,
        throws,
        position,
        power,
        speed,
        glove,
        velocity,
        control,
        finesse,
        potential: Math.max(previewOvr, potential),
        cardTheme,
        notes: notes.trim(),
        targetDestination: destination,
      });
      setMode('VAULT');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCards = useMemo(() => {
    if (filterTheme === 'ALL') return savedCards;
    return savedCards.filter((c) => c.cardTheme === filterTheme);
  }, [savedCards, filterTheme]);

  const previewThemeStyle = getCardThemeClasses(cardTheme);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-white tracking-tight">
            Player Cards & Scouting Studio
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {canSaveToCloud
              ? 'Real-time Firebase Vault · Saved cards and custom prospects sync immediately across sessions.'
              : 'Local Vault · Sign in with Google in the header to persist player cards to Firebase.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
            <button
              onClick={() => setMode('VAULT')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                mode === 'VAULT' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Saved Vault ({savedCards.length})
            </button>
            <button
              onClick={() => setMode('CREATOR')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                mode === 'CREATOR' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Create Player Card
            </button>
          </div>
        </div>
      </div>

      {mode === 'CREATOR' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Creator Form */}
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5"
          >
            <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-3">
              Design Custom Player Card
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Player Full Name</label>
                <input
                  type="text"
                  required
                  maxLength={64}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Pos</label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value as PlayerPosition)}
                    className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                  >
                    {ALL_POSITIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Age</label>
                  <input
                    type="number"
                    min={18}
                    max={42}
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">B / T</label>
                  <div className="flex gap-1">
                    <select
                      value={bats}
                      onChange={(e) => setBats(e.target.value as 'L' | 'R' | 'S')}
                      className="w-1/2 px-1 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    >
                      <option value="R">R</option>
                      <option value="L">L</option>
                      <option value="S">S</option>
                    </select>
                    <select
                      value={throws}
                      onChange={(e) => setThrows(e.target.value as 'L' | 'R')}
                      className="w-1/2 px-1 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    >
                      <option value="R">R</option>
                      <option value="L">L</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Attribute Sliders */}
            <div className="space-y-3 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">
                  {isPitcher ? 'Pitching Tool Grades' : 'Position Player Tool Grades'}
                </span>
                <span className="font-mono text-sky-400 font-bold">Calculated OVR: {previewOvr}</span>
              </div>

              {isPitcher ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Velocity', val: velocity, set: setVelocity },
                    { label: 'Control', val: control, set: setControl },
                    { label: 'Finesse', val: finesse, set: setFinesse },
                  ].map((s) => (
                    <div key={s.label} className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                      <div className="flex justify-between text-xs mb-2">
                        <span className="text-slate-300">{s.label}</span>
                        <span className="font-mono font-bold text-white">{s.val}</span>
                      </div>
                      <input
                        type="range"
                        min={25}
                        max={99}
                        value={s.val}
                        onChange={(e) => s.set(Number(e.target.value))}
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Power', val: power, set: setPower },
                    { label: 'Speed', val: speed, set: setSpeed },
                    { label: 'Glove', val: glove, set: setGlove },
                  ].map((s) => (
                    <div key={s.label} className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                      <div className="flex justify-between text-xs mb-2">
                        <span className="text-slate-300">{s.label}</span>
                        <span className="font-mono font-bold text-white">{s.val}</span>
                      </div>
                      <input
                        type="range"
                        min={25}
                        max={99}
                        value={s.val}
                        onChange={(e) => s.set(Number(e.target.value))}
                        className="w-full accent-emerald-500 cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-300">Ceiling Potential (POT)</span>
                  <span className="font-mono font-bold text-amber-300">{Math.max(previewOvr, potential)}</span>
                </div>
                <input
                  type="range"
                  min={previewOvr}
                  max={99}
                  value={Math.max(previewOvr, potential)}
                  onChange={(e) => setPotential(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>
            </div>

            {/* Card Finish & Destination */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Card Foil Finish</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['CHROME', 'GOLD', 'EMERALD', 'OBSIDIAN'] as CardTheme[]).map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setCardTheme(t)}
                      className={`py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                        cardTheme === t
                          ? 'bg-sky-500 text-slate-950 border-sky-400'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">League Placement</label>
                <select
                  value={destination}
                  onChange={(e) => setDestination(e.target.value as 'ROSTER' | 'WAIVER' | 'VAULT_ONLY')}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                >
                  <option value="ROSTER" disabled={userRosterCount >= 30}>
                    Sign to {userTeam?.id || 'Team'} Active Roster ({userRosterCount}/30)
                  </option>
                  <option value="WAIVER">Add to League Waiver Pool (FA)</option>
                  <option value="VAULT_ONLY">Save Card to Vault Only</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Scouting Report Notes</label>
              <input
                type="text"
                maxLength={280}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMode('VAULT')}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-bold cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                {submitting ? 'Creating Card...' : 'Save Player Card'}
              </button>
            </div>
          </form>

          {/* Live Dynamic Card Preview */}
          <div className="lg:col-span-5">
            <div className={`rounded-2xl border overflow-hidden ${previewThemeStyle.frame}`}>
              <div className={`px-5 py-4 flex items-center justify-between ${previewThemeStyle.headerBg}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <PlayerAvatarSvg
                    player={previewPlayer}
                    team={destination === 'ROSTER' ? userTeam : null}
                    theme={cardTheme}
                    size={62}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <TeamBadge team={destination === 'ROSTER' ? userTeam : null} size="sm" />
                      <div className="font-display text-2xl font-extrabold text-white truncate">
                        {previewPlayer.name}
                      </div>
                    </div>
                    <div className="text-xs text-slate-300 font-mono mt-0.5">
                      {previewPlayer.position} · Age {previewPlayer.age} · B/T {previewPlayer.bats}/{previewPlayer.throws}
                    </div>
                  </div>
                </div>
                <RatingBadge value={previewPlayer.ovr} size="lg" />
              </div>

              <div className="p-5 space-y-4">
                <AttributeRadarSvg player={previewPlayer} theme={cardTheme} size={210} />
                <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
                  {notes || 'No scouting notes attached.'}
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
                  <span className={previewThemeStyle.accentText}>{cardTheme} EDITION</span>
                  <span>POT {previewPlayer.potential}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Theme Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg w-fit">
            {(['ALL', 'CHROME', 'GOLD', 'EMERALD', 'OBSIDIAN'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterTheme(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  filterTheme === t ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {filteredCards.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center space-y-3">
              <p className="text-sm text-slate-300 font-medium">
                No saved player cards in your vault yet.
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Click any player across your Roster, Draft Room, or Leaderboards to save their dynamic card, or build a custom prospect in the Card Creator.
              </p>
              <button
                onClick={() => setMode('CREATOR')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Create First Player Card
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredCards.map((card) => {
                const style = getCardThemeClasses(card.cardTheme);
                const team = card.teamId !== 'FA' ? teamMap[card.teamId] : null;
                const slash = !card.isPitcher ? getHitterSlash(card.seasonStats) : null;
                const ratios = card.isPitcher ? getPitcherRatios(card.seasonStats) : null;

                return (
                  <div key={card.id} className={`rounded-2xl border overflow-hidden flex flex-col ${style.frame}`}>
                    <div className={`px-4 py-3 flex items-center justify-between gap-2 ${style.headerBg}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PlayerAvatarSvg player={card} team={team} theme={card.cardTheme} size={52} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <TeamBadge team={team} size="sm" />
                            <div className="font-display text-lg font-extrabold text-white truncate">
                              {card.name}
                            </div>
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">
                            {card.position} · Age {card.age} · {card.bats}/{card.throws} · {card.isCustom ? 'Custom' : 'Scouted'}
                          </div>
                        </div>
                      </div>
                      <RatingBadge value={card.ovr} size="lg" />
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <AttributeRadarSvg player={card} theme={card.cardTheme} size={175} />

                      {/* Live Stat Summary Bar */}
                      <div className="grid grid-cols-3 gap-2 bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 text-center font-mono">
                        {card.isPitcher && ratios ? (
                          <>
                            <div>
                              <div className="text-[10px] text-slate-400">ERA</div>
                              <div className="text-xs font-bold text-white">{ratios.era}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">WHIP</div>
                              <div className="text-xs font-bold text-sky-400">{ratios.whip}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">SO / W</div>
                              <div className="text-xs font-bold text-emerald-400">
                                {card.seasonStats.so || 0} / {card.seasonStats.w || 0}
                              </div>
                            </div>
                          </>
                        ) : slash ? (
                          <>
                            <div>
                              <div className="text-[10px] text-slate-400">AVG</div>
                              <div className="text-xs font-bold text-white">{slash.avg}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">OPS</div>
                              <div className="text-xs font-bold text-emerald-400">{slash.ops}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">HR / RBI</div>
                              <div className="text-xs font-bold text-sky-400">
                                {card.seasonStats.hr || 0} / {card.seasonStats.rbi || 0}
                              </div>
                            </div>
                          </>
                        ) : null}
                      </div>

                      {card.notes && (
                        <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">{card.notes}</p>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                        <div className="flex items-center gap-1">
                          {(['CHROME', 'GOLD', 'EMERALD', 'OBSIDIAN'] as CardTheme[]).map((t) => (
                            <button
                              key={t}
                              onClick={() => onUpdateCardTheme(card, t)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                                card.cardTheme === t
                                  ? 'bg-slate-700 text-white font-bold'
                                  : 'text-slate-500 hover:text-slate-300'
                              }`}
                            >
                              {t.slice(0, 3)}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => onDeleteCard(card.id)}
                          aria-label={`Remove ${card.name} card`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
