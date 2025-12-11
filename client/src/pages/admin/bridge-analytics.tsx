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

interface ParallelEnrichmentStatus {
  running: boolean;
  workersTotal: number;
  startedAt: string | null;
  unpricedCount: number;
  workers: Array<{
    workerId: number;
    running: boolean;
    groupsTotal: number;
    groupsProcessed: number;
    eventsUpdated: number;
    lastUpdate: string | null;
    complete: boolean;
  }>;
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

  // Parallel sync status and controls
  const { data: parallelSyncStatus, refetch: refetchParallelSync } = useQuery<ParallelSyncStatus>({
    queryKey: ['/api/admin/bridge/parallel-sync/status'],
    refetchInterval: 3000,
  });

  const [parallelWorkers, setParallelWorkers] = useState(8);

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

  // Parallel price enrichment status and controls
  const { data: parallelEnrichmentStatus, refetch: refetchEnrichment } = useQuery<ParallelEnrichmentStatus>({
    queryKey: ['/api/admin/bridge/price-enrichment/status'],
    refetchInterval: 3000,
  });

  const startParallelEnrichmentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/bridge/price-enrichment/start', { workers: 8 });
    },
    onSuccess: () => {
      toast({ title: 'Price enrichment started', description: '8 workers adding USD values in parallel' });
      refetchEnrichment();
    },
    onError: (err: any) => {
      if (err?.message?.includes('409')) {
        toast({ title: 'Enrichment already running', variant: 'destructive' });
      } else {
        toast({ title: 'Failed to start enrichment', variant: 'destructive' });
      }
    },
  });

  const stopParallelEnrichmentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/bridge/price-enrichment/stop');
    },
    onSuccess: () => {
      toast({ title: 'Enrichment stopping', description: 'Workers will complete current batches' });
      refetchEnrichment();
    },
    onError: () => {
      toast({ title: 'Failed to stop enrichment', variant: 'destructive' });
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
              {parallelSyncStatus?.running ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => stopParallelSyncMutation.mutate()}
                  disabled={stopParallelSyncMutation.isPending}
                  data-testid="button-stop-parallel-sync"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Stop Sync ({parallelSyncStatus.combinedProgress}%)
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => startParallelSyncMutation.mutate()}
                  disabled={startParallelSyncMutation.isPending || parallelSyncStatus?.allComplete}
                  data-testid="button-start-parallel-sync"
                >
                  {startParallelSyncMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  {parallelSyncStatus?.allComplete ? 'Sync Complete' : 'Start Block Sync'}
                </Button>
              )}
              {parallelEnrichmentStatus?.running ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => stopParallelEnrichmentMutation.mutate()}
                  disabled={stopParallelEnrichmentMutation.isPending}
                  data-testid="button-stop-enrichment"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Stop Prices ({parallelEnrichmentStatus.workers.filter(w => w.running).length} active)
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startParallelEnrichmentMutation.mutate()}
                  disabled={startParallelEnrichmentMutation.isPending || (parallelEnrichmentStatus?.unpricedCount === 0)}
                  data-testid="button-start-enrichment"
                >
                  {startParallelEnrichmentMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <DollarSign className="h-4 w-4 mr-2" />
                  )}
                  {parallelEnrichmentStatus?.unpricedCount === 0 ? 'All Priced' : 'Add USD Prices'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <div className="flex items-center gap-2">
                <Badge variant={
                  parallelSyncStatus?.running ? 'default' :
                  parallelSyncStatus?.allComplete ? 'outline' :
                  syncProgress?.progress?.status === 'error' ? 'destructive' : 'secondary'
                }>
                  {parallelSyncStatus?.running ? `Syncing (${parallelSyncStatus.combinedProgress}%)` : 
                   parallelSyncStatus?.allComplete ? 'Complete' :
                   `${(parallelSyncStatus?.combinedProgress || 0).toFixed(0)}% synced`}
                </Badge>
                {parallelEnrichmentStatus?.running && (
                  <Badge variant="default">
                    Pricing
                  </Badge>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Progress</p>
              <p className="text-lg font-semibold">
                {(parallelSyncStatus?.combinedProgress || 0).toFixed(0)}% / {(parallelSyncStatus?.latestBlock || 0).toLocaleString()} blocks
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Events Indexed</p>
              <p className="text-lg font-semibold">
                {(parallelSyncStatus?.workers?.reduce((sum, w) => sum + (w.totalEventsIndexed || 0), 0) || 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Needing USD Prices</p>
              <p className="text-lg font-semibold">
                {(parallelEnrichmentStatus?.unpricedCount || 0).toLocaleString()}
              </p>
            </div>
          </div>
          {parallelSyncStatus?.latestBlock && parallelSyncStatus.latestBlock > 0 && (() => {
            const progressPercent = parallelSyncStatus?.combinedProgress || 0;
            const latestBlock = parallelSyncStatus.latestBlock;
            const isComplete = parallelSyncStatus?.allComplete || false;
            const activeWorkers = parallelSyncStatus?.workers?.filter(w => w.status === 'running' || (w.progress < 100 && w.status !== 'complete')).length || 0;
            
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
                    <span className="text-muted-foreground">Workers:</span>
                    <span className="font-mono font-semibold text-foreground" data-testid="text-workers">
                      {activeWorkers} of {parallelSyncStatus?.workersTotal || 8} active
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
                    <span className="text-green-600 font-medium">Sync complete</span>
                  ) : parallelSyncStatus?.running ? (
                    <span className="text-primary font-medium">Syncing with {parallelSyncStatus.workersTotal} parallel workers</span>
                  ) : (
                    <span className="text-muted-foreground">{(100 - progressPercent).toFixed(0)}% remaining</span>
                  )}
                </div>
                {(parallelSyncStatus?.workers?.reduce((sum, w) => sum + (w.totalBatchCount || 0), 0) ?? 0) > 0 && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-muted text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Total batches:</span>
                      <span className="font-mono font-semibold text-foreground" data-testid="text-batch-count">
                        {(parallelSyncStatus?.workers?.reduce((sum, w) => sum + (w.totalBatchCount || 0), 0) || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Completed workers:</span>
                      <span className="font-mono font-semibold text-foreground" data-testid="text-completed-workers">
                        {parallelSyncStatus?.workers?.filter(w => w.status === 'complete').length || 0} / {parallelSyncStatus?.workersTotal || 8}
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

          {/* Block Sync Workers Grid */}
          {parallelSyncStatus?.running && parallelSyncStatus.workers && parallelSyncStatus.workers.length > 0 && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg" data-testid="parallel-sync-workers">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Block Sync Workers</span>
                <Badge variant="outline" className="ml-auto">
                  {parallelSyncStatus.workers.filter(w => w.status === 'running' || w.progress < 100).length} active
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {parallelSyncStatus.workers.map((w) => (
                  <div key={w.workerId} className="text-center">
                    <div className="text-xs text-muted-foreground">W{w.workerId}</div>
                    <Progress value={w.progress} className="h-1.5" />
                    <div className="text-xs font-mono">{w.progress.toFixed(0)}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pricing Sync Progress Section */}
          {(parallelEnrichmentStatus?.unpricedCount > 0 || parallelEnrichmentStatus?.running) && (() => {
            const totalUnpriced = parallelEnrichmentStatus?.unpricedCount || 0;
            const totalProcessed = parallelEnrichmentStatus?.workers?.reduce((sum, w) => sum + (w.eventsUpdated || 0), 0) || 0;
            const originalTotal = totalUnpriced + totalProcessed;
            const pricingProgress = originalTotal > 0 ? (totalProcessed / originalTotal) * 100 : 0;
            const activeWorkers = parallelEnrichmentStatus?.workers?.filter(w => w.running).length || 0;
            const isRunning = parallelEnrichmentStatus?.running;
            
            return (
              <div className="mt-4 p-4 bg-green-500/5 border border-green-500/20 rounded-lg" data-testid="pricing-sync-tracker">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Pricing Sync Progress</span>
                  </div>
                  <span className="text-sm font-mono">
                    {pricingProgress.toFixed(1)}%
                  </span>
                </div>
                <Progress 
                  value={pricingProgress} 
                  className="h-3"
                />
                <div className="flex items-center justify-between mt-2 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Events priced:</span>
                    <span className="font-mono font-semibold text-green-600" data-testid="text-events-priced">
                      {totalProcessed.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Remaining:</span>
                    <span className="font-mono font-semibold text-foreground" data-testid="text-events-remaining">
                      {totalUnpriced.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="text-xs mt-1 text-center">
                  {totalUnpriced === 0 ? (
                    <span className="text-green-600 font-medium">All events priced!</span>
                  ) : isRunning ? (
                    <span className="text-green-500 font-medium">Pricing with {activeWorkers} parallel workers</span>
                  ) : (
                    <span className="text-muted-foreground">{totalUnpriced.toLocaleString()} events need USD prices</span>
                  )}
                </div>
                
                {/* Enrichment Workers Grid */}
                {isRunning && parallelEnrichmentStatus.workers && parallelEnrichmentStatus.workers.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-green-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-muted-foreground">Price Enrichment Workers</span>
                      <Badge variant="outline" className="ml-auto text-xs">
                        {activeWorkers} active
                      </Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {parallelEnrichmentStatus.workers.map((w) => {
                        const pct = w.groupsTotal > 0 ? (w.groupsProcessed / w.groupsTotal) * 100 : 0;
                        return (
                          <div key={w.workerId} className="text-center">
                            <div className="text-xs text-muted-foreground">W{w.workerId}</div>
                            <Progress value={pct} className="h-1.5" />
                            <div className="text-xs font-mono text-green-600">{w.eventsUpdated}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>Groups: {parallelEnrichmentStatus.workers.reduce((sum, w) => sum + (w.groupsProcessed || 0), 0).toLocaleString()} / {parallelEnrichmentStatus.workers.reduce((sum, w) => sum + (w.groupsTotal || 0), 0).toLocaleString()}</span>
                      <span>Total updated: {totalProcessed.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
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
