import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, ExternalLink, Loader2, RefreshCw, Calculator, Clock } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SniperHero {
  id: string;
  normalizedId: number;
  mainClass: string;
  subClass: string | null;
  profession: string;
  rarity: number;
  level: number;
  generation: number;
  summonsRemaining: number;
  price: number;
  token: string;
  realm: string;
}

interface TSData {
  distribution: { [ts: string]: number };
  cumulativeProbs: { [ts: string]: number };
  expected: number;
}

interface CostBreakdown {
  purchaseCost: number;
  summonTokenCost: number;
  tearCount: number;
  tearCost: number;
}

interface SniperPair {
  hero1: SniperHero;
  hero2: SniperHero;
  realm: string;
  costs?: CostBreakdown;
  totalCost: number;
  totalCostUsd: number;
  efficiency: number;
  eliteChance?: number;
  exaltedChance?: number;
  maxSlotElite?: number;
  maxSlotExalted?: number;
  ts?: TSData;
}

interface CacheResult {
  ok: boolean;
  cached: boolean;
  isBuilding?: boolean;
  pairs: SniperPair[];
  totalHeroes: number;
  totalPairsScored: number;
  tokenPrices?: { CRYSTAL: number; JEWEL: number };
  computedAt?: string;
  message?: string;
}

interface CacheStatus {
  ok: boolean;
  isBuilding: boolean;
  lastRun: string | null;
  error: string | null;
  regular: { ready: { totalHeroes: number; totalPairsScored: number; computedAt: string } | null };
  dark: { ready: { totalHeroes: number; totalPairsScored: number; computedAt: string } | null };
}

type SortOption = "efficiency" | "tsPerToken" | "lowestCost" | "eliteChance" | "exaltedChance" | "maxSlotExalted" | "expectedTS";

