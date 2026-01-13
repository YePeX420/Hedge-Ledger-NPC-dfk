import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, ExternalLink, Loader2, RefreshCw, Calculator, Clock } from "lucide-react";
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

interface TTSData {
  distribution: { [tts: string]: number };
  cumulativeProbs: { [tts: string]: number };
  expected: number;
}

interface SniperPair {
  hero1: SniperHero;
  hero2: SniperHero;
  realm: string;
  totalCost: number;
  totalCostUsd: number;
  efficiency: number;
  eliteChance?: number;
  exaltedChance?: number;
  tts?: TTSData;
}

interface CacheResult {
  ok: boolean;
  cached: boolean;
  isRefreshing?: boolean;
  pairs: SniperPair[];
  totalHeroes: number;
  totalPairsScored: number;
  tokenPrices?: { CRYSTAL: number; JEWEL: number };
  computedAt?: string;
  message?: string;
}

export default function BargainHunter() {
  const [realmFilter, setRealmFilter] = useState<string>("all");
  const [minEliteChance, setMinEliteChance] = useState<number>(0);
  const [minExaltedChance, setMinExaltedChance] = useState<number>(0);

  const { data: result, isLoading, refetch } = useQuery<CacheResult>({
    queryKey: ['/api/admin/bargain-cache', 'regular'],
    queryFn: async () => {
      const response = await fetch('/api/admin/bargain-cache?type=regular', { credentials: 'include' });
      return response.json();
    },
    refetchInterval: 60000,
    staleTime: 30000
  });

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
    if (minEliteChance > 0) {
      filtered = filtered.filter(pair => (pair.eliteChance || 0) >= minEliteChance);
    }
    if (minExaltedChance > 0) {
      filtered = filtered.filter(pair => (pair.exaltedChance || 0) >= minExaltedChance);
    }
    // Use pre-computed efficiency from cache (TTS per native token cost)
    // This avoids re-sorting and maintains cache ordering
    return filtered.sort((a, b) => (b.efficiency || 0) - (a.efficiency || 0));
  }, [result?.pairs, realmFilter, minEliteChance, minExaltedChance]);

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
          <Zap className="h-8 w-8 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold">Summoning Bargain Hunter</h1>
            <p className="text-muted-foreground">
              Best TTS-to-cost ratio pairs for regular summoning
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            disabled={refreshMutation.isPending || result?.isRefreshing}
            variant="outline"
            data-testid="button-refresh-cache"
          >
            {refreshMutation.isPending || result?.isRefreshing ? (
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
            <span>Loading cached bargains...</span>
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
                    <SelectItem value="1">1%+</SelectItem>
                    <SelectItem value="2">2%+</SelectItem>
                    <SelectItem value="3">3%+</SelectItem>
                    <SelectItem value="5">5%+</SelectItem>
                    <SelectItem value="10">10%+</SelectItem>
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
            </div>
          </div>

          <div className="grid gap-4">
            {sortedPairs.slice(0, 100).map((pair, idx) => {
              const ttsEfficiency = (pair.tts?.expected || 0) / (pair.totalCostUsd || 1);
              return (
                <Card key={idx} className="overflow-hidden" data-testid={`card-pair-${idx}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                          #{idx + 1}
                        </Badge>
                        <span className="font-semibold">TTS Efficiency: {ttsEfficiency.toFixed(4)}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">
                          Expected TTS: {(pair.tts?.expected || 0).toFixed(2)}
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
                    
                    {pair.tts && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium">TTS Probability Distribution</div>
                          <Link
                            href={`/admin/summoning-calculator?hero1=${pair.hero1.normalizedId}&hero2=${pair.hero2.normalizedId}`}
                            className="text-xs text-cyan-500 hover:text-cyan-400 flex items-center gap-1"
                            data-testid={`link-calc-${idx}`}
                          >
                            <Calculator className="h-3 w-3" />
                            View Full Summon Chances
                          </Link>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(pair.tts.cumulativeProbs || {})
                            .sort(([a], [b]) => parseInt(b) - parseInt(a))
                            .slice(0, 6)
                            .map(([tts, prob]) => (
                              <Badge key={tts} variant="outline" className="text-xs">
                                TTS≥{tts}: {(Number(prob)).toFixed(1)}%
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
                No pairs found. Try refreshing or check if the tavern indexer has data.
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
