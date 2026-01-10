import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Target, Filter, TrendingUp, DollarSign, ExternalLink, Loader2, Info } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ProbabilityMap {
  [key: string]: number;
}

interface SniperFilters {
  classes: string[];
  professions: string[];
  realms: string[];
  priceRange: { min: number; max: number };
  rarities: { id: number; name: string }[];
  levelRange?: { min: number; max: number };
  ttsRange?: { min: number; max: number };
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
}

interface SniperPair {
  hero1: SniperHero;
  hero2: SniperHero;
  realm: string;
  targetProbability: number;
  totalCost: number;
  efficiency: number;
  probabilities: {
    class: ProbabilityMap;
    subClass: ProbabilityMap;
    profession: ProbabilityMap;
  };
}

interface SniperResult {
  ok: boolean;
  pairs: SniperPair[];
  totalHeroes: number;
  totalPairsScored: number;
  searchParams: {
    targetClasses: string[];
    targetProfessions: string[];
    realms: string[];
    minSummonsRemaining: number;
  };
}

export default function SummonSniper() {
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedProfessions, setSelectedProfessions] = useState<string[]>([]);
  const [sniperRealms, setSniperRealms] = useState<string[]>(["cv", "sd"]);
  const [sniperMinSummons, setSniperMinSummons] = useState("0");
  const [sniperMinLevel, setSniperMinLevel] = useState("1");
  const [sniperMaxTTS, setSniperMaxTTS] = useState("");
  const [sniperResult, setSniperResult] = useState<SniperResult | null>(null);

  const { data: sniperFilters } = useQuery<{ ok: boolean; filters: SniperFilters }>({
    queryKey: ['/api/admin/sniper/filters']
  });

  const sniperMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/sniper/search", {
        targetClasses: selectedClasses,
        targetProfessions: selectedProfessions,
        realms: sniperRealms,
        minSummonsRemaining: parseInt(sniperMinSummons) || 0,
        minLevel: parseInt(sniperMinLevel) || 1,
        maxTTS: sniperMaxTTS ? parseFloat(sniperMaxTTS) : null,
        limit: 20
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.ok) {
        setSniperResult(data);
      }
    }
  });

  const handleSniperSearch = () => {
    if (selectedClasses.length === 0 && selectedProfessions.length === 0) return;
    sniperMutation.mutate();
  };

  const toggleClass = (cls: string) => {
    setSelectedClasses(prev => 
      prev.includes(cls) 
        ? prev.filter(c => c !== cls)
        : [...prev, cls]
    );
  };

  const toggleProfession = (prof: string) => {
    setSelectedProfessions(prev => 
      prev.includes(prof) 
        ? prev.filter(p => p !== prof)
        : [...prev, prof]
    );
  };

  const toggleRealm = (realm: string) => {
    setSniperRealms(prev => 
      prev.includes(realm) 
        ? prev.filter(r => r !== realm)
        : [...prev, realm]
    );
  };

  const getRarityName = (rarity: number) => 
    ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][rarity] || 'Unknown';

  const getRarityColor = (rarity: number) => {
    const colors = ['text-gray-400', 'text-green-400', 'text-blue-400', 'text-orange-400', 'text-purple-400'];
    return colors[rarity] || 'text-gray-400';
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3">
        <Target className="h-8 w-8" />
        <div>
          <h1 className="text-2xl font-bold">Summon Sniper</h1>
          <p className="text-muted-foreground">
            Find optimal hero pairs from the tavern to maximize breeding success for specific traits
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Search Filters
          </CardTitle>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>Select multiple classes/professions to find heroes that can breed ANY of the selected traits. Results automatically show cheapest pairs ranked by efficiency.</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Target Classes (select one or more)</Label>
            <div className="flex flex-wrap gap-2">
              {sniperFilters?.filters?.classes?.map(cls => (
                <Badge
                  key={cls}
                  variant={selectedClasses.includes(cls) ? "default" : "outline"}
                  className="cursor-pointer text-sm py-1 px-3"
                  onClick={() => toggleClass(cls)}
                  data-testid={`badge-class-${cls.toLowerCase()}`}
                >
                  {cls}
                </Badge>
              ))}
            </div>
            {selectedClasses.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Selected: {selectedClasses.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label>Target Professions (select one or more)</Label>
            <div className="flex flex-wrap gap-2">
              {sniperFilters?.filters?.professions?.map(prof => (
                <Badge
                  key={prof}
                  variant={selectedProfessions.includes(prof) ? "default" : "outline"}
                  className="cursor-pointer text-sm py-1 px-3"
                  onClick={() => toggleProfession(prof)}
                  data-testid={`badge-profession-${prof.toLowerCase()}`}
                >
                  {prof}
                </Badge>
              ))}
            </div>
            {selectedProfessions.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Selected: {selectedProfessions.join(", ")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minSummons">Min Summons Remaining</Label>
              <Input
                id="minSummons"
                type="number"
                value={sniperMinSummons}
                onChange={(e) => setSniperMinSummons(e.target.value)}
                placeholder="0"
                data-testid="input-min-summons"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="minLevel">Min Level</Label>
              <Input
                id="minLevel"
                type="number"
                value={sniperMinLevel}
                onChange={(e) => setSniperMinLevel(e.target.value)}
                placeholder="1"
                data-testid="input-min-level"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxTTS">Max TTS (optional)</Label>
              <Input
                id="maxTTS"
                type="number"
                value={sniperMaxTTS}
                onChange={(e) => setSniperMaxTTS(e.target.value)}
                placeholder="Any"
                data-testid="input-max-tts"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <Label>Realms:</Label>
            <div className="flex gap-2">
              <Badge
                variant={sniperRealms.includes("cv") ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleRealm("cv")}
                data-testid="badge-realm-cv"
              >
                Crystalvale
              </Badge>
              <Badge
                variant={sniperRealms.includes("sd") ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleRealm("sd")}
                data-testid="badge-realm-sd"
              >
                Sundered Isles
              </Badge>
            </div>
          </div>

          <Button
            onClick={handleSniperSearch}
            disabled={(selectedClasses.length === 0 && selectedProfessions.length === 0) || sniperMutation.isPending}
            data-testid="button-sniper-search"
          >
            {sniperMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Target className="h-4 w-4 mr-2" />
            )}
            Find Best Pairs
          </Button>

          {sniperMutation.isError && (
            <p className="text-destructive text-sm">
              Error: {(sniperMutation.error as Error)?.message || "Search failed"}
            </p>
          )}
        </CardContent>
      </Card>

      {sniperResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <TrendingUp className="h-5 w-5" />
              Best Hero Pairs
              <Badge variant="outline" className="ml-2">
                {sniperResult.pairs.length} pairs from {sniperResult.totalHeroes} heroes
              </Badge>
            </CardTitle>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Ranked by efficiency (probability per token spent)</p>
              {sniperResult.searchParams && (
                <p className="text-xs">
                  Searching for: {sniperResult.searchParams.targetClasses?.length > 0 && `Classes: ${sniperResult.searchParams.targetClasses.join(" OR ")}`}
                  {sniperResult.searchParams.targetClasses?.length > 0 && sniperResult.searchParams.targetProfessions?.length > 0 && " AND "}
                  {sniperResult.searchParams.targetProfessions?.length > 0 && `Professions: ${sniperResult.searchParams.targetProfessions.join(" OR ")}`}
                </p>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {sniperResult.pairs.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No matching hero pairs found. Try adjusting your filters.
              </p>
            ) : (
              <div className="space-y-4">
                {sniperResult.pairs.map((pair, idx) => (
                  <Card key={idx} className="bg-muted/30">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="secondary">#{idx + 1}</Badge>
                            <Badge variant="outline">{pair.realm === 'cv' ? 'Crystalvale' : 'Sundered Isles'}</Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                            <div className="space-y-1">
                              <div className="font-medium">Hero 1</div>
                              <div className={getRarityColor(pair.hero1.rarity)}>
                                {getRarityName(pair.hero1.rarity)} {pair.hero1.mainClass}
                              </div>
                              <div className="text-muted-foreground">
                                Lv{pair.hero1.level} Gen{pair.hero1.generation} | {pair.hero1.summonsRemaining} summons
                              </div>
                              <div className="flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />
                                {pair.hero1.price.toFixed(2)} {pair.hero1.token}
                              </div>
                              <a
                                href={`https://game.defikingdoms.com/marketplace/heroes/${pair.hero1.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                              >
                                View in Tavern <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>

                            <div className="space-y-1">
                              <div className="font-medium">Hero 2</div>
                              <div className={getRarityColor(pair.hero2.rarity)}>
                                {getRarityName(pair.hero2.rarity)} {pair.hero2.mainClass}
                              </div>
                              <div className="text-muted-foreground">
                                Lv{pair.hero2.level} Gen{pair.hero2.generation} | {pair.hero2.summonsRemaining} summons
                              </div>
                              <div className="flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />
                                {pair.hero2.price.toFixed(2)} {pair.hero2.token}
                              </div>
                              <a
                                href={`https://game.defikingdoms.com/marketplace/heroes/${pair.hero2.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                              >
                                View in Tavern <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                        </div>

                        <div className="text-right space-y-1">
                          <div className="text-lg font-bold text-green-400">
                            {pair.targetProbability.toFixed(1)}% chance
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Total: {pair.totalCost.toFixed(2)} {pair.hero1.token}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Efficiency: {pair.efficiency.toFixed(4)}
                          </div>
                        </div>
                      </div>

                      {pair.probabilities && (
                        <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-2 text-xs">
                          {pair.probabilities.class && Object.entries(pair.probabilities.class).slice(0, 3).map(([name, prob]) => (
                            <div key={name} className="flex justify-between">
                              <span className="text-muted-foreground">{name}:</span>
                              <span>{prob}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
