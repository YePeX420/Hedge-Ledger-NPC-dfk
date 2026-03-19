import type { ReactNode } from 'react';
import abilitiesData from '../../../extension/data/abilities.master.json';
import consumablesData from '../../../extension/data/consumables.master.json';
import enemyPoliciesData from '../../../extension/data/enemy_policies.master.json';
import statusesData from '../../../extension/data/statuses.master.json';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CombatAssetChip, formatCombatName } from '@/lib/dfk-combat-icons';

export type CombatTooltipKind = 'ability' | 'status' | 'consumable' | 'trait' | 'passive';

export interface CombatTooltipMeta {
  label: string;
  title: string;
  subtitle?: string | null;
  detailLines: string[];
  bullets: string[];
  note?: string | null;
  dispellable?: boolean;
  source: string;
}

export interface CombatTooltipResolutionInput {
  kind: CombatTooltipKind;
  name?: string | null;
  id?: string | null;
  iconUrl?: string | null;
  category?: string | null;
  stacks?: number | null;
  durationTurns?: number | null;
  available?: boolean | null;
  tooltipTitle?: string | null;
  tooltipSubtitle?: string | null;
  tooltipBullets?: string[] | null;
  tooltipNote?: string | null;
  dispellable?: boolean | null;
  amnesiaAbilityName?: string | null;
  amnesiaTurns?: number | null;
}

interface AbilityEffectRecord {
  type?: string;
  chanceFormula?: string;
  durationTurns?: number;
  durationTicks?: number;
  magnitudePct?: number;
  valuePct?: number;
  value?: number;
  formula?: string;
  target?: string;
  status?: string;
  [key: string]: unknown;
}

interface AbilityRecord {
  id: string;
  name: string;
  class?: string;
  discipline?: string;
  tier?: number;
  type?: string;
  manaCost?: number;
  range?: number | string | null;
  targeting?: Record<string, unknown> | null;
  damageFormula?: string | null;
  healFormula?: string | null;
  effects?: AbilityEffectRecord[];
  penalties?: Array<Record<string, unknown>>;
  passiveRules?: Array<Record<string, unknown>>;
  notes?: string[];
}

interface StatusRecord {
  id: string;
  name: string;
  category?: string;
  durationUnit?: string;
  stacks?: string;
  affectedByPurify?: boolean;
  affectedByCleanse?: boolean;
  notes?: string[];
}

interface ConsumableRecord {
  id: string;
  name: string;
  type?: string;
  weight?: number;
  initiativeModifier?: number;
  targeting?: string;
  durationTicks?: number;
  effectDescription?: string;
  effects?: Array<Record<string, unknown>>;
  notes?: string[];
}

interface EnemyPolicyRecord {
  enemyType?: string;
  enemyId?: string;
  actions?: Array<{ actionId?: string; weight?: number }>;
  thresholdRules?: Array<{ actionId?: string; notes?: string }>;
}

const abilityRecords = (((abilitiesData as unknown) as { abilities?: AbilityRecord[] }).abilities || []).filter(Boolean);
const statusRecords = (((statusesData as unknown) as { statuses?: StatusRecord[] }).statuses || []).filter(Boolean);
const consumableRecords = (((consumablesData as unknown) as { consumables?: ConsumableRecord[] }).consumables || []).filter(Boolean);
const enemyPolicies = (((enemyPoliciesData as unknown) as { policies?: EnemyPolicyRecord[] }).policies || []).filter(Boolean);

const abilityByKey = new Map<string, AbilityRecord>();
const statusByKey = new Map<string, StatusRecord>();
const consumableByKey = new Map<string, ConsumableRecord>();
const enemyPolicyByActionKey = new Map<string, EnemyPolicyRecord>();

const KEY_ALIASES: Record<string, string> = {
  'healthpotion': 'healthvial',
  'manapotion': 'manavial',
  'healthvial': 'healthvial',
  'manavial': 'manavial',
  'coagulant': 'coagulantpotion',
  'resistgeneric': 'resistgeneric',
};

