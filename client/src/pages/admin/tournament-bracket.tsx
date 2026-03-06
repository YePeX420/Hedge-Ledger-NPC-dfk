import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowLeft, Trophy, Medal, Copy, Check, Users, Gift, Info, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';

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
  format: string;
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

interface BracketDetailResponse {
  ok: boolean;
  tournament: TournamentDetail;
  bracket: BracketData;
  players: Record<string, string>;
  rewardTiers: RewardTier[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATE_CONFIG: Record<string, { label: string; className: string }> = {
  in_progress:      { label: 'In Progress',       className: 'bg-green-600/15 text-green-400 border border-green-600/30' },
  accepting_entries:{ label: 'Accepting Entries',  className: 'bg-purple-400/15 text-purple-300 border border-purple-400/30' },
  upcoming:         { label: 'Upcoming',           className: 'bg-purple-700/15 text-purple-400 border border-purple-700/30' },
  completed:        { label: 'Completed',          className: 'bg-muted text-muted-foreground border border-border' },
  cancelled:        { label: 'Cancelled',          className: 'bg-red-600/15 text-red-400 border border-red-600/30' },
};

const RARITY_NAMES: Record<number, string> = { 0:'Common', 1:'Uncommon', 2:'Rare', 3:'Legendary', 4:'Mythic' };

function shortAddr(addr: string | undefined | null): string {
  if (!addr) return '?';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatDatetime(ts: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

function PlayerSlot({ slotId, players, winner, isWinner }: {
  slotId: number;
  players: Record<string, string>;
  winner: number;
  isWinner: boolean;
}) {
  const addr = slotId > 0 ? (players[slotId] || null) : null;
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

function MatchCard({ match, players, roundIndex, matchIndex }: {
  match: BracketMatch;
  players: Record<string, string>;
  roundIndex: number;
  matchIndex: number;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 w-44"
      data-testid={`match-r${roundIndex}-m${matchIndex}`}
    >
      <PlayerSlot slotId={match.slotA} players={players} winner={match.winner} isWinner={match.winner !== 0 && match.winner === match.slotA} />
      <div className="border-t border-border/40 mx-2" />
      <PlayerSlot slotId={match.slotB} players={players} winner={match.winner} isWinner={match.winner !== 0 && match.winner === match.slotB} />
    </div>
  );
}

const ROUND_LABELS = ['Round of 8', 'Semifinal', 'Final'];

function BracketTab({ bracket, players, champion }: {
  bracket: BracketData;
  players: Record<string, string>;
  champion: number;
}) {
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
                  <MatchCard key={mi} match={match} players={players} roundIndex={ri} matchIndex={mi} />
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
                    {players[champion] ? (
                      <span className="font-mono text-xs font-bold truncate">{shortAddr(players[champion])}</span>
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
          <DetailRow label="Format" value={t.format} />
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

// ─── Players tab ──────────────────────────────────────────────────────────────

function PlayersTab({ players, maxEntrants }: { players: Record<string, string>; maxEntrants: number }) {
  const entries = Object.entries(players).sort((a, b) => Number(a[0]) - Number(b[0]));

  if (entries.length === 0) {
    return (
      <div className="text-center py-12" data-testid="section-players-empty">
        <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="font-medium">No players have registered yet</p>
        <p className="text-sm text-muted-foreground mt-1">Player wallets will appear here once they claim entry.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="section-players">
      <p className="text-sm text-muted-foreground">{entries.length} / {maxEntrants} players registered</p>
      <div className="rounded-md border border-border/50 overflow-hidden">
        {entries.map(([slotId, addr], idx) => (
          <div
            key={slotId}
            className={`flex items-center gap-4 px-4 py-3 ${idx < entries.length - 1 ? 'border-b border-border/40' : ''}`}
            data-testid={`row-player-${slotId}`}
          >
            <span className="text-xs text-muted-foreground w-6 shrink-0">#{slotId}</span>
            <span className="font-mono text-sm flex-1">{addr}</span>
            <CopyButton text={addr} />
          </div>
        ))}
      </div>
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
      <div className="flex gap-4 flex-wrap text-sm text-muted-foreground">
        <span>{t.format} format</span>
        <span>·</span>
        <span>{t.rounds} rounds ({t.roundLengthMinutes} min)</span>
        <span>·</span>
        <span>{t.entrantsClaimed ?? t.entrants} / {t.maxEntrants} players</span>
        {t.entryFee > 0 && <><span>·</span><span>{t.entryFee.toFixed(2)} JEWEL entry</span></>}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="bracket" className="w-full">
        <TabsList data-testid="tabs-tournament-detail">
          <TabsTrigger value="bracket" data-testid="tab-bracket">Bracket</TabsTrigger>
          <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
          <TabsTrigger value="players" data-testid="tab-players">
            Players
            <span className="ml-1.5 text-xs text-muted-foreground">({Object.keys(players).length})</span>
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
              <PlayersTab players={players} maxEntrants={t.maxEntrants} />
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
