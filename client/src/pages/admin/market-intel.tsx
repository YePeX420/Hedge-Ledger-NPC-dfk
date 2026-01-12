import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Clock, Target, Play, RefreshCw, Activity, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const RARITY_NAMES: Record<number, string> = {
  0: 'Common', 1: 'Uncommon', 2: 'Rare', 3: 'Legendary', 4: 'Mythic'
};

const RARITY_COLORS: Record<number, string> = {
  0: 'bg-gray-500', 1: 'bg-green-500', 2: 'bg-blue-500', 3: 'bg-orange-500', 4: 'bg-purple-500'
};

interface SaleIngestionStatus {
  isRunning: boolean;
  lastSnapshotAt: string | null;
  lastReconciliationAt: string | null;
  salesDetected: number;
  delistingsDetected: number;
  autoRunActive: boolean;
  errors: Array<{ at: string; error: string }>;
}

interface SalesStats {
  realm: string;
  total_sales: string;
  avg_price: string;
  min_price: string;
  max_price: string;
}

interface RecentSale {
  id: number;
  hero_id: string;
  realm: string;
  sale_timestamp: string;
  token_symbol: string;
  price_amount: string;
  main_class?: string;
  sub_class?: string;
  rarity?: number;
  level?: number;
  profession?: string;
}

interface DemandMetric {
  id: number;
  realm: string;
  main_class: string;
  sub_class?: string;
  profession?: string;
  rarity?: number;
  level_band?: string;
  sales_count_7d: number;
  sales_count_30d: number;
  avg_time_on_market_hours?: string;
  median_price_native?: string;
  demand_score: number;
  velocity_score: number;
  liquidity_score: number;
}

