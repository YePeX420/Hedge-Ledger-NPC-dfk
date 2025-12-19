import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ArrowDownRight, ArrowUpRight, RefreshCw, Search, TrendingDown, Users, Activity, AlertTriangle, Play, Loader2, Square, DollarSign, Database, Zap, PieChart, Wallet, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';

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
  lastBridgeAmountUsd: string | null;
  summonerName: string | null;
}

type TimeRange = '1w' | '1m' | '3m' | '1y' | '2y' | 'all';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
  { value: 'all', label: 'All' },
];

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

interface ValueBreakdown {
  timestamp: string;
  prices: {
    jewel: number;
    crystal: number;
    jewelSource?: 'defillama' | 'coingecko' | 'fallback';
    crystalSource?: 'defillama' | 'coingecko' | 'fallback';
  };
  categories: Array<{
    category: string;
    contracts: Array<{
      name: string;
      address: string;
      jewelBalance: number;
      crystalBalance: number;
      totalValueUSD: number;
    }>;
    totalJewel: number;
    totalCrystal: number;
    totalValueUSD: number;
  }>;
  summary: {
    totalJewelLocked: number;
    totalCrystalLocked: number;
    totalValueUSD: number;
    lpPoolsValue: number;
    stakingValue: number;
    bridgeValue: number;
    systemValue: number;
  };
}

interface TvlReconciliation {
  chains: Array<{
    chainId: number;
    chainName: string;
    tokenIn: number;
    tokenOut: number;
    netToken: number;
    heroIn: number;
    heroOut: number;
    netHeroes: number;
    equipmentIn: number;
    equipmentOut: number;
    netEquipment: number;
    currentTVL: number | null;
    jewelPrice: number | null;
    discrepancy: number | null;
    discrepancyReason: string;
  }>;
  pricingCoverage: Array<{
    token: string;
    totalEvents: number;
    pricedEvents: number;
    coverage: string;
    totalUsd: number;
  }>;
  summary: {
    overallCoverage: string;
    totalEvents: number;
    pricedEvents: number;
    note: string;
  };
}

interface DailyAverage {
  period: string;
  label: string;
  days: number;
  totalIn: number;
  totalOut: number;
  dailyAvgIn: number;
  dailyAvgOut: number;
  netDailyAvg: number;
}

interface DailyTimeSeriesPoint {
  date: string;
  in: number;
  out: number;
  net: number;
}

type ChartRange = '7d' | '30d' | '6m' | '1y';

const CHART_RANGE_OPTIONS: { value: ChartRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
];

