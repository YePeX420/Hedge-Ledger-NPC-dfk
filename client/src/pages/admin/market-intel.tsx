import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Clock, Target, Play, RefreshCw, Activity, BarChart3, Calculator, ShoppingCart, Tag, Percent } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const RARITY_NAMES: Record<number, string> = {
  0: 'Common', 1: 'Uncommon', 2: 'Rare', 3: 'Legendary', 4: 'Mythic'
};

const RARITY_COLORS: Record<number, string> = {
  0: 'bg-gray-500', 1: 'bg-green-500', 2: 'bg-blue-500', 3: 'bg-orange-500', 4: 'bg-purple-500'
};

const CLASS_OPTIONS = [
  'Warrior', 'Knight', 'Thief', 'Archer', 'Priest', 'Wizard',
  'Monk', 'Pirate', 'Berserker', 'Seer', 'Legionnaire', 'Scholar',
  'Paladin', 'DarkKnight', 'Summoner', 'Ninja', 'Shapeshifter',
  'Bard', 'Dragoon', 'Sage', 'SpellBow', 'DreadKnight'
];

const PROFESSION_OPTIONS = ['mining', 'gardening', 'fishing', 'foraging'];

interface PriceRecommendation {
  buyLow: number;
  buyFair: number;
  marketMedian: number;
  marketAverage: number;
  sellFair: number;
  sellHigh: number;
  priceRange: { min: number; max: number };
  token: string;
  confidence: 'low' | 'medium' | 'high';
  sampleSize: number;
  priceVariation: number;
}

