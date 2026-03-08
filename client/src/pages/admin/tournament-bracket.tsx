import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowLeft, Trophy, Medal, Copy, Check, Users, Gift, Info, RefreshCw, Shield, Sword, Zap, Star, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useState } from 'react';
import {
  ACTIVE_SKILLS, PASSIVE_SKILLS,
  ABILITY_RARITY_COLORS, ABILITY_RARITY_BORDER,
  getActiveSkill, getPassiveSkill, getPassiveEffects,
} from '@/data/dfk-abilities';
import {
  computeHeroCombatProfile,
} from '@/lib/dfk-combat-formulas';
import {
  computeEquipmentBonuses,
  decodeWeaponSpeedModifier,
  computePetBonuses,
  getPetBonusName,
  getPetStatLabel,
  ARMOR_RESIST_NAMES,
} from '@/data/dfk-equipment-bonuses';

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
  // Combat scalars (fetched from DFK subgraph)
  pAccuracyAtRequirement?: number;
  accuracyRequirement?: number;
  pScalarStat1?: number; pScalarValue1?: number; pScalarMax1?: number;
  pScalarStat2?: number; pScalarValue2?: number; pScalarMax2?: number;
  pScalarStat3?: number; pScalarValue3?: number; pScalarMax3?: number;
  mAccuracyAtRequirement?: number;
  focusRequirement?: number;
  mScalarStat1?: number; mScalarValue1?: number; mScalarMax1?: number;
  mScalarStat2?: number; mScalarValue2?: number; mScalarMax2?: number;
  mScalarStat3?: number; mScalarValue3?: number; mScalarMax3?: number;
  speedModifier?: number;
  itemName?: string;
}

interface HeroArmor extends HeroEquipItem {
  armorType: number;
  rawPhysDefense: number; physDefScalar: number;
  rawMagicDefense: number; magicDefScalar: number;
  evasion: number;
  pDefScalarMax?: number;
  mDefScalarMax?: number;
  bonus1: number; bonus2: number; bonus3: number; bonus4: number; bonus5: number;
  bonusScalar1: number; bonusScalar2: number; bonusScalar3: number; bonusScalar4: number; bonusScalar5: number;
  itemName?: string;
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
  playerName: string | null;
}

interface AiHeroProfile {
  id: string | number;
  mainClass: string;
  level: number;
  STR: number; DEX: number; AGI: number; INT: number;
  WIS: number; VIT: number; END: number; LCK: number;
  pDef: number; mDef: number; pRed: number; mRed: number;
  hasArmor: boolean;
}

interface AiMatchupResult {
  winPctA: number;
  winPctB: number;
  initPctA: number;
  defSource: 'armor' | 'vit_end_proxy';
  analysis: string;
  teamA: { name: string; address: string; heroes: AiHeroProfile[] };
  teamB: { name: string; address: string; heroes: AiHeroProfile[] };
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

function PlayerSlot({ slotId, slotMap, nameMap, winner, isWinner }: {
  slotId: number;
  slotMap: Record<number, string>;
  nameMap: Record<number, string>;
  winner: number;
  isWinner: boolean;
}) {
  const addr = slotId > 0 ? (slotMap[slotId] ?? null) : null;
  const name = slotId > 0 ? (nameMap[slotId] ?? null) : null;
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
            <>
              <span className="text-xs flex-1 min-w-0 truncate">{name || shortAddr(addr)}</span>
              <CopyButton text={addr} />
            </>
          ) : (
            <span className="text-xs text-muted-foreground flex-1 min-w-0">Player {slotId}</span>
          )}
          {isWinner && <Check className="w-3 h-3 text-green-400 shrink-0" />}
        </>
      )}
    </div>
  );
}

