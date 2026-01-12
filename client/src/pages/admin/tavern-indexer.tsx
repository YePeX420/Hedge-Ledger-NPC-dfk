import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Play, Square, RefreshCw, RotateCcw, Clock, Database, CheckCircle, AlertCircle, Timer, Dna } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface WorkerState {
  id: number;
  status: 'idle' | 'working' | 'done';
  heroesProcessed: number;
  realm: string | null;
}

interface RealmProgress {
  realm: string;
  heroes_indexed: number;
  status: string;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  updated_at: string;
}

interface RealmStats {
  realm: string;
  total_heroes: number;
  avg_tts: number;
  min_price: number;
  max_price: number;
  avg_price: number;
}

interface GeneStats {
  total: number;
  complete: number;
  incomplete: number;
  percentage: number;
}

interface IndexerStatus {
  isRunning: boolean;
  startedAt: string | null;
  batchId: string | null;
  totalHeroesIndexed: number;
  cvHeroesIndexed: number;
  sdHeroesIndexed: number;
  numWorkers: number;
  workers: WorkerState[];
  errors: string[];
  autoRunActive: boolean;
  autoRunIntervalMs: number | null;
  nextRunAt: string | null;
}

interface GeneBackfillStatus {
  isRunning: boolean;
  startedAt: string | null;
  processed: number;
  errors: number;
  lastError: string | null;
}

interface TavernIndexerData {
  ok: boolean;
  status: IndexerStatus;
  progress: RealmProgress[];
  stats: RealmStats[];
  geneStatus?: GeneBackfillStatus;
  geneStats?: GeneStats;
  nextRunAt?: string | null;
  autoRunIntervalMs?: number;
}