function normalizeKey(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function getIconBasename(iconUrl: string | null | undefined): string {
  const raw = String(iconUrl || '').split('?')[0].split('#')[0];
  const fileName = raw.split('/').pop() || '';
  return fileName.replace(/\.[a-z0-9]+$/i, '');
}

function prettifyFallbackLabel(value: string | null | undefined, kind: CombatTooltipKind): string {
  const normalized = normalizeKey(value);
  if (!normalized || /^\d+$/.test(normalized) || /^effect\d*$/.test(normalized)) {
    return kind === 'status' ? 'Status Effect' : 'Unknown Effect';
  }
  return formatCombatName(value);
}

function canonicalizeKey(value: string | null | undefined): string {
  const normalized = normalizeKey(value);
  return KEY_ALIASES[normalized] || normalized;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function formatDuration(effect: AbilityEffectRecord | Record<string, unknown>): string {
  const durationTurns = typeof effect.durationTurns === 'number' ? effect.durationTurns : null;
  const durationTicks = typeof effect.durationTicks === 'number' ? effect.durationTicks : null;
  if (durationTurns != null) return ` for ${durationTurns} turn${durationTurns === 1 ? '' : 's'}`;
  if (durationTicks != null) return ` for ${durationTicks} ticks`;
  return '';
}

function formatTargetDescriptor(target: unknown): string {
  const raw = formatCombatName(String(target || 'target'));
  return raw.replace(/\bOn Hit\b/gi, '').trim();
}

function formatTargeting(targeting: Record<string, unknown> | null | undefined): string | null {
  if (!targeting) return null;
  const targetType = formatCombatName(String(targeting.targetType || ''));
  const targetCount = targeting.targetCount;
  const hits = targeting.hits;
  const parts: string[] = [];
  if (targetType) parts.push(targetType);
  if (typeof targetCount === 'number' && targetCount > 0) parts.push(`${targetCount} target${targetCount === 1 ? '' : 's'}`);
  if (typeof hits === 'number' && hits > 1) parts.push(`${hits} hits`);
  return parts.length ? parts.join(' | ') : null;
}

function formatGenericRecordDetails(record: Record<string, unknown>): string[] {
  const details: string[] = [];
  Object.entries(record).forEach(([key, value]) => {
    if (value == null || value === '' || key === 'type' || key === 'target') return;
    if (typeof value === 'string' || typeof value === 'number') {
      details.push(`${formatCombatName(key)}: ${value}`);
    }
  });
  return details;
}

function formatAbilityEffect(effect: AbilityEffectRecord): string {
  const type = canonicalizeKey(effect.type);
  const chancePrefix = effect.chanceFormula ? `${effect.chanceFormula} chance to ` : '';
  const duration = formatDuration(effect);
  const target = effect.target ? ` ${formatTargetDescriptor(effect.target)}` : '';
  switch (type) {
    case 'daze':
    case 'bleed':
    case 'blind':
    case 'burn':
    case 'poison':
    case 'taunt':
    case 'amnesia':
    case 'negate':
    case 'confuse':
      return `${chancePrefix}${formatCombatName(type)}${target}${duration}`.trim();
    case 'push':
    case 'pull':
      return `${chancePrefix}${formatCombatName(type)}${target}${duration}`.trim();
    case 'cleanse':
      return `Cleanse ${formatCombatName(String(effect.status || 'target'))}.`;
    case 'immunity':
      return `Gain immunity to ${formatCombatName(String(effect.status || 'status'))}${duration}.`;
    case 'critstrikechancebonus':
      return `Gain +${effect.magnitudePct ?? effect.valuePct ?? effect.value ?? 0}% crit strike chance.`;
    case 'accuracymodifier':
      return `${Number(effect.value ?? effect.magnitudePct ?? 0) >= 0 ? '+' : ''}${effect.value ?? effect.magnitudePct ?? 0}% ACC.`;
    default: {
      const details = formatGenericRecordDetails(effect);
      const generic = [formatCombatName(String(effect.type || 'effect')), ...details].join(' - ');
      return generic || 'Combat effect.';
    }
  }
}

function buildStatusMeta(record: StatusRecord, input: CombatTooltipResolutionInput): CombatTooltipMeta {
  const dispellable = Boolean(record.affectedByPurify || record.affectedByCleanse);
  const bullets = uniqueStrings(record.notes || []);
  return {
    label: record.name,
    title: record.name,
    subtitle: dispellable ? 'Can be dispelled' : null,
    detailLines: [],
    bullets,
    dispellable,
    source: 'statuses_master',
    note: input.category ? `Category: ${formatCombatName(input.category)}` : null,
  };
}

function buildAbilityMeta(record: AbilityRecord, input: CombatTooltipResolutionInput): CombatTooltipMeta {
  const detailLines = uniqueStrings([
    typeof record.manaCost === 'number' ? `Mana Cost: ${record.manaCost} MP` : null,
    record.range != null ? `Range: ${String(record.range)}` : null,
    formatTargeting(record.targeting),
  ]);
  const bullets = uniqueStrings([
    record.damageFormula ? `Damage Formula: ${record.damageFormula}` : null,
    record.healFormula ? `Heal Formula: ${record.healFormula}` : null,
    ...(record.effects || []).map(formatAbilityEffect),
    ...((record.penalties || []).flatMap((penalty) => formatGenericRecordDetails(penalty as Record<string, unknown>))),
    ...((record.notes || []).map((note) => String(note || '').replace(/â€”/g, '-'))),
  ]);
  return {
    label: input.name ? formatCombatName(input.name) : record.name,
    title: input.name ? formatCombatName(input.name) : record.name,
    subtitle: record.type === 'passive' ? 'Passive' : null,
    detailLines,
    bullets,
    source: 'abilities_master',
  };
}

function buildConsumableMeta(record: ConsumableRecord, input: CombatTooltipResolutionInput): CombatTooltipMeta {
  const detailLines = uniqueStrings([
    record.type ? formatCombatName(record.type) : null,
    record.targeting ? `Targeting: ${formatCombatName(record.targeting)}` : null,
    typeof record.initiativeModifier === 'number' ? `Initiative: ${record.initiativeModifier}` : null,
    typeof record.durationTicks === 'number' ? `Duration: ${record.durationTicks} ticks` : null,
  ]);
  const bullets = uniqueStrings([
    record.effectDescription,
    ...((record.effects || []).flatMap((effect) => formatGenericRecordDetails(effect))),
    ...(record.notes || []),
  ]);
  return {
    label: input.name ? formatCombatName(input.name) : record.name,
    title: input.name ? formatCombatName(input.name) : record.name,
    detailLines,
    bullets,
    source: 'consumables_master',
  };
}

function buildPolicyMeta(record: EnemyPolicyRecord, input: CombatTooltipResolutionInput): CombatTooltipMeta {
  const bullets = uniqueStrings([
    ...((record.thresholdRules || [])
      .filter((rule) => canonicalizeKey(rule.actionId) === canonicalizeKey(input.name))
      .map((rule) => rule.notes || null)),
  ]);
  return {
    label: input.name ? formatCombatName(input.name) : 'Enemy Action',
    title: input.name ? formatCombatName(input.name) : 'Enemy Action',
    detailLines: ['Enemy policy action'],
    bullets,
    source: 'enemy_policies_master',
  };
}

function buildFallbackMeta(input: CombatTooltipResolutionInput, inferredKey: string): CombatTooltipMeta {
  const fallbackTitle = prettifyFallbackLabel(inferredKey || input.name || input.id, input.kind);
  return {
    label: fallbackTitle,
    title: fallbackTitle,
    detailLines: [],
    bullets: [],
    source: 'fallback',
    note: input.category ? `Category: ${formatCombatName(input.category)}` : null,
  };
}

function buildRuntimeMeta(input: CombatTooltipResolutionInput): CombatTooltipMeta | null {
  const hasRuntimeContent =
    Boolean(input.tooltipTitle || input.tooltipSubtitle || input.tooltipNote) ||
    Boolean(input.tooltipBullets && input.tooltipBullets.length > 0) ||
    Boolean(input.amnesiaAbilityName && input.amnesiaTurns != null);
  if (!hasRuntimeContent) return null;

  const runtimeBullets = uniqueStrings([
    ...(input.tooltipBullets || []),
    input.amnesiaAbilityName && input.amnesiaTurns != null
      ? `Cannot use ${formatCombatName(input.amnesiaAbilityName)} for ${input.amnesiaTurns} turns.`
      : null,
  ]);
  const fallbackTitle = prettifyFallbackLabel(input.name || input.id, input.kind);
  const runtimeTitle = input.tooltipTitle || fallbackTitle;
  let runtimeSubtitle = input.tooltipSubtitle || null;
  if (!runtimeSubtitle && input.dispellable === true) runtimeSubtitle = 'Can be dispelled';

  return {
    label: runtimeTitle,
    title: runtimeTitle,
    subtitle: runtimeSubtitle,
    detailLines: [],
    bullets: runtimeBullets,
    note: input.tooltipNote || (input.category ? `Category: ${formatCombatName(input.category)}` : null),
    dispellable: input.dispellable ?? undefined,
    source: 'runtime_tooltip',
  };
}

const TOOLTIP_OVERRIDES: Partial<Record<CombatTooltipKind, Record<string, CombatTooltipMeta>>> = {
  status: {
    grunt: {
      label: 'Boar Attack Buff',
      title: 'Boar Attack Buff',
      subtitle: 'Can be dispelled',
      detailLines: [],
      bullets: ['Gain +30% ATTACK for 1 turn.'],
      source: 'mcp_override',
      dispellable: true,
    },
    amnesia: {
      label: 'Amnesia',
      title: 'Amnesia',
      detailLines: [],
      bullets: ['Prevents or disrupts ability usage for the listed number of turns.'],
      source: 'mcp_override',
    },
    daze: {
      label: 'Daze',
      title: 'Daze',
      detailLines: [],
      bullets: ['Disrupts action flow and combat tempo for the listed duration.'],
      source: 'mcp_override',
    },
    resistgeneric: {
      label: 'Resistance Trigger',
      title: 'Resistance Trigger',
      detailLines: [],
      bullets: ['The target resisted or mitigated an incoming effect.'],
      source: 'mcp_override',
    },
  },
  ability: {
    attack: {
      label: 'Attack',
      title: 'Basic Attack',
      detailLines: [],
      bullets: ['Perform a basic attack with the active hero.'],
      source: 'ui_override',
    },
    swap: {
      label: 'Swap',
      title: 'Swap',
      detailLines: [],
      bullets: ['Switch the active action panel or swap weapon stance when available.'],
      source: 'ui_override',
    },
    skip: {
      label: 'Skip',
      title: 'Skip',
      detailLines: [],
      bullets: ['Pass the current action window without using a skill or item.'],
      source: 'ui_override',
    },
    lilgore: {
      label: "Lil' Gore",
      title: "Lil' Gore",
      detailLines: ['Mana Cost: 0 MP', 'Range: 1'],
      bullets: [
        'Deal physical damage to target enemy equal to (1.0*ATTACK).',
        '15% chance to Push target 1.',
        '10% chance to Daze target.',
        '40% chance to inflict target with Bleed.',
      ],
      source: 'mcp_override',
    },
    charm: {
      label: 'Charm',
      title: 'Charm',
      detailLines: ['Mana Cost: 1 MP', 'Range: 3'],
      bullets: [
        'Target enemy in P3. On hit:',
        '50% chance to Pull P3 target 1.',
        'Target enemy in P2. On hit:',
        '50% chance to Pull P2 target 1.',
      ],
      source: 'mcp_override',
    },
    headbutt: {
      label: 'Head Butt',
      title: 'Head Butt',
      detailLines: ['Mana Cost: 2 MP', 'Range: 3'],
      bullets: [
        'Deal physical damage to target Channeling enemy equal to (1.2*ATTACK + 1.0*DEX).',
        'If no enemy is Channeling, deal physical damage to a random target enemy equal to (1.2*ATTACK + 1.0*DEX).',
        '60% chance to Daze target enemy for 1 turn.',
        'Amnesia 3.',
      ],
      source: 'mcp_override',
    },
    nuzzle: {
      label: 'Nuzzle',
      title: 'Nuzzle',
      detailLines: ['Mana Cost: 3 MP', 'Range: Party Members'],
      bullets: [
        'Heal target ally for an amount equal to (2.0*SPELL + 1.5*WIS).',
        'Restore an additional (1.5*SPELL) HP if the target is Big Boar.',
        'Cleanse target.',
        'If target is Big Boar, this Baby Boar gains +30% ATTACK for 2 turns.',
        'Amnesia 5.',
      ],
      source: 'mcp_override',
    },
    resilient: {
      label: 'Resilient',
      title: 'Resilient',
      subtitle: 'Passive',
      detailLines: [],
      bullets: [
        'Gain +5% Recovery chance while Blinded.',
        'Gain +5% Recovery chance while Poisoned.',
        'Gain +5% Recovery chance while Burned.',
        'Gain +5% Recovery chance while Chilled.',
      ],
      source: 'mcp_override',
    },
    grunt: {
      label: 'Grunt',
      title: 'Grunt',
      detailLines: [],
      bullets: ['Gain +30% ATTACK for 1 turn.'],
      source: 'mcp_override',
    },
  },
  consumable: {
    healthpotion: {
      label: 'Health Potion',
      title: 'Health Potion',
      detailLines: ['Heal item'],
      bullets: ['Heal target for 35% of max HP.'],
      source: 'alias_override',
    },
    manapotion: {
      label: 'Mana Potion',
      title: 'Mana Potion',
      detailLines: ['Mana item'],
      bullets: ['Restore target MP.'],
      source: 'alias_override',
    },
  },
};

function buildIndex() {
  abilityRecords.forEach((record) => {
    abilityByKey.set(canonicalizeKey(record.name), record);
    abilityByKey.set(canonicalizeKey(record.id), record);
  });
  statusRecords.forEach((record) => {
    statusByKey.set(canonicalizeKey(record.name), record);
    statusByKey.set(canonicalizeKey(record.id), record);
  });
  consumableRecords.forEach((record) => {
    consumableByKey.set(canonicalizeKey(record.name), record);
    consumableByKey.set(canonicalizeKey(record.id), record);
  });
  enemyPolicies.forEach((record) => {
    (record.actions || []).forEach((action) => {
      enemyPolicyByActionKey.set(canonicalizeKey(action.actionId), record);
    });
  });
}

buildIndex();

function collectLookupKeys(input: CombatTooltipResolutionInput): string[] {
  const iconBase = getIconBasename(input.iconUrl);
  const keys = uniqueStrings([
    input.name,
    input.id,
    iconBase,
    iconBase.replace(/[-_]/g, ''),
    input.iconUrl && input.iconUrl.includes('chatterbox') ? 'charm' : null,
    input.iconUrl && input.iconUrl.includes('grunt.png') ? 'grunt' : null,
    input.iconUrl && input.iconUrl.includes('amnesia') ? 'amnesia' : null,
    input.iconUrl && input.iconUrl.includes('daze') ? 'daze' : null,
    input.iconUrl && input.iconUrl.includes('resist-generic') ? 'resistgeneric' : null,
  ]).map(canonicalizeKey);
  return [...new Set(keys.filter(Boolean))];
}

export function resolveCombatTooltipMeta(input: CombatTooltipResolutionInput): CombatTooltipMeta {
  const runtimeMeta = buildRuntimeMeta(input);
  if (runtimeMeta) return runtimeMeta;

  const lookupKeys = collectLookupKeys(input);
  for (const key of lookupKeys) {
    const override = TOOLTIP_OVERRIDES[input.kind]?.[key];
    if (override) {
      return {
        ...override,
        label: override.label || prettifyFallbackLabel(input.name || key, input.kind),
        title: override.title || prettifyFallbackLabel(input.name || key, input.kind),
        detailLines: override.detailLines || [],
        bullets: override.bullets || [],
        source: override.source || 'override',
      };
    }
  }

  if (input.kind === 'status') {
    for (const key of lookupKeys) {
      const record = statusByKey.get(key);
      if (record) return buildStatusMeta(record, input);
    }
  }

  if (input.kind === 'consumable') {
    for (const key of lookupKeys) {
      const record = consumableByKey.get(key);
      if (record) return buildConsumableMeta(record, input);
    }
  }

  if (input.kind === 'ability' || input.kind === 'trait' || input.kind === 'passive') {
    for (const key of lookupKeys) {
      const record = abilityByKey.get(key);
      if (record) return buildAbilityMeta(record, input);
    }
    for (const key of lookupKeys) {
      const policy = enemyPolicyByActionKey.get(key);
      if (policy) return buildPolicyMeta(policy, input);
    }
  }

  return buildFallbackMeta(input, lookupKeys[0] || input.name || input.id || '');
}

export function CombatMetaTooltip({
  input,
  children,
  side = 'top',
}: {
  input: CombatTooltipResolutionInput;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const meta = resolveCombatTooltipMeta(input);
  const footerBits = uniqueStrings([
    typeof input.stacks === 'number' && input.stacks > 0 ? `Stacks: ${input.stacks}` : null,
    typeof input.durationTurns === 'number' && input.durationTurns > 0 ? `Duration: ${input.durationTurns}t` : null,
    input.available === false ? 'Currently unavailable' : null,
  ]);
  const chipKind = input.kind === 'consumable' ? 'consumable' : input.kind === 'status' ? 'status' : 'ability';

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={8}
          className="max-w-[320px] space-y-2 border border-white/10 bg-zinc-950 text-white shadow-2xl"
        >
          <div className="flex items-start gap-2">
            <CombatAssetChip kind={chipKind} name={meta.title} imageUrl={input.iconUrl || null} size="sm" />
            <div className="space-y-1">
              <p className="text-sm font-semibold leading-tight">{meta.title}</p>
              {meta.subtitle && <p className="text-[11px] text-zinc-200">{meta.subtitle}</p>}
              {meta.detailLines.map((line) => (
                <p key={line} className="text-[10px] uppercase tracking-wide text-zinc-300">
                  {line}
                </p>
              ))}
            </div>
          </div>

          {meta.bullets.length > 0 && (
            <ul className="space-y-1 pl-4 text-[11px] text-zinc-100">
              {meta.bullets.map((line) => (
                <li key={line} className="list-disc leading-snug">
                  {line}
                </li>
              ))}
            </ul>
          )}

          {meta.note && <p className="text-[10px] text-zinc-300">{meta.note}</p>}
          {footerBits.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-2 text-[10px] text-zinc-400">
              {footerBits.map((bit) => (
                <span key={bit}>{bit}</span>
              ))}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
