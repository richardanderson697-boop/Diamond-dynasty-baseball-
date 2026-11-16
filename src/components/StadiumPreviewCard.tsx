import React, { useMemo } from 'react';
import { MapPin, Wind } from 'lucide-react';
import { StadiumProfile, STADIUM_PROFILES } from '../data/stadiums';
import { Team } from '../types/baseball';
import { TeamBadge } from './SharedBadges';

interface StadiumPreviewCardProps {
  stadium: StadiumProfile;
  team?: Team | null;
  allTeams?: Team[];
  selectedTeamId?: string;
  onSelectTeamId?: (teamId: string) => void;
  onPlayLiveGame?: () => void;
  canPlayLiveGame?: boolean;
  nextOpponentText?: string;
}

const HOME_X = 180;
const HOME_Y = 212;
const PX_PER_FT = 0.41;

function polarToSvg(angleDegFromUp: number, distFt: number): { x: number; y: number } {
  const rad = (angleDegFromUp * Math.PI) / 180;
  const r = distFt * PX_PER_FT;
  return {
    x: HOME_X + Math.sin(rad) * r,
    y: HOME_Y - Math.cos(rad) * r,
  };
}

function formatFactor(factor: number): { text: string; tone: string } {
  const pct = Math.round((factor - 1) * 100);
  if (pct > 0) return { text: `+${pct}%`, tone: 'text-emerald-400' };
  if (pct < 0) return { text: `${pct}%`, tone: 'text-sky-400' };
  return { text: '0%', tone: 'text-slate-300' };
}

