import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeftRight,
  Coins,
  Calculator,
  Play,
  Square,
  RefreshCw,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface IndexerProgress {
  id: number;
  indexerName: string;
  indexerType: string;
  pid: number;
  lpToken: string;
  lastIndexedBlock: number;
  genesisBlock: number;
  status: string;
  totalEventsIndexed: number;
  lastError: string | null;
  updatedAt: string;
  live?: {
    isRunning: boolean;
    currentBlock: number;
    targetBlock: number;
    percentComplete: number;
    totalEventsFound: number;
    batchesCompleted: number;
    lastBatchAt: string | null;
  } | null;
  autoRun?: {
    pid: number;
    intervalMs: number;
    startedAt: string;
    lastRunAt: string | null;
    runsCompleted: number;
  } | null;
}

interface DailyAggregate {
  id: number;
  pid: number;
  date: string;
  volume24h: string;
  fees24h: string;
  rewards24h: string;
  rewardsUsd24h: string;
  tvl: string;
  stakedLp: string;
  feeApr: string;
  harvestApr: string;
  totalApr: string;
  swapCount24h: number;
  rewardEventCount24h: number;
}

interface UnifiedIndexerProgress {
  id: number;
  indexerName: string;
  indexerType: string;
  pid: number;
  lpToken: string;
  lastIndexedBlock: number;
  genesisBlock: number;
  status: string;
  totalEventsIndexed: number;
  lastError: string | null;
  updatedAt: string;
  live?: {
    isRunning: boolean;
    currentBlock: number;
    targetBlock: number;
    percentComplete: number;
    stakersFound: number;
    swapsFound: number;
    rewardsFound: number;
    batchesCompleted: number;
    lastBatchAt: string | null;
  } | null;
  autoRun?: {
    pid: number;
    intervalMs: number;
    startedAt: string;
    lastRunAt: string | null;
    runsCompleted: number;
  } | null;
}

interface IndexerStatus {
  swapIndexers: IndexerProgress[];
  rewardIndexers: IndexerProgress[];
  unifiedIndexers: UnifiedIndexerProgress[];
  aggregates: DailyAggregate[];
}

interface UnifiedWorkerStatus {
  activeWorkers: number;
  pools: Array<{
    pid: number;
    intervalMs: number;
    startedAt: string;
    lastRunAt: string | null;
    runsCompleted: number;
  }>;
}

function StatusBadge({ status, isRunning }: { status: string; isRunning?: boolean }) {
  if (isRunning) {
    return (
      <Badge variant="outline" className="bg-blue-500/20 text-blue-500 border-blue-500/30 gap-1" data-testid="badge-status-running">
        <Loader2 className="w-3 h-3 animate-spin" />
        Running
      </Badge>
    );
  }
  
  if (status === 'complete') {
    return (
      <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/30 gap-1" data-testid="badge-status-complete">
        <CheckCircle className="w-3 h-3" />
        Complete
      </Badge>
    );
  }
  
  if (status === 'error') {
    return (
      <Badge variant="outline" className="bg-red-500/20 text-red-500 border-red-500/30 gap-1" data-testid="badge-status-error">
        <AlertCircle className="w-3 h-3" />
        Error
      </Badge>
    );
  }
  
  return (
    <Badge variant="outline" className="bg-muted text-muted-foreground gap-1" data-testid="badge-status-idle">
      <Clock className="w-3 h-3" />
      Idle
    </Badge>
  );
}

function formatNumber(num: number | string | null | undefined): string {
  if (num === null || num === undefined) return '0';
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
  return n.toLocaleString();
}