const REALM_NAMES: Record<string, string> = {
  cv: 'Crystalvale',
  sd: 'Sundered Isles'
};

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m ago`;
  return `${diffDays}d ${diffHours % 24}h ago`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatCountdown(targetDate: string | null): string {
  if (!targetDate) return '--';
  const target = new Date(targetDate);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  
  if (diffMs <= 0) return 'Soon';
  return formatDuration(diffMs);
}

export default function TavernIndexerAdmin() {
  const { toast } = useToast();
  const [countdown, setCountdown] = useState<string>('--');

  const { data, isLoading, refetch } = useQuery<TavernIndexerData>({
    queryKey: ['/api/admin/tavern-indexer/status'],
    refetchInterval: 3000, // Refresh every 3 seconds for live updates
  });

  const { data: geneData, refetch: refetchGenes } = useQuery<{ ok: boolean; status: GeneBackfillStatus; stats: GeneStats }>({
    queryKey: ['/api/admin/tavern-indexer/genes-status'],
    refetchInterval: 5000,
  });

  // Update countdown timer every second
  useEffect(() => {
    const interval = setInterval(() => {
      if (data?.status?.nextRunAt) {
        setCountdown(formatCountdown(data.status.nextRunAt));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [data?.status?.nextRunAt]);

  const triggerIndexMutation = useMutation({
    mutationFn: async () => apiRequest('POST', '/api/admin/tavern-indexer/trigger', {}),
    onSuccess: () => {
      toast({ title: "Indexing started", description: "Tavern indexer is now running" });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => apiRequest('POST', '/api/admin/tavern-indexer/reset', {}),
    onSuccess: () => {
      toast({ title: "Reset complete", description: "Tavern index has been cleared" });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const startAutoRunMutation = useMutation({
    mutationFn: async () => apiRequest('POST', '/api/admin/tavern-indexer/start', { intervalMs: 30 * 60 * 1000 }),
    onSuccess: () => {
      toast({ title: "Auto-run started", description: "Indexer will run every 30 minutes" });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const stopAutoRunMutation = useMutation({
    mutationFn: async () => apiRequest('POST', '/api/admin/tavern-indexer/stop', {}),
    onSuccess: () => {
      toast({ title: "Auto-run stopped", description: "Automatic indexing disabled" });
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const triggerGeneBackfillMutation = useMutation({
    mutationFn: async () => apiRequest('POST', '/api/admin/tavern-indexer/backfill-genes', { maxHeroes: 500 }),
    onSuccess: () => {
      toast({ title: "Gene backfill started", description: "Fetching gene data from GraphQL" });
      refetchGenes();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const status = data?.status;
  const progress = data?.progress || [];
  const stats = data?.stats || [];
  const geneStatus = geneData?.status;
  const geneStats = geneData?.stats;

  // Calculate totals
  const totalHeroes = stats.reduce((sum, s) => sum + Number(s.total_heroes || 0), 0);
  const completeGenes = geneStats?.complete || 0;
  const genePercentage = geneStats?.percentage || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" data-testid="tavern-indexer-admin">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Tavern Indexer</h1>
          <p className="text-muted-foreground">Monitor and control the marketplace hero indexer</p>
        </div>
        <Button 
          variant="outline" 
          size="icon"
          onClick={() => refetch()}
          data-testid="button-refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Worker Status Card */}
      <Card data-testid="card-worker-status">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {status?.isRunning ? (
                <Loader2 className="h-5 w-5 animate-spin text-yellow-500" />
              ) : status?.autoRunActive ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
              )}
              <CardTitle>Worker Status</CardTitle>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={status?.isRunning ? "default" : "secondary"} data-testid="badge-worker-status">
                {status?.isRunning ? 'Running' : 'Idle'}
              </Badge>
              <Badge variant={status?.autoRunActive ? "default" : "outline"} data-testid="badge-autorun-status">
                {status?.autoRunActive ? 'Auto-Run ON' : 'Auto-Run OFF'}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress bars when running */}
          {status?.isRunning && status.workers && status.workers.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{status.numWorkers || 10} workers processing heroes...</p>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-blue-500" data-testid="text-cv-progress">CV: {(status.cvHeroesIndexed || 0).toLocaleString()}</span>
                  <span className="text-purple-500" data-testid="text-sd-progress">SD: {(status.sdHeroesIndexed || 0).toLocaleString()}</span>
                  <span className="font-semibold" data-testid="text-total-progress">Total: {(status.totalHeroesIndexed || 0).toLocaleString()}</span>
                </div>
              </div>
              {status.workers.map((worker, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>Worker {worker.id + 1}</span>
                    <span className="text-muted-foreground">
                      {worker.heroesProcessed || 0} heroes • {worker.status}
                    </span>
                  </div>
                  <Progress 
                    value={worker.status === 'done' ? 100 : worker.status === 'working' ? 50 : 0} 
                    className="h-1.5" 
                  />
                </div>
              ))}
            </div>
          )}

          {/* Stats when idle */}
          {!status?.isRunning && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <Database className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <div className="text-lg font-semibold" data-testid="text-total-heroes">{totalHeroes.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Total Heroes</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <Dna className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <div className="text-lg font-semibold" data-testid="text-complete-genes">{completeGenes.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Complete Genes ({genePercentage.toFixed(0)}%)</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <Clock className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <div className="text-lg font-semibold" data-testid="text-last-run">
                  {progress.length > 0 
                    ? formatTimeAgo(progress.reduce((latest, p) => {
                        if (!p.last_success_at) return latest;
                        if (!latest) return p.last_success_at;
                        return new Date(p.last_success_at) > new Date(latest) ? p.last_success_at : latest;
                      }, null as string | null))
                    : 'Never'
                  }
                </div>
                <div className="text-xs text-muted-foreground">Last Indexed</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <Timer className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <div className="text-lg font-semibold" data-testid="text-next-run">
                  {status?.autoRunActive && status?.nextRunAt ? countdown : '--'}
                </div>
                <div className="text-xs text-muted-foreground">Next Run</div>
              </div>
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex items-center gap-2 flex-wrap pt-2">
            <Button
              onClick={() => triggerIndexMutation.mutate()}
              disabled={status?.isRunning || triggerIndexMutation.isPending}
              data-testid="button-trigger-index"
            >
              {triggerIndexMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run Now
            </Button>
            
            {status?.autoRunActive ? (
              <Button
                variant="outline"
                onClick={() => stopAutoRunMutation.mutate()}
                disabled={stopAutoRunMutation.isPending}
                data-testid="button-stop-autorun"
              >
                <Square className="h-4 w-4 mr-2" />
                Stop Auto-Run
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => startAutoRunMutation.mutate()}
                disabled={startAutoRunMutation.isPending}
                data-testid="button-start-autorun"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Start Auto-Run (30m)
              </Button>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  disabled={status?.isRunning}
                  data-testid="button-reset"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Tavern Index?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete all indexed heroes and reset progress. You will need to re-index all heroes.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => resetMutation.mutate()}>
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Per-Chain Status */}
      <Card data-testid="card-chain-status">
        <CardHeader>
          <CardTitle>Per-Chain Status</CardTitle>
          <CardDescription>Last indexed time and hero count for each marketplace</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Realm</TableHead>
                <TableHead>Heroes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Success</TableHead>
                <TableHead>Last Run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {progress.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No indexing data yet. Run the indexer to populate.
                  </TableCell>
                </TableRow>
              ) : (
                progress.map((p) => {
                  const realmStats = stats.find(s => s.realm === p.realm);
                  return (
                    <TableRow key={p.realm} data-testid={`row-chain-${p.realm}`}>
                      <TableCell className="font-medium">
                        {REALM_NAMES[p.realm] || p.realm}
                      </TableCell>
                      <TableCell>{realmStats?.total_heroes?.toLocaleString() || p.heroes_indexed || 0}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={p.status === 'complete' ? 'default' : p.status === 'running' ? 'secondary' : 'outline'}
                        >
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatTimeAgo(p.last_success_at)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatTimeAgo(p.last_run_at)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Gene Backfill Status */}
      <Card data-testid="card-gene-backfill">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Dna className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Gene Data Status</CardTitle>
            </div>
            <Badge variant={geneStatus?.isRunning ? "default" : "secondary"}>
              {geneStatus?.isRunning ? 'Backfilling...' : 'Idle'}
            </Badge>
          </div>
          <CardDescription>Recessive gene data fetched from GraphQL for breeding calculations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Gene progress */}
          {geneStats && geneStats.total !== undefined && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Complete gene data</span>
                <span className="text-muted-foreground">
                  {(geneStats.complete || 0).toLocaleString()} / {(geneStats.total || 0).toLocaleString()} ({(geneStats.percentage || 0).toFixed(1)}%)
                </span>
              </div>
              <Progress value={geneStats.percentage || 0} className="h-2" />
            </div>
          )}

          {/* Backfill status when running */}
          {geneStatus?.isRunning && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Processed {geneStatus.processed} heroes...</span>
              {geneStatus.errors > 0 && (
                <Badge variant="destructive" className="text-xs">{geneStatus.errors} errors</Badge>
              )}
            </div>
          )}

          {/* Gene backfill button */}
          <Button
            variant="outline"
            onClick={() => triggerGeneBackfillMutation.mutate()}
            disabled={geneStatus?.isRunning || triggerGeneBackfillMutation.isPending}
            data-testid="button-backfill-genes"
          >
            {triggerGeneBackfillMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Dna className="h-4 w-4 mr-2" />
            )}
            Backfill Missing Genes
          </Button>
        </CardContent>
      </Card>

      {/* Recent Errors */}
      {status?.errors && status.errors.length > 0 && (
        <Card data-testid="card-errors">
          <CardHeader>
            <CardTitle className="text-destructive">Recent Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {status.errors.map((err, idx) => (
                <li key={idx} className="p-2 bg-destructive/10 rounded text-destructive">
                  {err}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
