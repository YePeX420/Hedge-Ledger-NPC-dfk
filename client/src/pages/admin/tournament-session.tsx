import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Swords, Trophy, Calendar, Users } from 'lucide-react';

const RARITY_LABELS = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
const RARITY_COLORS = ['text-muted-foreground', 'text-green-500', 'text-blue-500', 'text-orange-500', 'text-purple-500'];

const CLASS_COLORS: Record<string, string> = {
  Warrior: 'bg-red-500/15 text-red-400',
  Knight: 'bg-yellow-500/15 text-yellow-400',
  Thief: 'bg-purple-500/15 text-purple-400',
  Archer: 'bg-green-500/15 text-green-400',
  Priest: 'bg-blue-500/15 text-blue-400',
  Wizard: 'bg-indigo-500/15 text-indigo-400',
  Monk: 'bg-orange-500/15 text-orange-400',
  Pirate: 'bg-teal-500/15 text-teal-400',
  Berserker: 'bg-red-600/15 text-red-500',
  Seer: 'bg-cyan-500/15 text-cyan-400',
  Legionnaire: 'bg-amber-500/15 text-amber-400',
  Scholar: 'bg-violet-500/15 text-violet-400',
  default: 'bg-muted text-muted-foreground',
};

function classColor(cls: string) {
  return CLASS_COLORS[cls] || CLASS_COLORS.default;
}

interface HeroSnap {
  heroId: number;
  mainClass: string;
  subClass: string;
  level: number;
  rarity: number;
  playerAddress: string;
  placement: string;
  active1?: string | null;
  active2?: string | null;
  passive1?: string | null;
  passive2?: string | null;
}

interface Bout {
  id: number;
  tournamentId: number;
  format: string;
  status: string;
  startTime: string | null;
  hostPlayer: string | null;
  opponentPlayer: string | null;
  winnerPlayer: string | null;
  levelMin: number | null;
  levelMax: number | null;
  rarityMin: number | null;
  realm: string;
  gloryBout: boolean | null;
  tournamentTypeSignature: string | null;
  heroSnapshots: HeroSnap[] | null;
}

function truncAddr(addr: string | null | undefined) {
  if (!addr) return '—';
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function formatDate(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start) return '—';
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (!e || s.toDateString() === e.toDateString()) {
    return s.toLocaleDateString(undefined, { ...opts, year: 'numeric' });
  }
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`;
}

// Cluster bouts into rounds using 2-hour gap as a round break
function clusterIntoRounds(bouts: Bout[]): Bout[][] {
  if (bouts.length === 0) return [];
  const sorted = [...bouts].sort((a, b) => {
    const ta = a.startTime ? new Date(a.startTime).getTime() : 0;
    const tb = b.startTime ? new Date(b.startTime).getTime() : 0;
    return ta - tb;
  });
  const rounds: Bout[][] = [];
  let currentRound: Bout[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentRound[currentRound.length - 1];
    const prevTime = prev.startTime ? new Date(prev.startTime).getTime() : 0;
    const currTime = sorted[i].startTime ? new Date(sorted[i].startTime).getTime() : 0;
    const gapHours = (currTime - prevTime) / (1000 * 60 * 60);

    if (gapHours > 2) {
      rounds.push(currentRound);
      currentRound = [sorted[i]];
    } else {
      currentRound.push(sorted[i]);
    }
  }
  rounds.push(currentRound);
  return rounds;
}

function HeroClassChips({ heroes, isWinner }: { heroes: HeroSnap[]; isWinner: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {heroes.slice(0, 3).map((h, i) => (
        <span
          key={i}
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${classColor(h.mainClass)} ${isWinner ? 'ring-1 ring-green-500/40' : ''}`}
        >
          {h.mainClass}
          <span className="ml-1 opacity-60">Lv{h.level}</span>
        </span>
      ))}
    </div>
  );
}

