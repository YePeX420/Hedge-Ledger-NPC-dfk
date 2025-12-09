import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ArrowDownRight, ArrowUpRight, RefreshCw, Search, TrendingDown, Users, Activity, AlertTriangle, Play, Loader2, Square, DollarSign, Database, Zap } from 'lucide-react';
import { useState } from 'react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

interface BridgeOverview {
  events: {
    total: number;
    in: number;
    out: number;
    heroes: number;
    items: number;
    totalUsdIn: number;
    totalUsdOut: number;
  };
  metrics: {
    trackedWallets: number;
    totalExtracted: number;
    extractorCount: number;
  };
  chain: {
    latestBlock: number;
  };
}

interface Extractor {
  id: number;
  wallet: string;
  playerId: number | null;
  totalBridgedInUsd: string;
  totalBridgedOutUsd: string;
  netExtractedUsd: string;
  heroesIn: number;
  heroesOut: number;
  extractorScore: string;
  extractorFlags: string[];
  totalTransactions: number;
  lastBridgeAt: string;
}

interface WalletDetails {
  summary: Extractor | null;
  events: Array<{
    id: number;
    bridgeType: string;
    direction: string;
    tokenSymbol: string;
    amount: string | null;
    usdValue: string | null;
    blockTimestamp: string;
    txHash: string;
  }>;
}

interface SyncProgress {
  progress: {
    status: string;
    lastIndexedBlock: number;
    genesisBlock: number;
    targetBlock: number | null;
    totalEventsIndexed: number;
    eventsNeedingPrices: number;
    lastError: string | null;
    startedAt: string | null;
    lastBatchRuntimeMs: number | null;
    totalBatchCount: number;
    totalBatchRuntimeMs: number;
  } | null;
  latestBlock: number;
  unpricedCount: number;
  historicalSyncRunning: boolean;
  enrichmentRunning: boolean;
}

interface IncrementalBatchResult {
  status: string;
  startBlock?: number;
  endBlock?: number;
  latestBlock?: number;
  blocksRemaining?: number;
  eventsFound?: number;
  eventsInserted?: number;
  runtimeMs?: number;
  avgRuntimeMs?: number;
  totalBatchCount?: number;
  error?: string;
  message?: string;
}

interface BatchProgress {
  running: boolean;
  startBlock?: number;
  endBlock?: number;
  currentBlock?: number;
  blocksProcessed?: number;
  blocksTotal?: number;
  percentComplete?: number;
  eventsFound?: number;
  eventsInserted?: number;
  elapsedMs?: number;
}

interface ParallelSyncStatus {
  running: boolean;
  workersTotal: number;
  startedAt: string | null;
  latestBlock: number;
  mainIndexer: {
    lastIndexedBlock: number;
    totalEventsIndexed: number;
    status: string;
  } | null;
  workers: Array<{
    workerId: number;
    lastIndexedBlock: number;
    rangeStart: number;
    rangeEnd: number;
    progress: number;
    totalEventsIndexed: number;
    status: string;
    totalBatchCount: number;
  }>;
  combinedProgress: number;
  allComplete: boolean;
}

