import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Beer, Filter, TrendingUp, ExternalLink, Loader2, Search, RefreshCw, X, Database } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const HIDDEN_HEROES_KEY = "tavern-sniper-hidden-heroes";

type SortOption = "levelValue" | "price" | "level" | "combatPower" | "value";

interface TavernHero {
  id: string;
  normalizedId: number;
  mainClassStr: string;
  subClassStr: string;
  professionStr: string;
  rarity: number;
  level: number;
  generation: number;
  summons: number;
  maxSummons: number;
  priceNative: number;
  nativeToken: string;
  tavern: string;
  strength: number;
  agility: number;
  intelligence: number;
  wisdom: number;
  luck: number;
  dexterity: number;
  vitality: number;
  endurance: number;
  traitScore: number;
  combatPower: number;
  active1?: string;
  active2?: string;
  passive1?: string;
  passive2?: string;
}

interface TavernListingsResponse {
  ok: boolean;
  crystalvale: TavernHero[];
  serendale: TavernHero[];
  prices?: { crystal: number; jewel: number };
  lastIndexed?: string;
}

const CLASSES = [
  "All", "Warrior", "Knight", "Thief", "Archer", "Priest", "Wizard", "Monk", "Pirate",
  "Berserker", "Seer", "Legionnaire", "Scholar", "Paladin", "DarkKnight", "Summoner",
  "Ninja", "Shapeshifter", "Bard", "Dragoon", "Sage", "SpellBow", "DreadKnight"
];

const PROFESSIONS = ["All", "mining", "gardening", "fishing", "foraging"];

const RARITIES = [
  { id: -1, name: "All" },
  { id: 0, name: "Common" },
  { id: 1, name: "Uncommon" },
  { id: 2, name: "Rare" },
  { id: 3, name: "Legendary" },
  { id: 4, name: "Mythic" }
];

const REALMS = ["All", "cv", "sd"];

function getRarityColor(rarity: number): string {
  const colors: Record<number, string> = {
    0: "bg-gray-500/20 text-gray-700 dark:text-gray-300",
    1: "bg-green-500/20 text-green-700 dark:text-green-300",
    2: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
    3: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
    4: "bg-purple-500/20 text-purple-700 dark:text-purple-300"
  };
  return colors[rarity] || colors[0];
}

function getRarityName(rarity: number): string {
  return RARITIES.find(r => r.id === rarity)?.name || "Common";
}

function formatPrice(price: number): string {
  if (price >= 1000) return `${(price / 1000).toFixed(1)}k`;
  if (price >= 1) return price.toFixed(1);
  return price.toFixed(3);
}