function MatchupCard({ bout, onClick }: { bout: Bout; onClick: () => void }) {
  const snapshots = bout.heroSnapshots || [];
  const hostAddr = bout.hostPlayer?.toLowerCase();
  const hostHeroes = snapshots.filter(s => s.playerAddress?.toLowerCase() === hostAddr);
  const opponentHeroes = snapshots.filter(s => s.playerAddress?.toLowerCase() !== hostAddr);
  const isHostWin = bout.winnerPlayer && bout.hostPlayer &&
    bout.winnerPlayer.toLowerCase() === bout.hostPlayer.toLowerCase();

  return (
    <Card className="hover-elevate" data-testid={`card-bout-${bout.tournamentId}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono text-muted-foreground">#{bout.tournamentId}</span>
          <span className="text-xs text-muted-foreground">{formatDate(bout.startTime)}</span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
          <div className="space-y-1">
            <p className={`text-xs font-mono truncate ${isHostWin ? 'text-green-500' : 'text-muted-foreground'}`}>
              {truncAddr(bout.hostPlayer)} {isHostWin && <Trophy className="w-2.5 h-2.5 inline" />}
            </p>
            {hostHeroes.length > 0
              ? <HeroClassChips heroes={hostHeroes} isWinner={!!isHostWin} />
              : <p className="text-xs text-muted-foreground italic">No data</p>
            }
          </div>

          <div className="flex flex-col items-center">
            <Swords className="w-4 h-4 text-muted-foreground" />
            {bout.winnerPlayer && (
              <Badge
                variant="outline"
                className={`mt-1 text-[9px] px-1 py-0 ${isHostWin ? 'text-green-600 border-green-500/30' : 'text-blue-500 border-blue-500/30'}`}
              >
                {isHostWin ? 'Host' : 'Opp'}
              </Badge>
            )}
          </div>

          <div className="space-y-1 text-right">
            <p className={`text-xs font-mono truncate ${!isHostWin && bout.winnerPlayer ? 'text-green-500' : 'text-muted-foreground'}`}>
              {truncAddr(bout.opponentPlayer)}
            </p>
            {opponentHeroes.length > 0
              ? <div className="flex justify-end"><HeroClassChips heroes={opponentHeroes} isWinner={!isHostWin && !!bout.winnerPlayer} /></div>
              : <p className="text-xs text-muted-foreground italic text-right">No data</p>
            }
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-7"
          data-testid={`btn-view-analysis-${bout.tournamentId}`}
          onClick={onClick}
        >
          View Analysis
        </Button>
      </CardContent>
    </Card>
  );
}

export default function TournamentSession({ sessionKey }: { sessionKey: string }) {
  const [, navigate] = useLocation();
  const decodedKey = decodeURIComponent(sessionKey);

  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/admin/tournament/sessions', decodedKey, 'bouts'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tournament/sessions/${encodeURIComponent(decodedKey)}/bouts`);
      if (!res.ok) throw new Error('Failed to load session');
      return res.json() as Promise<{ ok: boolean; bouts: Bout[] }>;
    }
  });

  const bouts = data?.bouts || [];
  const rounds = clusterIntoRounds(bouts);

  // Derive session metadata from bouts
  const firstBout = bouts[0];
  const lastBout = bouts[bouts.length - 1];
  const startTime = firstBout?.startTime || null;
  const endTime = lastBout?.startTime || null;

  if (isLoading) return (
    <div className="p-6 flex items-center gap-2 text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading session…
    </div>
  );

  if (error || !data?.ok) return (
    <div className="p-6">
      <p className="text-destructive mb-4">Failed to load tournament session.</p>
      <Button variant="outline" onClick={() => navigate('/admin/tournament')}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>
    </div>
  );

  const useBracket = bouts.length >= 5;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="page-tournament-session">
      {/* Header */}
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/tournament')} className="-ml-2">
          <ArrowLeft className="w-4 h-4 mr-1" /> All Tournaments
        </Button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Tournament Session</h1>
            <div className="flex items-center gap-2 flex-wrap">
              {firstBout?.format && <Badge variant="outline">{firstBout.format}</Badge>}
              {firstBout?.levelMin && (
                <Badge variant="outline">Lv {firstBout.levelMin}–{firstBout.levelMax ?? '∞'}</Badge>
              )}
              {firstBout?.rarityMin != null && firstBout.rarityMin > 0 && (
                <Badge variant="outline" className={RARITY_COLORS[firstBout.rarityMin]}>
                  {RARITY_LABELS[firstBout.rarityMin]}+
                </Badge>
              )}
              {firstBout?.gloryBout && (
                <Badge variant="outline" className="text-amber-500 border-amber-500/40">Glory</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {bouts.length} bouts
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDateRange(startTime, endTime)}
            </span>
          </div>
        </div>
      </div>

      {bouts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground text-sm">
            No bouts found in this session.
          </CardContent>
        </Card>
      ) : useBracket ? (
        // Columnar bracket view for 5+ bouts
        <div>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {rounds.map((round, ri) => (
              <div key={ri} className="flex-shrink-0 w-72 space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-semibold text-muted-foreground">Round {ri + 1}</span>
                  <Badge variant="outline" className="text-xs">{round.length} bout{round.length !== 1 ? 's' : ''}</Badge>
                </div>
                {round.map(bout => (
                  <MatchupCard
                    key={bout.tournamentId}
                    bout={bout}
                    onClick={() => navigate(`/admin/tournament/${bout.tournamentId}`)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Grid view for ≤4 bouts
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bouts.map(bout => (
            <MatchupCard
              key={bout.tournamentId}
              bout={bout}
              onClick={() => navigate(`/admin/tournament/${bout.tournamentId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