export default function DarkBargainHunter() {
  const [realmFilter, setRealmFilter] = useState<string>("all");
  const [minRarityFilter, setMinRarityFilter] = useState<number>(0);
  const [minLevelFilter, setMinLevelFilter] = useState<number>(1);
  const [minSummonsRemaining, setMinSummonsRemaining] = useState<number>(0);
  const [minEliteChance, setMinEliteChance] = useState<number>(0);
  const [minExaltedChance, setMinExaltedChance] = useState<number>(0);
  const [minMaxSlotExalted, setMinMaxSlotExalted] = useState<number>(0);
  const [sortBy, setSortBy] = useState<SortOption>("efficiency");

  const { data: result, isLoading, refetch } = useQuery<CacheResult>({
    queryKey: ['/api/admin/bargain-cache', 'dark'],
    queryFn: async () => {
      const response = await fetch('/api/admin/bargain-cache?type=dark', { credentials: 'include' });
      return response.json();
    },
    refetchInterval: 60000,
    staleTime: 30000
  });
  
  const { data: cacheStatus } = useQuery<CacheStatus>({
    queryKey: ['/api/admin/bargain-cache/status'],
    queryFn: async () => {
      const response = await fetch('/api/admin/bargain-cache/status', { credentials: 'include' });
      return response.json();
    },
    refetchInterval: (query) => query.state.data?.isBuilding ? 3000 : 30000,
    staleTime: 2000
  });
  
  const isBuilding = cacheStatus?.isBuilding || result?.isBuilding;

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/bargain-cache/refresh");
      return response.json();
    },
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/bargain-cache'] });
      }, 5000);
    }
  });

  const sortedPairs = useMemo(() => {
    if (!result?.pairs) return [];
    let filtered = [...result.pairs];
    if (realmFilter !== "all") {
      filtered = filtered.filter(pair => pair.realm === realmFilter);
    }
    if (minRarityFilter > 0) {
      filtered = filtered.filter(pair => 
        pair.hero1.rarity >= minRarityFilter && pair.hero2.rarity >= minRarityFilter
      );
    }
    if (minLevelFilter > 1) {
      filtered = filtered.filter(pair => 
        pair.hero1.level >= minLevelFilter && pair.hero2.level >= minLevelFilter
      );
    }
    if (minSummonsRemaining > 0) {
      filtered = filtered.filter(pair => 
        pair.hero1.summonsRemaining >= minSummonsRemaining && 
        pair.hero2.summonsRemaining >= minSummonsRemaining
      );
    }
    if (minEliteChance > 0) {
      filtered = filtered.filter(pair => (pair.eliteChance || 0) >= minEliteChance);
    }
    if (minExaltedChance > 0) {
      filtered = filtered.filter(pair => (pair.exaltedChance || 0) >= minExaltedChance);
    }
    if (minMaxSlotExalted > 0) {
      filtered = filtered.filter(pair => (pair.maxSlotExalted || 0) >= minMaxSlotExalted);
    }
    // Sort based on selected option
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "tsPerToken":
          const aTsPerToken = (a.ts?.expected || 0) / (a.totalCost || 1);
          const bTsPerToken = (b.ts?.expected || 0) / (b.totalCost || 1);
          return bTsPerToken - aTsPerToken;
        case "lowestCost":
          return (a.totalCost || 0) - (b.totalCost || 0);
        case "eliteChance":
          return (b.eliteChance || 0) - (a.eliteChance || 0);
        case "exaltedChance":
          return (b.exaltedChance || 0) - (a.exaltedChance || 0);
        case "maxSlotExalted":
          return (b.maxSlotExalted || 0) - (a.maxSlotExalted || 0);
        case "expectedTS":
          return (b.ts?.expected || 0) - (a.ts?.expected || 0);
        case "efficiency":
        default:
          return (b.efficiency || 0) - (a.efficiency || 0);
      }
    });
  }, [result?.pairs, realmFilter, minRarityFilter, minLevelFilter, minSummonsRemaining, minEliteChance, minExaltedChance, minMaxSlotExalted, sortBy]);

  const getRarityName = (rarity: number) => 
    ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][rarity] || 'Unknown';

  const getRarityColor = (rarity: number) => {
    const colors = ['text-gray-400', 'text-green-400', 'text-blue-400', 'text-orange-400', 'text-purple-400'];
    return colors[rarity] || 'text-gray-400';
  };

  const formatCacheTime = (dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m ago`;
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="h-8 w-8 text-purple-500" />
          <div>
            <h1 className="text-2xl font-bold">Dark Summoning Bargain Hunter</h1>
            <p className="text-muted-foreground">
              Best TS-to-cost ratio pairs for dark summoning (1/4 token cost, burns both heroes)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isBuilding && (
            <Badge variant="secondary" className="flex items-center gap-1 bg-amber-500/20 text-amber-400 border-amber-500/30">
              <Loader2 className="h-3 w-3 animate-spin" />
              Rebuilding...
            </Badge>
          )}
          <Button
            onClick={() => refetch()}
            disabled={isLoading}
            variant="outline"
            size="sm"
            data-testid="button-reload"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || isBuilding}
            variant="outline"
            data-testid="button-refresh-cache"
          >
            {refreshMutation.isPending || isBuilding ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Rebuild Cache
          </Button>
        </div>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-3" />
            <span>Loading cached dark summoning bargains...</span>
          </CardContent>
        </Card>
      )}

      {!isLoading && !result?.cached && (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              {result?.message || 'Cache not available. Click "Rebuild Cache" to compute bargain pairs.'}
            </p>
            <Button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
              {refreshMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Build Cache Now
            </Button>
          </CardContent>
        </Card>
      )}

      {result?.cached && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Scored {result.totalPairsScored?.toLocaleString()} pairs</span>
              <span>from {result.totalHeroes?.toLocaleString()} heroes</span>
              <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30">
                Dark Summon Mode
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatCacheTime(result.computedAt)}
              </Badge>
              {realmFilter !== "all" && (
                <Badge variant="outline">
                  Showing {sortedPairs.length} {realmFilter === "cv" ? "Crystalvale" : "Sundered Isles"} pairs
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Min Elite%:</span>
                <Select value={String(minEliteChance)} onValueChange={(v) => setMinEliteChance(Number(v))}>
                  <SelectTrigger className="w-24" data-testid="select-elite-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Any</SelectItem>
                    <SelectItem value="10">10%+</SelectItem>
                    <SelectItem value="20">20%+</SelectItem>
                    <SelectItem value="30">30%+</SelectItem>
                    <SelectItem value="40">40%+</SelectItem>
                    <SelectItem value="50">50%+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Min Exalted%:</span>
                <Select value={String(minExaltedChance)} onValueChange={(v) => setMinExaltedChance(Number(v))}>
                  <SelectTrigger className="w-24" data-testid="select-exalted-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Any</SelectItem>
                    <SelectItem value="0.1">0.1%+</SelectItem>
                    <SelectItem value="0.25">0.25%+</SelectItem>
                    <SelectItem value="0.5">0.5%+</SelectItem>
                    <SelectItem value="1">1%+</SelectItem>
                    <SelectItem value="2">2%+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Best Slot%:</span>
                <Select value={String(minMaxSlotExalted)} onValueChange={(v) => setMinMaxSlotExalted(Number(v))}>
                  <SelectTrigger className="w-24" data-testid="select-max-slot-exalted-filter-dark">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Any</SelectItem>
                    <SelectItem value="1">1%+</SelectItem>
                    <SelectItem value="3">3%+</SelectItem>
                    <SelectItem value="5">5%+</SelectItem>
                    <SelectItem value="10">10%+</SelectItem>
                    <SelectItem value="12">12%+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Min Rarity:</span>
                <Select value={String(minRarityFilter)} onValueChange={(v) => setMinRarityFilter(Number(v))}>
                  <SelectTrigger className="w-32" data-testid="select-rarity-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Any</SelectItem>
                    <SelectItem value="1">Uncommon+</SelectItem>
                    <SelectItem value="2">Rare+</SelectItem>
                    <SelectItem value="3">Legendary+</SelectItem>
                    <SelectItem value="4">Mythic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Min Level:</span>
                <Select value={String(minLevelFilter)} onValueChange={(v) => setMinLevelFilter(Number(v))}>
                  <SelectTrigger className="w-24" data-testid="select-level-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Any</SelectItem>
                    <SelectItem value="5">5+</SelectItem>
                    <SelectItem value="10">10+</SelectItem>
                    <SelectItem value="15">15+</SelectItem>
                    <SelectItem value="20">20+</SelectItem>
                    <SelectItem value="30">30+</SelectItem>
                    <SelectItem value="50">50+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Min Summons:</span>
                <Select value={String(minSummonsRemaining)} onValueChange={(v) => setMinSummonsRemaining(Number(v))}>
                  <SelectTrigger className="w-24" data-testid="select-summons-filter-dark">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Any</SelectItem>
                    <SelectItem value="1">1+</SelectItem>
                    <SelectItem value="2">2+</SelectItem>
                    <SelectItem value="3">3+</SelectItem>
                    <SelectItem value="5">5+</SelectItem>
                    <SelectItem value="10">10+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Realm:</span>
                <Select value={realmFilter} onValueChange={setRealmFilter}>
                  <SelectTrigger className="w-40" data-testid="select-realm-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Realms</SelectItem>
                    <SelectItem value="cv">Crystalvale</SelectItem>
                    <SelectItem value="sd">Sundered Isles</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Sort by:</span>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-40" data-testid="select-sort-by">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efficiency">TS Efficiency</SelectItem>
                    <SelectItem value="tsPerToken">TS/Token Cost</SelectItem>
                    <SelectItem value="lowestCost">Lowest Cost</SelectItem>
                    <SelectItem value="expectedTS">Expected TS</SelectItem>
                    <SelectItem value="eliteChance">Elite Chance</SelectItem>
                    <SelectItem value="exaltedChance">Exalted Chance</SelectItem>
                    <SelectItem value="maxSlotExalted">Best Slot Exalted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {sortedPairs.slice(0, 100).map((pair, idx) => {
              return (
                <Card key={idx} className="overflow-hidden" data-testid={`card-pair-${idx}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30">
                          #{idx + 1}
                        </Badge>
                        <span className="font-semibold">TS/JEWEL: {((pair.efficiency || 0) * 100).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">
                          Expected TS: {(pair.ts?.expected || 0).toFixed(2)}
                        </Badge>
                        {(pair.eliteChance || 0) > 0 && (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                            Elite: {pair.eliteChance?.toFixed(1)}%
                          </Badge>
                        )}
                        {(pair.exaltedChance || 0) > 0 && (
                          <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30">
                            Exalted: {pair.exaltedChance?.toFixed(1)}%
                          </Badge>
                        )}
                        {(pair.maxSlotExalted || 0) > 0 && (
                          <Badge variant="outline" className="bg-pink-500/10 text-pink-600 border-pink-500/30">
                            Best Slot: {pair.maxSlotExalted?.toFixed(1)}%
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-green-600">
                          ${pair.totalCostUsd?.toFixed(2)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                      {[pair.hero1, pair.hero2].map((hero, i) => (
                        <div key={i} className="p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center justify-between mb-2">
                            <a
                              href={`https://game.defikingdoms.com/marketplace/hero/${hero.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-sm hover:underline flex items-center gap-1"
                              data-testid={`link-hero-${hero.id}`}
                            >
                              #{hero.normalizedId}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <Badge variant="outline" className={getRarityColor(hero.rarity)}>
                              {getRarityName(hero.rarity)}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Class:</span>{' '}
                              <span className="font-medium">{hero.mainClass}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Prof:</span>{' '}
                              <span className="font-medium">{hero.profession}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Level:</span>{' '}
                              <span className="font-medium">{hero.level}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Gen:</span>{' '}
                              <span className="font-medium">{hero.generation}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Summons:</span>{' '}
                              <span className="font-medium">{hero.summonsRemaining}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Price:</span>{' '}
                              <span className="font-medium">{hero.price} {hero.token}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Cost Breakdown - Dark summoning has no tears */}
                    {pair.costs && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="text-sm font-medium mb-2 text-muted-foreground">Cost Breakdown (Dark Summon)</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                          <div className="flex items-center justify-between bg-muted/30 px-2 py-1 rounded">
                            <span className="text-muted-foreground">Heroes:</span>
                            <span className="font-medium">{pair.costs.purchaseCost.toFixed(1)} {pair.hero1.token}</span>
                          </div>
                          <div className="flex items-center justify-between bg-muted/30 px-2 py-1 rounded">
                            <span className="text-muted-foreground">Summon (1/4):</span>
                            <span className="font-medium">{pair.costs.summonTokenCost.toFixed(1)} {pair.hero1.token}</span>
                          </div>
                          <div className="flex items-center justify-between bg-purple-500/10 px-2 py-1 rounded">
                            <span className="text-muted-foreground">Total:</span>
                            <span className="font-medium text-purple-400">{pair.totalCost.toFixed(1)} {pair.hero1.token}</span>
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Dark summoning: No tears required
                        </div>
                      </div>
                    )}
                    
                    {pair.ts && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium">TS Probability Distribution</div>
                          <Link
                            href={`/admin/summoning-calculator?hero1=${pair.hero1.normalizedId}&hero2=${pair.hero2.normalizedId}`}
                            className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                            data-testid={`link-calc-${idx}`}
                          >
                            <Calculator className="h-3 w-3" />
                            View Full Summon Chances
                          </Link>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(pair.ts.cumulativeProbs || {})
                            .sort(([a], [b]) => parseInt(b) - parseInt(a))
                            .slice(0, 6)
                            .map(([ts, prob]) => (
                              <Badge key={ts} variant="outline" className="text-xs">
                                TS≥{ts}: {(Number(prob)).toFixed(1)}%
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {sortedPairs.length === 0 && (
            <Card>
              <CardContent className="text-center py-12 text-muted-foreground">
                No pairs found. Try adjusting filters or check if the tavern indexer has data.
              </CardContent>
            </Card>
          )}

          {sortedPairs.length > 100 && (
            <p className="text-center text-sm text-muted-foreground">
              Showing top 100 of {sortedPairs.length} pairs
            </p>
          )}
        </div>
      )}
    </div>
  );
}