function MatchupModal({ match, players, slotMap, nameMap, onClose, onHeroSelect }: {
  match: BracketMatch;
  players: PlayerEntry[];
  slotMap: Record<number, string>;
  nameMap: Record<number, string>;
  onClose: () => void;
  onHeroSelect: (hero: HeroDetail) => void;
}) {
  const [activeSlot, setActiveSlot] = useState<number>(match.slotA > 0 ? match.slotA : match.slotB);

  const playerA = players.find(p => p.partyIndex === match.slotA) ?? null;
  const playerB = players.find(p => p.partyIndex === match.slotB) ?? null;

  const bothEmpty = match.slotA === 0 && match.slotB === 0;
  const activePlayer = activeSlot === match.slotA ? playerA : playerB;

  function slotLabel(slotId: number) {
    const addr = slotMap[slotId];
    const name = nameMap[slotId];
    if (!addr && !name) return slotId === 0 ? 'TBD' : `Slot #${slotId}`;
    return name || shortAddr(addr);
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm" data-testid="modal-matchup">
        <DialogHeader>
          <DialogTitle>Match — {slotLabel(match.slotA)} vs {slotLabel(match.slotB)}</DialogTitle>
        </DialogHeader>

        {bothEmpty ? (
          <p className="text-sm text-muted-foreground text-center py-4">No players registered for this match yet.</p>
        ) : (
          <div className="space-y-4">
            {/* Player A / B toggle */}
            <div className="flex gap-2">
              {[match.slotA, match.slotB].map(slotId => (
                <Button
                  key={slotId}
                  variant={activeSlot === slotId ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 flex items-center gap-1.5"
                  onClick={() => setActiveSlot(slotId)}
                  data-testid={`btn-slot-${slotId}`}
                >
                  {match.winner === slotId && <Trophy className="w-3 h-3 text-yellow-400 shrink-0" />}
                  <span className="truncate">{slotLabel(slotId)}</span>
                </Button>
              ))}
            </div>

            {/* Hero selection */}
            {activePlayer && activePlayer.heroes.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Select hero to inspect</p>
                <div className="flex flex-wrap gap-2">
                  {activePlayer.heroes.map((h, i) => (
                    <Button
                      key={h.id}
                      variant="outline"
                      size="sm"
                      onClick={() => { onHeroSelect(h); onClose(); }}
                      data-testid={`btn-hero-${h.id}`}
                    >
                      <span className="font-medium">{h.mainClassStr}</span>
                      <span className="text-muted-foreground ml-1">Lv{h.level}</span>
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Click a hero to open its full stat sheet.</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">No hero data loaded for this player yet.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MatchCard({ match, slotMap, nameMap, roundIndex, matchIndex, onMatchClick }: {
  match: BracketMatch;
  slotMap: Record<number, string>;
  nameMap: Record<number, string>;
  roundIndex: number;
  matchIndex: number;
  onMatchClick?: (match: BracketMatch) => void;
}) {
  const hasPlayers = match.slotA !== 0 || match.slotB !== 0;
  return (
    <div
      className={`flex flex-col gap-0.5 w-44 ${hasPlayers && onMatchClick ? 'cursor-pointer hover-elevate rounded' : ''}`}
      data-testid={`match-r${roundIndex}-m${matchIndex}`}
      onClick={() => hasPlayers && onMatchClick?.(match)}
    >
      <PlayerSlot slotId={match.slotA} slotMap={slotMap} nameMap={nameMap} winner={match.winner} isWinner={match.winner !== 0 && match.winner === match.slotA} />
      <div className="border-t border-border/40 mx-2" />
      <PlayerSlot slotId={match.slotB} slotMap={slotMap} nameMap={nameMap} winner={match.winner} isWinner={match.winner !== 0 && match.winner === match.slotB} />
    </div>
  );
}

const ROUND_LABELS = ['Round of 8', 'Semifinal', 'Final'];

function BracketTab({ bracket, players, champion }: {
  bracket: BracketData;
  players: PlayerEntry[];
  champion: number;
}) {
  const [selectedMatch, setSelectedMatch] = useState<BracketMatch | null>(null);
  const [selectedHero, setSelectedHero] = useState<HeroDetail | null>(null);

  // Build slot map: partyIndex (0-based, matches getBracket() raw values) → address
  const slotMap: Record<number, string> = {};
  const nameMap: Record<number, string> = {};
  for (const p of players) {
    slotMap[p.partyIndex] = p.address;
    if (p.playerName) nameMap[p.partyIndex] = p.playerName;
  }

  const hasAnyPlayer = bracket.rounds[0]?.some(m => m.slotA !== 0 || m.slotB !== 0);

  return (
    <div className="space-y-4">
      {selectedHero && <HeroDetailModal hero={selectedHero} onClose={() => setSelectedHero(null)} />}
      {selectedMatch && (
        <MatchupModal
          match={selectedMatch}
          players={players}
          slotMap={slotMap}
          nameMap={nameMap}
          onClose={() => setSelectedMatch(null)}
          onHeroSelect={hero => { setSelectedMatch(null); setSelectedHero(hero); }}
        />
      )}
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
                  <MatchCard key={mi} match={match} slotMap={slotMap} nameMap={nameMap} roundIndex={ri} matchIndex={mi} onMatchClick={setSelectedMatch} />
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
                      <>
                        <span className="text-xs font-bold flex-1 min-w-0 truncate">{nameMap[champion] || shortAddr(slotMap[champion])}</span>
                        <CopyButton text={slotMap[champion]} />
                      </>
                    ) : (
                      <span className="text-xs font-bold flex-1 min-w-0">Player {champion}</span>
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

// ─── Hero Detail Modal ────────────────────────────────────────────────────────

const STATUS_RESISTANCES = [
  'Banish', 'Berserk', 'Bleed', 'Blind', 'Poison', 'Pull', 'Push', 'Silence',
  'Sleep', 'Slow', 'Stun', 'Taunt', 'Fear', 'Intimidate', 'Mana Burn', 'Negate',
  'Burn', 'Confuse', 'Daze', 'Disarm', 'Ethereal', 'Exhaust', 'Chill',
];


function HeroDetailModal({ hero, onClose }: { hero: HeroDetail; onClose: () => void }) {
  const stats = {
    STR: hero.strength, DEX: hero.dexterity, AGI: hero.agility,
    INT: hero.intelligence, WIS: hero.wisdom, VIT: hero.vitality,
    END: hero.endurance, LCK: hero.luck,
  };
  const profile = computeHeroCombatProfile(stats, hero.level);

  // P.DEF / M.DEF — physDefScalar is stored ×100 (e.g. 150 = 1.5×), capped by pDefScalarMax
  const rawPDef = hero.armor?.rawPhysDefense ?? 0;
  const rawMDef = hero.armor?.rawMagicDefense ?? 0;
  const pDefScalarMax = hero.armor?.pDefScalarMax ?? rawPDef * 2;
  const mDefScalarMax = hero.armor?.mDefScalarMax ?? rawMDef * 2;
  const pDef = rawPDef + Math.min(((hero.armor?.physDefScalar ?? 0) / 100) * stats.END, pDefScalarMax);
  const mDef = rawMDef + Math.min(((hero.armor?.magicDefScalar ?? 0) / 100) * stats.WIS, mDefScalarMax);
  const pRed = pDef > 0 ? (pDef / (pDef + 100) * 100) : 0;
  const mRed = mDef > 0 ? (mDef / (mDef + 100) * 100) : 0;

  // Equipment bonus codes — context-sensitive maps per slot
  const equipBonuses = computeEquipmentBonuses({
    weapon1:   hero.weapon1   ?? null,
    weapon2:   hero.weapon2   ?? null,
    armor:     hero.armor     ?? null,
    accessory: hero.accessory ?? null,
    offhand1:  hero.offhand1  ?? null,
    offhand2:  hero.offhand2  ?? null,
  });

  // Pet bonuses — decoded from star-encoded combatBonus rawId
  const petBonuses = computePetBonuses(hero.pet);

  // Passive static bonuses — Foresight (+3% EVA), Duelist (+2.5% BLK/SBLK),
  // Headstrong/ClearVision/Fearless/Chatterbox/Stalwart (+2.5% SER each)
  const passiveEff1 = getPassiveEffects(hero.passive1);
  const passiveEff2 = getPassiveEffects(hero.passive2);
  const passiveEva  = (passiveEff1?.evaBonus  ?? 0) + (passiveEff2?.evaBonus  ?? 0);
  const passiveBlk  = (passiveEff1?.blkBonus  ?? 0) + (passiveEff2?.blkBonus  ?? 0);
  const passiveSblk = (passiveEff1?.sblkBonus ?? 0) + (passiveEff2?.sblkBonus ?? 0);
  const passiveSer  = (passiveEff1?.serBonus  ?? 0) + (passiveEff2?.serBonus  ?? 0);

  // EVA — formula base + armor evasion field + equipment evasion bonus codes + pet (Slippery) + passive (Foresight)
  const armorEva = (hero.armor?.evasion ?? 0) / 1_000_000;
  const totalEva = profile.EVA + armorEva + equipBonuses.evasion + (petBonuses.evasion ?? 0) + passiveEva;

  // SPEED — formula base + decoded weapon speed modifiers + equipment speed bonus codes + pet (Blur)
  // Blur gives a % of base speed, not a flat addition
  const weaponSpeedMod = decodeWeaponSpeedModifier(hero.weapon1?.speedModifier ?? 0)
                       + decodeWeaponSpeedModifier(hero.weapon2?.speedModifier ?? 0);
  const equipSpeedMod = equipBonuses.speed - equipBonuses.speedDown;
  const petSpeedMod = Math.round((petBonuses.speed ?? 0) * profile.Speed);
  const totalSpeed = Math.round(profile.Speed) + weaponSpeedMod + equipSpeedMod + petSpeedMod;

  // BLK / SBLK / REC — formula base + equipment bonus codes + pet + passive (Duelist)
  const totalBlk  = profile.Block      + equipBonuses.blkChance      + (petBonuses.blkChance      ?? 0) + passiveBlk;
  const totalSblk = profile.SpellBlock + equipBonuses.sblkChance     + (petBonuses.sblkChance     ?? 0) + passiveSblk;
  const totalRec  = profile.Recovery   + equipBonuses.recoveryChance + (petBonuses.recoveryChance ?? 0);

  // Critical / mana stats — used in both Primary Arms and Modifiers sections
  const totalCSC = profile.Crit + equipBonuses.critStrikeChance + (petBonuses.critStrikeChance ?? 0);
  const totalCHC = equipBonuses.critHealChance + (petBonuses.critHealChance ?? 0);
  const totalCDM = 1.5 + equipBonuses.critDamage;
  const hasMcpReduction = (hero.passive1 === 17 || hero.passive2 === 17);

  // Status Effect Resistance per-status computation
  const baseSER = profile.SER + passiveSer + (petBonuses.statusEffectResistance ?? 0);
  const resistCodeByName: Record<string, number> = Object.fromEntries(
    Object.entries(ARMOR_RESIST_NAMES).map(([code, name]) => [name, Number(code)])
  );
  const getStatusTotal = (statusName: string): number => {
    const code = resistCodeByName[statusName];
    const armorBonus = code != null ? (equipBonuses.specificResists[code] ?? 0) : 0;
    const p1Bonus = (passiveEff1?.resistCode != null && passiveEff1.resistCode === code) ? (passiveEff1.specificResistValue ?? 0) : 0;
    const p2Bonus = (passiveEff2?.resistCode != null && passiveEff2.resistCode === code) ? (passiveEff2.specificResistValue ?? 0) : 0;
    return baseSER + armorBonus + p1Bonus + p2Bonus;
  };
  const anyElevated = STATUS_RESISTANCES.some(s => getStatusTotal(s) > baseSER + 0.0001);
  const [serOpen, setSerOpen] = useState(anyElevated);

  // Weapon attack computation — stat code: 0=STR,1=AGI,2=DEX,3=INT,4=WIS,5=VIT,6=END,7=LCK
  const heroStatByCode: Record<number, number> = {
    0: stats.STR, 1: stats.AGI, 2: stats.DEX, 3: stats.INT,
    4: stats.WIS, 5: stats.VIT, 6: stats.END, 7: stats.LCK,
  };
  function computeWeaponAttack(w: HeroWeapon): number {
    let atk = w.baseDamage ?? 0;
    const scalars: [number | undefined, number | undefined, number | undefined][] = [
      [w.pScalarStat1, w.pScalarValue1, w.pScalarMax1],
      [w.pScalarStat2, w.pScalarValue2, w.pScalarMax2],
      [w.pScalarStat3, w.pScalarValue3, w.pScalarMax3],
    ];
    for (const [stat, val, max] of scalars) {
      if (!val || stat == null) continue;
      const statVal = heroStatByCode[stat] ?? 0;
      atk += Math.min((val / 100) * statVal, max ?? Infinity);
    }
    return Math.round(atk);
  }
  function computeWeaponSpell(w: HeroWeapon): number {
    let spell = w.basePotency ?? 0;
    const scalars: [number | undefined, number | undefined, number | undefined][] = [
      [w.mScalarStat1, w.mScalarValue1, w.mScalarMax1],
      [w.mScalarStat2, w.mScalarValue2, w.mScalarMax2],
      [w.mScalarStat3, w.mScalarValue3, w.mScalarMax3],
    ];
    for (const [stat, val, max] of scalars) {
      if (!val || stat == null) continue;
      const statVal = heroStatByCode[stat] ?? 0;
      spell += Math.min((val / 100) * statVal, max ?? Infinity);
    }
    return Math.round(spell);
  }
  const weapon1Attack = hero.weapon1 ? computeWeaponAttack(hero.weapon1) : null;
  const weapon1Spell  = hero.weapon1 ? computeWeaponSpell(hero.weapon1)  : null;
  const weapon1PAcc   = hero.weapon1?.pAccuracyAtRequirement != null ? (hero.weapon1.pAccuracyAtRequirement / 10).toFixed(1) : null;
  const weapon1MAcc   = hero.weapon1?.mAccuracyAtRequirement != null ? (hero.weapon1.mAccuracyAtRequirement / 10).toFixed(1) : null;
  const hasWeaponScalars = weapon1Attack != null && (hero.weapon1?.pScalarValue1 ?? 0) > 0;
  const weapon2Attack = hero.weapon2 ? computeWeaponAttack(hero.weapon2) : null;
  const weapon2Spell  = hero.weapon2 ? computeWeaponSpell(hero.weapon2)  : null;
  const weapon2PAcc   = hero.weapon2?.pAccuracyAtRequirement != null ? (hero.weapon2.pAccuracyAtRequirement / 10).toFixed(1) : null;
  const weapon2MAcc   = hero.weapon2?.mAccuracyAtRequirement != null ? (hero.weapon2.mAccuracyAtRequirement / 10).toFixed(1) : null;

  const fmt = (v: number, digits = 2) => v.toFixed(digits);
  const pct = (v: number) => (v * 100).toFixed(2) + '%';

  const active1 = getActiveSkill(hero.active1);
  const active2 = getActiveSkill(hero.active2);
  const passive1 = getPassiveSkill(hero.passive1);
  const passive2 = getPassiveSkill(hero.passive2);

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="modal-hero-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>#{hero.normalizedId || hero.id}</span>
            <span className={RARITY_COLORS[hero.rarity]}>{RARITY_NAMES[hero.rarity]}</span>
            <span>{hero.mainClassStr}</span>
            {hero.subClassStr && hero.subClassStr !== hero.mainClassStr && (
              <span className="text-muted-foreground">/ {hero.subClassStr}</span>
            )}
            <span className="text-muted-foreground font-normal">Lv {hero.level}</span>
          </DialogTitle>
        </DialogHeader>

        {/* HP/MP bars */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-muted-foreground text-xs">HP</span>
              <span className="text-xs font-mono">{hero.hp}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: '100%' }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-muted-foreground text-xs">MP</span>
              <span className="text-xs font-mono">{hero.mp}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          {/* Vitals */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Vitals</p>
            <div className="space-y-1 text-xs">
              {[
                ['P.DEF', fmt(pDef)],
                ['M.DEF', fmt(mDef)],
                ['P.RED', pRed.toFixed(2) + '%'],
                ['M.RED', mRed.toFixed(2) + '%'],
                ['BLK', (totalBlk * 100).toFixed(2) + '%'],
                ['SBLK', (totalSblk * 100).toFixed(2) + '%'],
                ['REC', (totalRec * 100).toFixed(2) + '%'],
                ['SER', (baseSER * 100).toFixed(2) + '%'],
                ['SPEED', totalSpeed.toString()],
                ['EVA', (totalEva * 100).toFixed(2) + '%'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Base Stats */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Base Stats</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {[
                ['STR', hero.strength], ['DEX', hero.dexterity],
                ['AGI', hero.agility], ['VIT', hero.vitality],
                ['END', hero.endurance], ['INT', hero.intelligence],
                ['WIS', hero.wisdom], ['LCK', hero.luck],
              ].map(([label, val]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono font-medium">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Dynamic Stat Scores */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Dynamic Scores</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {[
                ['STR', profile.STR], ['DEX', profile.DEX],
                ['AGI', profile.AGI], ['VIT', profile.VIT],
                ['END', profile.END], ['INT', profile.INT],
                ['WIS', profile.WIS], ['LCK', profile.LCK],
              ].map(([label, val]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono">{((val as number) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Abilities */}
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Abilities</p>
          <div className="flex flex-wrap gap-1.5">
            {[active1, active2].map((skill, i) => skill && (
              <Badge key={`a-${i}`} variant="outline"
                className={`text-xs ${ABILITY_RARITY_COLORS[skill.rarity]} ${ABILITY_RARITY_BORDER[skill.rarity]}`}>
                {skill.label}
              </Badge>
            ))}
            {[passive1, passive2].map((skill, i) => {
              if (!skill) return null;
              const eff = getPassiveEffects(skill.traitId);
              const staticHint = eff?.evaBonus   ? `EVA +${(eff.evaBonus * 100).toFixed(1)}%`
                               : eff?.blkBonus   ? `BLK/SBLK +${(eff.blkBonus * 100).toFixed(1)}%`
                               : eff?.serBonus   ? `SER +${(eff.serBonus * 100).toFixed(1)}%`
                               : null;
              return (
                <Badge key={`p-${i}`} variant="outline"
                  title={eff?.conditionalNote ?? skill.label}
                  className={`text-xs ${ABILITY_RARITY_COLORS[skill.rarity]} ${ABILITY_RARITY_BORDER[skill.rarity]} opacity-80 flex flex-col items-start gap-0 h-auto py-0.5`}>
                  <span>{skill.label}</span>
                  {staticHint && <span className="text-[10px] opacity-70 font-normal">{staticHint}</span>}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Modifiers — equipment + pet bonus codes that affect combat stats */}
        {(() => {
          const sign = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
          const totalRet = equipBonuses.retaliateAny + equipBonuses.retaliatePhysical + equipBonuses.retaliateMagical;
          // Merge pet bonuses into totals for display
          const totalAtkPct   = equipBonuses.attackPct        + (petBonuses.attackPct        ?? 0);
          const totalSpellPct = equipBonuses.spellPct         + (petBonuses.spellPct         ?? 0);
          const totalPDef     = equipBonuses.physDefPct       + (petBonuses.physDefPct       ?? 0);
          const totalMDef     = equipBonuses.magicDefPct      + (petBonuses.magicDefPct      ?? 0);
          const totalPAcc     = equipBonuses.physAccuracy     + (petBonuses.physAccuracy     ?? 0);
          const totalMAcc     = equipBonuses.magicAccuracy    + (petBonuses.magicAccuracy    ?? 0);
          const modRows: [string, string][] = [
            ...(equipBonuses.physicalDamage  !== 0 ? [['PDM',    sign(equipBonuses.physicalDamage  * 100)] as [string,string]] : []),
            ...(equipBonuses.magicDamage     !== 0 ? [['MDM',    sign(equipBonuses.magicDamage     * 100)] as [string,string]] : []),
            ...(totalAtkPct   !== 0 ? [['ATK%',   sign(totalAtkPct   * 100)] as [string,string]] : []),
            ...(totalSpellPct !== 0 ? [['SPELL%', sign(totalSpellPct * 100)] as [string,string]] : []),
            ...[['MCP', hasMcpReduction ? '90.0%' : '100.0%'] as [string,string]],
            ...[['PRC', '+' + (equipBonuses.pierce * 100).toFixed(2) + '%'] as [string,string]],
            ...(totalRet                    !== 0 ? [['RET',    sign(totalRet                    * 100)] as [string,string]] : []),
            ...(equipBonuses.riposte         !== 0 ? [['RIP',    sign(equipBonuses.riposte         * 100)] as [string,string]] : []),
            ...(totalPDef     !== 0 ? [['P.DEF%', sign(totalPDef     * 100)] as [string,string]] : []),
            ...(totalMDef     !== 0 ? [['M.DEF%', sign(totalMDef     * 100)] as [string,string]] : []),
            ...((equipBonuses.physDamageReduction + (petBonuses.physDamageReduction ?? 0)) !== 0 ? [['P.RED+', sign((equipBonuses.physDamageReduction + (petBonuses.physDamageReduction ?? 0)) * 100)] as [string,string]] : []),
            ...((equipBonuses.magicDamageReduction + (petBonuses.magicDamageReduction ?? 0)) !== 0 ? [['M.RED+', sign((equipBonuses.magicDamageReduction + (petBonuses.magicDamageReduction ?? 0)) * 100)] as [string,string]] : []),
            ...(equipBonuses.physDefFlat     !== 0 ? [['P.DEF+', equipBonuses.physDefFlat.toFixed(0)] as [string,string]] : []),
            ...(equipBonuses.magicDefFlat    !== 0 ? [['M.DEF+', equipBonuses.magicDefFlat.toFixed(0)] as [string,string]] : []),
            ...(equipBonuses.blkChance + (petBonuses.blkChance ?? 0) + passiveBlk !== 0 ? [['BLK+',   sign((equipBonuses.blkChance + (petBonuses.blkChance ?? 0) + passiveBlk) * 100)] as [string,string]] : []),
            ...(equipBonuses.sblkChance + (petBonuses.sblkChance ?? 0) + passiveSblk !== 0 ? [['SBLK+',  sign((equipBonuses.sblkChance + (petBonuses.sblkChance ?? 0) + passiveSblk) * 100)] as [string,string]] : []),
            ...(totalPAcc     !== 0 ? [['P.ACC+', sign(totalPAcc     * 100)] as [string,string]] : []),
            ...(totalMAcc     !== 0 ? [['M.ACC+', sign(totalMAcc     * 100)] as [string,string]] : []),
            ...((petBonuses.lifesteal ?? 0) !== 0 ? [['LIFESTEAL', sign((petBonuses.lifesteal ?? 0) * 100)] as [string,string]] : []),
            ...((petBonuses.statusEffectResistance ?? 0) + passiveSer !== 0 ? [['SER+', sign(((petBonuses.statusEffectResistance ?? 0) + passiveSer) * 100)] as [string,string]] : []),
          ] as [string, string][];
          // Show section if any equipment, pet, or passive bonus is present
          return (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Modifiers</p>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
                {modRows.map(([label, val]) => (
                  <div key={label} className="flex justify-between gap-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-mono ${val.startsWith('+') ? 'text-green-500' : val.startsWith('-') ? 'text-red-400' : ''}`}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Primary Arms — weapon combat output */}
        {hero.weapon1 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Primary Arms</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              {[
                ['Attack',  weapon1Attack?.toString() ?? '—'],
                ['Spell',   weapon1Spell?.toString()  ?? '—'],
                ['P.ACC',   weapon1PAcc  != null ? weapon1PAcc + '%'  : '—'],
                ['M.ACC',   weapon1MAcc  != null ? weapon1MAcc + '%'  : '—'],
                ['CSC',     (totalCSC * 100).toFixed(2) + '%'],
                ['CDM',     totalCDM.toFixed(2) + 'x'],
                ['CHC',     (totalCHC * 100).toFixed(2) + '%'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono">{val}</span>
                </div>
              ))}
            </div>
            {hero.weapon1.itemName && (
              <p className="text-xs text-muted-foreground mt-1">{hero.weapon1.itemName}</p>
            )}
          </div>
        )}

        {/* Secondary Arms — off-hand weapon stats */}
        {hero.weapon2 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Secondary Arms</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              {[
                ['Attack',  weapon2Attack?.toString() ?? '—'],
                ['Spell',   weapon2Spell?.toString()  ?? '—'],
                ['P.ACC',   weapon2PAcc  != null ? weapon2PAcc + '%'  : '—'],
                ['M.ACC',   weapon2MAcc  != null ? weapon2MAcc + '%'  : '—'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono">{val}</span>
                </div>
              ))}
            </div>
            {hero.weapon2.itemName && (
              <p className="text-xs text-muted-foreground mt-1">{hero.weapon2.itemName}</p>
            )}
          </div>
        )}

        {/* Equipment */}
        {(hero.weapon1 || hero.armor || hero.accessory) && (
          <div className="mt-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Equipment</p>
            <div className="space-y-0.5">
              {hero.weapon1 && <WeaponSlotDisplay weapon={hero.weapon1} label="Weapon" />}
              {hero.weapon2 && <WeaponSlotDisplay weapon={hero.weapon2} label="Off-weapon" />}
              {hero.offhand1 && <AccessorySlotDisplay item={hero.offhand1} label="Offhand" />}
              {hero.armor && <ArmorSlotDisplay armor={hero.armor} />}
              {hero.accessory && <AccessorySlotDisplay item={hero.accessory} label="Accessory" />}
            </div>
          </div>
        )}

        {/* Pet */}
        {hero.pet && (
          <div className="mt-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Pet</p>
            <div className="flex items-center gap-2 text-xs">
              <Star className="w-3.5 h-3.5 text-amber-400" />
              <span className={`font-medium ${RARITY_COLORS[hero.pet.rarity]}`}>{hero.pet.name}</span>
              <span className="text-muted-foreground">{RARITY_NAMES[hero.pet.rarity]}</span>
              {hero.pet.combatBonus > 0 && (
                <span className="text-muted-foreground">
                  — {getPetBonusName(hero.pet.combatBonus)}
                  {hero.pet.combatBonusScalar > 0 && ` +${(hero.pet.combatBonusScalar / 100).toFixed(1)}%`}
                  {getPetStatLabel(hero.pet.combatBonus) && (
                    <span className="ml-1 text-blue-400 text-xs">({getPetStatLabel(hero.pet.combatBonus)})</span>
                  )}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Status Resistances — base SER + passive-specific + armor-specific */}
        <div className="mt-3">
          <button
            onClick={() => setSerOpen(o => !o)}
            className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 hover:text-foreground transition-colors"
            data-testid="button-ser-toggle"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${serOpen ? '' : '-rotate-90'}`} />
            Status Resistances
            {anyElevated && <span className="ml-1 text-green-500">(boosted)</span>}
          </button>
          {serOpen && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
              {STATUS_RESISTANCES.map(status => {
                const total = getStatusTotal(status);
                const elevated = total > baseSER + 0.0001;
                return (
                  <div key={status} className="flex justify-between">
                    <span className={elevated ? 'text-green-500 font-medium' : 'text-muted-foreground'}>{status}</span>
                    <span className={`font-mono ${elevated ? 'text-green-500 font-medium' : ''}`}>{(total * 100).toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HeroCard({ hero, index, onHeroClick }: { hero: HeroDetail; index: number; onHeroClick: (h: HeroDetail) => void }) {
  const active1 = getActiveSkill(hero.active1);
  const active2 = getActiveSkill(hero.active2);
  const passive1 = getPassiveSkill(hero.passive1);
  const passive2 = getPassiveSkill(hero.passive2);

  const hasEquipment = hero.weapon1 || hero.weapon2 || hero.offhand1 || hero.offhand2 || hero.armor || hero.accessory;

  return (
    <div
      className="rounded-md border border-border/50 bg-muted/10 p-3 space-y-2.5 cursor-pointer hover-elevate"
      data-testid={`card-hero-${hero.id}`}
      onClick={() => onHeroClick(hero)}
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
        {[passive1, passive2].map((skill, i) => {
          if (!skill) return null;
          const eff = getPassiveEffects(skill.traitId);
          const staticHint = eff?.evaBonus   ? `EVA +${(eff.evaBonus * 100).toFixed(1)}%`
                           : eff?.blkBonus   ? `BLK/SBLK +${(eff.blkBonus * 100).toFixed(1)}%`
                           : eff?.serBonus   ? `SER +${(eff.serBonus * 100).toFixed(1)}%`
                           : null;
          return (
            <Badge
              key={`passive-${i}`}
              variant="outline"
              title={eff?.conditionalNote ?? skill.label}
              className={`text-xs ${ABILITY_RARITY_COLORS[skill.rarity]} ${ABILITY_RARITY_BORDER[skill.rarity]} opacity-80 flex flex-col items-start gap-0 h-auto py-0.5`}
              data-testid={`badge-skill-passive-${i}-${hero.id}`}
            >
              <span>{skill.label}</span>
              {staticHint && <span className="text-[10px] opacity-70 font-normal">{staticHint}</span>}
            </Badge>
          );
        })}
      </div>

      {/* Pet */}
      {hero.pet && (
        <div className="flex items-center gap-2 text-xs" data-testid={`pet-${hero.id}`}>
          <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className={`font-medium ${RARITY_COLORS[hero.pet.rarity] ?? ''}`}>{hero.pet.name}</span>
          <span className="text-muted-foreground">{RARITY_NAMES[hero.pet.rarity] ?? ''}</span>
          {hero.pet.combatBonus > 0 && (
            <span className="text-muted-foreground">
              — {getPetBonusName(hero.pet.combatBonus)}
              {hero.pet.combatBonusScalar > 0 && ` +${(hero.pet.combatBonusScalar / 100).toFixed(1)}%`}
              {getPetStatLabel(hero.pet.combatBonus) && (
                <span className="ml-1 text-blue-400 text-xs">({getPetStatLabel(hero.pet.combatBonus)})</span>
              )}
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
  const [selectedHero, setSelectedHero] = useState<HeroDetail | null>(null);

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
    <>
      {selectedHero && <HeroDetailModal hero={selectedHero} onClose={() => setSelectedHero(null)} />}
      <div className="space-y-4" data-testid="section-players">
        <p className="text-sm text-muted-foreground">{totalEntrants} / {maxEntrants} players — click a hero for full stats</p>
        {sorted.map((player, idx) => (
          <div
            key={player.address}
            className="rounded-md border border-border/50 overflow-hidden"
            data-testid={`card-player-${idx}`}
          >
            {/* Player header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 border-b border-border/40">
              <span className="text-xs text-muted-foreground w-6 shrink-0">#{player.partyIndex + 1}</span>
              {player.playerName && (
                <span className="text-sm font-medium truncate flex-1 min-w-0">{player.playerName}</span>
              )}
              <span className="font-mono text-xs text-muted-foreground shrink-0">{shortAddr(player.address)}</span>
              <CopyButton text={player.address} />
            </div>

            {/* Hero cards */}
            <div className="p-3 space-y-3">
              {player.heroes.length > 0 ? (
                player.heroes.map((hero, hi) => (
                  <HeroCard key={hero.id} hero={hero} index={hi} onHeroClick={setSelectedHero} />
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
    </>
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

// ─── AI Analysis tab ──────────────────────────────────────────────────────────

function AiAnalysisTab({ tournamentId, bracket, players }: {
  tournamentId: string;
  bracket: BracketData;
  players: PlayerEntry[];
}) {
  const [results, setResults] = useState<Record<string, AiMatchupResult & { loading?: boolean; error?: string }>>({});
  const [selectedRound, setSelectedRound] = useState(0);

  const slotMap: Record<number, string> = {};
  const nameMap: Record<number, string> = {};
  for (const p of players) {
    slotMap[p.partyIndex] = p.address;
    if (p.playerName) nameMap[p.partyIndex] = p.playerName;
  }

  const displayName = (slotId: number) => nameMap[slotId] || shortAddr(slotMap[slotId] ?? null);

  const round = bracket.rounds[selectedRound] ?? [];
  const matchesWithPlayers = round.filter(m =>
    m.slotA > 0 && m.slotB > 0 && slotMap[m.slotA] && slotMap[m.slotB]
  );

  const analyze = async (slotA: number, slotB: number) => {
    const key = `${slotA}-${slotB}`;
    const addrA = slotMap[slotA];
    const addrB = slotMap[slotB];
    if (!addrA || !addrB) return;

    setResults(prev => ({ ...prev, [key]: { ...prev[key], loading: true, error: undefined } as any }));
    try {
      const res = await fetch(`/api/admin/tournament/bracket/${tournamentId}/ai-matchup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerAAddr: addrA, playerBAddr: addrB }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Analysis failed');
      setResults(prev => ({ ...prev, [key]: { ...data, loading: false } }));
    } catch (err: any) {
      setResults(prev => ({ ...prev, [key]: { ...prev[key], loading: false, error: err.message } as any }));
    }
  };

  if (players.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="section-ai-empty">
        <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>No players registered yet — analysis will be available once entries are in.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="section-ai-analysis">
      {/* Round selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Round:</span>
        {bracket.rounds.map((_, ri) => (
          <Button
            key={ri}
            size="sm"
            variant={selectedRound === ri ? 'default' : 'outline'}
            onClick={() => setSelectedRound(ri)}
            data-testid={`btn-round-${ri}`}
          >
            {ROUND_LABELS[ri] ?? `Round ${ri + 1}`}
          </Button>
        ))}
      </div>

      {matchesWithPlayers.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No assigned matchups in this round yet.
        </div>
      ) : (
        <div className="space-y-4">
          {matchesWithPlayers.map(match => {
            const key = `${match.slotA}-${match.slotB}`;
            const result = results[key];
            const nameA = displayName(match.slotA);
            const nameB = displayName(match.slotB);

            return (
              <Card key={key} data-testid={`card-matchup-${key}`}>
                <CardContent className="p-5 space-y-4">
                  {/* Matchup header */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm">{nameA}</span>
                      <span className="text-muted-foreground text-sm">vs</span>
                      <span className="font-semibold text-sm">{nameB}</span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => analyze(match.slotA, match.slotB)}
                      disabled={result?.loading}
                      data-testid={`btn-analyze-${key}`}
                    >
                      <Zap className="w-3.5 h-3.5 mr-1.5" />
                      {result?.loading ? 'Analyzing...' : result ? 'Re-analyze' : 'Analyze'}
                    </Button>
                  </div>

                  {/* Error */}
                  {result?.error && (
                    <p className="text-sm text-destructive">{result.error}</p>
                  )}

                  {/* Results */}
                  {result && !result.loading && !result.error && (
                    <div className="space-y-3">
                      {/* Win bar */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-green-400">{nameA} — {result.winPctA}%</span>
                          <span className="text-red-400">{result.winPctB}% — {nameB}</span>
                        </div>
                        <div className="h-3 rounded-full overflow-hidden flex bg-muted">
                          <div
                            className="h-full bg-green-500 transition-all duration-700"
                            style={{ width: `${result.winPctA}%` }}
                          />
                          <div
                            className="h-full bg-red-500 transition-all duration-700"
                            style={{ width: `${result.winPctB}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <p className="text-xs text-muted-foreground">
                            Initiative: {nameA} {result.initPctA}% / {nameB} {100 - result.initPctA}%
                          </p>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${result.defSource === 'armor' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-500'}`}>
                            {result.defSource === 'armor' ? 'Armor defense data' : 'No armor — VIT/END proxy'}
                          </span>
                        </div>
                      </div>

                      {/* Per-hero defense breakdown */}
                      {result.defSource === 'armor' && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {([
                            { label: nameA, heroes: result.teamA?.heroes ?? [] },
                            { label: nameB, heroes: result.teamB?.heroes ?? [] },
                          ] as { label: string; heroes: AiHeroProfile[] }[]).map(({ label, heroes }) => (
                            <div key={label} className="rounded-md bg-muted/20 p-2.5 space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                              {heroes.map((h, hi) => (
                                <div key={hi} className="text-xs flex items-center gap-2 flex-wrap">
                                  <span className="text-muted-foreground shrink-0">{h.mainClass} Lv{h.level}</span>
                                  {h.hasArmor ? (
                                    <>
                                      <span>P.DEF <span className="font-mono">{h.pDef.toFixed(1)}</span></span>
                                      <span className="text-muted-foreground">({h.pRed.toFixed(1)}% red)</span>
                                      <span>M.DEF <span className="font-mono">{h.mDef.toFixed(1)}</span></span>
                                      <span className="text-muted-foreground">({h.mRed.toFixed(1)}% red)</span>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground italic">no armor</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* AI analysis */}
                      <div className="rounded-md bg-muted/30 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Analysis</p>
                        <p className="text-sm leading-relaxed">{result.analysis}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
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
        <span data-testid="stat-players">{t.entrantsClaimed} / {t.entrants} players</span>
        {t.entryFee > 0 && <><span>·</span><span data-testid="stat-entry-fee">{t.entryFee.toFixed(2)} JEWEL entry</span></>}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="bracket" className="w-full">
        <TabsList data-testid="tabs-tournament-detail">
          <TabsTrigger value="bracket" data-testid="tab-bracket">Bracket</TabsTrigger>
          <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
          <TabsTrigger value="players" data-testid="tab-players">
            Players
            <span className="ml-1.5 text-xs text-muted-foreground">({t.entrantsClaimed})</span>
          </TabsTrigger>
          <TabsTrigger value="rewards" data-testid="tab-rewards">Rewards</TabsTrigger>
          <TabsTrigger value="ai-analysis" data-testid="tab-ai-analysis">
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            AI Analysis
          </TabsTrigger>
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
              <PlayersTab players={players} maxEntrants={t.maxEntrants} totalEntrants={t.entrantsClaimed} />
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

        <TabsContent value="ai-analysis" className="mt-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4" />
                AI Matchup Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AiAnalysisTab tournamentId={String(t.id)} bracket={bracket} players={players} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
