import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Axe,
  Droplets,
  Eye,
  Flame,
  FlaskConical,
  HeartPulse,
  Lock,
  Moon,
  Shield,
  Skull,
  Snowflake,
  Sparkles,
  Swords,
  Target,
  WandSparkles,
  Wind,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type CombatAssetKind = 'hero' | 'enemy' | 'ability' | 'status' | 'consumable';

type CombatAssetTheme = {
  icon: LucideIcon;
  bgClass: string;
  ringClass: string;
  textClass: string;
  shortLabel?: string;
};

const DEFAULT_THEME: CombatAssetTheme = {
  icon: Sparkles,
  bgClass: 'bg-slate-500/15',
  ringClass: 'ring-slate-400/20',
  textClass: 'text-slate-200',
};

const DFK_ASSET_BASE = 'https://game.defikingdoms.com/assets';

const DFK_ABILITY_IMAGE_MAP: Record<string, string> = {
  flurry: `${DFK_ASSET_BASE}/ability-icons/archer/flurry.png`,
  huntersmark: `${DFK_ASSET_BASE}/ability-icons/archer/huntersmark.png`,
  multishot: `${DFK_ASSET_BASE}/ability-icons/archer/multishot.png`,
  rapidshot: `${DFK_ASSET_BASE}/ability-icons/archer/rapidshot.png`,
  repeatingshot: `${DFK_ASSET_BASE}/ability-icons/archer/repeatingshot.png`,
  blindingwinds: `${DFK_ASSET_BASE}/ability-icons/archer/blindingwinds.png`,
  deathmark: `${DFK_ASSET_BASE}/ability-icons/archer/deathmark.png`,
  charm: `${DFK_ASSET_BASE}/ability-icons/boar/charm.png`,
  grunt: `${DFK_ASSET_BASE}/ability-icons/boar/grunt.png`,
  headbutt: `${DFK_ASSET_BASE}/ability-icons/boar/headbutt.png`,
  lilgore: `${DFK_ASSET_BASE}/ability-icons/boar/lilgore.png`,
  nuzzle: `${DFK_ASSET_BASE}/ability-icons/boar/nuzzle.png`,
};

const DFK_HERO_CLASS_IMAGE_MAP: Record<string, string> = {
  archer: `${DFK_ASSET_BASE}/class-icons/archer.png`,
  knight: `${DFK_ASSET_BASE}/class-icons/knight.png`,
  warrior: `${DFK_ASSET_BASE}/class-icons/warrior.png`,
  priest: `${DFK_ASSET_BASE}/class-icons/priest.png`,
  wizard: `${DFK_ASSET_BASE}/class-icons/wizard.png`,
  pirate: `${DFK_ASSET_BASE}/class-icons/pirate.png`,
  berserker: `${DFK_ASSET_BASE}/class-icons/berserker.png`,
  seer: `${DFK_ASSET_BASE}/class-icons/seer.png`,
  monk: `${DFK_ASSET_BASE}/class-icons/monk.png`,
};

function normalizeKey(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[#()[\]/]/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function monogram(value: string | null | undefined, fallback = '?') {
  const cleaned = String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!cleaned) return fallback;
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
}