export default function TavernSniper() {
  const [filters, setFilters] = useState({
    mainClass: "All",
    profession: "All",
    realm: "All",
    minRarity: -1,
    minLevel: 1,
    maxLevel: 100,
    maxPrice: 1000
  });
  
  const [sortBy, setSortBy] = useState<SortOption>("levelValue");
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [hiddenHeroes, setHiddenHeroes] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(HIDDEN_HEROES_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [isReindexing, setIsReindexing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    localStorage.setItem(HIDDEN_HEROES_KEY, JSON.stringify(Array.from(hiddenHeroes)));
  }, [hiddenHeroes]);

  const hideHero = useCallback((heroId: string) => {
    setHiddenHeroes(prev => new Set(Array.from(prev).concat([heroId])));
  }, []);

  const clearHiddenHeroes = useCallback(() => {
    setHiddenHeroes(new Set());
  }, []);

  const buildQueryUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "200");
    if (filters.mainClass !== "All") params.set("mainClass", filters.mainClass);
    if (filters.minRarity >= 0) params.set("minRarity", filters.minRarity.toString());
    if (filters.minLevel > 1) params.set("minLevel", filters.minLevel.toString());
    if (filters.maxLevel < 100) params.set("maxLevel", filters.maxLevel.toString());
    if (filters.realm !== "All") params.set("realm", filters.realm);
    params.set("sortBy", "price");
    params.set("sortOrder", "asc");
    return `/api/admin/tavern-listings?${params.toString()}`;
  }, [filters.mainClass, filters.minRarity, filters.minLevel, filters.maxLevel, filters.realm]);

  const { data, isLoading, refetch } = useQuery<TavernListingsResponse>({
    queryKey: [buildQueryUrl],
    enabled: searchTriggered
  });

  const allHeroes = useMemo(() => {
    if (!data) return [];
    const heroes = [...(data.crystalvale || []), ...(data.serendale || [])];
    
    let filtered = heroes.filter(h => {
      if (hiddenHeroes.has(h.id)) return false;
      if (filters.profession !== "All" && h.professionStr !== filters.profession) return false;
      if (h.priceNative > filters.maxPrice) return false;
      return true;
    });

    switch (sortBy) {
      case "levelValue":
        return filtered.sort((a, b) => {
          const aValue = a.level / (a.priceNative || 1);
          const bValue = b.level / (b.priceNative || 1);
          return bValue - aValue;
        });
      case "price":
        return filtered.sort((a, b) => a.priceNative - b.priceNative);
      case "level":
        return filtered.sort((a, b) => b.level - a.level);
      case "combatPower":
        return filtered.sort((a, b) => b.combatPower - a.combatPower);
      case "value":
        return filtered.sort((a, b) => {
          const aValue = a.combatPower / (a.priceNative || 1);
          const bValue = b.combatPower / (b.priceNative || 1);
          return bValue - aValue;
        });
      default:
        return filtered;
    }
  }, [data, filters.profession, filters.maxPrice, sortBy, hiddenHeroes]);

  const handleSearch = () => {
    setSearchTriggered(true);
    if (searchTriggered) {
      refetch();
    }
  };

  const handleReindex = async () => {
    setIsReindexing(true);
    try {
      const response = await apiRequest("POST", "/api/admin/tavern-indexer/trigger");
      const result = await response.json();
      if (result.ok) {
        toast({
          title: "Re-indexing Started",
          description: "Fetching fresh listings from blockchain..."
        });
        
        const pollStatus = async () => {
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000));
            try {
              const statusRes = await fetch("/api/admin/tavern-indexer/status", { credentials: "include" });
              const status = await statusRes.json();
              if (!status.isRunning) {
                clearHiddenHeroes();
                toast({
                  title: "Re-indexing Complete",
                  description: `Indexed ${status.crystalvaleCount || 0} CV + ${status.serendaleCount || 0} SD heroes. Hidden list cleared.`
                });
                refetch();
                return;
              }
            } catch {
              break;
            }
          }
          toast({
            title: "Re-indexing Timeout",
            description: "Indexing is still running. Refresh manually when complete.",
            variant: "destructive"
          });
        };
        
        await pollStatus();
      } else {
        toast({
          title: "Re-indexing Failed",
          description: result.error || "Unknown error",
          variant: "destructive"
        });
      }
    } catch (err) {
      toast({
        title: "Re-indexing Failed",
        description: "Could not connect to indexer",
        variant: "destructive"
      });
    } finally {
      setIsReindexing(false);
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-4" data-testid="tavern-sniper-page">
      <div className="flex items-center gap-3">
        <Beer className="h-8 w-8 text-amber-600" />
        <div>
          <h1 className="text-2xl font-bold">Tavern Sniper</h1>
          <p className="text-muted-foreground text-sm">Find the best hero deals in the marketplace</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            Search Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Class</Label>
              <Select value={filters.mainClass} onValueChange={(v) => setFilters(f => ({ ...f, mainClass: v }))}>
                <SelectTrigger className="h-9" data-testid="select-class">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLASSES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Profession</Label>
              <Select value={filters.profession} onValueChange={(v) => setFilters(f => ({ ...f, profession: v }))}>
                <SelectTrigger className="h-9" data-testid="select-profession">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROFESSIONS.map(p => (
                    <SelectItem key={p} value={p}>{p === "All" ? "All" : p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Realm</Label>
              <Select value={filters.realm} onValueChange={(v) => setFilters(f => ({ ...f, realm: v }))}>
                <SelectTrigger className="h-9" data-testid="select-realm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Realms</SelectItem>
                  <SelectItem value="cv">Crystalvale</SelectItem>
                  <SelectItem value="sd">Serendale</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Min Rarity</Label>
              <Select value={filters.minRarity.toString()} onValueChange={(v) => setFilters(f => ({ ...f, minRarity: parseInt(v) }))}>
                <SelectTrigger className="h-9" data-testid="select-rarity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RARITIES.map(r => (
                    <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Min Level</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={filters.minLevel}
                onChange={(e) => setFilters(f => ({ ...f, minLevel: parseInt(e.target.value) || 1 }))}
                className="h-9"
                data-testid="input-min-level"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Max Price</Label>
              <Input
                type="number"
                min={0}
                value={filters.maxPrice}
                onChange={(e) => setFilters(f => ({ ...f, maxPrice: parseFloat(e.target.value) || 1000 }))}
                className="h-9"
                data-testid="input-max-price"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button onClick={handleSearch} disabled={isLoading} data-testid="button-search">
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Search Tavern
            </Button>

            {searchTriggered && (
              <>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh">
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={handleReindex} disabled={isLoading || isReindexing} data-testid="button-reindex">
                  {isReindexing ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Database className="h-4 w-4 mr-1" />
                  )}
                  Re-index
                </Button>
                {hiddenHeroes.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearHiddenHeroes} data-testid="button-clear-hidden">
                    <X className="h-4 w-4 mr-1" />
                    Clear {hiddenHeroes.size} Hidden
                  </Button>
                )}
              </>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-muted-foreground">Sort by:</span>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-[150px] h-8" data-testid="select-sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="levelValue">Level/Cost</SelectItem>
                  <SelectItem value="price">Lowest Price</SelectItem>
                  <SelectItem value="level">Highest Level</SelectItem>
                  <SelectItem value="combatPower">Combat Power</SelectItem>
                  <SelectItem value="value">Power/Cost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!searchTriggered && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Beer className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Set your filters and click "Search Tavern" to find heroes</p>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin" />
            <p className="text-muted-foreground">Searching the tavern...</p>
          </CardContent>
        </Card>
      )}

      {searchTriggered && !isLoading && data && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Found {allHeroes.length} heroes
              {data.lastIndexed && (
                <span className="ml-2">
                  (indexed {new Date(data.lastIndexed).toLocaleString()})
                </span>
              )}
            </p>
          </div>

          {allHeroes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>No heroes match your filters. Try adjusting your search criteria.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {allHeroes.slice(0, 50).map((hero, idx) => (
                <HeroCard key={hero.id} hero={hero} rank={idx + 1} sortBy={sortBy} onHide={hideHero} />
              ))}
            </div>
          )}

          {allHeroes.length > 50 && (
            <p className="text-center text-sm text-muted-foreground">
              Showing top 50 of {allHeroes.length} results
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function HeroCard({ hero, rank, sortBy, onHide }: { hero: TavernHero; rank: number; sortBy: SortOption; onHide: (id: string) => void }) {
  const levelValue = hero.level / (hero.priceNative || 1);
  const powerValue = hero.combatPower / (hero.priceNative || 1);
  
  const viewHeroUrl = `https://app.defikingdoms.com/heroes/${hero.id}`;
  
  return (
    <Card className="hover-elevate" data-testid={`hero-card-${hero.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-muted-foreground">#{rank}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{hero.mainClassStr}</span>
                {hero.subClassStr && (
                  <span className="text-xs text-muted-foreground">/ {hero.subClassStr}</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>#{hero.normalizedId} | {hero.tavern === "cv" ? "CV" : "SD"}</span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-5 w-5 ml-1 text-muted-foreground hover:text-destructive" 
                  onClick={() => onHide(hero.id)}
                  title="Hide hero (mark as bought)"
                  data-testid={`button-hide-${hero.id}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
          <Badge className={getRarityColor(hero.rarity)}>
            {getRarityName(hero.rarity)}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-2 text-sm mb-3">
          <div className="text-center p-2 bg-muted/50 rounded">
            <div className="text-xs text-muted-foreground">Level</div>
            <div className="font-bold">{hero.level}</div>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded">
            <div className="text-xs text-muted-foreground">Price</div>
            <div className="font-bold">{formatPrice(hero.priceNative)}</div>
            <div className="text-xs text-muted-foreground">{hero.nativeToken}</div>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded">
            <div className="text-xs text-muted-foreground">
              {sortBy === "levelValue" ? "Lvl/$" : sortBy === "value" ? "Pwr/$" : "Power"}
            </div>
            <div className="font-bold text-green-600 dark:text-green-400">
              {sortBy === "levelValue" ? levelValue.toFixed(2) : 
               sortBy === "value" ? powerValue.toFixed(1) :
               hero.combatPower}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          <Badge variant="outline" className="text-xs">
            Gen {hero.generation}
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {hero.professionStr}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {hero.summons}/{hero.maxSummons} summons
          </Badge>
          {hero.traitScore > 0 && (
            <Badge variant="outline" className="text-xs">
              TS {hero.traitScore}
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => window.open(viewHeroUrl, "_blank")}
            data-testid={`button-view-${hero.id}`}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            View Hero
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
