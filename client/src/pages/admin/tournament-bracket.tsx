import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowLeft, Trophy, Medal, Copy, Check, Users, Gift, Info, RefreshCw, Shield, Sword, Zap, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import {
  ACTIVE_SKILLS, PASSIVE_SKILLS,
  ABILITY_RARITY_COLORS, ABILITY_RARITY_BORDER,
  getActiveSkill, getPassiveSkill,
} from '@/data/dfk-abilities';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BracketMatch {
  slotA: number;
  slotB: number;
  winner: number;
}

interface BracketData {
  rounds: BracketMatch[][];
  champion: number;
}

interface RewardTier {
  tier: string;
  jewel: number;
  items: { tokenId: number; amount: number; name: string }[];
  isChampion: boolean;
}

interface TournamentDetail {
  id: number;
  name: string;
  stateLabel: string;
  tournamentType: number;
  rounds: number;
  roundLengthMinutes: number;
  bestOf: number;
  tournamentStartTime: number;
  entryPeriodStart: number;
  entrants: number;
  entrantsClaimed: number;
  maxEntrants: number;
  partyCount: number;
  format: string | null;
  shotClockDuration: number;
  bankedShotClockTime: number;
  shotClockPenaltyMode: number;
  shotClockPenaltyLabel: string;
  shotClockForfeitCount: number;
  suddenDeathMode: number;
  suddenDeathLabel: string;
  durabilityPerRound: number;
  battleInventory: number;
  battleBudget: number;
  minLevel: number | null;
  maxLevel: number | null;
  minRarity: number | null;
  maxRarity: number | null;
  excludedClasses: string[];
  allUniqueClasses: boolean;
  noTripleClasses: boolean;
  onlyPJ: boolean;
  onlyBannermen: boolean;
  maxTeamTraitScore: number;
  entryFee: number;
  hostAddress: string | null;
  hostTier: number;
  hostTierLabel: string;
  tournamentHosted: boolean;
  tournamentSponsored: boolean;
}

interface HeroEquipItem {
  id: string;
  displayId: number;
  normalizedId: number | string;
  rarity: number;
  durability: number;
  maxDurability: number;
}

interface HeroWeapon extends HeroEquipItem {
  weaponType: number;
  baseDamage: number;
  basePotency: number;
  bonus1: number; bonus2: number; bonus3: number; bonus4: number;
  bonusScalar1: number; bonusScalar2: number; bonusScalar3: number; bonusScalar4: number;
}

interface HeroArmor extends HeroEquipItem {
  armorType: number;
  rawPhysDefense: number; physDefScalar: number;
  rawMagicDefense: number; magicDefScalar: number;
  evasion: number;
  bonus1: number; bonus2: number; bonus3: number; bonus4: number; bonus5: number;
  bonusScalar1: number; bonusScalar2: number; bonusScalar3: number; bonusScalar4: number; bonusScalar5: number;
}

interface HeroAccessory extends HeroEquipItem {
  equipmentType: number;
  bonus1: number; bonus2: number; bonus3: number; bonus4: number; bonus5: number;
  bonusScalar1: number; bonusScalar2: number; bonusScalar3: number; bonusScalar4: number; bonusScalar5: number;
}

interface HeroPet {
  id: string;
  normalizedId: string;
  name: string;
  rarity: number;
  element: number;
  eggType: number;
  season: number;
  shiny: boolean;
  combatBonus: number;
  combatBonusScalar: number;
}

interface HeroDetail {
  id: string;
  normalizedId: string;
  mainClassStr: string;
  subClassStr: string;
  level: number;
  rarity: number;
  element: number;
  strength: number; agility: number; dexterity: number; intelligence: number;
  wisdom: number; vitality: number; endurance: number; luck: number;
  hp: number; mp: number;
  active1: number; active2: number;
  passive1: number; passive2: number;
  pjStatus: string | null;
  pjLevel: number | null;
  pet: HeroPet | null;
  weapon1: HeroWeapon | null;
  weapon2: HeroWeapon | null;
  offhand1: HeroAccessory | null;
  offhand2: HeroAccessory | null;
  armor: HeroArmor | null;
  accessory: HeroAccessory | null;
}

interface PlayerEntry {
  address: string;
  partyIndex: number;
  heroIds: number[];
  heroes: HeroDetail[];
}