function heroTheme(name: string, heroClass?: string | null): CombatAssetTheme {
  const key = normalizeKey(heroClass || name);
  if (key.includes('archer')) return { icon: Target, bgClass: 'bg-emerald-500/15', ringClass: 'ring-emerald-400/20', textClass: 'text-emerald-200', shortLabel: 'AR' };
  if (key.includes('knight')) return { icon: Shield, bgClass: 'bg-sky-500/15', ringClass: 'ring-sky-400/20', textClass: 'text-sky-200', shortLabel: 'KN' };
  if (key.includes('warrior')) return { icon: Swords, bgClass: 'bg-orange-500/15', ringClass: 'ring-orange-400/20', textClass: 'text-orange-200', shortLabel: 'WA' };
  if (key.includes('priest')) return { icon: HeartPulse, bgClass: 'bg-rose-500/15', ringClass: 'ring-rose-400/20', textClass: 'text-rose-200', shortLabel: 'PR' };
  if (key.includes('wizard')) return { icon: WandSparkles, bgClass: 'bg-violet-500/15', ringClass: 'ring-violet-400/20', textClass: 'text-violet-200', shortLabel: 'WI' };
  if (key.includes('pirate')) return { icon: Axe, bgClass: 'bg-amber-500/15', ringClass: 'ring-amber-400/20', textClass: 'text-amber-200', shortLabel: 'PI' };
  if (key.includes('berserker')) return { icon: Axe, bgClass: 'bg-red-500/15', ringClass: 'ring-red-400/20', textClass: 'text-red-200', shortLabel: 'BE' };
  if (key.includes('seer')) return { icon: Eye, bgClass: 'bg-cyan-500/15', ringClass: 'ring-cyan-400/20', textClass: 'text-cyan-200', shortLabel: 'SE' };
  return { ...DEFAULT_THEME, shortLabel: monogram(heroClass || name, 'HR') };
}

function enemyTheme(name: string): CombatAssetTheme {
  const key = normalizeKey(name);
  if (key.includes('boar')) return { icon: Skull, bgClass: 'bg-red-500/15', ringClass: 'ring-red-400/20', textClass: 'text-red-200', shortLabel: 'BR' };
  if (key.includes('gore')) return { icon: Skull, bgClass: 'bg-red-500/15', ringClass: 'ring-red-400/20', textClass: 'text-red-200', shortLabel: 'LG' };
  return { icon: Skull, bgClass: 'bg-orange-500/15', ringClass: 'ring-orange-400/20', textClass: 'text-orange-200', shortLabel: monogram(name, 'EN') };
}

function abilityTheme(name: string): CombatAssetTheme {
  const key = normalizeKey(name);
  if (/(shot|arrow|aim|winds)/.test(key)) return { icon: Wind, bgClass: 'bg-emerald-500/15', ringClass: 'ring-emerald-400/20', textClass: 'text-emerald-200' };
  if (/(heal|renew|recover|vigor)/.test(key)) return { icon: HeartPulse, bgClass: 'bg-blue-500/15', ringClass: 'ring-blue-400/20', textClass: 'text-blue-200' };
  if (/(gore|head_butt|charge|smash|strike|slash|cleave|vigilant|challenge)/.test(key)) return { icon: Swords, bgClass: 'bg-rose-500/15', ringClass: 'ring-rose-400/20', textClass: 'text-rose-200' };
  if (/(burn|flame|inferno|fire)/.test(key)) return { icon: Flame, bgClass: 'bg-orange-500/15', ringClass: 'ring-orange-400/20', textClass: 'text-orange-200' };
  if (/(chill|ice|frost|freeze)/.test(key)) return { icon: Snowflake, bgClass: 'bg-cyan-500/15', ringClass: 'ring-cyan-400/20', textClass: 'text-cyan-200' };
  if (/(poison|toxic|venom)/.test(key)) return { icon: Droplets, bgClass: 'bg-lime-500/15', ringClass: 'ring-lime-400/20', textClass: 'text-lime-200' };
  return { icon: Zap, bgClass: 'bg-violet-500/15', ringClass: 'ring-violet-400/20', textClass: 'text-violet-200' };
}

