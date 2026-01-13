import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Target, Filter, TrendingUp, ExternalLink, Loader2, Info, User, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";

type SearchMode = "tavern" | "myHero";
type SummonType = "regular" | "dark";

interface ProbabilityMap {
  [key: string]: number;
}

interface SniperFilters {
  classes: string[];
  professions: string[];
  activeSkills: string[];
  passiveSkills: string[];
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
  realm: string;
}

interface TTSData {
  distribution: { [tts: string]: number };
  cumulative: { [tts: string]: number };
  expected: number;
  slotTiers?: {
    active1: { [tier: string]: number };
    active2: { [tier: string]: number };
    passive1: { [tier: string]: number };
    passive2: { [tier: string]: number };
  };
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
    active1?: ProbabilityMap;
    active2?: ProbabilityMap;
    passive1?: ProbabilityMap;
    passive2?: ProbabilityMap;
  };
  tts?: TTSData;
}

interface UserHeroInfo {
  id: string;
  mainClass: string;
  subClass: string;
  profession: string;
  rarity: number;
  level: number;
  generation: number;
  summonsRemaining: number;
  realm: string;
  token: string;
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
  searchParams: {
    targetClasses: string[];
    targetProfessions: string[];
    targetActiveSkills: string[];
    targetPassiveSkills: string[];
    realms: string[];
    minSummonsRemaining: number;
    summonType?: string;
    searchMode?: string;
  };
  userHero?: UserHeroInfo | null;
  ttsMetadata?: {
    maxExpectedTTS: number;
    maxCumulativeByTarget: Record<number, number>;
    requestedTarget: number | null;
    requestedMinProb: number | null;
  };
}

const RARITIES = [
  { id: 0, name: 'Common' },
  { id: 1, name: 'Uncommon' },
  { id: 2, name: 'Rare' },
  { id: 3, name: 'Legendary' },
  { id: 4, name: 'Mythic' }
];

