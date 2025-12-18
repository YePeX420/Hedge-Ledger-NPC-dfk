import { useState, useEffect, useRef } from "react";
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
  ChevronDown,
  ChevronRight,
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
  batchesCompleted: number;
  lastBatchAt: string | null;
}

interface HarmonyPool {
  pid: number;
  lpToken: string;
  stakerCount: number;
  totalStaked: string;
  isRunning: boolean;
  isAutoRunning: boolean;
  percentComplete: number;
  liveWorkers: WorkerProgress[];
}

interface HarmonyIndexerStatus {
  latestBlock: number;
  poolLength: number;
  pools: HarmonyPool[];
  dbProgress: Array<{
    id: number;
    indexerName: string;
    pid: number;
    lastIndexedBlock: number;
    status: string;
    totalEventsIndexed: number;
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

function formatBlock(block: number): string {
  return block.toLocaleString();
}

function WorkersSummary({ workers }: { workers: WorkerProgress[] }) {
  const [expanded, setExpanded] = useState(false);
  
  if (!workers || workers.length === 0) {
    return <span className="text-muted-foreground text-sm">No workers</span>;
  }
  
  const runningCount = workers.filter(w => w.isRunning).length;
  const avgPercent = workers.reduce((sum, w) => sum + w.percentComplete, 0) / workers.length;
  
  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(!expanded)}
        className="h-auto p-1 gap-1"
        data-testid="button-expand-workers"
      >
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <span className="text-sm">
          {workers.length} workers ({runningCount} active) • {avgPercent.toFixed(1)}%
        </span>
      </Button>
      
      {expanded && (
        <div className="pl-4 space-y-1 text-xs">
          {workers.map((w) => (
            <div key={w.workerId} className="flex items-center gap-2">
              <Badge variant={w.isRunning ? "default" : "secondary"} className="text-xs">
                W{w.workerId}
              </Badge>
              <Progress value={w.percentComplete} className="w-20 h-1" />
              <span className="text-muted-foreground">
                {w.percentComplete.toFixed(1)}% • {formatNumber(w.stakersFound)} stakers
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PoolIndexerHarmonyPage() {
  const { toast } = useToast();
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  const { data: status, isLoading, refetch } = useQuery<HarmonyIndexerStatus>({
    queryKey: ["/api/admin/pool-indexer-harmony/status"],
    refetchInterval: autoRefresh ? 3000 : false,
  });
  
  useEffect(() => {
    const interval = autoRefresh ? setInterval(() => refetch(), 3000) : undefined;
    return () => { if (interval) clearInterval(interval); };
  }, [autoRefresh, refetch]);
  
  const triggerMutation = useMutation({
    mutationFn: async (pid: number) => {
      return apiRequest("/api/admin/pool-indexer-harmony/trigger", {
        method: "POST",
        body: JSON.stringify({ pid }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pool-indexer-harmony/status"] });
      toast({ title: "Indexer triggered", description: "Harmony indexer batch started" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
  
  const autoRunMutation = useMutation({
    mutationFn: async ({ pid, action }: { pid: number; action: 'start' | 'stop' }) => {
      return apiRequest("/api/admin/pool-indexer-harmony/auto-run", {
        method: "POST",
        body: JSON.stringify({ pid, action }),
      });
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pool-indexer-harmony/status"] });
      toast({ title: action === 'start' ? "Auto-run started" : "Auto-run stopped" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
  
  const startAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/admin/pool-indexer-harmony/start-all", { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pool-indexer-harmony/status"] });
      toast({ title: "All indexers started" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
  
  const stopAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/admin/pool-indexer-harmony/stop-all", { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pool-indexer-harmony/status"] });
      toast({ title: "All indexers stopped" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
  
  if (isLoading) {
    return (
      <div className="space-y-6 p-6" data-testid="loading-skeleton">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  
  const pools = status?.pools || [];
  const runningPools = pools.filter(p => p.isAutoRunning || p.isRunning);
  const totalStakers = pools.reduce((sum, p) => sum + (p.stakerCount || 0), 0);
  
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">Harmony Pool Indexer</h1>
          <p className="text-muted-foreground">
            Legacy Serendale Master Gardener on Harmony chain
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            data-testid="button-toggle-refresh"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => startAllMutation.mutate()}
            disabled={startAllMutation.isPending}
            data-testid="button-start-all"
          >
            <Zap className="w-4 h-4 mr-2" />
            Start All
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => stopAllMutation.mutate()}
            disabled={stopAllMutation.isPending}
            data-testid="button-stop-all"
          >
            <Square className="w-4 h-4 mr-2" />
            Stop All
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-latest-block">
          <CardHeader className="pb-2">
            <CardDescription>Latest Block</CardDescription>
            <CardTitle className="text-xl">{formatBlock(status?.latestBlock || 0)}</CardTitle>
          </CardHeader>
        </Card>
        
        <Card data-testid="card-pool-count">
          <CardHeader className="pb-2">
            <CardDescription>Pools Discovered</CardDescription>
            <CardTitle className="text-xl">{pools.length} / {status?.poolLength || 0}</CardTitle>
          </CardHeader>
        </Card>
        
        <Card data-testid="card-running-pools">
          <CardHeader className="pb-2">
            <CardDescription>Running Pools</CardDescription>
            <CardTitle className="text-xl">{runningPools.length}</CardTitle>
          </CardHeader>
        </Card>
        
        <Card data-testid="card-total-stakers">
          <CardHeader className="pb-2">
            <CardDescription>Total Stakers</CardDescription>
            <CardTitle className="text-xl">{formatNumber(totalStakers)}</CardTitle>
          </CardHeader>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Pool Status</CardTitle>
          <CardDescription>
            Harmony Serendale LP pools with staking activity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PID</TableHead>
                <TableHead>LP Token</TableHead>
                <TableHead>Stakers</TableHead>
                <TableHead>Total Staked</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Workers</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pools.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No pools found. Click "Start All" to begin indexing.
                  </TableCell>
                </TableRow>
              ) : (
                pools.map((pool) => {
                  const dbRecord = status?.dbProgress?.find(p => p.pid === pool.pid);
                  return (
                    <TableRow key={pool.pid} data-testid={`row-pool-${pool.pid}`}>
                      <TableCell className="font-mono">{pool.pid}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[120px] truncate" title={pool.lpToken}>
                        {pool.lpToken ? `${pool.lpToken.slice(0, 10)}...${pool.lpToken.slice(-6)}` : '-'}
                      </TableCell>
                      <TableCell>{formatNumber(pool.stakerCount)}</TableCell>
                      <TableCell>{formatNumber(pool.totalStaked)}</TableCell>
                      <TableCell>
                        <StatusBadge 
                          status={dbRecord?.status || 'idle'} 
                          isRunning={pool.isRunning || pool.isAutoRunning} 
                        />
                      </TableCell>
                      <TableCell>
                        <WorkersSummary workers={pool.liveWorkers} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {pool.isAutoRunning ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => autoRunMutation.mutate({ pid: pool.pid, action: 'stop' })}
                              disabled={autoRunMutation.isPending}
                              data-testid={`button-stop-${pool.pid}`}
                            >
                              <Square className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => autoRunMutation.mutate({ pid: pool.pid, action: 'start' })}
                              disabled={autoRunMutation.isPending}
                              data-testid={`button-start-${pool.pid}`}
                            >
                              <Play className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => triggerMutation.mutate(pool.pid)}
                            disabled={triggerMutation.isPending}
                            data-testid={`button-trigger-${pool.pid}`}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
