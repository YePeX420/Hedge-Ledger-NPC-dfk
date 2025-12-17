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
  Play,
  Square,
  RefreshCw,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  Zap,
  Archive,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WorkerProgress {
  workerId: number;
  isRunning: boolean;
  currentBlock: number;
  targetBlock: number;
  rangeStart: number;
  rangeEnd: number;
  percentComplete: number;
  stakersFound: number;
  rewardsFound: number;
  batchesCompleted: number;
  lastBatchAt: string | null;
}

interface V1IndexerProgress {
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
    rewardsFound: number;
    batchesCompleted: number;
    lastBatchAt: string | null;
    workers?: WorkerProgress[];
  } | null;
}

interface V1IndexerStatus {
  indexers: V1IndexerProgress[];
  workerStatus: {
    activeWorkers: number;
    workersPerPool: number;
    pools: Array<{
      pid: number;
      workerId: number;
      intervalMs: number;
      startedAt: string;
      lastRunAt: string | null;
      runsCompleted: number;
    }>;
  };
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

function formatBlock(block: number): string {
  return block.toLocaleString();
}

function calculateETA(startedAt: string | null | undefined, percentComplete: number): string | null {
  if (!startedAt || percentComplete <= 0 || percentComplete >= 100) return null;
  
  const startTime = new Date(startedAt).getTime();
  if (isNaN(startTime)) return null;
  
  const now = Date.now();
  const elapsedMs = now - startTime;
  
  if (elapsedMs < 5000) return null;
  
  const rate = percentComplete / elapsedMs;
  if (!isFinite(rate) || rate <= 0) return null;
  
  const remainingPercent = 100 - percentComplete;
  const remainingMs = remainingPercent / rate;
  if (!isFinite(remainingMs)) return null;
  
  const remainingSec = Math.floor(remainingMs / 1000);
  if (remainingSec < 60) return `~${remainingSec}s`;
  
  const remainingMin = Math.floor(remainingSec / 60);
  if (remainingMin < 60) return `~${remainingMin}m`;
  
  const hours = Math.floor(remainingMin / 60);
  const mins = remainingMin % 60;
  if (hours < 24) return `~${hours}h ${mins}m`;
  
  const days = Math.floor(hours / 24);
  const hrs = hours % 24;
  return `~${days}d ${hrs}h`;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
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

function WorkerProgressBars({ workers }: { workers?: WorkerProgress[] }) {
  if (!workers || workers.length === 0) return null;
  
  return (
    <div className="space-y-1">
      {workers.map((worker) => (
        <div key={worker.workerId} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-6">W{worker.workerId}</span>
          <Progress 
            value={worker.percentComplete} 
            className={`h-1.5 flex-1 ${worker.isRunning ? 'bg-blue-100' : ''}`} 
          />
          <span className="text-xs text-muted-foreground w-10 text-right">
            {(worker.percentComplete ?? 0).toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export default function PoolIndexerV1Page() {
  const { toast } = useToast();
  const [isStartingAll, setIsStartingAll] = useState(false);
  const [isStoppingAll, setIsStoppingAll] = useState(false);

  const { data: status, isLoading, refetch } = useQuery<V1IndexerStatus>({
    queryKey: ["/api/admin/pool-indexer-v1/status"],
    refetchInterval: 3000,
  });

  const triggerMutation = useMutation({
    mutationFn: async (pid: number) => {
      const res = await apiRequest('POST', '/api/admin/pool-indexer-v1/trigger', { pid });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pool-indexer-v1/status"] });
      toast({ title: "V1 batch triggered" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to trigger V1 batch", description: error.message, variant: "destructive" });
    },
  });

  const autoRunMutation = useMutation({
    mutationFn: async ({ pid, action }: { pid: number; action: 'start' | 'stop' }) => {
      const res = await apiRequest('POST', '/api/admin/pool-indexer-v1/auto-run', { pid, action });
      return res.json();
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pool-indexer-v1/status"] });
      toast({ title: `V1 auto-run ${action === 'start' ? 'started' : 'stopped'}` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to toggle V1 auto-run", description: error.message, variant: "destructive" });
    },
  });

  const startAllMutation = useMutation({
    mutationFn: async () => {
      setIsStartingAll(true);
      const res = await apiRequest('POST', '/api/admin/pool-indexer-v1/start-all');
      return res.json();
    },
    onSuccess: (data: any) => {
      setIsStartingAll(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pool-indexer-v1/status"] });
      toast({ 
        title: "V1 indexers started",
        description: `Started ${data.started} workers across ${data.totalPools} pools`,
      });
    },
    onError: (error: Error) => {
      setIsStartingAll(false);
      toast({ title: "Failed to start V1 indexers", description: error.message, variant: "destructive" });
    },
  });

  const stopAllMutation = useMutation({
    mutationFn: async () => {
      setIsStoppingAll(true);
      const res = await apiRequest('POST', '/api/admin/pool-indexer-v1/stop-all');
      return res.json();
    },
    onSuccess: (data: any) => {
      setIsStoppingAll(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pool-indexer-v1/status"] });
      toast({ 
        title: "V1 indexers stopped",
        description: `Stopped ${data.totalWorkers} workers`,
      });
    },
    onError: (error: Error) => {
      setIsStoppingAll(false);
      toast({ title: "Failed to stop V1 indexers", description: error.message, variant: "destructive" });
    },
  });

  const indexers = status?.indexers || [];
  const workerStatus = status?.workerStatus;
  const totalActiveWorkers = workerStatus?.activeWorkers || 0;

  const workersPerPoolMap = new Map<number, number>();
  const poolStartedAtMap = new Map<number, string>();
  if (workerStatus?.pools) {
    for (const worker of workerStatus.pools) {
      workersPerPoolMap.set(worker.pid, (workersPerPoolMap.get(worker.pid) || 0) + 1);
      const existingStart = poolStartedAtMap.get(worker.pid);
      if (!existingStart || new Date(worker.startedAt) < new Date(existingStart)) {
        poolStartedAtMap.set(worker.pid, worker.startedAt);
      }
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Archive className="w-6 h-6 text-amber-500" />
              V1 Pool Indexer (Legacy)
            </h1>
            <p className="text-muted-foreground">
              Index staker positions from deprecated Master Gardener V1
            </p>
          </div>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Archive className="w-6 h-6 text-amber-500" />
            V1 Pool Indexer (Legacy)
          </h1>
          <p className="text-muted-foreground">
            Index staker positions from deprecated Master Gardener V1
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active V1 Workers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-workers">
              {totalActiveWorkers}
            </div>
            <p className="text-xs text-muted-foreground">
              {workerStatus?.workersPerPool || 5} max per pool
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">V1 Pools Indexed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pools-indexed">
              {indexers.filter(i => i.status === 'complete' || (i.live?.percentComplete || 0) > 0).length} / 14
            </div>
            <p className="text-xs text-muted-foreground">Legacy staker positions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Global Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              size="sm"
              onClick={() => startAllMutation.mutate()}
              disabled={isStartingAll || totalActiveWorkers > 0}
              data-testid="button-start-all-v1"
            >
              {isStartingAll ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-1" />
              )}
              Start All V1
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => stopAllMutation.mutate()}
              disabled={isStoppingAll || totalActiveWorkers === 0}
              data-testid="button-stop-all-v1"
            >
              {isStoppingAll ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Square className="w-4 h-4 mr-1" />
              )}
              Stop All V1
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-amber-500" />
            V1 Legacy Indexers
          </CardTitle>
          <CardDescription>
            Track staker positions from the deprecated V1 Master Gardener contract
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {indexers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No V1 indexers found. Start indexing to track legacy positions.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Pool</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-48">Workers</TableHead>
                  <TableHead className="text-right">V1 Stakers</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {indexers.map((indexer) => {
                  const isRunning = indexer.live?.isRunning || false;
                  const percentComplete = indexer.live?.percentComplete || 0;
                  const workers = indexer.live?.workers || [];
                  const activeWorkerCount = workersPerPoolMap.get(indexer.pid) || 0;
                  const hasAutoRun = activeWorkerCount > 0;
                  const poolStartedAt = poolStartedAtMap.get(indexer.pid);
                  const eta = isRunning ? calculateETA(poolStartedAt, percentComplete) : null;
                  
                  return (
                    <TableRow key={indexer.indexerName} data-testid={`row-indexer-v1-${indexer.pid}`}>
                      <TableCell className="font-mono font-medium">
                        #{indexer.pid}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={indexer.status} isRunning={isRunning} />
                          {hasAutoRun && (
                            <Badge variant="outline" className="bg-amber-500/20 text-amber-500 border-amber-500/30 gap-1 text-xs">
                              <Zap className="w-3 h-3" />
                              V1 ({activeWorkerCount}w)
                            </Badge>
                          )}
                          {eta && (
                            <span className="text-xs text-muted-foreground" data-testid={`eta-v1-${indexer.pid}`}>
                              ETA: {eta}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {workers.length > 0 ? (
                          <WorkerProgressBars workers={workers} />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {hasAutoRun ? `${activeWorkerCount} workers` : 'No workers'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatNumber(indexer.live?.stakersFound || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatNumber(indexer.totalEventsIndexed)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => triggerMutation.mutate(indexer.pid)}
                            disabled={isRunning || triggerMutation.isPending}
                            data-testid={`button-trigger-v1-${indexer.pid}`}
                          >
                            {triggerMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant={hasAutoRun ? "destructive" : "outline"}
                            onClick={() => autoRunMutation.mutate({ 
                              pid: indexer.pid, 
                              action: hasAutoRun ? 'stop' : 'start' 
                            })}
                            data-testid={`button-auto-v1-${indexer.pid}`}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
