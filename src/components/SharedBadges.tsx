import React from 'react';
import { CardTheme, Player, Team } from '../types/baseball';
import { getRatingColor } from '../engine/baseballEngine';

export function RatingBadge({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
  const cls = getRatingColor(value);
  const sz =
    size === 'lg'
      ? 'px-2.5 py-1 text-sm font-bold'
      : 'px-1.5 py-0.5 text-xs font-semibold';
  return (
    <span className={`inline-flex items-center justify-center rounded border font-mono tabular-nums ${sz} ${cls}`}>
      {value}
    </span>
  );
}

export function TeamBadge({
  team,
  size = 'sm',
}: {
  team?: Pick<Team, 'id' | 'color' | 'accent'> | null;
  size?: 'sm' | 'lg';
}) {
  if (!team) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-mono font-semibold bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
        FA
      </span>
    );
  }
  const sz = size === 'lg' ? 'w-10 h-10 text-sm' : 'w-6 h-6 text-[10px]';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-bold tracking-tight shrink-0 border border-white/15 font-mono ${sz}`}
      style={{ backgroundColor: team.color, color: team.accent }}
    >
      {team.id}
    </span>
  );
}

export function getCardThemeClasses(theme: CardTheme): {
  frame: string;
  headerBg: string;
  accentText: string;
  polygonFill: string;
  polygonStroke: string;
} {
  switch (theme) {
    case 'GOLD':
      return {
        frame: 'border-amber-500/50 bg-gradient-to-br from-amber-950/35 via-slate-900 to-slate-950',
        headerBg: 'bg-amber-500/10 border-b border-amber-500/25',
        accentText: 'text-amber-300',
        polygonFill: 'rgba(245, 158, 11, 0.24)',
        polygonStroke: '#F59E0B',
      };
    case 'EMERALD':
      return {
        frame: 'border-emerald-500/50 bg-gradient-to-br from-emerald-950/35 via-slate-900 to-slate-950',
        headerBg: 'bg-emerald-500/10 border-b border-emerald-500/25',
        accentText: 'text-emerald-300',
        polygonFill: 'rgba(16, 185, 129, 0.24)',
        polygonStroke: '#10B981',
      };
    case 'OBSIDIAN':
      return {
        frame: 'border-slate-600/70 bg-gradient-to-br from-slate-900 via-[#090D16] to-black',
        headerBg: 'bg-slate-800/40 border-b border-slate-700/70',
        accentText: 'text-slate-200',
        polygonFill: 'rgba(148, 163, 184, 0.22)',
        polygonStroke: '#94A3B8',
      };
    case 'CHROME':
    default:
      return {
        frame: 'border-sky-500/45 bg-gradient-to-br from-sky-950/35 via-slate-900 to-slate-950',
        headerBg: 'bg-sky-500/10 border-b border-sky-500/25',
        accentText: 'text-sky-300',
        polygonFill: 'rgba(56, 189, 248, 0.24)',
        polygonStroke: '#38BDF8',
      };
  }
}

export function AttributeRadarSvg({
  player,
  theme = 'CHROME',
  size = 190,
}: {
  player: Pick<
    Player,
    'isPitcher' | 'ovr' | 'potential' | 'power' | 'speed' | 'glove' | 'velocity' | 'control' | 'finesse'
  >;
  theme?: CardTheme;
  size?: number;
}) {
  const axes = player.isPitcher
    ? [
        { label: 'VEL', value: player.velocity ?? 50 },
        { label: 'CTL', value: player.control ?? 50 },
        { label: 'FIN', value: player.finesse ?? 50 },
        { label: 'OVR', value: player.ovr },
        { label: 'POT', value: player.potential },
      ]
    : [
        { label: 'POW', value: player.power ?? 50 },
        { label: 'SPD', value: player.speed ?? 50 },
        { label: 'GLV', value: player.glove ?? 50 },
        { label: 'OVR', value: player.ovr },
        { label: 'POT', value: player.potential },
      ];

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.33;
  const themeStyle = getCardThemeClasses(theme);

  const getPoint = (idx: number, val: number) => {
    const angle = (Math.PI * 2 * idx) / axes.length - Math.PI / 2;
    const norm = Math.max(0.15, Math.min(1, val / 99));
    return {
      x: cx + Math.cos(angle) * maxR * norm,
      y: cy + Math.sin(angle) * maxR * norm,
    };
  };

  const rings = [0.33, 0.66, 1.0];
  const dataPoints = axes.map((a, i) => getPoint(i, a.value));
  const polygonStr = dataPoints.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto select-none">
      {rings.map((r, rIdx) => {
        const pts = axes
          .map((_, i) => {
            const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
            const x = cx + Math.cos(angle) * maxR * r;
            const y = cy + Math.sin(angle) * maxR * r;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ');
        return (
          <polygon
            key={rIdx}
            points={pts}
            fill="none"
            stroke="rgba(148, 163, 184, 0.2)"
            strokeWidth={1}
          />
        );
      })}

      {axes.map((a, i) => {
        const outer = getPoint(i, 99);
        const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
        const lx = cx + Math.cos(angle) * (maxR + 18);
        const ly = cy + Math.sin(angle) * (maxR + 18);
        return (
          <g key={a.label}>
            <line
              x1={cx}
              y1={cy}
              x2={outer.x}
              y2={outer.y}
              stroke="rgba(148, 163, 184, 0.18)"
              strokeWidth={1}
            />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#94A3B8"
              fontSize="10"
              fontWeight="600"
              fontFamily="JetBrains Mono, monospace"
            >
              {a.label} {a.value}
            </text>
          </g>
        );
      })}

      <polygon
        points={polygonStr}
        fill={themeStyle.polygonFill}
        stroke={themeStyle.polygonStroke}
        strokeWidth={2}
      />

      {dataPoints.map((pt, i) => (
        <circle
          key={i}
          cx={pt.x}
          cy={pt.y}
          r={3}
          fill={themeStyle.polygonStroke}
        />
      ))}
    </svg>
  );
}