export default function BridgeAnalytics() {
  const { toast } = useToast();
  const [walletSearch, setWalletSearch] = useState('');
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);

  const { data: overview, isLoading: overviewLoading, isError: overviewError, refetch: refetchOverview } = useQuery<BridgeOverview>({
    queryKey: ['/api/admin/bridge/overview'],
  });

  const { data: extractors, isLoading: extractorsLoading, isError: extractorsError } = useQuery<Extractor[]>({
    queryKey: ['/api/admin/bridge/extractors'],
  });
  
  const safeOverview = overview && !('error' in overview) ? overview : null;
  const safeExtractors = Array.isArray(extractors) ? extractors : [];

  const { data: walletDetails, isLoading: walletLoading } = useQuery<WalletDetails>({
    queryKey: ['/api/admin/bridge/wallet', selectedWallet],
    enabled: !!selectedWallet,
  });

  const indexWalletMutation = useMutation({
    mutationFn: async (wallet: string) => {
      return apiRequest('POST', '/api/admin/bridge/index-wallet', { wallet });
    },
    onSuccess: () => {
      toast({ title: 'Wallet indexed successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bridge'] });
    },
    onError: () => {
      toast({ title: 'Failed to index wallet', variant: 'destructive' });
    },
  });

  const refreshMetricsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/bridge/refresh-metrics');
    },
    onSuccess: () => {
      toast({ title: 'Metrics refreshed' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bridge'] });
    },
  });

  const { data: indexerStatus } = useQuery<{ running: boolean }>({
    queryKey: ['/api/admin/bridge/indexer-status'],
    refetchInterval: 5000,
  });

  const runIndexerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/bridge/run-indexer');
    },
    onSuccess: () => {
      toast({ title: 'Bridge indexer started', description: 'Scanning last 100k blocks (~2-3 days). This may take several minutes.' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bridge/indexer-status'] });
    },
    onError: (err: any) => {
      if (err?.message?.includes('409')) {
        toast({ title: 'Indexer already running', variant: 'destructive' });
      } else {
        toast({ title: 'Failed to start indexer', variant: 'destructive' });
      }
    },
  });

  const { data: syncProgress } = useQuery<SyncProgress>({
    queryKey: ['/api/admin/bridge/sync-progress'],
    refetchInterval: 5000,
  });

  const startHistoricalSyncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/bridge/start-historical-sync');
    },
    onSuccess: () => {
      toast({ title: 'Historical sync started', description: 'Indexing from genesis block. This may take hours.' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bridge/sync-progress'] });
    },
    onError: () => {
      toast({ title: 'Failed to start historical sync', variant: 'destructive' });
    },
  });

  const stopHistoricalSyncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/bridge/stop-historical-sync');
    },
    onSuccess: () => {
      toast({ title: 'Historical sync stopped' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bridge/sync-progress'] });
    },
  });

  // Poll for live batch progress while batch is running
  const { data: batchProgress, refetch: refetchBatchProgress } = useQuery<BatchProgress>({
    queryKey: ['/api/admin/bridge/batch-progress'],
    refetchInterval: 1000, // Always poll every second to catch batch start
  });
  
  const runIncrementalBatchMutation = useMutation<IncrementalBatchResult>({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/bridge/run-incremental-batch');
      return response.json();
    },
    onSuccess: (data) => {
      // Immediately refetch to pick up running state
      refetchBatchProgress();
      
      if (data.status === 'complete') {
        toast({ title: 'Already at latest block', description: data.message });
      } else if (data.status === 'success') {
        toast({ 
          title: `Indexed 10K blocks`, 
          description: `Blocks ${data.startBlock?.toLocaleString()}-${data.endBlock?.toLocaleString()}: ${data.eventsInserted} events in ${((data.runtimeMs || 0) / 1000).toFixed(1)}s` 
        });
      } else if (data.status === 'error') {
        toast({ title: 'Batch failed', description: data.error, variant: 'destructive' });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bridge/sync-progress'] });
    },
    onError: (err: any) => {
      if (err?.message?.includes('409')) {
        toast({ title: 'Batch already running', variant: 'destructive' });
      } else {
        toast({ title: 'Failed to run batch', variant: 'destructive' });
      }
    },
  });

  const runPriceEnrichmentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/bridge/run-price-enrichment');
    },
    onSuccess: () => {
      toast({ title: 'Price enrichment started', description: 'Adding USD values to events. This may take a while.' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bridge/sync-progress'] });
    },
    onError: () => {
      toast({ title: 'Failed to start price enrichment', variant: 'destructive' });
    },
  });

  // Parallel sync status and controls
  const { data: parallelSyncStatus, refetch: refetchParallelSync } = useQuery<ParallelSyncStatus>({
    queryKey: ['/api/admin/bridge/parallel-sync/status'],
    refetchInterval: 3000,
  });

  const [parallelWorkers, setParallelWorkers] = useState(4);

  const startParallelSyncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/bridge/parallel-sync/start', { 
        workers: parallelWorkers,
        batchSize: 10000,
        maxBatches: 100,
      });
    },
    onSuccess: () => {
      toast({ title: 'Parallel sync started', description: `${parallelWorkers} workers indexing in parallel` });
      refetchParallelSync();
    },
    onError: (err: any) => {
      if (err?.message?.includes('409')) {
        toast({ title: 'Parallel sync already running', variant: 'destructive' });
      } else {
        toast({ title: 'Failed to start parallel sync', variant: 'destructive' });
      }
    },
  });

  const stopParallelSyncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/bridge/parallel-sync/stop');
    },
    onSuccess: () => {
      toast({ title: 'Parallel sync stopping', description: 'Workers will complete current batches' });
      refetchParallelSync();
    },
    onError: () => {
      toast({ title: 'Failed to stop parallel sync', variant: 'destructive' });
    },
  });

  const handleSearch = async () => {
    if (walletSearch.trim()) {
      const wallet = walletSearch.trim().toLowerCase();
      try {
        await indexWalletMutation.mutateAsync(wallet);
        setSelectedWallet(wallet);
      } catch {
        // Error is handled by mutation's onError callback
      }
    }
  };

  const formatUsd = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const shortenAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="p-6 space-y-6" data-testid="bridge-analytics">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bridge Analytics</h1>
          <p className="text-muted-foreground">Track cross-chain bridge flows and identify extractors</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => runIndexerMutation.mutate()}
            disabled={runIndexerMutation.isPending || indexerStatus?.running}
            data-testid="button-run-indexer"
          >
            {indexerStatus?.running ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {indexerStatus?.running ? 'Indexer Running...' : 'Run Indexer'}
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => refreshMetricsMutation.mutate()}
            disabled={refreshMetricsMutation.isPending}
            data-testid="button-refresh-metrics"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshMetricsMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh Metrics
          </Button>
        </div>
      </div>

      {/* Sync Progress Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5" />
                Historical Sync Progress
              </CardTitle>
              <CardDescription>
                Index all bridge events from genesis for complete extraction analysis
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="default"
                size="sm"
                onClick={() => runIncrementalBatchMutation.mutate()}
                disabled={runIncrementalBatchMutation.isPending || batchProgress?.running || syncProgress?.historicalSyncRunning}
                data-testid="button-index-10k"
              >
                {(runIncrementalBatchMutation.isPending || batchProgress?.running) ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {batchProgress?.running 
                  ? `${batchProgress.percentComplete}% (${(batchProgress.blocksProcessed || 0).toLocaleString()}/${(batchProgress.blocksTotal || 10000).toLocaleString()})`
                  : 'Index 10K Blocks'
                }
              </Button>
              {syncProgress?.historicalSyncRunning ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => stopHistoricalSyncMutation.mutate()}
                  disabled={stopHistoricalSyncMutation.isPending}
                  data-testid="button-stop-sync"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Stop Sync
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startHistoricalSyncMutation.mutate()}
                  disabled={startHistoricalSyncMutation.isPending}
                  data-testid="button-start-historical-sync"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Full Sync
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => runPriceEnrichmentMutation.mutate()}
                disabled={runPriceEnrichmentMutation.isPending || syncProgress?.enrichmentRunning}
                data-testid="button-run-enrichment"
              >
                {syncProgress?.enrichmentRunning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <DollarSign className="h-4 w-4 mr-2" />
                )}
                {syncProgress?.enrichmentRunning ? 'Enriching...' : 'Add USD Prices'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <div className="flex items-center gap-2">
                <Badge variant={
                  syncProgress?.historicalSyncRunning ? 'default' :
                  syncProgress?.progress?.status === 'completed' ? 'outline' :
                  syncProgress?.progress?.status === 'error' ? 'destructive' : 'secondary'
                }>
                  {syncProgress?.historicalSyncRunning ? 'Running' : 
                   syncProgress?.progress?.status || 'Not Started'}
                </Badge>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Blocks Indexed</p>
              <p className="text-lg font-semibold">
                {(syncProgress?.progress?.lastIndexedBlock || 0).toLocaleString()} / {(syncProgress?.latestBlock || 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Events Indexed</p>
              <p className="text-lg font-semibold">
                {(syncProgress?.progress?.totalEventsIndexed || 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Needing USD Prices</p>
              <p className="text-lg font-semibold">
                {(syncProgress?.unpricedCount || 0).toLocaleString()}
              </p>
            </div>
          </div>
          {syncProgress?.latestBlock && syncProgress.latestBlock > 0 && (() => {
            const syncedBlock = syncProgress?.progress?.lastIndexedBlock || 0;
            const latestBlock = syncProgress.latestBlock;
            const progressPercent = Math.min(100, Math.max(0, (syncedBlock / latestBlock) * 100));
            const blocksRemaining = Math.max(0, latestBlock - syncedBlock);
            const isComplete = blocksRemaining === 0;
            
            return (
              <div className="mt-6 p-4 bg-muted/50 rounded-lg" data-testid="block-sync-tracker">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Block Sync Progress</span>
                  <span className="text-sm font-mono">
                    {progressPercent.toFixed(2)}%
                  </span>
                </div>
                <Progress 
                  value={progressPercent} 
                  className="h-3"
                />
                <div className="flex items-center justify-between mt-2 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Synced to block:</span>
                    <span className="font-mono font-semibold text-foreground" data-testid="text-synced-block">
                      {syncedBlock.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Latest block:</span>
                    <span className="font-mono font-semibold text-foreground" data-testid="text-latest-block">
                      {latestBlock.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="text-xs mt-1 text-center">
                  {isComplete ? (
                    <span className="text-green-600 font-medium">Up to date</span>
                  ) : (
                    <span className="text-muted-foreground">{blocksRemaining.toLocaleString()} blocks remaining</span>
                  )}
                </div>
                {(syncProgress?.progress?.totalBatchCount ?? 0) > 0 && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-muted text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Batches completed:</span>
                      <span className="font-mono font-semibold text-foreground" data-testid="text-batch-count">
                        {(syncProgress?.progress?.totalBatchCount || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Last batch:</span>
                      <span className="font-mono font-semibold text-foreground" data-testid="text-last-batch-time">
                        {((syncProgress?.progress?.lastBatchRuntimeMs || 0) / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Avg time/10K:</span>
                      <span className="font-mono font-semibold text-foreground" data-testid="text-avg-batch-time">
                        {(((syncProgress?.progress?.totalBatchRuntimeMs || 0) / (syncProgress?.progress?.totalBatchCount || 1)) / 1000).toFixed(1)}s
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {syncProgress?.progress?.lastError && (
            <div className="mt-3 p-2 bg-destructive/10 rounded text-sm text-destructive">
              Last error: {syncProgress.progress.lastError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Parallel Sync Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                Parallel Sync (Faster)
              </CardTitle>
              <CardDescription>
                Run multiple workers in parallel to speed up historical indexing by 3-4x
              </CardDescription>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Workers:</span>
                <select
                  value={parallelWorkers}
                  onChange={(e) => setParallelWorkers(parseInt(e.target.value))}
                  disabled={parallelSyncStatus?.running}
                  className="border rounded px-2 py-1 text-sm bg-background"
                  data-testid="select-parallel-workers"
                >
                  <option value="2">2</option>
                  <option value="4">4</option>
                  <option value="6">6</option>
                  <option value="8">8</option>
                </select>
              </div>
              {parallelSyncStatus?.running ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => stopParallelSyncMutation.mutate()}
                  disabled={stopParallelSyncMutation.isPending}
                  data-testid="button-stop-parallel-sync"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Stop Sync
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => startParallelSyncMutation.mutate()}
                  disabled={startParallelSyncMutation.isPending}
                  data-testid="button-start-parallel-sync"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Start Parallel Sync
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {parallelSyncStatus?.running && (
            <div className="mb-4 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
              <div className="flex items-center gap-2 text-yellow-600 mb-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="font-medium">Parallel sync running...</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {parallelSyncStatus.workersTotal} workers processing different block ranges simultaneously
              </p>
            </div>
          )}
          
          {parallelSyncStatus?.workers && parallelSyncStatus.workers.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Combined Progress</span>
                <span className="text-sm font-mono">{parallelSyncStatus.combinedProgress}%</span>
              </div>
              <Progress value={parallelSyncStatus.combinedProgress} className="h-2" />
              
              <div className="grid gap-3 mt-4">
                {parallelSyncStatus.workers.map((worker) => (
                  <div 
                    key={worker.workerId}
                    className="p-3 bg-muted/50 rounded"
                    data-testid={`worker-status-${worker.workerId}`}
                  >
                    <div className="flex items-center justify-between mb-2 text-sm">
                      <span className="font-medium">Worker {worker.workerId}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">
                          {worker.rangeStart.toLocaleString()} → {worker.rangeEnd.toLocaleString()}
                        </span>
                        <Badge 
                          variant={worker.status === 'complete' ? 'outline' : 'secondary'}
                          className="text-xs"
                        >
                          {worker.progress}%
                        </Badge>
                      </div>
                    </div>
                    <Progress value={worker.progress} className="h-1.5 mb-1" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Block {worker.lastIndexedBlock.toLocaleString()}</span>
                      <span>{worker.totalEventsIndexed.toLocaleString()} events</span>
                    </div>
                  </div>
                ))}
              </div>
              
              {parallelSyncStatus.allComplete && (
                <div className="text-center text-green-600 font-medium mt-2">
                  All workers completed
                </div>
              )}
            </div>
          )}
          
          {(!parallelSyncStatus?.workers || parallelSyncStatus.workers.length === 0) && !parallelSyncStatus?.running && (
            <div className="text-center text-muted-foreground py-4">
              <p>No parallel sync running. Click "Start Parallel Sync" to begin.</p>
              <p className="text-xs mt-1">This is faster than single-threaded indexing for catching up.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Bridge Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="stat-total-events">
                  {safeOverview?.events?.total ?? 0}
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ArrowDownRight className="h-3 w-3 text-green-500" /> 
                    {safeOverview?.events?.in ?? 0} in
                  </span>
                  <span className="flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3 text-red-500" /> 
                    {safeOverview?.events?.out ?? 0} out
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Bridged In</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-green-600" data-testid="stat-bridged-in">
                {formatUsd(safeOverview?.events?.totalUsdIn ?? 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Bridged Out</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-red-600" data-testid="stat-bridged-out">
                {formatUsd(safeOverview?.events?.totalUsdOut ?? 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Extractors Identified</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold text-orange-600" data-testid="stat-extractors">
                  {safeOverview?.metrics?.extractorCount ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatUsd(safeOverview?.metrics?.totalExtracted ?? 0)} extracted
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Wallet Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Analyze Wallet</CardTitle>
          <CardDescription>Enter a wallet address to index and analyze bridge activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="0x..."
              value={walletSearch}
              onChange={(e) => setWalletSearch(e.target.value)}
              className="font-mono"
              data-testid="input-wallet-search"
            />
            <Button 
              onClick={handleSearch}
              disabled={indexWalletMutation.isPending}
              data-testid="button-search-wallet"
            >
              <Search className="h-4 w-4 mr-2" />
              {indexWalletMutation.isPending ? 'Indexing...' : 'Analyze'}
            </Button>
          </div>

          {selectedWallet && walletDetails && (
            <div className="mt-4 space-y-4">
              <Separator />
              {walletDetails.summary ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Total In</p>
                    <p className="text-xl font-semibold text-green-600">
                      {formatUsd(walletDetails.summary.totalBridgedInUsd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Out</p>
                    <p className="text-xl font-semibold text-red-600">
                      {formatUsd(walletDetails.summary.totalBridgedOutUsd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Net Extracted</p>
                    <p className={`text-xl font-semibold ${parseFloat(walletDetails.summary.netExtractedUsd) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {formatUsd(walletDetails.summary.netExtractedUsd)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No bridge activity found for this wallet</p>
              )}

              {walletDetails.events.length > 0 && (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {walletDetails.events.map((event) => (
                      <div key={event.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-3">
                          {event.direction === 'in' ? (
                            <ArrowDownRight className="h-4 w-4 text-green-500" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 text-red-500" />
                          )}
                          <div>
                            <p className="text-sm font-medium">
                              {event.tokenSymbol} {event.bridgeType}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(event.blockTimestamp)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {event.usdValue && (
                            <p className={`text-sm font-medium ${event.direction === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                              {formatUsd(event.usdValue)}
                            </p>
                          )}
                          {event.amount && (
                            <p className="text-xs text-muted-foreground">
                              {parseFloat(event.amount).toFixed(2)} {event.tokenSymbol}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Extractors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-orange-500" />
            Top Extractors
          </CardTitle>
          <CardDescription>Wallets with highest net value extracted from DFK Chain</CardDescription>
        </CardHeader>
        <CardContent>
          {extractorsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : safeExtractors.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {safeExtractors.map((extractor, index) => (
                  <div 
                    key={extractor.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 cursor-pointer hover-elevate"
                    onClick={() => setSelectedWallet(extractor.wallet)}
                    data-testid={`extractor-row-${index}`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-bold text-muted-foreground w-8">
                        #{index + 1}
                      </span>
                      <div>
                        <p className="font-mono text-sm">{shortenAddress(extractor.wallet)}</p>
                        <div className="flex gap-2 mt-1">
                          {extractor.extractorFlags?.map((flag) => (
                            <Badge key={flag} variant="outline" className="text-xs">
                              {flag.replace(/_/g, ' ')}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-orange-600">
                        {formatUsd(extractor.netExtractedUsd)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Score: {extractor.extractorScore}/10
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No extractors identified yet</p>
              <p className="text-sm">Index some wallets to start tracking</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