function safeParseFloat(val: string | null | undefined): number {
  if (!val) return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function formatBlock(block: number): string {
  return block.toLocaleString();
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function IndexerTable({ 
  indexers, 
  type,
  onTrigger,
  onAutoRun,
  isTriggering,
}: { 
  indexers: IndexerProgress[];
  type: 'swap' | 'reward';
  onTrigger: (pid: number) => void;
  onAutoRun: (pid: number, action: 'start' | 'stop') => void;
  isTriggering: boolean;
}) {
  if (!indexers || indexers.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No {type} indexers found. Trigger a batch to initialize.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Pool</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead className="text-right">Events</TableHead>
              <TableHead className="text-right">Last Block</TableHead>
              <TableHead className="text-right">Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {indexers.map((indexer) => {
              const isRunning = indexer.live?.isRunning || false;
              const percentComplete = indexer.live?.percentComplete || 0;
              const hasAutoRun = !!indexer.autoRun;
              
              return (
                <TableRow key={indexer.indexerName} data-testid={`row-indexer-${type}-${indexer.pid}`}>
                  <TableCell className="font-mono font-medium">
                    #{indexer.pid}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={indexer.status} isRunning={isRunning} />
                      {hasAutoRun && (
                        <Badge variant="outline" className="bg-purple-500/20 text-purple-500 border-purple-500/30 gap-1 text-xs">
                          <Zap className="w-3 h-3" />
                          Auto ({indexer.autoRun!.runsCompleted} runs)
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isRunning && (
                      <div className="space-y-1">
                        <Progress value={percentComplete} className="h-2 w-24" />
                        <span className="text-xs text-muted-foreground">
                          {percentComplete.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {!isRunning && indexer.status === 'complete' && (
                      <span className="text-xs text-green-500">Synced</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(indexer.live?.totalEventsFound || indexer.totalEventsIndexed)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatBlock(indexer.live?.currentBlock || indexer.lastIndexedBlock)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {indexer.updatedAt ? new Date(indexer.updatedAt).toLocaleTimeString() : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onTrigger(indexer.pid)}
                        disabled={isRunning || isTriggering}
                        data-testid={`button-trigger-${type}-${indexer.pid}`}
                      >
                        {isTriggering ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant={hasAutoRun ? "destructive" : "outline"}
                        onClick={() => onAutoRun(indexer.pid, hasAutoRun ? 'stop' : 'start')}
                        data-testid={`button-auto-${type}-${indexer.pid}`}
                      >
                        {hasAutoRun ? <Square className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AggregatesTable({ aggregates }: { aggregates: DailyAggregate[] }) {
  const validAggregates = (aggregates || []).filter(agg => agg != null && agg.pid !== undefined);
  
  if (validAggregates.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No aggregates computed yet. Trigger aggregation to compute.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Pool</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">TVL</TableHead>
              <TableHead className="text-right">Volume 24h</TableHead>
              <TableHead className="text-right">Fees 24h</TableHead>
              <TableHead className="text-right">Rewards 24h</TableHead>
              <TableHead className="text-right">Fee APR</TableHead>
              <TableHead className="text-right">Reward APR</TableHead>
              <TableHead className="text-right">Total APR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {validAggregates.map((agg) => (
              <TableRow key={`${agg.pid}-${agg.date}`} data-testid={`row-aggregate-${agg.pid}`}>
                <TableCell className="font-mono font-medium">#{agg.pid}</TableCell>
                <TableCell>{agg.date}</TableCell>
                <TableCell className="text-right font-mono">${formatNumber(agg.tvl)}</TableCell>
                <TableCell className="text-right font-mono">${formatNumber(agg.volume24h)}</TableCell>
                <TableCell className="text-right font-mono">${formatNumber(agg.fees24h)}</TableCell>
                <TableCell className="text-right font-mono">
                  {formatNumber(agg.rewards24h)} CRYSTAL
                </TableCell>
                <TableCell className="text-right font-mono text-blue-500">
                  {safeParseFloat(agg.feeApr).toFixed(2)}%
                </TableCell>
                <TableCell className="text-right font-mono text-purple-500">
                  {safeParseFloat(agg.harvestApr).toFixed(2)}%
                </TableCell>
                <TableCell className="text-right font-mono text-green-500 font-bold">
                  {safeParseFloat(agg.totalApr).toFixed(2)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function UnifiedIndexerTable({ 
  indexers, 
  onTrigger,
  onAutoRun,
  isTriggering,
}: { 
  indexers: UnifiedIndexerProgress[];
  onTrigger: (pid: number) => void;
  onAutoRun: (pid: number, action: 'start' | 'stop') => void;
  isTriggering: boolean;
}) {
  if (!indexers || indexers.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No unified indexers found. Trigger a batch to initialize a pool.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Pool</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead className="text-right">Stakers</TableHead>
              <TableHead className="text-right">Swaps</TableHead>
              <TableHead className="text-right">Rewards</TableHead>
              <TableHead className="text-right">Last Block</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {indexers.map((indexer) => {
              const isRunning = indexer.live?.isRunning || false;
              const percentComplete = indexer.live?.percentComplete || 0;
              const hasAutoRun = !!indexer.autoRun;
              
              return (
                <TableRow key={indexer.indexerName} data-testid={`row-indexer-unified-${indexer.pid}`}>
                  <TableCell className="font-mono font-medium">
                    #{indexer.pid}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={indexer.status} isRunning={isRunning} />
                      {hasAutoRun && (
                        <Badge variant="outline" className="bg-purple-500/20 text-purple-500 border-purple-500/30 gap-1 text-xs">
                          <Zap className="w-3 h-3" />
                          Auto ({indexer.autoRun!.runsCompleted} runs)
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isRunning && (
                      <div className="space-y-1">
                        <Progress value={percentComplete} className="h-2 w-24" />
                        <span className="text-xs text-muted-foreground">
                          {percentComplete.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {!isRunning && indexer.status === 'complete' && (
                      <span className="text-xs text-green-500">Synced</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(indexer.live?.stakersFound || 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(indexer.live?.swapsFound || 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(indexer.live?.rewardsFound || 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatBlock(indexer.live?.currentBlock || indexer.lastIndexedBlock)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onTrigger(indexer.pid)}
                        disabled={isRunning || isTriggering}
                        data-testid={`button-trigger-unified-${indexer.pid}`}
                      >
                        {isTriggering ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant={hasAutoRun ? "destructive" : "outline"}
                        onClick={() => onAutoRun(indexer.pid, hasAutoRun ? 'stop' : 'start')}
                        data-testid={`button-auto-unified-${indexer.pid}`}
                      >
                        {hasAutoRun ? <Square className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function AdminPoolIndexer() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("unified");
  
  const { data: status, isLoading, error, refetch } = useQuery<IndexerStatus>({
    queryKey: ["/api/admin/pool-indexer/status"],
    refetchInterval: 5000,
  });
  
  const { data: workerStatus } = useQuery<UnifiedWorkerStatus>({
    queryKey: ["/api/admin/pool-indexer/unified/status"],
    refetchInterval: 5000,
  });
  
  const triggerSwapMutation = useMutation({
    mutationFn: async (pid: number) => {
      return apiRequest("POST", "/api/admin/pool-indexer/swap/trigger", { pid });
    },
    onSuccess: () => {
      toast({ title: "Swap indexer triggered", description: "Batch started" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pool-indexer/status"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
  
  const triggerRewardMutation = useMutation({
    mutationFn: async (pid: number) => {
      return apiRequest("POST", "/api/admin/pool-indexer/reward/trigger", { pid });
    },
    onSuccess: () => {
      toast({ title: "Reward indexer triggered", description: "Batch started" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pool-indexer/status"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
  
  const swapAutoRunMutation = useMutation({
    mutationFn: async ({ pid, action }: { pid: number; action: 'start' | 'stop' }) => {
      return apiRequest("POST", "/api/admin/pool-indexer/swap/auto-run", { pid, action });
    },
    onSuccess: (_, vars) => {
      toast({ 
        title: `Swap auto-run ${vars.action === 'start' ? 'started' : 'stopped'}`,
        description: `Pool #${vars.pid}` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pool-indexer/status"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
  
  const rewardAutoRunMutation = useMutation({
    mutationFn: async ({ pid, action }: { pid: number; action: 'start' | 'stop' }) => {
      return apiRequest("POST", "/api/admin/pool-indexer/reward/auto-run", { pid, action });
    },
    onSuccess: (_, vars) => {
      toast({ 
        title: `Reward auto-run ${vars.action === 'start' ? 'started' : 'stopped'}`,
        description: `Pool #${vars.pid}` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pool-indexer/status"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
  
  const triggerAggregateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/pool-indexer/aggregate/trigger", {});
    },
    onSuccess: () => {
      toast({ title: "Aggregation triggered", description: "Computing daily aggregates for all pools" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pool-indexer/status"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
  
  const triggerUnifiedMutation = useMutation({
    mutationFn: async (pid: number) => {
      return apiRequest("POST", "/api/admin/pool-indexer/unified/trigger", { pid });
    },
    onSuccess: () => {
      toast({ title: "Unified indexer triggered", description: "Scanning all event types" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pool-indexer/status"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
  
  const unifiedAutoRunMutation = useMutation({
    mutationFn: async ({ pid, action }: { pid: number; action: 'start' | 'stop' }) => {
      return apiRequest("POST", "/api/admin/pool-indexer/unified/auto-run", { pid, action });
    },
    onSuccess: (_, vars) => {
      toast({ 
        title: `Unified auto-run ${vars.action === 'start' ? 'started' : 'stopped'}`,
        description: `Pool #${vars.pid}` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pool-indexer/status"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Pool Indexer Status</h1>
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
            <h2 className="text-lg font-semibold mb-2">Error loading status</h2>
            <p className="text-muted-foreground">{(error as any).message}</p>
            <Button onClick={() => refetch()} className="mt-4" data-testid="button-retry">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const swapIndexers = status?.swapIndexers || [];
  const rewardIndexers = status?.rewardIndexers || [];
  const unifiedIndexers = status?.unifiedIndexers || [];
  const aggregates = status?.aggregates || [];
  
  const totalSwapEvents = swapIndexers.reduce((sum, i) => sum + (i.totalEventsIndexed || 0), 0);
  const totalRewardEvents = rewardIndexers.reduce((sum, i) => sum + (i.totalEventsIndexed || 0), 0);
  const runningSwaps = swapIndexers.filter(i => i.live?.isRunning).length;
  const runningRewards = rewardIndexers.filter(i => i.live?.isRunning).length;
  const runningUnified = unifiedIndexers.filter(i => i.live?.isRunning).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Pool Indexer Status</h1>
          <p className="text-muted-foreground">Monitor and manage swap/reward event indexing</p>
        </div>
        <Button 
          onClick={() => refetch()} 
          variant="outline"
          disabled={isLoading}
          data-testid="button-refresh"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Active Workers</CardTitle>
            <Zap className={`h-4 w-4 ${workerStatus?.activeWorkers ? 'text-green-500' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-workers">
              {workerStatus?.activeWorkers ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {workerStatus?.activeWorkers ? (
                <>unified auto-run{workerStatus.activeWorkers > 1 ? 's' : ''}</>
              ) : (
                'no workers running'
              )}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Swap Events</CardTitle>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-swaps">{formatNumber(totalSwapEvents)}</div>
            <p className="text-xs text-muted-foreground">
              {runningSwaps > 0 ? `${runningSwaps} indexer(s) running` : `${swapIndexers.length} indexers`}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Reward Events</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-rewards">{formatNumber(totalRewardEvents)}</div>
            <p className="text-xs text-muted-foreground">
              {runningRewards > 0 ? `${runningRewards} indexer(s) running` : `${rewardIndexers.length} indexers`}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Daily Aggregates</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-aggregates">{aggregates.length}</div>
            <p className="text-xs text-muted-foreground">pools with data</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Compute All</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => triggerAggregateMutation.mutate()}
              disabled={triggerAggregateMutation.isPending}
              className="w-full"
              data-testid="button-compute-all"
            >
              {triggerAggregateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Calculator className="w-4 h-4 mr-2" />
              )}
              Run Aggregation
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap gap-1">
          <TabsTrigger value="unified" data-testid="tab-unified">
            <Zap className="w-4 h-4 mr-2" />
            Unified ({unifiedIndexers.length})
          </TabsTrigger>
          <TabsTrigger value="swaps" data-testid="tab-swaps">
            <ArrowLeftRight className="w-4 h-4 mr-2" />
            Swaps ({swapIndexers.length})
          </TabsTrigger>
          <TabsTrigger value="rewards" data-testid="tab-rewards">
            <Coins className="w-4 h-4 mr-2" />
            Rewards ({rewardIndexers.length})
          </TabsTrigger>
          <TabsTrigger value="aggregates" data-testid="tab-aggregates">
            <Calculator className="w-4 h-4 mr-2" />
            Aggregates ({aggregates.length})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="unified" className="mt-4">
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Unified Indexer</CardTitle>
              <CardDescription>
                Scans all event types (Deposit, Withdraw, Swap, Harvest) in a single blockchain pass per pool.
                This consolidates staker tracking, swap volume analytics, and reward distribution into one efficient indexer.
              </CardDescription>
            </CardHeader>
          </Card>
          <UnifiedIndexerTable
            indexers={unifiedIndexers}
            onTrigger={(pid) => triggerUnifiedMutation.mutate(pid)}
            onAutoRun={(pid, action) => unifiedAutoRunMutation.mutate({ pid, action })}
            isTriggering={triggerUnifiedMutation.isPending}
          />
        </TabsContent>
        
        <TabsContent value="swaps" className="mt-4">
          <IndexerTable
            indexers={swapIndexers}
            type="swap"
            onTrigger={(pid) => triggerSwapMutation.mutate(pid)}
            onAutoRun={(pid, action) => swapAutoRunMutation.mutate({ pid, action })}
            isTriggering={triggerSwapMutation.isPending}
          />
        </TabsContent>
        
        <TabsContent value="rewards" className="mt-4">
          <IndexerTable
            indexers={rewardIndexers}
            type="reward"
            onTrigger={(pid) => triggerRewardMutation.mutate(pid)}
            onAutoRun={(pid, action) => rewardAutoRunMutation.mutate({ pid, action })}
            isTriggering={triggerRewardMutation.isPending}
          />
        </TabsContent>
        
        <TabsContent value="aggregates" className="mt-4">
          <AggregatesTable aggregates={aggregates} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
