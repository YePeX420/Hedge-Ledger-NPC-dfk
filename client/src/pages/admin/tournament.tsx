import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Medal, Play, RefreshCw, Loader2, Trophy, Swords, ChevronRight, Square, RotateCcw, Filter, Activity, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TournamentRow {
  id: number;
  tournamentId: number;
  realm: string;
  name: string | null;
  format: string;
  status: string;
  startTime: string | null;
  endTime: string | null;
  levelMin: number | null;
  levelMax: number | null;
  rarityMin: number | null;
  rarityMax: number | null;
  partySize: number;
  excludedClasses: number | null;
  allUniqueClasses: boolean | null;
  noTripleClasses: boolean | null;
  mustIncludeClass: boolean | null;
  gloryBout: boolean | null;
  minGlories: number | null;
  hostGlories: number | null;
  opponentGlories: number | null;
  sponsorCount: number | null;
  hostPlayer: string | null;
  opponentPlayer: string | null;
  winnerPlayer: string | null;
  totalEntrants: number | null;
  tournamentTypeSignature: string | null;
}

interface IndexerStatus {
  isRunning: boolean;
  startedAt: string | null;
  battlesProcessed: number;
  placementsIndexed: number;
  snapshotsIndexed: number;
  totalBattlesToProcess: number;
  throughputPerMinute: number;
  estimatedSecondsRemaining: number | null;
}

const RARITY_LABELS = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
const FORMAT_LABELS: Record<string, string> = { '1v1': '1v1', '3v3': '3v3', '6v6': '6v6' };
const REALM_LABELS: Record<string, string> = { cv: 'Crystalvale', sd: 'Sundered Isles', metis: 'Metis' };

