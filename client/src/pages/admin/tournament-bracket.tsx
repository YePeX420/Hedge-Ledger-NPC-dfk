import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowLeft, Trophy, Medal, Copy, Check, Users, Gift, Info, RefreshCw, Shield, Sword, Zap, Star, X, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useState } from 'react';
import {
  ABILITY_RARITY_COLORS, ABILITY_RARITY_BORDER,
  getActiveSkill, getPassiveSkill, getPassiveEffects,
} from '@/data/dfk-abilities';
import {
  getPetBonusName,
  getPetStatLabel,
} from '@/data/dfk-equipment-bonuses';
import { HeroDetailModal } from '@/components/dfk/HeroDetailModal';
import type {
  HeroDetail,
  HeroWeapon,
  HeroArmor,
  HeroAccessory,
  HeroPet,
} from '@/components/dfk/HeroDetailModal';

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


interface PlayerEntry {
  address: string;
  partyIndex: number;
  heroIds: number[];
  heroes: HeroDetail[];
  playerName: string | null;
}

interface AiMatchupResult {
  winPctA: number;
  winPctB: number;
  nameA: string;
  nameB: string;
  factors: {
    init: number;
    dps: number;
    surv: number;
    synergy: number;
    comp: number;
    experience: number;
  };
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
  10: '2H Sword', 11: '2H Axe', 12: '2H Staff', 13: '1H Wand',
  14: 'Throwing', 15: 'Shield', 16: 'Tome',
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

// ─── Bracket layout constants ─────────────────────────────────────────────────
const MATCH_H = 82;      // px — height of match cards in round 1+
const MATCH_H_R0 = 108;  // px — taller for round 0 (includes Analyze Matchup footer)
const MATCH_GAP = 8;     // px — gap between cards in the first round

function formatRoundTime(tournamentStartTime: number, roundLengthMinutes: number, roundIndex: number): string {
  const ts = tournamentStartTime + roundIndex * roundLengthMinutes * 60;
  return new Date(ts * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function MatchCard({ match, slotMap, nameMap, roundIndex, matchIndex, onMatchClick, onAnalyze }: {
  match: BracketMatch;
  slotMap: Record<number, string>;
  nameMap: Record<number, string>;
  roundIndex: number;
  matchIndex: number;
  onMatchClick?: (match: BracketMatch) => void;
  onAnalyze?: (match: BracketMatch) => void;
}) {
  const hasPlayers = match.slotA !== 0 || match.slotB !== 0;
  const hasBothPlayers = match.slotA > 0 && match.slotB > 0;
  const cardH = MATCH_H_R0;
  return (
    <div
      className="flex flex-col w-44 border border-border/60 rounded-md bg-muted/20 overflow-hidden"
      style={{ height: cardH }}
      data-testid={`match-r${roundIndex}-m${matchIndex}`}
    >
      <div
        className={`flex flex-col flex-1 ${hasPlayers && onMatchClick ? 'cursor-pointer hover-elevate' : ''}`}
        style={{ height: MATCH_H }}
        onClick={() => hasPlayers && onMatchClick?.(match)}
      >
        <div className="flex-1 flex items-center">
          <PlayerSlot slotId={match.slotA} slotMap={slotMap} nameMap={nameMap} winner={match.winner} isWinner={match.winner !== 0 && match.winner === match.slotA} />
        </div>
        <div className="border-t border-border/40 mx-2" />
        <div className="flex-1 flex items-center">
          <PlayerSlot slotId={match.slotB} slotMap={slotMap} nameMap={nameMap} winner={match.winner} isWinner={match.winner !== 0 && match.winner === match.slotB} />
        </div>
      </div>
      <div className="border-t border-border/40" />
      <div className="flex items-center justify-center px-2" style={{ height: cardH - MATCH_H - 1 }}>
        {onAnalyze && hasBothPlayers ? (
          <button
            className="w-full text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 py-1"
            onClick={() => onAnalyze(match)}
            data-testid={`btn-analyze-matchup-r${roundIndex}-m${matchIndex}`}
          >
            <Zap className="w-2.5 h-2.5" />
            Analyze Matchup
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground/30 italic select-none">
            {!hasBothPlayers && hasPlayers ? 'Bye' : ''}
          </span>
        )}
      </div>
    </div>
  );
}

function BracketConnector({ matchesInRound, totalHeight, width = 40 }: {
  matchesInRound: number;
  totalHeight: number;
  width?: number;
}) {
  const outputCount = matchesInRound / 2;
  const lines: React.ReactNode[] = [];

  for (let j = 0; j < outputCount; j++) {
    const topY = ((2 * j * 2) + 1) * totalHeight / (2 * matchesInRound);
    const botY = ((2 * j * 2 + 2) + 1) * totalHeight / (2 * matchesInRound);
    const outY = (topY + botY) / 2;
    const mid = width / 2;

    lines.push(
      <g key={j}>
        <line x1={0} y1={topY} x2={mid} y2={topY} />
        <line x1={0} y1={botY} x2={mid} y2={botY} />
        <line x1={mid} y1={topY} x2={mid} y2={botY} />
        <line x1={mid} y1={outY} x2={width} y2={outY} />
      </g>
    );
  }

  return (
    <svg
      width={width}
      height={totalHeight}
      style={{ flexShrink: 0 }}
      overflow="visible"
    >
      <g stroke="hsl(var(--border))" strokeWidth="1.5" fill="none">
        {lines}
      </g>
    </svg>
  );
}


const ROUND_LABELS = ['Round of 8', 'Semifinal', 'Final'];

function BracketTab({ bracket, players, champion, tournament, tournamentId }: {
  bracket: BracketData;
  players: PlayerEntry[];
  champion: number;
  tournament: TournamentDetail;
  tournamentId: string;
}) {
  const [, navigate] = useLocation();
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

  // Round-0 cards are taller (MATCH_H_R0); this anchors the total bracket height
  const N = bracket.rounds[0]?.length ?? 1;
  const totalH = N * MATCH_H_R0 + (N - 1) * MATCH_GAP;

  // Header height so all column headers align
  const HEADER_H = 56;

  const handleAnalyze = (match: BracketMatch) => {
    navigate(`/admin/tournament/bracket/${tournamentId}/matchup/${match.slotA}/${match.slotB}`);
  };

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
        <div className="flex items-end gap-0 min-w-max pb-4">
          {bracket.rounds.map((round, ri) => (
            <div key={ri} style={{ display: 'contents' }}>
              {/* Round column */}
              <div className="flex flex-col items-center">
                {/* Round header pill */}
                <div
                  className="flex flex-col items-center justify-center w-44 rounded-md bg-muted/50 border border-border/60 px-3 py-2 mb-4 text-center"
                  style={{ height: HEADER_H }}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    {ROUND_LABELS[ri] ?? `Round ${ri + 1}`}
                  </span>
                  {tournament.tournamentStartTime > 0 && tournament.roundLengthMinutes > 0 && (
                    <span className="text-[11px] text-muted-foreground mt-0.5">
                      {formatRoundTime(tournament.tournamentStartTime, tournament.roundLengthMinutes, ri)}
                    </span>
                  )}
                </div>
                {/* Match cards — evenly distributed across total height */}
                <div
                  className="flex flex-col items-center justify-evenly"
                  style={{ height: totalH }}
                >
                  {round.map((match, mi) => (
                    <MatchCard
                      key={mi}
                      match={match}
                      slotMap={slotMap}
                      nameMap={nameMap}
                      roundIndex={ri}
                      matchIndex={mi}
                      onMatchClick={setSelectedMatch}
                      onAnalyze={handleAnalyze}
                    />
                  ))}
                </div>
              </div>

              {/* Connector SVG between this round and the next */}
              {ri < bracket.rounds.length - 1 && (
                <div style={{ marginTop: HEADER_H + 16 }}>
                  <BracketConnector matchesInRound={round.length} totalHeight={totalH} width={40} />
                </div>
              )}
            </div>
          ))}

          {/* Single horizontal connector from last round to champion */}
          {bracket.rounds.length > 0 && (
            <div style={{ marginTop: HEADER_H + 16 }}>
              <svg width={32} height={totalH} style={{ flexShrink: 0 }} overflow="visible">
                <line
                  x1={0} y1={totalH / 2}
                  x2={32} y2={totalH / 2}
                  stroke="hsl(var(--border))" strokeWidth="1.5" fill="none"
                />
              </svg>
            </div>
          )}

          {/* Champion column */}
          <div className="flex flex-col items-center">
            <div
              className="flex flex-col items-center justify-center w-44 rounded-md bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 mb-4 text-center"
              style={{ height: HEADER_H }}
            >
              <Trophy className="w-4 h-4 text-yellow-400 mb-0.5" />
              <span className="text-xs font-semibold uppercase tracking-wide text-yellow-300">Champion</span>
            </div>
            <div
              className="flex flex-col items-center justify-center"
              style={{ height: totalH }}
            >
              <div className="flex items-center gap-2 px-3 py-3 rounded-md w-44 border border-yellow-500/30 bg-yellow-500/10" style={{ height: MATCH_H }}>
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
  const displayName = weapon.itemName ?? `${typeName} #${weapon.displayId}`;
  const rarityColor = RARITY_COLORS[weapon.rarity] ?? 'text-muted-foreground';
  return (
    <EquipSlot label={label} icon={<Sword className="w-4 h-4" />}>
      <span className={`text-xs font-medium ${rarityColor}`}>{displayName}</span>
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
  const displayName = armor.itemName ?? `${typeName} Armor #${armor.displayId}`;
  const rarityColor = RARITY_COLORS[armor.rarity] ?? 'text-muted-foreground';
  return (
    <EquipSlot label="Armor" icon={<Shield className="w-4 h-4" />}>
      <span className={`text-xs font-medium ${rarityColor}`}>{displayName}</span>
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
  const displayName = item.itemName ?? `Accessory #${item.displayId}`;
  const rarityColor = RARITY_COLORS[item.rarity] ?? 'text-muted-foreground';
  return (
    <EquipSlot label={label} icon={<Zap className="w-4 h-4" />}>
      <span className={`text-xs font-medium ${rarityColor}`}>{displayName}</span>
      <div className="mt-0.5">
        <DurabilityBar current={item.durability} max={item.maxDurability} />
      </div>
    </EquipSlot>
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

// ─── Team ranking result types ────────────────────────────────────────────────

interface TeamRankEntry {
  address: string;
  playerName: string | null;
  partyIndex: number;
  heroClasses: string[];
  avgWinRate: number;
  exp: number;
  expRecord: { wins: number; losses: number } | null;
  positioning: { class: string; position: 'front' | 'back' }[];
  teamStats: { dps: number; surv: number; synergy: number; comp: number; initAvg: number };
}

interface RankResult {
  rankings: TeamRankEntry[];
  narrative: string | null;
  playerCount: number;
}

// ─── Players tab ──────────────────────────────────────────────────────────────

const RANK_MEDALS = [
  <Trophy className="w-3.5 h-3.5 text-yellow-400" />,
  <Medal className="w-3.5 h-3.5 text-slate-300" />,
  <Medal className="w-3.5 h-3.5 text-amber-600" />,
];

function PlayersTab({ players, maxEntrants, totalEntrants, tournamentId }: {
  players: PlayerEntry[];
  maxEntrants: number;
  totalEntrants: number;
  tournamentId: string;
}) {
  const [selectedHero, setSelectedHero] = useState<HeroDetail | null>(null);
  const [rankResult, setRankResult] = useState<RankResult | null>(null);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankError, setRankError] = useState<string | null>(null);
  const [rankOpen, setRankOpen] = useState(true);
  const [tipsMap, setTipsMap] = useState<Record<string, { loading: boolean; text: string | null; error?: string }>>({});

  const eligibleCount = players.filter(p => p.heroes.length > 0).length;

  const runRanking = async () => {
    setRankLoading(true);
    setRankError(null);
    try {
      const res = await fetch(`/api/admin/tournament/bracket/${tournamentId}/rank-teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Ranking failed');
      setRankResult(data);
    } catch (err: any) {
      setRankError(err.message);
    } finally {
      setRankLoading(false);
    }
  };

  const fetchTips = async (address: string) => {
    if (tipsMap[address.toLowerCase()]?.loading) return;
    setTipsMap(prev => ({ ...prev, [address.toLowerCase()]: { loading: true, text: null } }));
    try {
      const res = await fetch(`/api/admin/tournament/bracket/${tournamentId}/player-tips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Tips unavailable');
      setTipsMap(prev => ({ ...prev, [address.toLowerCase()]: { loading: false, text: data.tips } }));
    } catch (err: any) {
      setTipsMap(prev => ({ ...prev, [address.toLowerCase()]: { loading: false, text: null, error: err.message } }));
    }
  };

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

  // Build a rank position map from ranking results for badge display
  const rankMap: Record<string, number> = {};
  if (rankResult) {
    rankResult.rankings.forEach((r, i) => { rankMap[r.address.toLowerCase()] = i; });
  }

  return (
    <>
      {selectedHero && <HeroDetailModal hero={selectedHero} onClose={() => setSelectedHero(null)} />}
      <div className="space-y-4" data-testid="section-players">

        {/* AI Rank Teams panel */}
        <div className="rounded-md border border-border/50 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 border-b border-border/40 flex-wrap gap-y-2">
            <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">AI Team Power Ranking</span>
              {rankResult && (
                <span className="ml-2 text-[10px] text-muted-foreground">equipment · pets · skills · positioning factored</span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {eligibleCount >= 2 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runRanking}
                  disabled={rankLoading}
                  data-testid="btn-rank-teams"
                >
                  {rankLoading
                    ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Ranking…</>
                    : rankResult
                    ? <><RefreshCw className="w-3 h-3 mr-1.5" />Re-rank</>
                    : <><Zap className="w-3 h-3 mr-1.5 text-yellow-400" />Rank {eligibleCount} Teams</>
                  }
                </Button>
              )}
              {rankResult && (
                <Button size="icon" variant="ghost" onClick={() => setRankOpen(v => !v)} data-testid="btn-rank-toggle">
                  {rankOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
              )}
            </div>
          </div>

          {rankError && (
            <div className="px-4 py-3 text-sm text-destructive">{rankError}</div>
          )}

          {!rankResult && !rankLoading && !rankError && eligibleCount < 2 && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              {eligibleCount === 0 ? 'No teams with hero data yet.' : 'Need at least 2 teams with heroes to rank.'}
            </div>
          )}

          {!rankResult && !rankLoading && !rankError && eligibleCount >= 2 && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Click "Rank {eligibleCount} Teams" to score all entrants using the 6-factor prediction engine and get an AI-generated field assessment.
            </div>
          )}

          {rankResult && rankOpen && (
            <div className="divide-y divide-border/30">
              {/* AI narrative */}
              {rankResult.narrative && (
                <div className="px-4 py-3 bg-blue-500/5 border-b border-blue-500/20">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-400 mb-1.5 flex items-center gap-1.5">
                    <Star className="w-3 h-3" /> Field Assessment
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{rankResult.narrative}</p>
                </div>
              )}

              {/* Ranking rows */}
              {rankResult.rankings.map((entry, i) => (
                <div
                  key={entry.address}
                  className={`flex items-center gap-3 px-4 py-2.5 flex-wrap gap-y-1 ${i === 0 ? 'bg-yellow-500/5' : ''}`}
                  data-testid={`row-rank-${i}`}
                >
                  <div className="w-5 shrink-0 flex items-center justify-center">
                    {RANK_MEDALS[i] ?? <span className="text-xs text-muted-foreground font-mono">{i + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {entry.playerName || shortAddr(entry.address)}
                      </span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {entry.positioning && entry.positioning.length > 0
                          ? entry.positioning.map((hp, ci) => (
                              <Badge
                                key={ci}
                                variant="secondary"
                                className={`text-[10px] px-1.5 py-0 ${hp.position === 'front' ? 'bg-orange-500/15 text-orange-300 border-orange-500/20' : 'bg-blue-500/15 text-blue-300 border-blue-500/20'}`}
                                title={`Recommended: ${hp.position}-line`}
                              >
                                {hp.class}
                              </Badge>
                            ))
                          : entry.heroClasses.map((cls, ci) => (
                              <Badge key={ci} variant="secondary" className="text-[10px] px-1.5 py-0">{cls}</Badge>
                            ))
                        }
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {entry.expRecord && (entry.expRecord.wins + entry.expRecord.losses) >= 3 && (
                        <p className="text-[10px] text-muted-foreground">
                          {entry.expRecord.wins}W–{entry.expRecord.losses}L record
                        </p>
                      )}
                      {entry.teamStats.synergy > 0 && (
                        <p className="text-[10px] text-purple-400/80">
                          {entry.teamStats.synergy}% synergy
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className={`text-sm font-bold tabular-nums ${entry.avgWinRate >= 60 ? 'text-green-400' : entry.avgWinRate >= 50 ? 'text-muted-foreground' : 'text-red-400/70'}`}>
                      {entry.avgWinRate}%
                    </span>
                    <span className="text-[10px] text-muted-foreground">proj. win rate</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-sm text-muted-foreground">{totalEntrants} / {maxEntrants} players — click a hero for full stats</p>

        {sorted.map((player, idx) => {
          const rankPos = rankMap[player.address.toLowerCase()];
          const hasRank = rankResult != null && rankPos !== undefined;
          return (
            <div
              key={player.address}
              className="rounded-md border border-border/50 overflow-hidden"
              data-testid={`card-player-${idx}`}
            >
              {/* Player header */}
              <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 border-b border-border/40 flex-wrap gap-y-1">
                <span className="text-xs text-muted-foreground w-6 shrink-0">#{player.partyIndex + 1}</span>
                {player.playerName && (
                  <span className="text-sm font-medium truncate flex-1 min-w-0">{player.playerName}</span>
                )}
                {hasRank && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 shrink-0 ${rankPos === 0 ? 'border-yellow-400/50 text-yellow-400' : rankPos === 1 ? 'border-slate-300/50 text-slate-300' : rankPos === 2 ? 'border-amber-600/50 text-amber-500' : 'border-border/50 text-muted-foreground'}`}
                    data-testid={`badge-rank-${idx}`}
                  >
                    #{rankPos + 1} · {rankResult!.rankings[rankPos].avgWinRate}%
                  </Badge>
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

                {/* AI Tips section */}
                {player.heroes.length > 0 && (() => {
                  const tipsKey = player.address.toLowerCase();
                  const tips = tipsMap[tipsKey];
                  return (
                    <div className="border-t border-border/30 pt-3">
                      {!tips || (!tips.loading && !tips.text && !tips.error) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-[11px] h-7 text-blue-400 hover:text-blue-300"
                          onClick={() => fetchTips(player.address)}
                          data-testid={`btn-tips-${idx}`}
                        >
                          <Lightbulb className="w-3 h-3 mr-1.5" />
                          Get AI Tactical Tips
                        </Button>
                      ) : tips.loading ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Analysing team composition…
                        </div>
                      ) : tips.error ? (
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-destructive">{tips.error}</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[11px] h-7 text-muted-foreground"
                            onClick={() => fetchTips(player.address)}
                          >
                            Retry
                          </Button>
                        </div>
                      ) : tips.text ? (
                        <div className="rounded-md bg-blue-500/8 border border-blue-500/20 px-3 py-2.5">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Lightbulb className="w-3 h-3 text-blue-400 shrink-0" />
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-400">AI Tactical Tips</span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="ml-auto h-5 w-5"
                              onClick={() => setTipsMap(prev => ({ ...prev, [tipsKey]: { loading: false, text: null } }))}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{tips.text}</p>
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
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
                      {result?.loading ? 'Running...' : result ? 'Re-run' : 'Get Prediction'}
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
                          <span className="text-green-400">{result.nameA} — {result.winPctA}%</span>
                          <span className="text-red-400">{result.winPctB}% — {result.nameB}</span>
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
                      </div>

                      {/* 6-factor breakdown */}
                      {result.factors && (
                        <div className="rounded-md bg-muted/20 p-3 space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Factor Breakdown</p>
                          {([
                            { label: 'Initiative',    key: 'init',       weight: 25 },
                            { label: 'Effective DPS', key: 'dps',        weight: 30 },
                            { label: 'Survivability', key: 'surv',       weight: 20 },
                            { label: 'Skill Synergy', key: 'synergy',    weight: 10 },
                            { label: 'Team Comp',     key: 'comp',       weight: 10 },
                            { label: 'Experience',    key: 'experience', weight:  5 },
                          ] as { label: string; key: keyof typeof result.factors; weight: number }[]).map(({ label, key, weight }) => {
                            const aVal = result.factors[key];
                            const bVal = Math.round((100 - aVal) * 10) / 10;
                            const aHigher = aVal >= 50;
                            return (
                              <div key={key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-xs text-muted-foreground truncate">{label}</span>
                                  <span className="text-[10px] text-muted-foreground/60 shrink-0">{weight}%</span>
                                </div>
                                <span className={`text-xs font-mono tabular-nums ${aHigher ? 'text-green-400' : 'text-muted-foreground'}`}>
                                  {aVal.toFixed(1)}%
                                </span>
                                <span className={`text-xs font-mono tabular-nums ${!aHigher ? 'text-green-400' : 'text-muted-foreground'}`}>
                                  {bVal.toFixed(1)}%
                                </span>
                              </div>
                            );
                          })}
                          <div className="pt-1 border-t border-border/40 flex justify-between text-[10px] text-muted-foreground/50">
                            <span>{result.nameA}</span>
                            <span>{result.nameB}</span>
                          </div>
                        </div>
                      )}
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
              <BracketTab bracket={bracket} players={players} champion={bracket.champion} tournament={t} tournamentId={id} />
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
              <PlayersTab players={players} maxEntrants={t.maxEntrants} totalEntrants={t.entrantsClaimed} tournamentId={id} />
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
