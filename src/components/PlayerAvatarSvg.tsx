import React, { useMemo } from 'react';
import { CardTheme, Player, Team } from '../types/baseball';

interface PlayerAvatarSvgProps {
  player: Pick<Player, 'id' | 'name' | 'isPitcher' | 'bats' | 'throws' | 'position'>;
  team?: Pick<Team, 'id' | 'color' | 'accent'> | null;
  theme?: CardTheme;
  size?: number;
  className?: string;
}

const SKIN_TONES = [
  { base: '#F5D0B5', shade: '#E0AE8E' },
  { base: '#E6B792', shade: '#CD966E' },
  { base: '#C98F66', shade: '#AA704A' },
  { base: '#9F6945', shade: '#815030' },
  { base: '#7B4C2F', shade: '#5E361E' },
  { base: '#573421', shade: '#3E2213' },
];

const HAIR_COLORS = ['#18181B', '#271E17', '#4A2C1D', '#7C4A26', '#9A7236', '#334155'];

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function PlayerAvatarSvg({
  player,
  team,
  theme = 'CHROME',
  size = 76,
  className = '',
}: PlayerAvatarSvgProps) {
  const traits = useMemo(() => {
    const seed = hashString(`${player.id}|${player.name}|${player.position}`);
    const skin = SKIN_TONES[seed % SKIN_TONES.length];
    const hairColor = HAIR_COLORS[(seed >> 3) % HAIR_COLORS.length];
    const facialHair = (seed >> 6) % 5; // 0: clean, 1: stubble, 2: mustache, 3: goatee, 4: full beard
    const eyeStyle = (seed >> 9) % 2;
    const jawWidth = ((seed >> 11) % 3) - 1; // -1..1
    const jerseyNum = ((seed >> 13) % 97) + 1;
    return { skin, hairColor, facialHair, eyeStyle, jawWidth, jerseyNum };
  }, [player.id, player.name, player.position]);

  const primary = team?.color || '#1E293B';
  const accent = team?.accent || '#38BDF8';
  const monogram = team?.id ? team.id.slice(0, 2) : 'FA';

  const bgGradientId = useMemo(
    () => `av-bg-${hashString(`${player.id}-${theme}-${size}`)}`,
    [player.id, theme, size]
  );

  const bgTop =
    theme === 'GOLD'
      ? '#451A03'
      : theme === 'EMERALD'
      ? '#064E3B'
      : theme === 'OBSIDIAN'
      ? '#0F172A'
      : '#0C4A6E';

  const faceW = 19 + traits.jawWidth;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`rounded-xl border border-white/15 shrink-0 select-none ${className}`}
      aria-label={`${player.name} portrait`}
    >
      <defs>
        <linearGradient id={bgGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={bgTop} />
          <stop offset="100%" stopColor="#090D16" />
        </linearGradient>
      </defs>

      {/* Card Portrait Backdrop */}
      <rect width="100" height="100" fill={`url(#${bgGradientId})`} />
      <circle cx="50" cy="48" r="36" fill={primary} opacity="0.22" />

      {/* Subtle Action Silhouette behind player (bat or pitching ball) */}
      {player.isPitcher ? (
        <g opacity="0.28">
          <circle cx="82" cy="30" r="7" fill="#F8FAFC" />
          <path d="M77 25 Q82 30 77 35 M87 25 Q82 30 87 35" stroke="#DC2626" strokeWidth="1.2" fill="none" />
        </g>
      ) : (
        <g opacity="0.3">
          <line
            x1={player.bats === 'L' ? 18 : 82}
            y1="82"
            x2={player.bats === 'L' ? 32 : 68}
            y2="24"
            stroke="#D97706"
            strokeWidth="4.2"
            strokeLinecap="round"
          />
        </g>
      )}

      {/* Jersey Shoulders & Collar */}
      <path
        d="M12 100 C15 78 27 72 50 72 C73 72 85 78 88 100 Z"
        fill={primary}
      />
      <path
        d="M38 73 L50 88 L62 73"
        fill="none"
        stroke={accent}
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <path d="M40 73 L50 85 L60 73 Z" fill="#0F172A" opacity="0.35" />

      {/* Jersey Chest Number */}
      <text
        x="73"
        y="93"
        textAnchor="middle"
        fill={accent}
        fontSize="10"
        fontWeight="700"
        fontFamily="JetBrains Mono, monospace"
        opacity="0.9"
      >
        {traits.jerseyNum}
      </text>

      {/* Neck */}
      <rect x="42" y="59" width="16" height="16" rx="6" fill={traits.skin.shade} />

      {/* Ears */}
      <ellipse cx={50 - faceW} cy="45" rx="3.4" ry="5.5" fill={traits.skin.shade} />
      <ellipse cx={50 + faceW} cy="45" rx="3.4" ry="5.5" fill={traits.skin.shade} />

      {/* Head */}
      <path
        d={`M ${50 - faceW} 34 C ${50 - faceW} 20, ${50 + faceW} 20, ${50 + faceW} 34 L ${50 + faceW - 1} 49 C ${50 + faceW - 3} 62, 56 66, 50 66 C 44 66, ${50 - faceW + 3} 62, ${50 - faceW + 1} 49 Z`}
        fill={traits.skin.base}
      />

      {/* Side Hair */}
      <path
        d={`M ${50 - faceW} 34 L ${50 - faceW + 2} 42 L ${50 - faceW} 40 Z`}
        fill={traits.hairColor}
      />
      <path
        d={`M ${50 + faceW} 34 L ${50 + faceW - 2} 42 L ${50 + faceW} 40 Z`}
        fill={traits.hairColor}
      />

      {/* Facial Hair */}
      {traits.facialHair === 1 && (
        <path
          d={`M ${50 - faceW + 3} 50 C ${50 - faceW + 5} 62, ${50 + faceW - 5} 62, ${50 + faceW - 3} 50 C ${50 + faceW - 6} 59, ${50 - faceW + 6} 59, ${50 - faceW + 3} 50 Z`}
          fill={traits.hairColor}
          opacity="0.28"
        />
      )}
      {traits.facialHair === 2 && (
        <path
          d="M42 53 Q50 50 58 53 Q55 55 50 54 Q45 55 42 53 Z"
          fill={traits.hairColor}
        />
      )}
      {traits.facialHair === 3 && (
        <g fill={traits.hairColor}>
          <path d="M43 52 Q50 50 57 52 L55 64 Q50 67 45 64 Z" opacity="0.88" />
          <path d="M45 55 L55 55 L54 57 L46 57 Z" fill={traits.skin.base} />
        </g>
      )}
      {traits.facialHair === 4 && (
        <path
          d={`M ${50 - faceW + 1} 45 C ${50 - faceW + 2} 62, 42 67, 50 67 C 58 67, ${50 + faceW - 2} 62, ${50 + faceW - 1} 45 L ${50 + faceW - 4} 48 C ${50 + faceW - 6} 56, 56 54, 50 54 C 44 54, ${50 - faceW + 6} 56, ${50 - faceW + 4} 48 Z`}
          fill={traits.hairColor}
          opacity="0.92"
        />
      )}

      {/* Brows & Eyes */}
      <path d="M37 39 Q41 37 45 39" stroke={traits.hairColor} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M55 39 Q59 37 63 39" stroke={traits.hairColor} strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="41" cy="43" r={traits.eyeStyle === 0 ? 1.8 : 1.6} fill="#0F172A" />
      <circle cx="59" cy="43" r={traits.eyeStyle === 0 ? 1.8 : 1.6} fill="#0F172A" />

      {/* Nose & Determined Mouth */}
      <path d="M50 43 L49 50 L52 50" stroke={traits.skin.shade} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M45 56 Q50 58 55 56" stroke="#7C2D12" strokeWidth="1.5" strokeLinecap="round" fill="none" />

      {/* Team Cap Crown & Brim */}
      <path
        d={`M ${50 - faceW - 1} 33 C ${50 - faceW} 14, ${50 + faceW} 14, ${50 + faceW + 1} 33 Z`}
        fill={primary}
      />
      <path
        d={`M ${50 - faceW - 4} 33 Q 50 28 ${50 + faceW + 4} 33 Q 50 36 ${50 - faceW - 4} 33 Z`}
        fill={accent}
        opacity="0.95"
      />
      {/* Cap Button & Monogram */}
      <circle cx="50" cy="17" r="1.8" fill={accent} />
      <text
        x="50"
        y="27"
        textAnchor="middle"
        fill={accent}
        fontSize="8.5"
        fontWeight="800"
        fontFamily="Barlow Condensed, sans-serif"
      >
        {monogram}
      </text>
    </svg>
  );
}
