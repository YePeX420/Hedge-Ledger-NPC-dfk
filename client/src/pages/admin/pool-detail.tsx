import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  RefreshCw, 
  ArrowLeft, 
  TrendingUp, 
  Zap, 
  Users,
  Droplets,
  ExternalLink,
  Database,
  Play,
  RotateCcw,
  UserCheck,
  Timer,
  Power
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PoolInfo {
  pid: number;
  pairName: string;
  lpToken: string;
  token0: string;
  token1: string;
  totalTVL: number;
}

interface APRBreakdown {
  passive: {
    feeAprValue: number;
    harvestAprValue: number;
    totalPassive: number;
  };
  active: {
    questAprWorst: number;
    questAprBest: number;
  };
  total: {
    worst: number;
    best: number;
  };
}

interface Staker {
  wallet: string;
  summonerName?: string | null;
  v2Value: string;
  v1Value: string;
  totalValue: string;
  lastActivity: {
    type: 'Deposit' | 'Withdraw' | 'Unknown';
    blockNumber: number;
    txHash: string;
    date: string | null;
  };
}

interface AllStakersResponse {
  stakers: Staker[];
  count: number;
  v2TVL: number;
  v1TVL: number;
  totalTVL: number;
  source?: 'indexed' | 'onchain';
}

interface PoolDetailResponse {
  pool: PoolInfo;
  aprBreakdown: APRBreakdown;
}

interface IndexerProgress {
  pid: number;
  lastBlock: number;
  stakersFound: number;
  lastUpdated: string;
  isComplete: boolean;
}

interface LiveProgress {
  isRunning: boolean;
  currentBlock: number;
  targetBlock: number;
  totalEventsFound: number;
  totalStakersFound: number;
  batchesCompleted: number;
  startedAt: string | null;
  lastBatchAt: string | null;
  lastBatchEventsFound: number;
  percentComplete: number;
  lastError?: string;
  completedAt?: string | null;
}

interface AutoRunStatus {
  pid: number;
  isAutoRunning: boolean;
  autoRunInfo: {
    intervalMs: number;
    startedAt: string;
    lastRunAt: string | null;
    runsCompleted: number;
  } | null;
  liveProgress: LiveProgress | null;
}