export function StadiumPreviewCard({
  stadium,
  team,
  allTeams,
  selectedTeamId,
  onSelectTeamId,
  onPlayLiveGame,
  canPlayLiveGame,
  nextOpponentText,
}: StadiumPreviewCardProps) {
  const patternId = useMemo(() => `turf-${stadium.teamId}`, [stadium.teamId]);
  const clipId = useMemo(() => `fair-clip-${stadium.teamId}`, [stadium.teamId]);
  const skyId = useMemo(() => `sky-${stadium.teamId}`, [stadium.teamId]);

  const geometry = useMemo(() => {
    const lf = polarToSvg(-45, stadium.dimensions.lf);
    const lc = polarToSvg(-22.5, stadium.dimensions.lc);
    const cf = polarToSvg(0, stadium.dimensions.cf);
    const rc = polarToSvg(22.5, stadium.dimensions.rc);
    const rf = polarToSvg(45, stadium.dimensions.rf);

    // Smoothly connect fence corners and gaps
    const wallPoints = [lf, lc, cf, rc, rf];
    const fairPolygon = `${HOME_X},${HOME_Y} ${wallPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}`;

    const foulPad =
      stadium.foulTerritory === 'SPACIOUS' ? 24 : stadium.foulTerritory === 'TIGHT' ? 10 : 16;

    const foulLeftEnd = polarToSvg(-50, stadium.dimensions.lf * 0.92);
    const foulRightEnd = polarToSvg(50, stadium.dimensions.rf * 0.92);

    const wallSegments = [
      { a: lf, b: lc, h: (stadium.wallHeights.lf + stadium.wallHeights.lc) / 2 },
      { a: lc, b: cf, h: (stadium.wallHeights.lc + stadium.wallHeights.cf) / 2 },
      { a: cf, b: rc, h: (stadium.wallHeights.cf + stadium.wallHeights.rc) / 2 },
      { a: rc, b: rf, h: (stadium.wallHeights.rc + stadium.wallHeights.rf) / 2 },
    ];

    // 90 ft bases
    const b1 = polarToSvg(45, 90);
    const b2 = polarToSvg(0, 127.3);
    const b3 = polarToSvg(-45, 90);
    const pitcher = polarToSvg(0, 60.5);

    const markers = [
      { label: `${stadium.dimensions.lf}'`, ht: stadium.wallHeights.lf, pt: lf, dx: -14, dy: -6 },
      { label: `${stadium.dimensions.lc}'`, ht: stadium.wallHeights.lc, pt: lc, dx: -10, dy: -8 },
      { label: `${stadium.dimensions.cf}'`, ht: stadium.wallHeights.cf, pt: cf, dx: 0, dy: -9 },
      { label: `${stadium.dimensions.rc}'`, ht: stadium.wallHeights.rc, pt: rc, dx: 10, dy: -8 },
      { label: `${stadium.dimensions.rf}'`, ht: stadium.wallHeights.rf, pt: rf, dx: 14, dy: -6 },
    ];

    return {
      lf,
      lc,
      cf,
      rc,
      rf,
      fairPolygon,
      foulPad,
      foulLeftEnd,
      foulRightEnd,
      wallSegments,
      b1,
      b2,
      b3,
      pitcher,
      markers,
    };
  }, [stadium]);

  const skyStops =
    stadium.lighting === 'DAY'
      ? ['#0EA5E9', '#0C4A6E', '#090D16']
      : stadium.lighting === 'TWILIGHT'
      ? ['#9A3412', '#1E1B4B', '#090D16']
      : ['#0F172A', '#090D16', '#05080F'];

  const hrStat = formatFactor(stadium.parkFactors.hrFactor);
  const doublesStat = formatFactor(stadium.parkFactors.doublesFactor);
  const triplesStat = formatFactor(stadium.parkFactors.triplesFactor);
  const foulStat = formatFactor(stadium.parkFactors.foulOutFactor);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <TeamBadge team={team} />
          <div className="min-w-0">
            <h3 className="font-bold text-white text-sm truncate flex items-center gap-1.5">
              {stadium.name}
            </h3>
            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3 text-sky-400" />
                {stadium.city} · {stadium.elevationFt.toLocaleString()} ft
              </span>
              <span aria-hidden="true">·</span>
              <span>{stadium.roofType.replace('_', ' ')}</span>
              <span aria-hidden="true">·</span>
              <span>{stadium.surface.replace('_', ' ')}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {allTeams && onSelectTeamId && (
            <select
              aria-label="Select ballpark to scout"
              value={selectedTeamId || stadium.teamId}
              onChange={(e) => onSelectTeamId(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              {STADIUM_PROFILES.map((s) => (
                <option key={s.teamId} value={s.teamId}>
                  {s.teamId} · {s.name}
                </option>
              ))}
            </select>
          )}
          {onPlayLiveGame && (
            <button
              onClick={onPlayLiveGame}
              disabled={!canPlayLiveGame}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 text-xs font-bold transition cursor-pointer whitespace-nowrap"
            >
              {nextOpponentText || 'Play Live Game'}
            </button>
          )}
        </div>
      </div>

      {/* Content Split: SVG Field Schematic + Park Factors */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
          <svg
            viewBox="0 0 360 236"
            className="w-full h-auto block"
            role="img"
            aria-label={`${stadium.name} ballpark dimensions and field schematic`}
          >
            <defs>
              <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={skyStops[0]} stopOpacity="0.65" />
                <stop offset="48%" stopColor={skyStops[1]} stopOpacity="0.45" />
                <stop offset="100%" stopColor={skyStops[2]} />
              </linearGradient>

              <clipPath id={clipId}>
                <polygon points={geometry.fairPolygon} />
              </clipPath>

              {stadium.turfPattern === 'STRIPES' && (
                <pattern id={patternId} width="14" height="14" patternUnits="userSpaceOnUse">
                  <rect width="7" height="14" fill={stadium.grassPrimary} />
                  <rect x="7" width="7" height="14" fill={stadium.grassSecondary} />
                </pattern>
              )}
              {stadium.turfPattern === 'CHECKERBOARD' && (
                <pattern id={patternId} width="16" height="16" patternUnits="userSpaceOnUse">
                  <rect width="16" height="16" fill={stadium.grassPrimary} />
                  <rect width="8" height="8" fill={stadium.grassSecondary} />
                  <rect x="8" y="8" width="8" height="8" fill={stadium.grassSecondary} />
                </pattern>
              )}
              {stadium.turfPattern === 'DIAMOND' && (
                <pattern
                  id={patternId}
                  width="16"
                  height="16"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect width="16" height="16" fill={stadium.grassPrimary} />
                  <rect width="8" height="8" fill={stadium.grassSecondary} />
                  <rect x="8" y="8" width="8" height="8" fill={stadium.grassSecondary} />
                </pattern>
              )}
              {stadium.turfPattern === 'CONCENTRIC' && (
                <pattern
                  id={patternId}
                  width="360"
                  height="236"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="360" height="236" fill={stadium.grassPrimary} />
                  {[165, 140, 115, 90, 65].map((r, i) => (
                    <circle
                      key={r}
                      cx={HOME_X}
                      cy={HOME_Y}
                      r={r}
                      fill="none"
                      stroke={stadium.grassSecondary}
                      strokeWidth={i % 2 === 0 ? 12 : 10}
                      opacity="0.7"
                    />
                  ))}
                </pattern>
              )}
            </defs>

            {/* Sky / Dome Background */}
            <rect width="360" height="236" fill={`url(#${skyId})`} />

            {/* Horizon Backdrop Silhouette */}
            {stadium.backdrop === 'SKYLINE' && (
              <path
                d="M0,74 L18,74 L18,48 L36,48 L36,64 L54,64 L54,32 L72,32 L72,58 L98,58 L98,42 L116,42 L116,66 L246,66 L246,38 L266,38 L266,56 L290,56 L290,30 L310,30 L310,60 L332,60 L332,45 L360,45 L360,92 L0,92 Z"
                fill="#0F172A"
                opacity="0.75"
              />
            )}
            {stadium.backdrop === 'MOUNTAINS' && (
              <path
                d="M0,82 L44,44 L86,70 L132,34 L180,68 L234,36 L282,66 L326,40 L360,72 L360,96 L0,96 Z"
                fill="#1E293B"
                opacity="0.7"
              />
            )}
            {stadium.backdrop === 'WATERFRONT' && (
              <g opacity="0.7">
                <rect x="0" y="64" width="360" height="32" fill="#0369A1" opacity="0.35" />
                <path d="M12,68 Q48,63 84,68 T156,68 T228,68 T300,68 T360,68" stroke="#38BDF8" strokeWidth="1.2" fill="none" opacity="0.45" />
              </g>
            )}
            {stadium.backdrop === 'FOREST' && (
              <path
                d="M0,74 Q14,52 28,70 Q44,46 60,68 Q78,48 96,70 Q114,54 132,74 L228,74 Q246,52 264,70 Q282,46 300,68 Q318,50 336,72 Q348,54 360,70 L360,94 L0,94 Z"
                fill="#064E3B"
                opacity="0.65"
              />
            )}
            {stadium.backdrop === 'INDUSTRIAL' && (
              <path
                d="M0,74 L26,74 L26,46 L46,46 L46,62 L76,62 L76,40 L84,40 L84,62 L276,62 L276,42 L294,42 L294,64 L322,64 L322,36 L336,36 L336,74 L360,74 L360,94 L0,94 Z"
                fill="#1E293B"
                opacity="0.8"
              />
            )}
            {stadium.backdrop === 'DESERT' && (
              <path
                d="M0,76 L54,54 L88,54 L106,74 L252,74 L274,50 L306,50 L330,76 L360,76 L360,94 L0,94 Z"
                fill="#451A03"
                opacity="0.6"
              />
            )}

            {/* Retractable / Dome Roof Arch */}
            {stadium.roofType !== 'OPEN' && (
              <path
                d="M16,60 Q180,-10 344,60"
                fill="none"
                stroke="#94A3B8"
                strokeWidth={stadium.roofType === 'DOME' ? 2.5 : 1.8}
                strokeDasharray={stadium.roofType === 'RETRACTABLE_DOME' ? '6 4' : undefined}
                opacity="0.45"
              />
            )}

            {/* Foul Territory Apron */}
            <polygon
              points={`${HOME_X},${HOME_Y + geometry.foulPad} ${geometry.foulLeftEnd.x.toFixed(1)},${geometry.foulLeftEnd.y.toFixed(1)} ${geometry.lf.x.toFixed(1)},${geometry.lf.y.toFixed(1)} ${geometry.lc.x.toFixed(1)},${geometry.lc.y.toFixed(1)} ${geometry.cf.x.toFixed(1)},${geometry.cf.y.toFixed(1)} ${geometry.rc.x.toFixed(1)},${geometry.rc.y.toFixed(1)} ${geometry.rf.x.toFixed(1)},${geometry.rf.y.toFixed(1)} ${geometry.foulRightEnd.x.toFixed(1)},${geometry.foulRightEnd.y.toFixed(1)}`}
              fill={stadium.grassPrimary}
              opacity="0.42"
            />

            {/* Warning Track & Grass Field */}
            <g clipPath={`url(#${clipId})`}>
              <rect width="360" height="236" fill={`url(#${patternId})`} />
              {/* Dirt Infield Arc */}
              <circle cx={HOME_X} cy={HOME_Y - 38} r="48" fill={stadium.dirtColor} />
              {/* Infield Grass Diamond */}
              <polygon
                points={`${HOME_X},${HOME_Y - 12} ${geometry.b1.x.toFixed(1)},${geometry.b1.y.toFixed(1)} ${geometry.b2.x.toFixed(1)},${geometry.b2.y.toFixed(1)} ${geometry.b3.x.toFixed(1)},${geometry.b3.y.toFixed(1)}`}
                fill={stadium.grassSecondary}
              />
            </g>

            {/* Chalk Foul Lines */}
            <line
              x1={HOME_X}
              y1={HOME_Y}
              x2={geometry.lf.x}
              y2={geometry.lf.y}
              stroke="#E2E8F0"
              strokeWidth="1.2"
              opacity="0.7"
            />
            <line
              x1={HOME_X}
              y1={HOME_Y}
              x2={geometry.rf.x}
              y2={geometry.rf.y}
              stroke="#E2E8F0"
              strokeWidth="1.2"
              opacity="0.7"
            />

            {/* Outfield Wall Segments (thickness & height scaled by wall height!) */}
            {geometry.wallSegments.map((seg, i) => {
              const strokeW = Math.max(3, Math.min(9, seg.h / 4));
              return (
                <g key={i}>
                  <line
                    x1={seg.a.x}
                    y1={seg.a.y - strokeW * 0.4}
                    x2={seg.b.x}
                    y2={seg.b.y - strokeW * 0.4}
                    stroke="#F59E0B"
                    strokeWidth="1.4"
                    opacity="0.85"
                  />
                  <line
                    x1={seg.a.x}
                    y1={seg.a.y}
                    x2={seg.b.x}
                    y2={seg.b.y}
                    stroke={stadium.wallColor}
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                  />
                </g>
              );
            })}

            {/* Pitcher's Mound & Bases */}
            <circle cx={geometry.pitcher.x} cy={geometry.pitcher.y} r="5.5" fill={stadium.dirtColor} />
            <rect x={geometry.pitcher.x - 2} y={geometry.pitcher.y - 0.8} width="4" height="1.6" fill="#F8FAFC" />

            <rect x={geometry.b1.x - 2.5} y={geometry.b1.y - 2.5} width="5" height="5" fill="#F8FAFC" transform={`rotate(45 ${geometry.b1.x} ${geometry.b1.y})`} />
            <rect x={geometry.b2.x - 2.5} y={geometry.b2.y - 2.5} width="5" height="5" fill="#F8FAFC" transform={`rotate(45 ${geometry.b2.x} ${geometry.b2.y})`} />
            <rect x={geometry.b3.x - 2.5} y={geometry.b3.y - 2.5} width="5" height="5" fill="#F8FAFC" transform={`rotate(45 ${geometry.b3.x} ${geometry.b3.y})`} />
            <polygon
              points={`${HOME_X - 3},${HOME_Y - 1} ${HOME_X + 3},${HOME_Y - 1} ${HOME_X + 3},${HOME_Y + 2} ${HOME_X},${HOME_Y + 4} ${HOME_X - 3},${HOME_Y + 2}`}
              fill="#F8FAFC"
            />

            {/* Wall Distance & Height Labels */}
            {geometry.markers.map((m, idx) => (
              <g key={idx}>
                <text
                  x={m.pt.x + m.dx}
                  y={m.pt.y + m.dy}
                  textAnchor="middle"
                  fill="#F8FAFC"
                  fontSize="8.5"
                  fontWeight="700"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {m.label}
                </text>
                {m.ht >= 14 && (
                  <text
                    x={m.pt.x + m.dx}
                    y={m.pt.y + m.dy + 8}
                    textAnchor="middle"
                    fill="#FBBF24"
                    fontSize="7"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {m.ht}ft
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>

        {/* Park Factors & Ballpark Scouting Notes */}
        <div className="lg:col-span-5 space-y-3">
          <p className="text-xs text-slate-300 leading-relaxed">{stadium.summary}</p>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
              <div className="text-[11px] text-slate-400">Home Run Factor</div>
              <div className={`text-base font-bold font-mono tabular-nums mt-0.5 ${hrStat.tone}`}>
                {stadium.parkFactors.hrFactor.toFixed(2)}x ({hrStat.text})
              </div>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
              <div className="text-[11px] text-slate-400">Doubles Factor</div>
              <div className={`text-base font-bold font-mono tabular-nums mt-0.5 ${doublesStat.tone}`}>
                {stadium.parkFactors.doublesFactor.toFixed(2)}x ({doublesStat.text})
              </div>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
              <div className="text-[11px] text-slate-400">Triples Factor</div>
              <div className={`text-base font-bold font-mono tabular-nums mt-0.5 ${triplesStat.tone}`}>
                {stadium.parkFactors.triplesFactor.toFixed(2)}x ({triplesStat.text})
              </div>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
              <div className="text-[11px] text-slate-400">Foul Ground</div>
              <div className={`text-base font-bold font-mono tabular-nums mt-0.5 ${foulStat.tone}`}>
                {stadium.foulTerritory} ({foulStat.text})
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/80">
            <span className="inline-flex items-center gap-1.5">
              <Wind className="w-3.5 h-3.5 text-sky-400" />
              Cap: {stadium.capacity.toLocaleString()}
            </span>
            <span>
              LF {stadium.dimensions.lf}' · CF {stadium.dimensions.cf}' · RF {stadium.dimensions.rf}'
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
