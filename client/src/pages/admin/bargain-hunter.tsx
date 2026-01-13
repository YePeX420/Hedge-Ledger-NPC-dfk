import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, ExternalLink, Loader2, TrendingUp, RefreshCw, Calculator } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface ProbabilityMap {
  [key: string]: number;
}

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
  cumulative: { [tts: string]: number };
  expected: number;
}

interface SniperPair {
  hero1: SniperHero;
  hero2: SniperHero;
  realm: string;
  targetProbability: number;
  totalCost: number;
  totalCostUsd: number;
  efficiency: number;
  costs?: {
    purchaseCost: number;
    summonTokenCost: number;
    tearCost: number;
    tearCount: number;
    bridgeCostUsd: number;
    heroesNeedingBridge: number;
    totalCost: number;
    totalCostUsd: number;
    tokenPriceUsd: number;
  };
  probabilities: {
    class: ProbabilityMap;
    subClass: ProbabilityMap;
    profession: ProbabilityMap;
  };
  tts?: TTSData;
}

interface SniperResult {
  ok: boolean;
  pairs: SniperPair[];
  totalHeroes: number;
  totalPairsScored: number;
  tokenPrices?: {
    CRYSTAL: number;
    JEWEL: number;
  };
}

export default function BargainHunter() {
  const [result, setResult] = useState<SniperResult | null>(null);
  const [realmFilter, setRealmFilter] = useState<string>("all");

  const ALL_CLASSES = ['Archer', 'Berserker', 'Knight', 'Priest', 'Seer', 'Warrior', 'Wizard', 'Pirate'];

  const searchMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/sniper/search", {
        targetClasses: ALL_CLASSES,
        targetProfessions: [],
        targetActiveSkills: [],
        targetPassiveSkills: [],
        realms: ["cv", "sd"],
        minRarity: 0,
        minSummonsRemaining: 1,
        minLevel: 1,
        summonType: "regular",
        searchMode: "tavern",
        bridgeFeeUsd: 0.5,
        sortBy: "skillScore",
        limit: 0
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.ok) {
        setResult(data);
      }
    }
  });

  useEffect(() => {
    searchMutation.mutate();
  }, []);

  const sortedPairs = useMemo(() => {
    if (!result?.pairs) return [];
    let filtered = [...result.pairs];
    if (realmFilter !== "all") {
      filtered = filtered.filter(pair => pair.realm === realmFilter);
    }
    return filtered.sort((a, b) => {
      const aEfficiency = (a.tts?.expected || 0) / (a.totalCostUsd || 1);
      const bEfficiency = (b.tts?.expected || 0) / (b.totalCostUsd || 1);
      return bEfficiency - aEfficiency;
    });
  }, [result?.pairs, realmFilter]);

  const getRarityName = (rarity: number) => 
    ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][rarity] || 'Unknown';

  const getRarityColor = (rarity: number) => {
    const colors = ['text-gray-400', 'text-green-400', 'text-blue-400', 'text-orange-400', 'text-purple-400'];
    return colors[rarity] || 'text-gray-400';
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
        <Button
          onClick={() => searchMutation.mutate()}
          disabled={searchMutation.isPending}
          variant="outline"
          data-testid="button-refresh"
        >
          {searchMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {searchMutation.isPending && !result && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-3" />
            <span>Finding best bargains...</span>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Scored {result.totalPairsScored?.toLocaleString()} pairs</span>
              <span>from {result.totalHeroes?.toLocaleString()} heroes</span>
              {realmFilter !== "all" && (
                <Badge variant="outline">
                  Showing {sortedPairs.length} {realmFilter === "cv" ? "Crystalvale" : "Sundered Isles"} pairs
                </Badge>
              )}
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

          <div className="grid gap-4">
            {sortedPairs.map((pair, idx) => {
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
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          Expected TTS: {Math.round(pair.tts?.expected || 0)}
                        </Badge>
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
                          {Object.entries(pair.tts.cumulative || {})
                            .sort(([a], [b]) => parseInt(b) - parseInt(a))
                            .slice(0, 6)
                            .map(([tts, prob]) => (
                              <Badge key={tts} variant="outline" className="text-xs">
                                TTS≥{tts}: {(prob * 100).toFixed(1)}%
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
        </div>
      )}
    </div>
  );
}