export default function PoolDetailPage() {
  const { pid } = useParams<{ pid: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [workerCount, setWorkerCount] = useState<number>(4);
  const [autoRunInterval, setAutoRunInterval] = useState<string>("300000"); // 5 min default

  const { data: poolData, isLoading: poolLoading, refetch: refetchPool } = useQuery<PoolDetailResponse>({
    queryKey: ["/api/admin/pools", pid],
    enabled: !!pid,
  });

  const { data: stakersData, isLoading: stakersLoading, refetch: refetchStakers, isFetching: stakersFetching } = useQuery<AllStakersResponse>({
    queryKey: ["/api/admin/pools", pid, "all-stakers"],
    enabled: !!pid,
  });

  const { data: indexerStatus, refetch: refetchIndexerStatus } = useQuery<{ unifiedIndexers: { pid: number; lastIndexedBlock: number; totalEventsIndexed: number; status: string; updatedAt: string; live?: { isRunning: boolean; currentBlock: number; targetBlock: number; percentComplete: number; stakersFound: number; swapsFound: number; rewardsFound: number; } | null; autoRun?: { intervalMs: number; startedAt: string; runsCompleted: number; } | null; }[] }>({
    queryKey: ["/api/admin/pool-indexer/status"],
    refetchInterval: 2000,
  });

  const currentUnifiedIndexer = indexerStatus?.unifiedIndexers?.find(p => p.pid === Number(pid));

  const liveProgress: LiveProgress | null = currentUnifiedIndexer?.live ? {
    isRunning: currentUnifiedIndexer.live.isRunning,
    currentBlock: currentUnifiedIndexer.live.currentBlock,
    targetBlock: currentUnifiedIndexer.live.targetBlock,
    totalEventsFound: (currentUnifiedIndexer.live.stakersFound || 0) + (currentUnifiedIndexer.live.swapsFound || 0) + (currentUnifiedIndexer.live.rewardsFound || 0),
    totalStakersFound: currentUnifiedIndexer.live.stakersFound || 0,
    batchesCompleted: 0,
    startedAt: null,
    lastBatchAt: null,
    lastBatchEventsFound: 0,
    percentComplete: currentUnifiedIndexer.live.percentComplete,
  } : null;

  const currentProgress: IndexerProgress | undefined = currentUnifiedIndexer ? {
    pid: currentUnifiedIndexer.pid,
    lastBlock: currentUnifiedIndexer.lastIndexedBlock,
    stakersFound: currentUnifiedIndexer.live?.stakersFound || 0,
    lastUpdated: currentUnifiedIndexer.updatedAt,
    isComplete: currentUnifiedIndexer.status === 'complete',
  } : undefined;

  const isAutoRunning = !!currentUnifiedIndexer?.autoRun;

  const startAutoRunMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/pool-indexer/unified/auto-run`, { 
        pid: Number(pid),
        action: 'start',
        intervalMs: parseInt(autoRunInterval) 
      });
      const text = await res.text();
      return text ? JSON.parse(text) : { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Auto-Run Started",
        description: `Unified indexer will run automatically every ${parseInt(autoRunInterval) / 60000} minutes.`,
      });
      refetchIndexerStatus();
    },
    onError: (error: Error) => {
      toast({
        title: "Error Starting Auto-Run",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const stopAutoRunMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/pool-indexer/unified/auto-run`, {
        pid: Number(pid),
        action: 'stop'
      });
      const text = await res.text();
      return text ? JSON.parse(text) : { success: true };
    },
    onSuccess: (data: unknown) => {
      const result = data as { result?: { runsCompleted?: number } };
      toast({
        title: "Auto-Run Stopped",
        description: `Completed ${result.result?.runsCompleted || 0} runs before stopping.`,
      });
      refetchIndexerStatus();
    },
    onError: (error: Error) => {
      toast({
        title: "Error Stopping Auto-Run",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAutoRunToggle = (checked: boolean) => {
    if (checked) {
      startAutoRunMutation.mutate();
    } else {
      stopAutoRunMutation.mutate();
    }
  };

  const runBatchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/pool-indexer/unified/trigger`, { pid: Number(pid) });
      const text = await res.text();
      return text ? JSON.parse(text) : { success: true };
    },
    onSuccess: (data: unknown) => {
      const result = data as { result?: { stakersUpdated?: number; swapsSaved?: number; rewardsSaved?: number } };
      toast({
        title: "Unified Batch Complete",
        description: `Found ${result.result?.stakersUpdated || 0} stakers, ${result.result?.swapsSaved || 0} swaps, ${result.result?.rewardsSaved || 0} rewards.`,
      });
      refetchIndexerStatus();
      refetchStakers();
    },
    onError: (error: Error) => {
      toast({
        title: "Indexer Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateNamesMutation = useMutation({
    mutationFn: async () => {
      toast({
        title: "Names Update",
        description: "Summoner name updates happen automatically during indexing.",
      });
      return { success: true };
    },
    onSuccess: () => {
      refetchStakers();
    },
    onError: (error: Error) => {
      toast({
        title: "Update Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetIndexMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/pool-indexer/unified/reset`, { pid: Number(pid) });
      const text = await res.text();
      return text ? JSON.parse(text) : { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Index Reset",
        description: "Unified indexer has been reset. Run indexer to rebuild.",
      });
      refetchIndexerStatus();
      refetchStakers();
    },
    onError: (error: Error) => {
      toast({
        title: "Reset Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null) return "$0.00";
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  const formatAPR = (value: number | null | undefined) => {
    if (value == null) return "0.00%";
    return `${value.toFixed(2)}%`;
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleRefresh = () => {
    refetchPool();
    refetchStakers();
  };

  const pool = poolData?.pool;
  const apr = poolData?.aprBreakdown;
  const isLoading = poolLoading || stakersLoading;

  const [aprWindow, setAprWindow] = useState<'1y' | '1m' | '24h'>('1y');

  const scaleApr = (annualizedApr: number | null | undefined) => {
    if (annualizedApr == null) return 0;
    switch (aprWindow) {
      case '1m': return annualizedApr / 12;
      case '24h': return annualizedApr / 365;
      default: return annualizedApr;
    }
  };

  const getWindowLabel = () => {
    switch (aprWindow) {
      case '1m': return 'Monthly';
      case '24h': return 'Daily';
      default: return 'Annual';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/admin/pools")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              {pool?.pairName || `Pool ${pid}`}
            </h1>
            <p className="text-muted-foreground">
              Pool ID: {pid} {pool?.lpToken && `• LP: ${formatAddress(pool.lpToken)}`}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={isLoading}
          data-testid="button-refresh"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {poolLoading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : pool ? (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-muted-foreground">APR Window:</span>
            <div className="flex gap-1">
              {(['1y', '1m', '24h'] as const).map((w) => (
                <Button
                  key={w}
                  variant={aprWindow === w ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAprWindow(w)}
                  data-testid={`button-apr-${w}`}
                >
                  {w.toUpperCase()}
                </Button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground ml-2">({getWindowLabel()} rates)</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Value Locked</CardTitle>
                <Droplets className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-tvl">
                  {formatCurrency(pool.totalTVL)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Passive APR</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-passive-apr">
                  {formatAPR(scaleApr(apr?.passive?.totalPassive))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Fee: {formatAPR(scaleApr(apr?.passive?.feeAprValue))} + Harvest: {formatAPR(scaleApr(apr?.passive?.harvestAprValue))}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active APR</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-active-apr">
                  {scaleApr(apr?.active?.questAprWorst) === scaleApr(apr?.active?.questAprBest) 
                    ? formatAPR(scaleApr(apr?.active?.questAprWorst))
                    : `${formatAPR(scaleApr(apr?.active?.questAprWorst))} - ${formatAPR(scaleApr(apr?.active?.questAprBest))}`
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  Hero-dependent quest rewards
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total APR</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-total-apr">
                  {scaleApr(apr?.total?.worst) === scaleApr(apr?.total?.best) 
                    ? formatAPR(scaleApr(apr?.total?.worst))
                    : `${formatAPR(scaleApr(apr?.total?.worst))} - ${formatAPR(scaleApr(apr?.total?.best))}`
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  Combined passive + active APR
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  All Gardeners List
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  {stakersData?.count || 0} wallets staked in this pool
                  {stakersData?.source && (
                    <Badge variant={stakersData.source === 'indexed' ? 'default' : 'secondary'}>
                      {stakersData.source === 'indexed' ? 'Indexed' : 'Live Scan'}
                    </Badge>
                  )}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchStakers()}
                disabled={stakersFetching}
                data-testid="button-fetch-stakers"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${stakersFetching ? "animate-spin" : ""}`} />
                {stakersFetching ? "Fetching..." : "Fetch Stakers"}
              </Button>
            </CardHeader>
            <CardContent>
              {stakersLoading || stakersFetching ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Scanning blockchain...</span>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Wallet</TableHead>
                      <TableHead>Summoner</TableHead>
                      <TableHead className="text-right">V2 USD</TableHead>
                      <TableHead className="text-right">V1 USD</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Last Activity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stakersData?.stakers.map((staker, index) => (
                      <TableRow key={staker.wallet} data-testid={`row-staker-${index}`}>
                        <TableCell>
                          <a 
                            href={`https://subnets.avax.network/defi-kingdoms/address/${staker.wallet}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-sm hover:underline"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`link-wallet-${index}`}
                          >
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {formatAddress(staker.wallet)}
                            </code>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                        <TableCell data-testid={`text-summoner-${index}`}>
                          {staker.summonerName ? (
                            <span className="font-medium text-primary">{staker.summonerName}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium" data-testid={`text-v2-${index}`}>
                          {parseFloat(staker.v2Value) > 0 ? (
                            <span className="text-green-600 dark:text-green-400">
                              ${parseFloat(staker.v2Value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium" data-testid={`text-v1-${index}`}>
                          {parseFloat(staker.v1Value) > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400">
                              ${parseFloat(staker.v1Value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium" data-testid={`text-total-${index}`}>
                          ${parseFloat(staker.totalValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-activity-${index}`}>
                          <div className="flex flex-col items-end">
                            <Badge variant={staker.lastActivity.type === 'Deposit' ? 'default' : 'secondary'}>
                              {staker.lastActivity.type}
                            </Badge>
                            {staker.lastActivity.date && (
                              <span className="text-xs text-muted-foreground mt-1">
                                {new Date(staker.lastActivity.date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!stakersData?.stakers || stakersData.stakers.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No stakers found. Click "Fetch Stakers" to scan blockchain.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Unified Indexer
              </CardTitle>
              <CardDescription>
                Scans Deposit, Withdraw, Swap, and Harvest events in a single blockchain pass
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Live Progress Section - shown when indexing is running or recently completed */}
              {liveProgress && (liveProgress.isRunning || (liveProgress.completedAt && isAutoRunning)) && (
                <div className="p-4 rounded-lg bg-muted/50 border space-y-3" data-testid="section-live-progress">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {liveProgress.isRunning ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                          <span className="font-medium">Indexing in Progress</span>
                        </>
                      ) : (
                        <>
                          <Database className="h-4 w-4 text-green-500" />
                          <span className="font-medium text-green-600 dark:text-green-400">Sync Complete</span>
                        </>
                      )}
                    </div>
                    <Badge variant={liveProgress.isRunning ? "default" : "secondary"} data-testid="badge-percent-complete">
                      {liveProgress.percentComplete.toFixed(1)}%
                    </Badge>
                  </div>
                  <Progress value={liveProgress.percentComplete} className="h-2" data-testid="progress-indexer" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Current Block</p>
                      <p className="font-semibold" data-testid="text-live-current-block">
                        {liveProgress.currentBlock.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Target Block</p>
                      <p className="font-semibold" data-testid="text-live-target-block">
                        {liveProgress.targetBlock.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Events Found</p>
                      <p className="font-semibold" data-testid="text-live-events">
                        {liveProgress.totalEventsFound.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Batches Completed</p>
                      <p className="font-semibold" data-testid="text-live-batches">
                        {liveProgress.batchesCompleted.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {liveProgress.completedAt && !liveProgress.isRunning && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      Completed at {new Date(liveProgress.completedAt).toLocaleTimeString()} - waiting for new blocks
                    </p>
                  )}
                  {liveProgress.lastBatchAt && liveProgress.isRunning && (
                    <p className="text-xs text-muted-foreground">
                      Last batch: {new Date(liveProgress.lastBatchAt).toLocaleTimeString()} 
                      ({liveProgress.lastBatchEventsFound} events)
                    </p>
                  )}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <p className="text-sm text-muted-foreground">Last Indexed Block</p>
                  <p className="text-lg font-semibold" data-testid="text-indexer-block">
                    {liveProgress?.currentBlock?.toLocaleString() || currentProgress?.lastBlock?.toLocaleString() || "Not started"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Stakers Found</p>
                  <p className="text-lg font-semibold" data-testid="text-indexer-stakers">
                    {liveProgress?.totalStakersFound?.toLocaleString() || currentProgress?.stakersFound?.toLocaleString() || "0"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Events Indexed</p>
                  <p className="text-lg font-semibold" data-testid="text-indexer-events">
                    {liveProgress?.totalEventsFound?.toLocaleString() || "0"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge 
                    variant={liveProgress?.isRunning ? "default" : currentProgress?.isComplete ? "default" : "secondary"}
                    data-testid="badge-indexer-status"
                  >
                    {liveProgress?.isRunning ? "Indexing..." : currentProgress?.isComplete ? "Complete" : "Idle"}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-4 border-t">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Power className={`h-4 w-4 ${isAutoRunning ? 'text-green-500' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium">Auto-Run:</span>
                  <Switch
                    checked={isAutoRunning}
                    onCheckedChange={handleAutoRunToggle}
                    disabled={startAutoRunMutation.isPending || stopAutoRunMutation.isPending}
                    data-testid="switch-auto-run"
                  />
                  <Select
                    value={autoRunInterval}
                    onValueChange={setAutoRunInterval}
                    disabled={isAutoRunning}
                  >
                    <SelectTrigger className="w-28" data-testid="select-auto-run-interval">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="60000">1 min</SelectItem>
                      <SelectItem value="300000">5 min</SelectItem>
                      <SelectItem value="600000">10 min</SelectItem>
                      <SelectItem value="1800000">30 min</SelectItem>
                      <SelectItem value="3600000">1 hour</SelectItem>
                    </SelectContent>
                  </Select>
                  {isAutoRunning && currentUnifiedIndexer?.autoRun && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Timer className="h-3 w-3" />
                      <span>{currentUnifiedIndexer.autoRun.runsCompleted} runs</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Workers:</span>
                  <Select
                    value={workerCount.toString()}
                    onValueChange={(val) => setWorkerCount(Number(val))}
                  >
                    <SelectTrigger className="w-20" data-testid="select-workers">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 4, 6, 8].map((n) => (
                        <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={() => runBatchMutation.mutate()}
                  disabled={runBatchMutation.isPending}
                  data-testid="button-run-indexer"
                >
                  {runBatchMutation.isPending ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  {runBatchMutation.isPending ? "Indexing..." : "Run Indexer Batch"}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => updateNamesMutation.mutate()}
                  disabled={updateNamesMutation.isPending}
                  data-testid="button-update-names"
                >
                  {updateNamesMutation.isPending ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserCheck className="mr-2 h-4 w-4" />
                  )}
                  {updateNamesMutation.isPending ? "Updating..." : "Update Summoner Names"}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => resetIndexMutation.mutate()}
                  disabled={resetIndexMutation.isPending}
                  data-testid="button-reset-index"
                >
                  {resetIndexMutation.isPending ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-2 h-4 w-4" />
                  )}
                  Reset Index
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Pool Activity
              </CardTitle>
              <CardDescription>
                Recent staking and unstaking activity for this pool
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="py-8 text-center text-muted-foreground" data-testid="text-activity-placeholder">
                <p>Activity tracking coming soon.</p>
                <p className="text-sm mt-2">
                  This section will show recent deposits, withdrawals, and quest completions.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              Pool not found or data unavailable.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