function statusTheme(name: string): CombatAssetTheme {
  const key = normalizeKey(name);
  if (key.includes('bleed')) return { icon: Droplets, bgClass: 'bg-red-500/15', ringClass: 'ring-red-400/20', textClass: 'text-red-200' };
  if (key.includes('burn')) return { icon: Flame, bgClass: 'bg-orange-500/15', ringClass: 'ring-orange-400/20', textClass: 'text-orange-200' };
  if (key.includes('blind')) return { icon: Eye, bgClass: 'bg-slate-400/15', ringClass: 'ring-slate-300/20', textClass: 'text-slate-100' };
  if (key.includes('poison')) return { icon: Droplets, bgClass: 'bg-lime-500/15', ringClass: 'ring-lime-400/20', textClass: 'text-lime-200' };
  if (key.includes('stun') || key.includes('daze')) return { icon: Zap, bgClass: 'bg-yellow-500/15', ringClass: 'ring-yellow-400/20', textClass: 'text-yellow-200' };
  if (key.includes('sleep')) return { icon: Moon, bgClass: 'bg-indigo-500/15', ringClass: 'ring-indigo-400/20', textClass: 'text-indigo-200' };
  if (key.includes('amnesia') || key.includes('silence') || key.includes('lock')) return { icon: Lock, bgClass: 'bg-fuchsia-500/15', ringClass: 'ring-fuchsia-400/20', textClass: 'text-fuchsia-200' };
  if (key.includes('taunt') || key.includes('intimidate')) return { icon: AlertTriangle, bgClass: 'bg-amber-500/15', ringClass: 'ring-amber-400/20', textClass: 'text-amber-200' };
  if (key.includes('chill') || key.includes('freeze')) return { icon: Snowflake, bgClass: 'bg-cyan-500/15', ringClass: 'ring-cyan-400/20', textClass: 'text-cyan-200' };
  if (key.includes('vigor') || key.includes('regen') || key.includes('heal')) return { icon: HeartPulse, bgClass: 'bg-blue-500/15', ringClass: 'ring-blue-400/20', textClass: 'text-blue-200' };
  return { icon: Sparkles, bgClass: 'bg-slate-500/15', ringClass: 'ring-slate-400/20', textClass: 'text-slate-200' };
}

function consumableTheme(name: string): CombatAssetTheme {
  const key = normalizeKey(name);
  if (key.includes('anti_') || key.includes('potion')) return { icon: FlaskConical, bgClass: 'bg-teal-500/15', ringClass: 'ring-teal-400/20', textClass: 'text-teal-200' };
  return { icon: FlaskConical, bgClass: 'bg-violet-500/15', ringClass: 'ring-violet-400/20', textClass: 'text-violet-200' };
}

function getTheme(kind: CombatAssetKind, name: string, secondary?: string | null) {
  switch (kind) {
    case 'hero':
      return heroTheme(name, secondary);
    case 'enemy':
      return enemyTheme(name);
    case 'ability':
      return abilityTheme(name);
    case 'status':
      return statusTheme(name);
    case 'consumable':
      return consumableTheme(name);
    default:
      return DEFAULT_THEME;
  }
}

export function resolveCombatAssetImageUrl(
  kind: CombatAssetKind,
  name: string,
  secondaryLabel?: string | null,
) {
  const key = normalizeKey(name);
  const secondaryKey = normalizeKey(secondaryLabel);
  if (kind === 'hero') {
    return DFK_HERO_CLASS_IMAGE_MAP[secondaryKey] || DFK_HERO_CLASS_IMAGE_MAP[key] || null;
  }
  if (kind === 'ability') {
    return DFK_ABILITY_IMAGE_MAP[key] || null;
  }
  return null;
}

export function CombatAssetChip({
  kind,
  name,
  secondaryLabel,
  imageUrl,
  size = 'sm',
  className,
}: {
  kind: CombatAssetKind;
  name: string;
  secondaryLabel?: string | null;
  imageUrl?: string | null;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const theme = getTheme(kind, name, secondaryLabel);
  const Icon = theme.icon;
  const resolvedImageUrl = imageUrl || resolveCombatAssetImageUrl(kind, name, secondaryLabel);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [resolvedImageUrl]);
  const sizing = size === 'xs'
    ? 'h-5 w-5 text-[9px]'
    : size === 'md'
    ? 'h-8 w-8 text-[11px]'
    : 'h-6 w-6 text-[10px]';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md ring-1',
        sizing,
        theme.bgClass,
        theme.ringClass,
        theme.textClass,
        className,
      )}
      title={name}
    >
      {resolvedImageUrl && !imageFailed ? (
        <img
          src={resolvedImageUrl}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <>
          <Icon className={size === 'md' ? 'h-4 w-4' : 'h-3 w-3'} />
          <span className="sr-only">{name}</span>
        </>
      )}
    </span>
  );
}

export function formatCombatName(value: string | null | undefined) {
  return String(value || '')
    .replace(/[_#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