export default function MarketIntelPage() {
  const { toast } = useToast();
  const [selectedRealm, setSelectedRealm] = useState<string>("all");

  const statusQuery = useQuery<{ ok: boolean; status: SaleIngestionStatus; stats: SalesStats[] }>({
    queryKey: ['/api/admin/market-intel/status'],
    refetchInterval: 10000
  });

  const recentSalesQuery = useQuery<{ ok: boolean; sales: RecentSale[]; count: number }>({
    queryKey: ['/api/admin/market-intel/recent-sales', selectedRealm],
    queryFn: async () => {
      const url = selectedRealm === 'all' 
        ? '/api/admin/market-intel/recent-sales?limit=50'
        : `/api/admin/market-intel/recent-sales?limit=50&realm=${selectedRealm}`;
      const res = await fetch(url, { credentials: 'include' });
      return res.json();
    }
  });

  const demandMetricsQuery = useQuery<{ ok: boolean; metrics: DemandMetric[]; count: number }>({
    queryKey: ['/api/admin/market-intel/demand-metrics', selectedRealm],
    queryFn: async () => {
      const url = selectedRealm === 'all'
        ? '/api/admin/market-intel/demand-metrics'
        : `/api/admin/market-intel/demand-metrics?realm=${selectedRealm}`;
      const res = await fetch(url, { credentials: 'include' });
      return res.json();
    }
  });

  const invalidateAllMarketIntel = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/admin/market-intel/status'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/market-intel/recent-sales'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/market-intel/demand-metrics'] });
  };

  const snapshotMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/market-intel/snapshot'),
    onSuccess: () => {
      toast({ title: "Snapshot taken", description: "Listing snapshot saved" });
      invalidateAllMarketIntel();
    },
    onError: (err: Error) => {
      toast({ title: "Snapshot failed", description: err.message, variant: "destructive" });
    }
  });

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/market-intel/reconcile');
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Reconciliation complete", 
        description: `Detected ${data.salesDetected || 0} sales, ${data.delistingsDetected || 0} delistings` 
      });
      invalidateAllMarketIntel();
    },
    onError: (err: Error) => {
      toast({ title: "Reconciliation failed", description: err.message, variant: "destructive" });
    }
  });

  const fullCycleMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/market-intel/full-cycle'),
    onSuccess: () => {
      toast({ title: "Full cycle complete", description: "Snapshot and reconciliation finished" });
      invalidateAllMarketIntel();
    },
    onError: (err: Error) => {
      toast({ title: "Full cycle failed", description: err.message, variant: "destructive" });
    }
  });

  const startAutoMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/market-intel/start-auto'),
    onSuccess: () => {
      toast({ title: "Auto ingestion started", description: "Running every hour" });
      invalidateAllMarketIntel();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to start", description: err.message, variant: "destructive" });
    }
  });

  const stopAutoMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/market-intel/stop-auto'),
    onSuccess: () => {
      toast({ title: "Auto ingestion stopped" });
      invalidateAllMarketIntel();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to stop", description: err.message, variant: "destructive" });
    }
  });

  const status = statusQuery.data?.status;
  const stats = statusQuery.data?.stats || [];
  const recentSales = recentSalesQuery.data?.sales || [];
  const demandMetrics = demandMetricsQuery.data?.metrics || [];

  const formatPrice = (price: string | undefined) => {
    if (!price) return '-';
    const num = parseFloat(price);
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toFixed(2);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="space-y-6" data-testid="page-market-intel">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Market Intel</h1>
          <p className="text-muted-foreground">Track hero sales trends and demand patterns</p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedRealm} onValueChange={setSelectedRealm}>
            <SelectTrigger className="w-[140px]" data-testid="select-realm">
              <SelectValue placeholder="All Realms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Realms</SelectItem>
              <SelectItem value="cv">Crystalvale</SelectItem>
              <SelectItem value="sd">Sundered Isles</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => snapshotMutation.mutate()}
            disabled={snapshotMutation.isPending}
            data-testid="button-snapshot"
          >
            {snapshotMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
            <span className="ml-2">Snapshot</span>
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => reconcileMutation.mutate()}
            disabled={reconcileMutation.isPending}
            data-testid="button-reconcile"
          >
            {reconcileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Reconcile</span>
          </Button>
          
          <Button
            size="sm"
            onClick={() => fullCycleMutation.mutate()}
            disabled={fullCycleMutation.isPending}
            data-testid="button-full-cycle"
          >
            {fullCycleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            <span className="ml-2">Full Cycle</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingestion Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge 
                variant={status?.autoRunActive ? "default" : "secondary"}
                data-testid="badge-ingestion-status"
              >
                {status?.autoRunActive ? 'Auto Running' : 'Stopped'}
              </Badge>
              {status?.autoRunActive ? (
                <Button size="sm" variant="ghost" onClick={() => stopAutoMutation.mutate()}>
                  Stop
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => startAutoMutation.mutate()}>
                  Start Auto
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Last snapshot: {formatDate(status?.lastSnapshotAt || null)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales Detected</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-sales-detected">
              {status?.salesDetected || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Delistings: {status?.delistingsDetected || 0}
            </p>
          </CardContent>
        </Card>

        {stats.map((s) => (
          <Card key={s.realm}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {s.realm === 'cv' ? 'Crystalvale' : 'Sundered Isles'}
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.total_sales} sales</div>
              <p className="text-xs text-muted-foreground">
                Avg: {formatPrice(s.avg_price)} {s.realm === 'cv' ? 'CRYSTAL' : 'JEWEL'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Sales
            </CardTitle>
            <CardDescription>Latest hero sales detected</CardDescription>
          </CardHeader>
          <CardContent>
            {recentSalesQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : recentSales.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No sales detected yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hero</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSales.slice(0, 10).map((sale) => (
                    <TableRow key={sale.id} data-testid={`row-sale-${sale.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {sale.realm.toUpperCase()}
                          </Badge>
                          <span className="font-mono text-xs">{sale.hero_id}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {sale.rarity !== undefined && (
                            <span className={`w-2 h-2 rounded-full ${RARITY_COLORS[sale.rarity]}`} />
                          )}
                          <span>{sale.main_class || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatPrice(sale.price_amount)} {sale.token_symbol}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(sale.sale_timestamp).toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Demand Heatmap
            </CardTitle>
            <CardDescription>Class demand scores by sales velocity</CardDescription>
          </CardHeader>
          <CardContent>
            {demandMetricsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : demandMetrics.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No demand data yet</p>
            ) : (
              <div className="space-y-2">
                {demandMetrics.slice(0, 10).map((metric) => (
                  <div 
                    key={metric.id} 
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                    data-testid={`row-demand-${metric.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {metric.realm.toUpperCase()}
                      </Badge>
                      <span className="font-medium">{metric.main_class}</span>
                      {metric.rarity !== undefined && metric.rarity !== null && (
                        <Badge className={`${RARITY_COLORS[metric.rarity]} text-xs`}>
                          {RARITY_NAMES[metric.rarity]}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-medium">{metric.sales_count_7d} / 7d</div>
                        <div className="text-xs text-muted-foreground">{metric.sales_count_30d} / 30d</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        <span className="font-bold">{metric.demand_score}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