export default function BridgeAnalytics() {
  const { toast } = useToast();
  const [walletSearch, setWalletSearch] = useState('');
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [chartRange, setChartRange] = useState<ChartRange>('30d');

  const { data: overview, isLoading: overviewLoading, isError: overviewError, refetch: refetchOverview } = useQuery<BridgeOverview>({
    queryKey: ['/api/admin/bridge/overview'],
  });

  const { data: extractors, isLoading: extractorsLoading, isError: extractorsError } = useQuery<Extractor[]>({
    queryKey: ['/api/admin/bridge/extractors', timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/admin/bridge/extractors?timeRange=${timeRange}&limit=1000`);
      if (!res.ok) throw new Error('Failed to fetch extractors');
      return res.json();
    },
  });
  
  const safeOverview = overview && !('error' in overview) ? overview : null;
  const safeExtractors = Array.isArray(extractors) ? extractors : [];

  const { data: valueBreakdown, isLoading: valueBreakdownLoading, isError: valueBreakdownError, refetch: refetchValueBreakdown } = useQuery<ValueBreakdown>({
    queryKey: ['/api/admin/bridge/value-breakdown'],
  });

  const { data: tvlReconciliation, isLoading: tvlLoading } = useQuery<TvlReconciliation>({
    queryKey: ['/api/admin/bridge/tvl-reconciliation'],
  });

  const { data: dailyAverages, isLoading: dailyAveragesLoading } = useQuery<DailyAverage[]>({
    queryKey: ['/api/admin/bridge/daily-averages'],
  });

  const { data: dailyTimeSeries, isLoading: timeSeriesLoading } = useQuery<DailyTimeSeriesPoint[]>({
    queryKey: ['/api/admin/bridge/daily-timeseries', chartRange],
    queryFn: async () => {
      const res = await fetch(`/api/admin/bridge/daily-timeseries?range=${chartRange}`);
      if (!res.ok) throw new Error('Failed to fetch time series');
      return res.json();
    },
  });

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

  const formatUsdCompact = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (num >= 1_000_000_000) {
      return `$${(num / 1_000_000_000).toFixed(2)}B`;
    }
    if (num >= 1_000_000) {
      return `$${(num / 1_000_000).toFixed(2)}M`;
    }
    if (num >= 1_000) {
      return `$${(num / 1_000).toFixed(2)}K`;
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  };

  const formatUsdAccounting = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    const absNum = Math.abs(num);
    let formatted: string;
    if (absNum >= 1_000_000_000) {
      formatted = `$${(absNum / 1_000_000_000).toFixed(2)}B`;
    } else if (absNum >= 1_000_000) {
      formatted = `$${(absNum / 1_000_000).toFixed(2)}M`;
    } else if (absNum >= 1_000) {
      formatted = `$${(absNum / 1_000).toFixed(2)}K`;
    } else {
      formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(absNum);
    }
    return num < 0 ? `(${formatted})` : formatted;
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

      {/* Daily Averages by Time Period */}
      <Card data-testid="card-daily-averages">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="h-5 w-5" />
              Bridge Flow Daily Averages
            </CardTitle>
            <CardDescription>
              Net daily average bridged in vs out by time period. Negative values (more out than in) shown in parentheses.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {dailyAveragesLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : dailyAverages && dailyAverages.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {dailyAverages.map((avg) => (
                <div key={avg.period} className="border rounded-lg p-4" data-testid={`daily-avg-${avg.period}`}>
                  <div className="text-sm font-medium text-muted-foreground mb-2">{avg.label}</div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">In/day:</span>
                      <span className="text-green-600 font-medium">{formatUsdCompact(avg.dailyAvgIn)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Out/day:</span>
                      <span className="text-red-600 font-medium">{formatUsdCompact(avg.dailyAvgOut)}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Net/day:</span>
                      <span className={`font-bold ${avg.netDailyAvg >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatUsdAccounting(avg.netDailyAvg)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No bridge data available</p>
          )}
        </CardContent>
      </Card>

      {/* Daily Bridge Flow Chart */}
      <Card data-testid="card-daily-chart">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Daily Bridge Flow
            </CardTitle>
            <CardDescription>
              Daily in/out/net bridged amounts over time
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {CHART_RANGE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={chartRange === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setChartRange(opt.value)}
                data-testid={`button-chart-range-${opt.value}`}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {timeSeriesLoading ? (
            <div className="flex items-center justify-center h-64" data-testid="loading-chart">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : dailyTimeSeries && dailyTimeSeries.length > 0 ? (
            <div className="h-[350px]" data-testid="chart-area-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyTimeSeries} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => {
                      const d = new Date(val);
                      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }}
                    className="text-xs fill-muted-foreground"
                  />
                  <YAxis 
                    tickFormatter={(val) => {
                      if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
                      if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
                      return `$${val}`;
                    }}
                    className="text-xs fill-muted-foreground"
                  />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length && label) {
                        const d = new Date(String(label));
                        return (
                          <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                            <p className="font-medium mb-2">
                              {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                            <div className="space-y-1">
                              <p className="text-green-600">In: {formatUsdCompact(payload[0]?.value as number || 0)}</p>
                              <p className="text-red-600">Out: {formatUsdCompact(payload[1]?.value as number || 0)}</p>
                              <p className={`font-medium ${(payload[2]?.value as number || 0) >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                                Net: {formatUsdAccounting(payload[2]?.value as number || 0)}
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Area 
                    type="monotone" 
                    dataKey="in" 
                    stroke="hsl(142, 76%, 36%)" 
                    fillOpacity={1}
                    fill="url(#colorIn)"
                    name="Bridged In"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="out" 
                    stroke="hsl(0, 84%, 60%)" 
                    fillOpacity={1}
                    fill="url(#colorOut)"
                    name="Bridged Out"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="net" 
                    stroke="hsl(217, 91%, 60%)" 
                    fill="none"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="Net Flow"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No bridge data available for chart</p>
          )}
          <div className="flex justify-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-muted-foreground">Bridged In</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-muted-foreground">Bridged Out</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-blue-500 border-dashed border-t-2 border-blue-500" />
              <span className="text-muted-foreground">Net Flow</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Value Distribution Pie Chart */}
      <Card data-testid="card-value-distribution">
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              DFK Chain Value Distribution
            </CardTitle>
            <CardDescription>
              Where bridged tokens are locked across LP pools, staking, and game contracts
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => refetchValueBreakdown()}
            disabled={valueBreakdownLoading}
            data-testid="button-refresh-breakdown"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${valueBreakdownLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {valueBreakdownLoading ? (
            <div className="flex items-center justify-center h-64" data-testid="loading-breakdown">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : valueBreakdownError ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4" data-testid="error-breakdown">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p>Failed to load value breakdown data</p>
              <Button variant="outline" size="sm" onClick={() => refetchValueBreakdown()} data-testid="button-retry-breakdown">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          ) : valueBreakdown?.summary ? (
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
              <div className="h-[280px] min-h-[250px]" data-testid="chart-pie-container">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={[
                        { name: 'LP Pools', value: valueBreakdown.summary.lpPoolsValue, fill: 'hsl(217, 91%, 60%)' },
                        { name: 'Staking', value: valueBreakdown.summary.stakingValue, fill: 'hsl(160, 84%, 39%)' },
                        { name: 'Bridges', value: valueBreakdown.summary.bridgeValue, fill: 'hsl(38, 92%, 50%)' },
                        { name: 'System', value: valueBreakdown.summary.systemValue, fill: 'hsl(263, 70%, 50%)' },
                      ].filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {[
                        { name: 'LP Pools', value: valueBreakdown.summary.lpPoolsValue, fill: 'hsl(217, 91%, 60%)' },
                        { name: 'Staking', value: valueBreakdown.summary.stakingValue, fill: 'hsl(160, 84%, 39%)' },
                        { name: 'Bridges', value: valueBreakdown.summary.bridgeValue, fill: 'hsl(38, 92%, 50%)' },
                        { name: 'System', value: valueBreakdown.summary.systemValue, fill: 'hsl(263, 70%, 50%)' },
                      ].filter(d => d.value > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-blue-500/10 dark:bg-blue-500/20 rounded-lg border border-blue-500/20" data-testid="stat-lp-pools">
                    <p className="text-sm text-muted-foreground">LP Pools</p>
                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400" data-testid="breakdown-lp">
                      {formatUsd(valueBreakdown.summary.lpPoolsValue)}
                    </p>
                  </div>
                  <div className="p-3 bg-green-500/10 dark:bg-green-500/20 rounded-lg border border-green-500/20" data-testid="stat-staking">
                    <p className="text-sm text-muted-foreground">Staking/Governance</p>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400" data-testid="breakdown-staking">
                      {formatUsd(valueBreakdown.summary.stakingValue)}
                    </p>
                  </div>
                  <div className="p-3 bg-amber-500/10 dark:bg-amber-500/20 rounded-lg border border-amber-500/20" data-testid="stat-bridges">
                    <p className="text-sm text-muted-foreground">Bridge Contracts</p>
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400" data-testid="breakdown-bridges">
                      {formatUsd(valueBreakdown.summary.bridgeValue)}
                    </p>
                  </div>
                  <div className="p-3 bg-violet-500/10 dark:bg-violet-500/20 rounded-lg border border-violet-500/20" data-testid="stat-system">
                    <p className="text-sm text-muted-foreground">System Contracts</p>
                    <p className="text-lg font-bold text-violet-600 dark:text-violet-400" data-testid="breakdown-system">
                      {formatUsd(valueBreakdown.summary.systemValue)}
                    </p>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div data-testid="stat-jewel-locked">
                    <p className="text-muted-foreground">Total JEWEL Locked</p>
                    <p className="font-semibold" data-testid="breakdown-jewel">
                      {valueBreakdown.summary.totalJewelLocked.toLocaleString()} JEWEL
                    </p>
                  </div>
                  <div data-testid="stat-crystal-locked">
                    <p className="text-muted-foreground">Total CRYSTAL Locked</p>
                    <p className="font-semibold" data-testid="breakdown-crystal">
                      {valueBreakdown.summary.totalCrystalLocked.toLocaleString()} CRYSTAL
                    </p>
                  </div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg" data-testid="stat-tvl-summary">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-sm text-muted-foreground">Total Value Locked (TVL)</span>
                    <span className="text-xl font-bold" data-testid="breakdown-tvl">
                      {formatUsd(valueBreakdown.summary.totalValueUSD)}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2 text-xs" data-testid="text-prices">
                      <span className="text-muted-foreground">
                        JEWEL: ${valueBreakdown.prices.jewel.toFixed(4)}
                      </span>
                      {valueBreakdown.prices.jewelSource && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          valueBreakdown.prices.jewelSource === 'defillama' 
                            ? 'bg-green-500/20 text-green-600 dark:text-green-400' 
                            : valueBreakdown.prices.jewelSource === 'coingecko'
                            ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                            : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                        }`} data-testid="badge-jewel-source">
                          {valueBreakdown.prices.jewelSource}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs" data-testid="text-crystal-price">
                      <span className="text-muted-foreground">
                        CRYSTAL: ${valueBreakdown.prices.crystal.toFixed(4)}
                      </span>
                      {valueBreakdown.prices.crystalSource && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          valueBreakdown.prices.crystalSource === 'defillama' 
                            ? 'bg-green-500/20 text-green-600 dark:text-green-400' 
                            : valueBreakdown.prices.crystalSource === 'coingecko'
                            ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                            : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                        }`} data-testid="badge-crystal-source">
                          {valueBreakdown.prices.crystalSource}
                        </span>
                      )}
                    </div>
                    {(valueBreakdown.prices.jewelSource === 'fallback' || valueBreakdown.prices.crystalSource === 'fallback') && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-amber-600 dark:text-amber-400" data-testid="warning-fallback-prices">
                        <AlertTriangle className="h-3 w-3" />
                        <span>Using fallback prices - live data unavailable</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2" data-testid="text-updated">
                    Updated: {new Date(valueBreakdown.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2" data-testid="empty-breakdown">
              <PieChart className="h-8 w-8 opacity-50" />
              <p>No value breakdown data available</p>
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* TVL Reconciliation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <PieChart className="h-5 w-5 text-blue-500" />
            TVL Reconciliation
          </CardTitle>
          <CardDescription>Net bridge flows vs current TVL with pricing coverage analysis</CardDescription>
        </CardHeader>
        <CardContent>
          {tvlLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : tvlReconciliation ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {tvlReconciliation.chains.map((chain) => (
                  <div key={chain.chainId} className="p-4 rounded-lg bg-muted/50" data-testid={`chain-flow-${chain.chainId}`}>
                    <h4 className="font-semibold mb-2">{chain.chainName}</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Token IN:</span>
                        <span className="text-green-600">${(chain.tokenIn / 1e6).toFixed(2)}M</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Token OUT:</span>
                        <span className="text-red-600">${(chain.tokenOut / 1e6).toFixed(2)}M</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-medium">
                        <span>Net Flow:</span>
                        <span className={chain.netToken >= 0 ? 'text-green-600' : 'text-red-600'}>
                          ${(chain.netToken / 1e6).toFixed(2)}M
                        </span>
                      </div>
                      {chain.currentTVL && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Current TVL:</span>
                            <span>${(chain.currentTVL / 1e6).toFixed(2)}M</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">JEWEL Price:</span>
                            <span>${chain.jewelPrice?.toFixed(3)}</span>
                          </div>
                        </>
                      )}
                      <Separator className="my-2" />
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Heroes:</span>
                        <span className={chain.netHeroes >= 0 ? 'text-green-600' : 'text-red-600'}>
                          +{chain.heroIn} / -{chain.heroOut} = {chain.netHeroes > 0 ? '+' : ''}{chain.netHeroes}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Equipment:</span>
                        <span className={chain.netEquipment >= 0 ? 'text-green-600' : 'text-red-600'}>
                          +{chain.equipmentIn} / -{chain.equipmentOut} = {chain.netEquipment > 0 ? '+' : ''}{chain.netEquipment}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Token Pricing Coverage
                  <Badge variant="outline">{tvlReconciliation.summary.overallCoverage}%</Badge>
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {tvlReconciliation.pricingCoverage.slice(0, 10).map((token) => (
                    <div key={token.token} className="p-2 rounded bg-muted/30 text-xs" data-testid={`token-coverage-${token.token}`}>
                      <div className="font-medium">{token.token}</div>
                      <div className="text-muted-foreground">{token.totalEvents.toLocaleString()} events</div>
                      <div className={parseFloat(token.coverage) >= 99 ? 'text-green-600' : parseFloat(token.coverage) >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                        {token.coverage}% priced
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                {tvlReconciliation.summary.note}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No reconciliation data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Extractors */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-orange-500" />
                Top Extractors
              </CardTitle>
              <CardDescription>Wallets with highest net value extracted from DFK Chain</CardDescription>
            </div>
            <div className="flex items-center gap-1 p-1 bg-muted rounded-lg" data-testid="time-range-filter">
              {TIME_RANGE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={timeRange === option.value ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTimeRange(option.value)}
                  className="h-7 px-3 text-xs font-medium"
                  data-testid={`button-time-${option.value}`}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {extractorsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : safeExtractors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No extractors identified yet</p>
              <p className="text-sm">Index some wallets to start tracking</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-1">
                {/* Header */}
                <div className="grid grid-cols-8 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50 rounded-md">
                  <div>Wallet</div>
                  <div>Summoner</div>
                  <div className="text-right">Bridged In</div>
                  <div className="text-right">Bridged Out</div>
                  <div className="text-right">Net Extracted</div>
                  <div className="text-right">Last Bridge Amt</div>
                  <div className="text-center">Flags</div>
                  <div className="text-right">Last Bridge</div>
                </div>
                <Separator />
                
                {safeExtractors.map((extractor) => {
                  const netExtracted = parseFloat(extractor.netExtractedUsd);
                  const isHeavy = extractor.extractorFlags?.includes('heavy_extractor');
                  const isNet = extractor.extractorFlags?.includes('net_extractor');
                  
                  return (
                    <div 
                      key={extractor.id}
                      className="grid grid-cols-8 gap-2 px-3 py-3 text-sm items-center hover-elevate rounded-md cursor-pointer"
                      onClick={() => setSelectedWallet(extractor.wallet)}
                      data-testid={`row-extractor-${extractor.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />
                        <a 
                          href={`https://subnets.avax.network/defi-kingdoms/address/${extractor.wallet}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs hover:underline flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`link-wallet-${extractor.id}`}
                        >
                          {shortenAddress(extractor.wallet)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <div className="text-xs text-primary font-medium truncate" data-testid={`text-summoner-${extractor.id}`}>
                        {extractor.summonerName || '*'}
                      </div>
                      <div className="text-right text-green-600 font-medium">
                        {formatUsdCompact(extractor.totalBridgedInUsd)}
                      </div>
                      <div className="text-right text-red-600 font-medium">
                        {formatUsdCompact(extractor.totalBridgedOutUsd)}
                      </div>
                      <div className={`text-right font-bold ${netExtracted > 0 ? 'text-amber-600' : 'text-foreground'}`}>
                        {formatUsdCompact(netExtracted)}
                      </div>
                      <div className="text-right text-muted-foreground">
                        {extractor.lastBridgeAmountUsd ? formatUsdCompact(extractor.lastBridgeAmountUsd) : '-'}
                      </div>
                      <div className="flex justify-center gap-1 flex-wrap">
                        {isHeavy && (
                          <Badge variant="destructive" className="text-xs">
                            Heavy
                          </Badge>
                        )}
                        {isNet && !isHeavy && (
                          <Badge variant="secondary" className="text-xs">
                            Net
                          </Badge>
                        )}
                        {!isHeavy && !isNet && (
                          <Badge variant="outline" className="text-xs">
                            -
                          </Badge>
                        )}
                      </div>
                      <div className="text-right text-muted-foreground text-xs">
                        {extractor.lastBridgeAt ? formatDate(extractor.lastBridgeAt) : '-'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