export default function SummonSniper() {
  const [selectedClasses, setSelectedClasses] = useState<string[]>(['Archer', 'Berserker', 'Knight', 'Priest', 'Seer', 'Warrior', 'Wizard', 'Pirate']);
  const [selectedProfessions, setSelectedProfessions] = useState<string[]>([]);
  const [selectedActiveSkills, setSelectedActiveSkills] = useState<string[]>([]);
  const [selectedPassiveSkills, setSelectedPassiveSkills] = useState<string[]>([]);
  const [sniperRealms, setSniperRealms] = useState<string[]>(["cv", "sd"]);
  const [minRarity, setMinRarity] = useState(0);
  const [sniperMinSummons, setSniperMinSummons] = useState("0");
  const [sniperMinLevel, setSniperMinLevel] = useState("1");
  const [targetTTSValue, setTargetTTSValue] = useState("");
  const [minTTSProbability, setMinTTSProbability] = useState("");
  const [minEliteChance, setMinEliteChance] = useState("");
  const [minExaltedChance, setMinExaltedChance] = useState("");
  const [sniperResult, setSniperResult] = useState<SniperResult | null>(null);
  
  // New state for search mode and summon type
  const [searchMode, setSearchMode] = useState<SearchMode>("tavern");
  const [summonType, setSummonType] = useState<SummonType>("regular");
  const [myHeroId, setMyHeroId] = useState("");
  const [bridgeFeeUsd, setBridgeFeeUsd] = useState("0.50"); // Estimated bridge fee per hero in USD
  const [sortBy, setSortBy] = useState<"efficiency" | "chance" | "price" | "skillScore">("efficiency");

  const { data: sniperFilters } = useQuery<{ ok: boolean; filters: SniperFilters }>({
    queryKey: ['/api/admin/sniper/filters']
  });

  const sniperMutation = useMutation({
    mutationFn: async () => {
      // For dark summons, any summons remaining is fine (more = higher rarity chance)
      const effectiveMinSummons = parseInt(sniperMinSummons) || 0;
      const effectiveMaxSummons = undefined;  // No max restriction
      
      const response = await apiRequest("POST", "/api/admin/sniper/search", {
        targetClasses: selectedClasses,
        targetProfessions: selectedProfessions,
        targetActiveSkills: selectedActiveSkills,
        targetPassiveSkills: selectedPassiveSkills,
        realms: sniperRealms,
        minRarity,
        minSummonsRemaining: effectiveMinSummons,
        maxSummonsRemaining: effectiveMaxSummons,
        minLevel: parseInt(sniperMinLevel) || 1,
        targetTTSValue: targetTTSValue ? parseInt(targetTTSValue) : null,
        minTTSProbability: minTTSProbability ? parseFloat(minTTSProbability) : null,
        minEliteChance: minEliteChance ? parseFloat(minEliteChance) : null,
        minExaltedChance: minExaltedChance ? parseFloat(minExaltedChance) : null,
        summonType,
        searchMode,
        myHeroId: searchMode === "myHero" ? myHeroId : undefined,
        bridgeFeeUsd: parseFloat(bridgeFeeUsd) || 0,
        sortBy,
        limit: 50
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
    // Need at least one trait filter
    if (selectedClasses.length === 0 && selectedProfessions.length === 0 && selectedActiveSkills.length === 0 && selectedPassiveSkills.length === 0) return;
    // In myHero mode, need a hero ID
    if (searchMode === "myHero" && !myHeroId.trim()) return;
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

  const toggleActiveSkill = (skill: string) => {
    setSelectedActiveSkills(prev => 
      prev.includes(skill) 
        ? prev.filter(s => s !== skill)
        : [...prev, skill]
    );
  };

  const togglePassiveSkill = (skill: string) => {
    setSelectedPassiveSkills(prev => 
      prev.includes(skill) 
        ? prev.filter(s => s !== skill)
        : [...prev, skill]
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

  // Sort pairs based on selected sort option
  const sortedPairs = useMemo(() => {
    if (!sniperResult?.pairs) return [];
    const pairs = [...sniperResult.pairs];
    switch (sortBy) {
      case "chance":
        return pairs.sort((a, b) => b.targetProbability - a.targetProbability);
      case "price":
        return pairs.sort((a, b) => a.totalCostUsd - b.totalCostUsd);
      case "skillScore":
        return pairs.sort((a, b) => (b.tts?.expected || 0) - (a.tts?.expected || 0));
      case "efficiency":
      default:
        return pairs.sort((a, b) => b.efficiency - a.efficiency);
    }
  }, [sniperResult?.pairs, sortBy]);

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
          {/* Search Mode Toggle */}
          <div className="space-y-3">
            <Label>Search Mode</Label>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={searchMode === "tavern" ? "default" : "outline"}
                className={`cursor-pointer text-sm py-1.5 px-4 transition-colors ${
                  searchMode === "tavern" 
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background" 
                    : "hover:bg-muted"
                }`}
                onClick={() => setSearchMode("tavern")}
                data-testid="badge-mode-tavern"
              >
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Two from Tavern
              </Badge>
              <Badge
                variant={searchMode === "myHero" ? "default" : "outline"}
                className={`cursor-pointer text-sm py-1.5 px-4 transition-colors ${
                  searchMode === "myHero" 
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background" 
                    : "hover:bg-muted"
                }`}
                onClick={() => setSearchMode("myHero")}
                data-testid="badge-mode-myhero"
              >
                <User className="h-3.5 w-3.5 mr-1.5" />
                Pair for My Hero
              </Badge>
            </div>
            {searchMode === "myHero" && (
              <div className="mt-2">
                <Label htmlFor="myHeroId">Your Hero ID</Label>
                <Input
                  id="myHeroId"
                  type="text"
                  value={myHeroId}
                  onChange={(e) => setMyHeroId(e.target.value)}
                  placeholder="Enter your hero ID (e.g., 1000000123456)"
                  className="mt-1 max-w-md"
                  data-testid="input-my-hero-id"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Find the best tavern hero to pair with your existing hero
                </p>
              </div>
            )}
          </div>

          {/* Summon Type Toggle */}
          <div className="space-y-3">
              <Label>Summon Type</Label>
              <div className="flex gap-2">
                <Badge
                  variant={summonType === "regular" ? "default" : "outline"}
                  className={`cursor-pointer text-sm py-1.5 px-4 transition-colors ${
                    summonType === "regular" 
                      ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background" 
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setSummonType("regular")}
                  data-testid="badge-summon-regular"
                >
                  Regular Summon
                </Badge>
                <Badge
                  variant={summonType === "dark" ? "default" : "outline"}
                  className={`cursor-pointer text-sm py-1.5 px-4 transition-colors ${
                    summonType === "dark" 
                      ? "bg-purple-600 text-white ring-2 ring-purple-500 ring-offset-1 ring-offset-background" 
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setSummonType("dark")}
                  data-testid="badge-summon-dark"
                >
                  Dark Summon
                </Badge>
              </div>
            <p className="text-xs text-muted-foreground">
              {summonType === "regular" 
                ? "Standard summoning with full token cost. Heroes must have summons remaining."
                : "Dark summoning burns both heroes (1/4 cost). More summons = higher rarity chance."}
            </p>
          </div>

          <div className="space-y-3">
            <Label>Target Classes (select one or more)</Label>
            <div className="flex flex-wrap gap-2">
              {sniperFilters?.filters?.classes?.map(cls => (
                <Badge
                  key={cls}
                  variant={selectedClasses.includes(cls) ? "default" : "outline"}
                  className={`cursor-pointer text-sm py-1 px-3 transition-colors ${
                    selectedClasses.includes(cls) 
                      ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background" 
                      : "hover:bg-muted"
                  }`}
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
                  className={`cursor-pointer text-sm py-1 px-3 transition-colors ${
                    selectedProfessions.includes(prof) 
                      ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background" 
                      : "hover:bg-muted"
                  }`}
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

          <div className="space-y-3">
            <Label>Target Active Skills (optional)</Label>
            <div className="flex flex-wrap gap-2">
              {sniperFilters?.filters?.activeSkills?.map(skill => (
                <Badge
                  key={skill}
                  variant={selectedActiveSkills.includes(skill) ? "default" : "outline"}
                  className={`cursor-pointer text-sm py-1 px-3 transition-colors ${
                    selectedActiveSkills.includes(skill) 
                      ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background" 
                      : "hover:bg-muted"
                  }`}
                  onClick={() => toggleActiveSkill(skill)}
                  data-testid={`badge-active-${skill.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {skill}
                </Badge>
              ))}
            </div>
            {selectedActiveSkills.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Selected: {selectedActiveSkills.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label>Target Passive Skills (optional)</Label>
            <div className="flex flex-wrap gap-2">
              {sniperFilters?.filters?.passiveSkills?.map(skill => (
                <Badge
                  key={skill}
                  variant={selectedPassiveSkills.includes(skill) ? "default" : "outline"}
                  className={`cursor-pointer text-sm py-1 px-3 transition-colors ${
                    selectedPassiveSkills.includes(skill) 
                      ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background" 
                      : "hover:bg-muted"
                  }`}
                  onClick={() => togglePassiveSkill(skill)}
                  data-testid={`badge-passive-${skill.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {skill}
                </Badge>
              ))}
            </div>
            {selectedPassiveSkills.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Selected: {selectedPassiveSkills.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label>Minimum Parent Rarity</Label>
            <div className="flex flex-wrap gap-2">
              {RARITIES.map(r => (
                <Badge
                  key={r.id}
                  variant={minRarity === r.id ? "default" : "outline"}
                  className={`cursor-pointer text-sm py-1 px-3 transition-colors ${
                    minRarity === r.id 
                      ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background" 
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setMinRarity(r.id)}
                  data-testid={`badge-rarity-${r.name.toLowerCase()}`}
                >
                  {r.name}
                </Badge>
              ))}
            </div>
            {minRarity > 0 && (
              <p className="text-xs text-muted-foreground">
                Only showing {RARITIES[minRarity].name}+ parents
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minSummons">
                {summonType === "dark" ? "Summons Remaining (Fixed)" : "Min Summons Remaining"}
              </Label>
              {summonType === "dark" ? (
                <div className="h-9 px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground flex items-center">
                  Any (more summons = higher rarity chance)
                </div>
              ) : (
                <Input
                  id="minSummons"
                  type="number"
                  value={sniperMinSummons}
                  onChange={(e) => setSniperMinSummons(e.target.value)}
                  placeholder="0"
                  data-testid="input-min-summons"
                />
              )}
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
              <Label htmlFor="targetTTSValue">Target TTS</Label>
              <Input
                id="targetTTSValue"
                type="number"
                min="0"
                max="12"
                value={targetTTSValue}
                onChange={(e) => setTargetTTSValue(e.target.value)}
                placeholder="e.g. 8"
                data-testid="input-target-tts-value"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minTTSProbability">Min TTS % Chance</Label>
              <Input
                id="minTTSProbability"
                type="number"
                step="1"
                min="0"
                max="100"
                value={minTTSProbability}
                onChange={(e) => setMinTTSProbability(e.target.value)}
                placeholder="e.g. 20"
                data-testid="input-min-tts-probability"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minEliteChance">Min Elite % Chance</Label>
              <Input
                id="minEliteChance"
                type="number"
                step="1"
                min="0"
                max="100"
                value={minEliteChance}
                onChange={(e) => setMinEliteChance(e.target.value)}
                placeholder="e.g. 20"
                data-testid="input-min-elite-chance"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minExaltedChance">Min Exalted % Chance</Label>
              <Input
                id="minExaltedChance"
                type="number"
                step="1"
                min="0"
                max="100"
                value={minExaltedChance}
                onChange={(e) => setMinExaltedChance(e.target.value)}
                placeholder="e.g. 2"
                data-testid="input-min-exalted-chance"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            TTS filters for total tier score. Elite/Exalted filters for chance of at least one elite (Stun, Second Wind, etc.) or exalted (Resurrection, Second Life) skill.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bridgeFee">Bridge Fee per Hero (USD)</Label>
              <Input
                id="bridgeFee"
                type="number"
                step="0.01"
                value={bridgeFeeUsd}
                onChange={(e) => setBridgeFeeUsd(e.target.value)}
                placeholder="0.50"
                data-testid="input-bridge-fee"
              />
              <p className="text-xs text-muted-foreground">
                Metis heroes need bridging to CV for summoning. Estimate ~$0.50 per hero.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <Label>Realms:</Label>
            <div className="flex gap-2">
              <Badge
                variant={sniperRealms.includes("cv") ? "default" : "outline"}
                className={`cursor-pointer transition-colors ${
                  sniperRealms.includes("cv") 
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background" 
                    : "hover:bg-muted"
                }`}
                onClick={() => toggleRealm("cv")}
                data-testid="badge-realm-cv"
              >
                Crystalvale
              </Badge>
              <Badge
                variant={sniperRealms.includes("sd") ? "default" : "outline"}
                className={`cursor-pointer transition-colors ${
                  sniperRealms.includes("sd") 
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background" 
                    : "hover:bg-muted"
                }`}
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
              {sniperResult.userHero ? 'Best Tavern Matches' : 'Best Hero Pairs'}
              <Badge variant="outline" className="ml-2">
                {sniperResult.pairs.length} {sniperResult.userHero ? 'matches' : 'pairs'} from {sniperResult.totalHeroes} heroes
              </Badge>
              {sniperResult.searchParams?.summonType === 'dark' && (
                <Badge className="bg-purple-600 text-white">Dark Summon</Badge>
              )}
            </CardTitle>
            
            {/* User Hero Info Card */}
            {sniperResult.userHero && (
              <div className="mt-3 p-3 bg-muted/50 rounded-lg border">
                <div className="flex items-center gap-2 mb-1">
                  <User className="h-4 w-4" />
                  <span className="font-medium">Your Hero</span>
                </div>
                <div className={`text-sm ${getRarityColor(sniperResult.userHero.rarity)}`}>
                  {getRarityName(sniperResult.userHero.rarity)} {sniperResult.userHero.mainClass}
                </div>
                <div className="text-xs text-muted-foreground">
                  Lv{sniperResult.userHero.level} Gen{sniperResult.userHero.generation} | {sniperResult.userHero.summonsRemaining} summons | ID: {sniperResult.userHero.id}
                </div>
              </div>
            )}
            
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span>Sort by:</span>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as "efficiency" | "chance" | "price" | "skillScore")}>
                  <SelectTrigger className="w-[180px] h-8" data-testid="select-sort-by">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efficiency">Efficiency (%/$)</SelectItem>
                    <SelectItem value="chance">Highest Chance</SelectItem>
                    <SelectItem value="price">Lowest Price</SelectItem>
                    <SelectItem value="skillScore">Offspring Skill Score</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {sniperResult.tokenPrices && (
                <p className="text-xs">
                  Token prices: CRYSTAL ${sniperResult.tokenPrices.CRYSTAL?.toFixed(4) || '0'}, JEWEL ${sniperResult.tokenPrices.JEWEL?.toFixed(4) || '0'}
                </p>
              )}
              {sniperResult.searchParams && (
                <p className="text-xs">
                  Searching for: {sniperResult.searchParams.targetClasses?.length > 0 && `Classes: ${sniperResult.searchParams.targetClasses.join(" OR ")}`}
                  {sniperResult.searchParams.targetClasses?.length > 0 && sniperResult.searchParams.targetProfessions?.length > 0 && " AND "}
                  {sniperResult.searchParams.targetProfessions?.length > 0 && `Professions: ${sniperResult.searchParams.targetProfessions.join(" OR ")}`}
                  {(sniperResult.searchParams.targetClasses?.length > 0 || sniperResult.searchParams.targetProfessions?.length > 0) && sniperResult.searchParams.targetActiveSkills?.length > 0 && " AND "}
                  {sniperResult.searchParams.targetActiveSkills?.length > 0 && `Active: ${sniperResult.searchParams.targetActiveSkills.join(" OR ")}`}
                  {(sniperResult.searchParams.targetClasses?.length > 0 || sniperResult.searchParams.targetProfessions?.length > 0 || sniperResult.searchParams.targetActiveSkills?.length > 0) && sniperResult.searchParams.targetPassiveSkills?.length > 0 && " AND "}
                  {sniperResult.searchParams.targetPassiveSkills?.length > 0 && `Passive: ${sniperResult.searchParams.targetPassiveSkills.join(" OR ")}`}
                </p>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {sniperResult.pairs.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-muted-foreground">
                  No matching hero pairs found. Try adjusting your filters.
                </p>
                {/* Show TTS metadata when TTS filter may be too strict */}
                {sniperResult.ttsMetadata && (sniperResult.ttsMetadata.requestedTarget !== null || (targetTTSValue && minTTSProbability)) && (
                  <div className="text-xs text-amber-500 bg-amber-500/10 rounded-md p-3 max-w-md mx-auto" data-testid="tts-guidance-panel">
                    <p className="font-medium mb-1">TTS Filter may be too strict</p>
                    <p>
                      You requested TTS &ge; {sniperResult.ttsMetadata.requestedTarget ?? targetTTSValue} with &ge; {sniperResult.ttsMetadata.requestedMinProb ?? minTTSProbability}% chance.
                    </p>
                    <p className="mt-1">
                      Best available: {sniperResult.ttsMetadata.maxCumulativeByTarget?.[(sniperResult.ttsMetadata.requestedTarget ?? parseInt(targetTTSValue) ?? 0)]?.toFixed(2) || '0'}% chance for TTS &ge; {sniperResult.ttsMetadata.requestedTarget ?? targetTTSValue}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Max expected TTS across all pairs: {Math.round(sniperResult.ttsMetadata.maxExpectedTTS || 0)}
                    </p>
                    <p className="mt-2 text-muted-foreground italic">
                      Try lowering Target TTS to 1-2 or reducing Min % Chance
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {sortedPairs.map((pair, idx) => (
                  <Card key={idx} className="bg-muted/30">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="secondary">#{idx + 1}</Badge>
                            <Badge variant="outline">{pair.realm === 'cv' ? 'Crystalvale' : 'Sundered Isles'}</Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                            {/* In myHero mode, hero1 is the user's hero - show simplified */}
                            {sniperResult.userHero ? (
                              <div className="space-y-1 opacity-60">
                                <div className="font-medium flex items-center gap-1">
                                  <User className="h-3 w-3" /> Your Hero
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                                    {pair.hero1.realm === 'cv' ? 'CV' : 'SD'}
                                  </Badge>
                                </div>
                                <div className={getRarityColor(pair.hero1.rarity)}>
                                  {getRarityName(pair.hero1.rarity)} {pair.hero1.mainClass}
                                </div>
                                <div className="text-muted-foreground text-xs">
                                  (Already owned)
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="font-medium flex items-center gap-1">
                                  Hero 1 ({pair.hero1.id})
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                                    {pair.hero1.realm === 'cv' ? 'CV' : 'SD'}
                                  </Badge>
                                </div>
                                <div className={getRarityColor(pair.hero1.rarity)}>
                                  {getRarityName(pair.hero1.rarity)} {pair.hero1.mainClass}
                                </div>
                                <div className="text-muted-foreground">
                                  Lv{pair.hero1.level} Gen{pair.hero1.generation} | {pair.hero1.summonsRemaining} summons
                                </div>
                                <div className="text-muted-foreground">
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
                            )}

                            <div className="space-y-1">
                              <div className="font-medium flex items-center gap-1">
                                {sniperResult.userHero ? `Tavern Match (${pair.hero2.id})` : `Hero 2 (${pair.hero2.id})`}
                                <Badge variant="outline" className="text-[10px] px-1 py-0">
                                  {pair.hero2.realm === 'cv' ? 'CV' : 'SD'}
                                </Badge>
                              </div>
                              <div className={getRarityColor(pair.hero2.rarity)}>
                                {getRarityName(pair.hero2.rarity)} {pair.hero2.mainClass}
                              </div>
                              <div className="text-muted-foreground">
                                Lv{pair.hero2.level} Gen{pair.hero2.generation} | {pair.hero2.summonsRemaining} summons
                              </div>
                              <div className="text-muted-foreground">
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
                          <div className="text-sm font-medium">
                            Total: ${pair.totalCostUsd?.toFixed(2) || '0.00'} USD
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ({pair.totalCost.toFixed(2)} {pair.hero1.token})
                          </div>
                          {pair.costs && (
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              <div>Purchase: {pair.costs.purchaseCost.toFixed(2)} {pair.hero1.token}</div>
                              <div>Summon: {pair.costs.summonTokenCost} {pair.hero1.token}</div>
                              <div>Tears: {pair.costs.tearCount} ({pair.costs.tearCost.toFixed(2)} {pair.hero1.token})</div>
                              {pair.costs.heroesNeedingBridge > 0 && (
                                <div className="text-yellow-500">
                                  Bridge: ${pair.costs.bridgeCostUsd.toFixed(2)} ({pair.costs.heroesNeedingBridge} hero{pair.costs.heroesNeedingBridge > 1 ? 'es' : ''})
                                </div>
                              )}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground pt-1">
                            Efficiency: {pair.efficiency.toFixed(4)} %/$
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
                      
                      {pair.tts && (
                        <div className="mt-3 pt-3 border-t">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium">Offspring TTS Probability</span>
                            <Badge variant="secondary" className="text-xs">
                              Expected: {Math.round(pair.tts.expected || 0)}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-4 gap-1 text-xs">
                            {Object.entries(pair.tts.distribution || {})
                              .filter(([_, prob]) => prob > 0.5)
                              .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
                              .slice(0, 8)
                              .map(([tts, prob]) => (
                                <div key={tts} className="flex justify-between bg-muted/50 rounded px-2 py-1">
                                  <span className="text-muted-foreground">TTS {tts}:</span>
                                  <span className={parseInt(tts) >= 4 ? 'text-green-400' : ''}>{(prob as number).toFixed(1)}%</span>
                                </div>
                              ))}
                          </div>
                          {pair.tts.cumulative && (
                            <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                              <span>TTS≥2: <span className="text-foreground">{pair.tts.cumulative["2"]?.toFixed(1) ?? '0'}%</span></span>
                              <span>TTS≥4: <span className="text-green-400">{pair.tts.cumulative["4"]?.toFixed(1) ?? '0'}%</span></span>
                              <span>TTS≥6: <span className="text-yellow-400">{pair.tts.cumulative["6"]?.toFixed(1) ?? '0'}%</span></span>
                              <span>TTS≥8: <span className="text-orange-400">{pair.tts.cumulative["8"]?.toFixed(1) ?? '0'}%</span></span>
                            </div>
                          )}
                          {pair.eliteExaltedChances && (pair.eliteExaltedChances.eliteChance > 0 || pair.eliteExaltedChances.exaltedChance > 0) && (
                            <div className="flex gap-3 mt-2 text-xs">
                              {pair.eliteExaltedChances.eliteChance > 0 && (
                                <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-500">
                                  Elite: {pair.eliteExaltedChances.eliteChance.toFixed(1)}%
                                </Badge>
                              )}
                              {pair.eliteExaltedChances.exaltedChance > 0 && (
                                <Badge variant="outline" className="text-[10px] border-purple-500 text-purple-500">
                                  Exalted: {pair.eliteExaltedChances.exaltedChance.toFixed(2)}%
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="mt-3 pt-3 border-t">
                        <a
                          href={`/admin/summoning-calculator?hero1=${pair.hero1.id}&hero2=${pair.hero2.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-blue-400 hover:underline"
                          data-testid={`link-calculator-${idx}`}
                        >
                          View Full Summon Chances <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
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