function truncAddr(addr: string | null) {
  if (!addr) return '—';
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function formatDate(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function gloryTotal(t: TournamentRow) {
  return (t.hostGlories || 0) + (t.opponentGlories || 0);
}

export default function AdminTournament() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [filters, setFilters] = useState({
    format: 'all',
    realm: 'all',
    glory_bout: false,
    level_min: '',
    level_max: '',
    rarity_min: 'all',
  });
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const buildQuery = () => {
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (filters.format !== 'all') params.set('format', filters.format);
    if (filters.realm !== 'all') params.set('realm', filters.realm);
    if (filters.glory_bout) params.set('glory_bout', 'true');
    if (filters.level_min) params.set('level_min', filters.level_min);
    if (filters.level_max) params.set('level_max', filters.level_max);
    if (filters.rarity_min !== 'all') params.set('rarity_min', filters.rarity_min);
    return params.toString();
  };

  const { data: browseData, isLoading: browseLoading } = useQuery({
    queryKey: ['/api/admin/tournament/browse', filters, offset],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tournament/browse?${buildQuery()}`);
      if (!res.ok) throw new Error('Failed to load bouts');
      return res.json() as Promise<{ ok: boolean; data: TournamentRow[]; total: number }>;
    }
  });

  const { data: statusData } = useQuery({
    queryKey: ['/api/admin/tournament/status'],
    queryFn: async () => {
      const res = await fetch('/api/admin/tournament/status');
      if (!res.ok) throw new Error('Failed to load status');
      const json = await res.json();
      return json.liveState as IndexerStatus;
    },
    refetchInterval: 5000,
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/tournament/trigger', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to trigger indexer');
    },
    onSuccess: () => {
      toast({ title: 'Indexer started' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tournament/status'] });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' })
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/tournament/stop', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to stop indexer');
    },
    onSuccess: () => {
      toast({ title: 'Indexer stopped' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tournament/status'] });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' })
  });

  const resetFilters = () => {
    setFilters({ format: 'all', realm: 'all', glory_bout: false, level_min: '', level_max: '', rarity_min: 'all' });
    setOffset(0);
  };

  const bouts: TournamentRow[] = browseData?.data || [];
  const total = browseData?.total || 0;

  return (
    <div className="p-6 space-y-6" data-testid="page-tournament-list">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Medal className="w-8 h-8 text-primary" />
            DFK Tournaments
          </h1>
          <p className="text-muted-foreground mt-1">Browse real on-chain PvP bouts indexed from the DFK GraphQL API.</p>
        </div>
      </div>

      {/* Indexer Status Card */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Activity className={`w-4 h-4 ${statusData?.isRunning ? 'text-green-500 animate-pulse' : 'text-muted-foreground'}`} />
              <span className="text-sm font-medium">{statusData?.isRunning ? 'Indexer Running' : 'Indexer Idle'}</span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Database className="w-3 h-3" />{total.toLocaleString()} bouts indexed</span>
              {statusData?.isRunning && statusData.throughputPerMinute > 0 && (
                <span>{statusData.throughputPerMinute}/min</span>
              )}
              {statusData?.isRunning && statusData.estimatedSecondsRemaining && (
                <span>ETA: {Math.ceil(statusData.estimatedSecondsRemaining / 60)}m</span>
              )}
            </div>
            {statusData?.isRunning && (
              <div className="w-32">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${statusData.totalBattlesToProcess > 0 ? Math.min(100, (statusData.battlesProcessed / statusData.totalBattlesToProcess) * 100) : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {statusData?.isRunning ? (
              <Button variant="outline" size="sm" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending} data-testid="button-stop-indexer">
                <Square className="w-3 h-3 mr-1" /> Stop
              </Button>
            ) : (
              <Button size="sm" onClick={() => triggerMutation.mutate()} disabled={triggerMutation.isPending} data-testid="button-run-indexer">
                {triggerMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                Run Indexer
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-6">
        {/* Filter sidebar */}
        <div className="w-56 shrink-0 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-1"><Filter className="w-3 h-3" /> Filters</span>
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-6 px-2 text-xs">
              <RotateCcw className="w-3 h-3 mr-1" /> Reset
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Format</Label>
            <Select value={filters.format} onValueChange={v => { setFilters(p => ({ ...p, format: v })); setOffset(0); }}>
              <SelectTrigger className="h-8 text-sm" data-testid="select-filter-format"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Formats</SelectItem>
                <SelectItem value="1v1">1v1</SelectItem>
                <SelectItem value="3v3">3v3</SelectItem>
                <SelectItem value="6v6">6v6</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Realm</Label>
            <Select value={filters.realm} onValueChange={v => { setFilters(p => ({ ...p, realm: v })); setOffset(0); }}>
              <SelectTrigger className="h-8 text-sm" data-testid="select-filter-realm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Realms</SelectItem>
                <SelectItem value="cv">Crystalvale</SelectItem>
                <SelectItem value="sd">Sundered Isles</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Min Rarity</Label>
            <Select value={filters.rarity_min} onValueChange={v => { setFilters(p => ({ ...p, rarity_min: v })); setOffset(0); }}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Rarity</SelectItem>
                {RARITY_LABELS.map((r, i) => <SelectItem key={i} value={String(i)}>{r}+</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Min Lv</Label>
              <Input className="h-8 text-sm" type="number" value={filters.level_min} onChange={e => { setFilters(p => ({ ...p, level_min: e.target.value })); setOffset(0); }} placeholder="1" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Max Lv</Label>
              <Input className="h-8 text-sm" type="number" value={filters.level_max} onChange={e => { setFilters(p => ({ ...p, level_max: e.target.value })); setOffset(0); }} placeholder="100" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Glory Bouts Only</Label>
            <Switch checked={filters.glory_bout} onCheckedChange={v => { setFilters(p => ({ ...p, glory_bout: v })); setOffset(0); }} data-testid="switch-glory-bout" />
          </div>
        </div>

        {/* Main bout list */}
        <div className="flex-1 space-y-3">
          {browseLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Card key={i} className="animate-pulse"><CardContent className="p-4 h-20" /></Card>
              ))}
            </div>
          ) : bouts.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Swords className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="font-medium">No bouts indexed yet</p>
                <p className="text-sm text-muted-foreground mt-1">Run the indexer to pull DFK on-chain battle data.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{total.toLocaleString()} total bouts — showing {offset + 1}–{Math.min(offset + LIMIT, total)}</p>

              {bouts.map(t => {
                const isHostWin = t.winnerPlayer && t.hostPlayer &&
                  t.winnerPlayer.toLowerCase() === t.hostPlayer.toLowerCase();
                const glories = gloryTotal(t);

                return (
                  <Card key={t.id} className="hover-elevate cursor-pointer" data-testid={`card-bout-${t.tournamentId}`} onClick={() => navigate(`/admin/tournament/${t.tournamentId}`)}>
                    <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-muted-foreground">#{t.tournamentId}</span>
                          <Badge variant="outline" className="text-xs">{FORMAT_LABELS[t.format] || t.format}</Badge>
                          <Badge variant="outline" className="text-xs">{REALM_LABELS[t.realm] || t.realm}</Badge>
                          {t.gloryBout && <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/40">Glory</Badge>}
                          {t.levelMin && <Badge variant="outline" className="text-xs">Lv {t.levelMin}–{t.levelMax ?? '∞'}</Badge>}
                          {t.rarityMin != null && t.rarityMin > 0 && <Badge variant="outline" className="text-xs">{RARITY_LABELS[t.rarityMin]}+</Badge>}
                          {t.allUniqueClasses && <Badge variant="outline" className="text-xs">All Unique</Badge>}
                          {t.noTripleClasses && <Badge variant="outline" className="text-xs">No Triple</Badge>}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className={`font-medium truncate max-w-[140px] ${isHostWin ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                            {truncAddr(t.hostPlayer)}
                          </span>
                          <Swords className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className={`font-medium truncate max-w-[140px] ${!isHostWin && t.winnerPlayer ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                            {truncAddr(t.opponentPlayer)}
                          </span>
                          {t.winnerPlayer && (
                            <Badge variant="outline" className="text-xs text-green-600 border-green-500/40 shrink-0">
                              <Trophy className="w-2.5 h-2.5 mr-1" />
                              {isHostWin ? 'Host' : 'Opponent'} Win
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{formatDate(t.startTime)}</span>
                          {glories > 0 && <span>{glories.toLocaleString()} Glories</span>}
                          {t.sponsorCount != null && t.sponsorCount > 0 && <span>{t.sponsorCount} sponsors</span>}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                );
              })}

              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">Page {Math.floor(offset / LIMIT) + 1} of {Math.ceil(total / LIMIT)}</span>
                <Button variant="outline" size="sm" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>
                  Next
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