interface BracketDetailResponse {
  ok: boolean;
  tournament: TournamentDetail;
  bracket: BracketData;
  players: PlayerEntry[];
  rewardTiers: RewardTier[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATE_CONFIG: Record<string, { label: string; className: string }> = {
  in_progress:       { label: 'In Progress',       className: 'bg-green-600/15 text-green-400 border border-green-600/30' },
  accepting_entries: { label: 'Accepting Entries',  className: 'bg-purple-400/15 text-purple-300 border border-purple-400/30' },
  upcoming:          { label: 'Upcoming',           className: 'bg-purple-700/15 text-purple-400 border border-purple-700/30' },
  completed:         { label: 'Completed',          className: 'bg-muted text-muted-foreground border border-border' },
  cancelled:         { label: 'Cancelled',          className: 'bg-red-600/15 text-red-400 border border-red-600/30' },
};

const RARITY_NAMES: Record<number, string> = { 0: 'Common', 1: 'Uncommon', 2: 'Rare', 3: 'Legendary', 4: 'Mythic' };

const RARITY_COLORS: Record<number, string> = {
  0: 'text-muted-foreground',
  1: 'text-green-400',
  2: 'text-blue-400',
  3: 'text-purple-400',
  4: 'text-amber-400',
};

const WEAPON_TYPE_NAMES: Record<number, string> = {
  0: 'Staff', 1: 'Sword', 2: 'Axe', 3: 'Bow', 4: 'Dagger',
  5: 'Crossbow', 6: 'Spear', 7: 'Wand', 8: 'Club', 9: 'Fist',
};

const ARMOR_TYPE_NAMES: Record<number, string> = {
  0: 'Light', 1: 'Medium', 2: 'Heavy',
};

const ELEMENT_NAMES: Record<number, string> = {
  0: 'Fire', 2: 'Water', 4: 'Earth', 6: 'Wind', 8: 'Lightning',
  10: 'Ice', 12: 'Light', 14: 'Dark',
};

const PET_COMBAT_BONUS_NAMES: Record<number, string> = {
  0: 'None', 1: 'Phys Atk', 2: 'Magic Atk', 3: 'Defense', 4: 'Speed',
  5: 'Crit Rate', 6: 'HP Regen', 7: 'Accuracy', 8: 'Evasion', 9: 'MP Regen',
};

function shortAddr(addr: string | undefined | null): string {
  if (!addr) return '?';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatDatetime(ts: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Copy button helper ───────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
      data-testid="button-copy-address"
      title="Copy address"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ─── Bracket visualization ────────────────────────────────────────────────────

function PlayerSlot({ slotId, slotMap, winner, isWinner }: {
  slotId: number;
  slotMap: Record<number, string>;
  winner: number;
  isWinner: boolean;
}) {
  const addr = slotId > 0 ? (slotMap[slotId] ?? null) : null;
  const isEmpty = slotId === 0;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
        isEmpty
          ? 'bg-muted/30 text-muted-foreground/50'
          : isWinner
          ? 'bg-green-600/10 border border-green-600/30 text-foreground font-semibold'
          : winner !== 0
          ? 'bg-muted/20 text-muted-foreground line-through decoration-muted-foreground/40'
          : 'bg-muted/20 text-foreground'
      }`}
      data-testid={`slot-player-${slotId}`}
    >
      {isEmpty ? (
        <span className="text-xs">TBD</span>
      ) : (
        <>
          <span className="text-xs text-muted-foreground w-4 shrink-0">#{slotId}</span>
          {addr ? (
            <span className="font-mono text-xs truncate">{shortAddr(addr)}</span>
          ) : (
            <span className="text-xs text-muted-foreground">Player {slotId}</span>
          )}
          {isWinner && <Check className="w-3 h-3 text-green-400 ml-auto shrink-0" />}
        </>
      )}
    </div>
  );
}

function MatchCard({ match, slotMap, roundIndex, matchIndex }: {
  match: BracketMatch;
  slotMap: Record<number, string>;
  roundIndex: number;
  matchIndex: number;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 w-44"
      data-testid={`match-r${roundIndex}-m${matchIndex}`}
    >
      <PlayerSlot slotId={match.slotA} slotMap={slotMap} winner={match.winner} isWinner={match.winner !== 0 && match.winner === match.slotA} />
      <div className="border-t border-border/40 mx-2" />
      <PlayerSlot slotId={match.slotB} slotMap={slotMap} winner={match.winner} isWinner={match.winner !== 0 && match.winner === match.slotB} />
    </div>
  );
}

const ROUND_LABELS = ['Round of 8', 'Semifinal', 'Final'];

function BracketTab({ bracket, players, champion }: {
  bracket: BracketData;
  players: PlayerEntry[];
  champion: number;
}) {
  // Build slot map: partyIndex+1 (1-based slot) → address
  const slotMap: Record<number, string> = {};
  for (const p of players) {
    slotMap[p.partyIndex + 1] = p.address;
  }

  const hasAnyPlayer = bracket.rounds[0]?.some(m => m.slotA !== 0 || m.slotB !== 0);

  return (
    <div className="space-y-4">
      {!hasAnyPlayer && (
        <p className="text-sm text-muted-foreground text-center py-2">
          No players have registered yet — bracket slots will fill once entries open.
        </p>
      )}
      <div className="overflow-x-auto">
        <div className="flex items-center gap-8 min-w-max pb-4">
          {bracket.rounds.map((round, ri) => (
            <div key={ri} className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground text-center mb-2 font-medium uppercase tracking-wide">
                {ROUND_LABELS[ri] ?? `Round ${ri + 1}`}
              </p>
              <div
                className="flex flex-col"
                style={{ gap: ri === 0 ? '8px' : ri === 1 ? '88px' : '184px', justifyContent: 'space-around', alignItems: 'center' }}
              >
                {round.map((match, mi) => (
                  <MatchCard key={mi} match={match} slotMap={slotMap} roundIndex={ri} matchIndex={mi} />
                ))}
              </div>
            </div>
          ))}

          {/* Champion column */}
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground text-center mb-2 font-medium uppercase tracking-wide">
              Champion
            </p>
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <div className="flex items-center gap-2 px-3 py-3 rounded w-44 border border-yellow-500/30 bg-yellow-500/10">
                <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
                {champion > 0 ? (
                  <>
                    <span className="text-xs text-muted-foreground w-4 shrink-0">#{champion}</span>
                    {slotMap[champion] ? (
                      <span className="font-mono text-xs font-bold truncate">{shortAddr(slotMap[champion])}</span>
                    ) : (
                      <span className="text-xs font-bold">Player {champion}</span>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">TBD</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Details tab ──────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-right">{value}</span>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-5 mb-1 first:mt-0">
      {children}
    </h3>
  );
}

function DetailsTab({ t }: { t: TournamentDetail }) {
  const hasRestrictions = t.excludedClasses.length > 0 || t.allUniqueClasses || t.noTripleClasses || t.onlyPJ || t.onlyBannermen || t.maxTeamTraitScore > 0 || t.minLevel || t.maxLevel;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="section-details">
      {/* Left: Battle & Shot Clock */}
      <div>
        <SectionHeading>Battle Settings</SectionHeading>
        <div className="rounded-md border border-border/50 bg-card px-4 py-1">
          {t.format && <DetailRow label="Format" value={t.format} />}
          <DetailRow label="Best Of" value={t.bestOf} />
          <DetailRow label="Rounds" value={`${t.rounds} rounds — ${t.roundLengthMinutes} min each`} />
          <DetailRow label="Battle Inventory" value={`${t.battleInventory} / ${t.battleBudget} Stone`} />
          <DetailRow label="Durability / Round" value={t.durabilityPerRound > 0 ? `${t.durabilityPerRound}` : 'Unlimited'} />
          <DetailRow label="Sudden Death" value={t.suddenDeathLabel} />
        </div>

        <SectionHeading>Shot Clock</SectionHeading>
        <div className="rounded-md border border-border/50 bg-card px-4 py-1">
          <DetailRow label="Duration" value={t.shotClockDuration > 0 ? `${t.shotClockDuration}s` : '—'} />
          <DetailRow label="Banked Time" value={t.bankedShotClockTime > 0 ? `${t.bankedShotClockTime}s` : '—'} />
          <DetailRow label="Penalty Mode" value={t.shotClockPenaltyLabel} />
          {t.shotClockForfeitCount > 0 && (
            <DetailRow label="Forfeit Count" value={t.shotClockForfeitCount} />
          )}
        </div>
      </div>

      {/* Right: Restrictions & Entry */}
      <div>
        <SectionHeading>Entry Details</SectionHeading>
        <div className="rounded-md border border-border/50 bg-card px-4 py-1">
          <DetailRow label="Tournament Opens" value={formatDatetime(t.entryPeriodStart)} />
          <DetailRow label="Tournament Starts" value={formatDatetime(t.tournamentStartTime)} />
          <DetailRow label="Max Entrants" value={t.maxEntrants} />
          <DetailRow label="Party Size" value={`${t.partyCount}v${t.partyCount}`} />
          <DetailRow
            label="Entry Fee"
            value={t.entryFee > 0 ? `${t.entryFee.toFixed(2)} JEWEL` : 'Free'}
          />
          {t.tournamentHosted && t.hostAddress && (
            <DetailRow
              label="Hosted By"
              value={<span className="font-mono text-xs">{`${t.hostTierLabel} — ${shortAddr(t.hostAddress)}`}</span>}
            />
          )}
          {t.tournamentSponsored && (
            <DetailRow label="Sponsored" value={<Badge variant="outline" className="text-xs">Yes</Badge>} />
          )}
        </div>

        {hasRestrictions && (
          <>
            <SectionHeading>Restrictions</SectionHeading>
            <div className="rounded-md border border-border/50 bg-card px-4 py-1">
              {(t.minLevel || t.maxLevel) && (
                <DetailRow
                  label="Level Range"
                  value={`${t.minLevel ?? 1} – ${t.maxLevel ?? 'any'}`}
                />
              )}
              {(t.minRarity != null && t.minRarity > 0) && (
                <DetailRow label="Min Rarity" value={RARITY_NAMES[t.minRarity] ?? t.minRarity} />
              )}
              {t.excludedClasses.length > 0 && (
                <DetailRow
                  label="Excluded Classes"
                  value={
                    <div className="flex flex-wrap gap-1 justify-end">
                      {t.excludedClasses.map(c => (
                        <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                      ))}
                    </div>
                  }
                />
              )}
              {t.allUniqueClasses && <DetailRow label="All Unique Classes" value="Required" />}
              {t.noTripleClasses && <DetailRow label="No Triple Classes" value="Required" />}
              {t.onlyPJ && <DetailRow label="Only PJ Heroes" value="Required" />}
              {t.onlyBannermen && <DetailRow label="Only Bannermen" value="Required" />}
              {t.maxTeamTraitScore > 0 && (
                <DetailRow label="Max Team Trait Score" value={t.maxTeamTraitScore} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Players tab — hero detail sub-components ──────────────────────────────────

function DurabilityBar({ current, max }: { current: number; max: number }) {
  if (!max) return null;
  const pct = Math.round((current / max) * 100);
  const color = pct > 60 ? 'bg-green-500' : pct > 30 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{current}/{max}</span>
    </div>
  );
}

function EquipSlot({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground mr-1.5">{label}</span>
        {children}
      </div>
    </div>
  );
}

function WeaponSlotDisplay({ weapon, label }: { weapon: HeroWeapon; label: string }) {
  const typeName = WEAPON_TYPE_NAMES[weapon.weaponType] ?? `Type ${weapon.weaponType}`;
  const rarityColor = RARITY_COLORS[weapon.rarity] ?? 'text-muted-foreground';
  return (
    <EquipSlot label={label} icon={<Sword className="w-4 h-4" />}>
      <span className={`text-xs font-medium ${rarityColor}`}>
        {typeName} <span className="text-muted-foreground font-normal">#{weapon.displayId}</span>
      </span>
      {weapon.baseDamage > 0 && (
        <span className="text-xs text-muted-foreground ml-2">{weapon.baseDamage} dmg</span>
      )}
      <div className="mt-0.5">
        <DurabilityBar current={weapon.durability} max={weapon.maxDurability} />
      </div>
    </EquipSlot>
  );
}

function ArmorSlotDisplay({ armor }: { armor: HeroArmor }) {
  const typeName = ARMOR_TYPE_NAMES[armor.armorType] ?? `Type ${armor.armorType}`;
  const rarityColor = RARITY_COLORS[armor.rarity] ?? 'text-muted-foreground';
  return (
    <EquipSlot label="Armor" icon={<Shield className="w-4 h-4" />}>
      <span className={`text-xs font-medium ${rarityColor}`}>
        {typeName} Armor <span className="text-muted-foreground font-normal">#{armor.displayId}</span>
      </span>
      {armor.rawPhysDefense > 0 && (
        <span className="text-xs text-muted-foreground ml-2">{armor.rawPhysDefense} pDef</span>
      )}
      {armor.rawMagicDefense > 0 && (
        <span className="text-xs text-muted-foreground ml-1">{armor.rawMagicDefense} mDef</span>
      )}
      <div className="mt-0.5">
        <DurabilityBar current={armor.durability} max={armor.maxDurability} />
      </div>
    </EquipSlot>
  );
}

function AccessorySlotDisplay({ item, label }: { item: HeroAccessory; label: string }) {
  const rarityColor = RARITY_COLORS[item.rarity] ?? 'text-muted-foreground';
  return (
    <EquipSlot label={label} icon={<Zap className="w-4 h-4" />}>
      <span className={`text-xs font-medium ${rarityColor}`}>
        Accessory <span className="text-muted-foreground font-normal">#{item.displayId}</span>
      </span>
      <div className="mt-0.5">
        <DurabilityBar current={item.durability} max={item.maxDurability} />
      </div>
    </EquipSlot>
  );
}

function HeroCard({ hero, index }: { hero: HeroDetail; index: number }) {
  const active1 = getActiveSkill(hero.active1);
  const active2 = getActiveSkill(hero.active2);
  const passive1 = getPassiveSkill(hero.passive1);
  const passive2 = getPassiveSkill(hero.passive2);

  const hasEquipment = hero.weapon1 || hero.weapon2 || hero.offhand1 || hero.offhand2 || hero.armor || hero.accessory;

  return (
    <div
      className="rounded-md border border-border/50 bg-muted/10 p-3 space-y-2.5"
      data-testid={`card-hero-${hero.id}`}
    >
      {/* Header: class, level, rarity */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-sm">{hero.mainClassStr}</span>
        {hero.subClassStr && hero.subClassStr !== hero.mainClassStr && (
          <span className="text-sm text-muted-foreground">/ {hero.subClassStr}</span>
        )}
        <span className="text-xs text-muted-foreground">Lv {hero.level}</span>
        <span className={`text-xs font-medium ${RARITY_COLORS[hero.rarity] ?? ''}`}>
          {RARITY_NAMES[hero.rarity] ?? `Rarity ${hero.rarity}`}
        </span>
        {hero.pjStatus === 'pj' && (
          <Badge variant="outline" className="text-xs px-1.5 py-0">PJ {hero.pjLevel}</Badge>
        )}
        <span className="text-xs text-muted-foreground ml-auto">#{hero.normalizedId || hero.id}</span>
      </div>

      {/* Stats strip */}
      <div className="flex flex-wrap gap-1.5">
        {[
          ['STR', hero.strength], ['AGI', hero.agility], ['DEX', hero.dexterity],
          ['INT', hero.intelligence], ['WIS', hero.wisdom], ['VIT', hero.vitality],
          ['END', hero.endurance], ['LCK', hero.luck],
        ].map(([label, val]) => (
          <div key={label as string} className="flex items-center gap-1 bg-muted/40 rounded px-1.5 py-0.5" data-testid={`stat-${label}-${hero.id}`}>
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-xs font-mono font-medium">{val}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 bg-muted/40 rounded px-1.5 py-0.5">
          <span className="text-xs text-muted-foreground">HP</span>
          <span className="text-xs font-mono font-medium">{hero.hp}</span>
        </div>
        <div className="flex items-center gap-1 bg-muted/40 rounded px-1.5 py-0.5">
          <span className="text-xs text-muted-foreground">MP</span>
          <span className="text-xs font-mono font-medium">{hero.mp}</span>
        </div>
      </div>

      {/* Skills row */}
      <div className="flex flex-wrap gap-1">
        {[active1, active2].map((skill, i) => skill && (
          <Badge
            key={`active-${i}`}
            variant="outline"
            className={`text-xs ${ABILITY_RARITY_COLORS[skill.rarity]} ${ABILITY_RARITY_BORDER[skill.rarity]}`}
            data-testid={`badge-skill-active-${i}-${hero.id}`}
          >
            {skill.label}
          </Badge>
        ))}
        {[passive1, passive2].map((skill, i) => skill && (
          <Badge
            key={`passive-${i}`}
            variant="outline"
            className={`text-xs ${ABILITY_RARITY_COLORS[skill.rarity]} ${ABILITY_RARITY_BORDER[skill.rarity]} opacity-80`}
            data-testid={`badge-skill-passive-${i}-${hero.id}`}
          >
            {skill.label}
          </Badge>
        ))}
      </div>

      {/* Pet */}
      {hero.pet && (
        <div className="flex items-center gap-2 text-xs" data-testid={`pet-${hero.id}`}>
          <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className={`font-medium ${RARITY_COLORS[hero.pet.rarity] ?? ''}`}>{hero.pet.name}</span>
          <span className="text-muted-foreground">{RARITY_NAMES[hero.pet.rarity] ?? ''}</span>
          {hero.pet.combatBonus > 0 && (
            <span className="text-muted-foreground">
              — {PET_COMBAT_BONUS_NAMES[hero.pet.combatBonus] ?? `Bonus ${hero.pet.combatBonus}`}
              {hero.pet.combatBonusScalar > 0 && ` +${(hero.pet.combatBonusScalar / 100).toFixed(1)}%`}
            </span>
          )}
          {hero.pet.shiny && <Badge variant="outline" className="text-xs px-1.5 py-0 text-amber-400 border-amber-500/40">Shiny</Badge>}
        </div>
      )}

      {/* Equipment */}
      {hasEquipment && (
        <div className="border-t border-border/30 pt-2 space-y-0" data-testid={`equip-${hero.id}`}>
          {hero.weapon1 && <WeaponSlotDisplay weapon={hero.weapon1} label="Main" />}
          {hero.weapon2 && <WeaponSlotDisplay weapon={hero.weapon2} label="Off-weapon" />}
          {hero.offhand1 && <AccessorySlotDisplay item={hero.offhand1} label="Offhand" />}
          {hero.offhand2 && <AccessorySlotDisplay item={hero.offhand2} label="Offhand 2" />}
          {hero.armor && <ArmorSlotDisplay armor={hero.armor} />}
          {hero.accessory && <AccessorySlotDisplay item={hero.accessory} label="Accessory" />}
        </div>
      )}
    </div>
  );
}

// ─── Players tab ──────────────────────────────────────────────────────────────

function PlayersTab({ players, maxEntrants, totalEntrants }: {
  players: PlayerEntry[];
  maxEntrants: number;
  totalEntrants: number;
}) {
  if (players.length === 0) {
    return (
      <div className="text-center py-12" data-testid="section-players-empty">
        <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="font-medium">No players have registered yet</p>
        <p className="text-sm text-muted-foreground mt-1">Player wallets and hero teams will appear here once they enter.</p>
      </div>
    );
  }

  const sorted = [...players].sort((a, b) => a.partyIndex - b.partyIndex);

  return (
    <div className="space-y-4" data-testid="section-players">
      <p className="text-sm text-muted-foreground">{totalEntrants} / {maxEntrants} players registered</p>
      {sorted.map((player, idx) => (
        <div
          key={player.address}
          className="rounded-md border border-border/50 overflow-hidden"
          data-testid={`card-player-${idx}`}
        >
          {/* Player header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 border-b border-border/40">
            <span className="text-xs text-muted-foreground w-6 shrink-0">#{player.partyIndex + 1}</span>
            <span className="font-mono text-sm flex-1 truncate">{player.address}</span>
            <CopyButton text={player.address} />
          </div>

          {/* Hero cards */}
          <div className="p-3 space-y-3">
            {player.heroes.length > 0 ? (
              player.heroes.map((hero, hi) => (
                <HeroCard key={hero.id} hero={hero} index={hi} />
              ))
            ) : player.heroIds.length > 0 ? (
              <div className="text-xs text-muted-foreground py-2">
                Heroes: {player.heroIds.join(', ')} — loading details unavailable
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-2">No hero data available</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Rewards tab ──────────────────────────────────────────────────────────────

const PLACEMENT_ICONS: Record<number, React.ReactNode> = {
  0: <Trophy className="w-4 h-4 text-yellow-400" />,
  1: <Medal className="w-4 h-4 text-slate-300" />,
  2: <Medal className="w-4 h-4 text-amber-600" />,
};

function RewardsTab({ rewardTiers, tournamentSponsored }: { rewardTiers: RewardTier[]; tournamentSponsored: boolean }) {
  if (rewardTiers.length === 0) {
    return (
      <div className="text-center py-12">
        <Gift className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="font-medium">Reward data not available</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="section-rewards">
      {tournamentSponsored && (
        <p className="text-xs text-muted-foreground">Sponsored tournament — prize pool funded by DFK.</p>
      )}
      <div className="rounded-md border border-border/50 overflow-hidden">
        {rewardTiers.map((tier, idx) => (
          <div
            key={idx}
            className={`flex items-center gap-4 px-4 py-3 ${idx < rewardTiers.length - 1 ? 'border-b border-border/40' : ''} ${tier.isChampion ? 'bg-yellow-500/5' : ''}`}
            data-testid={`row-reward-${idx}`}
          >
            <div className="w-5 shrink-0 flex items-center justify-center">
              {PLACEMENT_ICONS[idx] ?? <span className="text-xs text-muted-foreground">{idx + 1}</span>}
            </div>
            <span className="text-sm font-medium flex-1">{tier.tier}</span>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {tier.jewel > 0 && (
                <Badge variant="outline" className="text-xs font-mono">
                  {tier.jewel % 1 === 0 ? tier.jewel.toFixed(0) : tier.jewel.toFixed(2)} JEWEL
                </Badge>
              )}
              {tier.items.map((item, ii) => (
                <Badge key={ii} variant="secondary" className="text-xs">
                  {item.amount > 1 ? `${item.amount}× ` : ''}{item.name}
                </Badge>
              ))}
              {tier.jewel === 0 && tier.items.length === 0 && (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface Props {
  id: string;
}

export default function TournamentBracketPage({ id }: Props) {
  const [, navigate] = useLocation();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['/api/admin/tournament/bracket', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tournament/bracket/${id}`);
      if (!res.ok) throw new Error(`Failed to load tournament: ${res.status}`);
      return res.json() as Promise<BracketDetailResponse>;
    },
    staleTime: 55_000,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-md" />
      </div>
    );
  }

  if (error || !data?.ok) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/tournament')} className="mb-4" data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium text-destructive">Failed to load tournament data</p>
            <p className="text-sm text-muted-foreground mt-1">{(error as Error)?.message || 'Unknown error'}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { tournament: t, bracket, players, rewardTiers } = data;
  const stateCfg = STATE_CONFIG[t.stateLabel] ?? STATE_CONFIG.upcoming;

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/tournament')} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
          </Button>
          <h1 className="text-xl font-bold" data-testid="heading-tournament-name">{t.name}</h1>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${stateCfg.className}`} data-testid="badge-state">
            {stateCfg.label}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Quick stats bar */}
      <div className="flex gap-4 flex-wrap text-sm text-muted-foreground" data-testid="stats-bar">
        {t.format && <><span data-testid="stat-format">{t.format}</span><span>·</span></>}
        <span data-testid="stat-rounds">{t.rounds} rounds ({t.roundLengthMinutes} min)</span>
        <span>·</span>
        <span data-testid="stat-players">{t.entrants} / {t.maxEntrants} players</span>
        {t.entryFee > 0 && <><span>·</span><span data-testid="stat-entry-fee">{t.entryFee.toFixed(2)} JEWEL entry</span></>}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="bracket" className="w-full">
        <TabsList data-testid="tabs-tournament-detail">
          <TabsTrigger value="bracket" data-testid="tab-bracket">Bracket</TabsTrigger>
          <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
          <TabsTrigger value="players" data-testid="tab-players">
            Players
            <span className="ml-1.5 text-xs text-muted-foreground">({t.entrants})</span>
          </TabsTrigger>
          <TabsTrigger value="rewards" data-testid="tab-rewards">Rewards</TabsTrigger>
        </TabsList>

        <TabsContent value="bracket" className="mt-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                Tournament Bracket
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BracketTab bracket={bracket} players={players} champion={bracket.champion} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="w-4 h-4" />
                Tournament Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DetailsTab t={t} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="players" className="mt-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Players
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PlayersTab players={players} maxEntrants={t.maxEntrants} totalEntrants={t.entrants} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rewards" className="mt-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Gift className="w-4 h-4" />
                Rewards
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RewardsTab rewardTiers={rewardTiers} tournamentSponsored={t.tournamentSponsored} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
