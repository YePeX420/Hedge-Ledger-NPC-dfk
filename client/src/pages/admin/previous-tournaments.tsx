import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, RefreshCw, Trophy, CheckCircle2 } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScheduledTournament {
  id: string;
  name: string;
  stateLabel: string;
  tournamentStartTime: number | null;
  completedAt?: number;
  format: string;
  realm: string;
  minLevel: number | null;
  maxLevel: number | null;
  minRarity: number | null;
  allUniqueClasses: boolean;
  noTripleClasses: boolean;
  gloryBout: boolean;
  hostedBy: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RARITY_LABELS = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];

const REALM_DISPLAY: Record<string, { label: string; color: string }> = {
  cv:    { label: 'Crystalvale', color: 'text-teal-400' },
  sd:    { label: 'Sundered',    color: 'text-amber-400' },
  metis: { label: 'Metis',       color: 'text-blue-400' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTournamentDateTime(unix: number | null): string {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function buildRestrictionLine(t: ScheduledTournament): string {
  const parts: string[] = [];
  if (t.minLevel != null) parts.push(`Lv ${t.minLevel}–${t.maxLevel ?? '∞'}`);
  if (t.minRarity != null && t.minRarity > 0) parts.push(`${RARITY_LABELS[t.minRarity]}+`);
  const realm = REALM_DISPLAY[t.realm]?.label ?? t.realm;
  if (realm) parts.push(realm);
  if (t.allUniqueClasses) parts.push('All Unique');
  if (t.noTripleClasses) parts.push('No Triple');
  if (t.gloryBout) parts.push('Glory');
  return parts.join(' · ');
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PreviousTournamentsPage() {
  const [location, navigate] = useLocation();
  const basePath = location.startsWith('/user/') ? '/user/dfk-tournament' : '/admin/tournament';

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['/api/admin/tournament/completed'],
    queryFn: async () => {
      const res = await fetch('/api/admin/tournament/completed?count=200');
      if (!res.ok) throw new Error('Failed to load completed tournaments');
      return res.json() as Promise<{
        ok: boolean;
        tournaments: ScheduledTournament[];
        count: number;
        total: number;
        tracking: boolean;
      }>;
    },
    refetchInterval: 120_000,
  });

  const tournaments = data?.tournaments ?? [];

  const renderCard = (t: ScheduledTournament) => {
    const restrictionLine = buildRestrictionLine(t);
    const realmInfo = REALM_DISPLAY[t.realm];

    return (
      <Card
        key={t.id}
        className="hover-elevate cursor-pointer"
        data-testid={`card-prev-tournament-${t.id}`}
        onClick={() => navigate(`${basePath}/bracket/${t.id}`)}
      >
        <CardContent className="p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <p className="font-bold text-sm leading-snug">{t.name}</p>
            <span className="text-sm text-muted-foreground font-medium shrink-0">{t.format}</span>
          </div>

          {t.hostedBy && (
            <p className="text-xs text-muted-foreground -mt-1">
              Hosted By: {t.hostedBy}
            </p>
          )}

          {t.tournamentStartTime && (
            <p className="text-xs text-muted-foreground">
              Started: {formatTournamentDateTime(t.tournamentStartTime)}
            </p>
          )}

          {t.completedAt && t.completedAt > ((t.tournamentStartTime ?? 0) * 1000) && (
            <p className="text-xs text-muted-foreground">
              Completed: {formatTournamentDateTime(Math.round(t.completedAt / 1000))}
            </p>
          )}

          <div>
            <span className="inline-block text-xs font-semibold px-3 py-1 rounded-md bg-muted text-muted-foreground">
              Completed
            </span>
          </div>

          {restrictionLine && (
            <p className={`text-xs leading-tight ${realmInfo ? realmInfo.color : 'text-muted-foreground'}`}>
              {restrictionLine}
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-previous-tournaments">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <History className="w-8 h-8 text-primary" />
          Previous Tournaments
        </h1>
        <p className="text-muted-foreground mt-1">
          Completed DFK bracket tournaments. Click any card to view the full bracket and fight details.
        </p>
      </div>

      <div className="flex items-center justify-between">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {tournaments.length} completed tournament{tournaments.length !== 1 ? 's' : ''}
          </p>
        )}
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-previous">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <Card key={i} className="animate-pulse"><CardContent className="h-40 p-4" /></Card>
          ))}
        </div>
      ) : tournaments.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Trophy className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-medium">No completed tournaments yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
              Tournaments will appear here automatically once they finish.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-muted-foreground/60" />
            <span className="text-sm font-medium">Completed</span>
            <span className="text-xs text-muted-foreground">({tournaments.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tournaments.map(t => renderCard(t))}
          </div>
        </>
      )}
    </div>
  );
}