interface PriceRecommendationResponse {
  ok: boolean;
  recommendation: PriceRecommendation | null;
  recentSales?: Array<{
    heroId: string;
    price: number;
    token: string;
    saleDate: string;
    mainClass: string;
    rarity: number;
    level: number;
    profession: string;
  }>;
  similarSalesCount: number;
  message?: string;
  error?: string;
}

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
  
  // Price Tool State
  const [priceToolClass, setPriceToolClass] = useState<string>("");
  const [priceToolRarity, setPriceToolRarity] = useState<string>("");
  const [priceToolLevelMin, setPriceToolLevelMin] = useState<string>("");
  const [priceToolLevelMax, setPriceToolLevelMax] = useState<string>("");
  const [priceToolProfession, setPriceToolProfession] = useState<string>("");
  const [priceToolRealm, setPriceToolRealm] = useState<string>("cv");
  const [priceResult, setPriceResult] = useState<PriceRecommendationResponse | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const fetchPriceRecommendation = async () => {
    if (!priceToolClass) {
      toast({ title: "Select a class", description: "Class is required for price lookup", variant: "destructive" });
      return;
    }
    
    setPriceLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('mainClass', priceToolClass);
      params.set('realm', priceToolRealm);
      if (priceToolRarity) params.set('rarity', priceToolRarity);
      if (priceToolLevelMin) params.set('levelMin', priceToolLevelMin);
      if (priceToolLevelMax) params.set('levelMax', priceToolLevelMax);
      if (priceToolProfession) params.set('profession', priceToolProfession);
      
      const res = await fetch(`/api/admin/market-intel/price-recommendation?${params.toString()}`, {
        credentials: 'include'
      });
      const data = await res.json();
      setPriceResult(data);
    } catch (err: any) {
      toast({ title: "Price lookup failed", description: err.message, variant: "destructive" });
    } finally {
      setPriceLoading(false);
    }
  };

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

      {/* Hero Price Tool */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Hero Price Tool
          </CardTitle>
          <CardDescription>Get buy/sell price recommendations based on recent market data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-6 lg:grid-cols-7">
            <div className="space-y-2">
              <Label>Realm</Label>
              <Select value={priceToolRealm} onValueChange={setPriceToolRealm}>
                <SelectTrigger data-testid="select-price-realm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cv">Crystalvale</SelectItem>
                  <SelectItem value="sd">Sundered Isles</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Class *</Label>
              <Select value={priceToolClass} onValueChange={setPriceToolClass}>
                <SelectTrigger data-testid="select-price-class">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {CLASS_OPTIONS.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Rarity</Label>
              <Select value={priceToolRarity} onValueChange={setPriceToolRarity}>
                <SelectTrigger data-testid="select-price-rarity">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  <SelectItem value="0">Common</SelectItem>
                  <SelectItem value="1">Uncommon</SelectItem>
                  <SelectItem value="2">Rare</SelectItem>
                  <SelectItem value="3">Legendary</SelectItem>
                  <SelectItem value="4">Mythic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Level Min</Label>
              <Input
                type="number"
                placeholder="1"
                value={priceToolLevelMin}
                onChange={(e) => setPriceToolLevelMin(e.target.value)}
                data-testid="input-price-level-min"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Level Max</Label>
              <Input
                type="number"
                placeholder="100"
                value={priceToolLevelMax}
                onChange={(e) => setPriceToolLevelMax(e.target.value)}
                data-testid="input-price-level-max"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Profession</Label>
              <Select value={priceToolProfession} onValueChange={setPriceToolProfession}>
                <SelectTrigger data-testid="select-price-profession">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  {PROFESSION_OPTIONS.map(p => (
                    <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button 
                onClick={fetchPriceRecommendation}
                disabled={priceLoading || !priceToolClass}
                className="w-full"
                data-testid="button-get-price"
              >
                {priceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                <span className="ml-2">Get Prices</span>
              </Button>
            </div>
          </div>

          {priceResult && (
            <div className="mt-6">
              {priceResult.recommendation ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        priceResult.recommendation.confidence === 'high' ? 'default' :
                        priceResult.recommendation.confidence === 'medium' ? 'secondary' : 'outline'
                      }>
                        {priceResult.recommendation.confidence.toUpperCase()} confidence
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Based on {priceResult.recommendation.sampleSize} recent sales
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Percent className="h-4 w-4" />
                      {priceResult.recommendation.priceVariation}% price variation
                    </div>
                  </div>
                  
                  <div className="grid gap-4 md:grid-cols-3">
                    {/* Buy Recommendations */}
                    <div className="rounded-md border border-green-500/30 bg-green-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <ShoppingCart className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">Buy Prices</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Great Deal</span>
                          <span className="font-bold text-green-500" data-testid="text-buy-low">
                            {priceResult.recommendation.buyLow} {priceResult.recommendation.token}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Fair Price</span>
                          <span className="font-medium" data-testid="text-buy-fair">
                            {priceResult.recommendation.buyFair} {priceResult.recommendation.token}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Market Price */}
                    <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Market Value</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Median</span>
                          <span className="font-bold text-blue-500" data-testid="text-market-median">
                            {priceResult.recommendation.marketMedian} {priceResult.recommendation.token}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Average</span>
                          <span className="font-medium" data-testid="text-market-avg">
                            {priceResult.recommendation.marketAverage} {priceResult.recommendation.token}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                          <span>Range</span>
                          <span>
                            {priceResult.recommendation.priceRange.min} - {priceResult.recommendation.priceRange.max}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Sell Recommendations */}
                    <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Tag className="h-4 w-4 text-orange-500" />
                        <span className="text-sm font-medium">Sell Prices</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Fair Price</span>
                          <span className="font-medium" data-testid="text-sell-fair">
                            {priceResult.recommendation.sellFair} {priceResult.recommendation.token}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Premium</span>
                          <span className="font-bold text-orange-500" data-testid="text-sell-high">
                            {priceResult.recommendation.sellHigh} {priceResult.recommendation.token}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Sales Table */}
                  {priceResult.recentSales && priceResult.recentSales.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium mb-2">Recent Similar Sales</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Hero</TableHead>
                            <TableHead>Class</TableHead>
                            <TableHead>Rarity</TableHead>
                            <TableHead>Level</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>When</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {priceResult.recentSales.map((sale, idx) => (
                            <TableRow key={`${sale.heroId}-${idx}`}>
                              <TableCell className="font-mono text-xs">{sale.heroId}</TableCell>
                              <TableCell>{sale.mainClass || '-'}</TableCell>
                              <TableCell>
                                {sale.rarity !== undefined && sale.rarity !== null && (
                                  <Badge className={`${RARITY_COLORS[sale.rarity]} text-xs`}>
                                    {RARITY_NAMES[sale.rarity]}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>{sale.level || '-'}</TableCell>
                              <TableCell className="font-medium">
                                {sale.price.toFixed(2)} {sale.token}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(sale.saleDate).toLocaleDateString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {priceResult.message || 'No similar sales found. Try broadening your criteria.'}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
