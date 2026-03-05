import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw, ExternalLink, LayoutGrid, List, Filter, X, Star, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CombatPet {
  id: string;
  normalizedId: string;
  originRealm: string;
  currentRealm: string;
  rarity: number;
  rarityName: string;
  element: number;
  elementName: string;
  season: number;
  seasonName: string;
  eggType: number;
  eggTypeName: string;
  gatheringType: string;
  appearance: number;
  background: number;
  shiny: boolean;
  bonusCount: number;
  profBonus: number;
  profBonusScalar: number;
  profBonusStars: number;
  profBonusName: string;
  craftBonus: number;
  craftBonusScalar: number;
  craftBonusStars: number;
  craftBonusName: string;
  combatBonus: number;
  combatBonusScalar: number;
  combatBonusStars: number;
  combatBonusName: string;
  combatBonusDescription: string;
  totalStars: number;
  salePriceRaw: string;
  salePriceJewel: number;
  priceCurrency: string;
  topRollPercent: number | null;
  topRollMaxValue: number | null;
  profTopRollPercent: number | null;
  ownerName: string;
  ownerId: string;
}

function getTopRollColor(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 90) return "text-yellow-500";
  if (pct >= 75) return "text-purple-500";
  if (pct >= 50) return "text-blue-500";
  if (pct >= 25) return "text-green-500";
  return "text-muted-foreground";
}

function getTopRollBadgeVariant(pct: number | null): "default" | "secondary" | "destructive" | "outline" {
  if (pct === null) return "outline";
  if (pct >= 90) return "default";
  if (pct >= 75) return "default";
  return "secondary";
}

function getTopRollLabel(pct: number | null): string {
  if (pct === null) return "N/A";
  if (pct >= 95) return "Perfect";
  if (pct >= 85) return "Excellent";
  if (pct >= 70) return "Great";
  if (pct >= 50) return "Good";
  if (pct >= 25) return "Fair";
  return "Low";
}

const COMBAT_ABILITY_DESCRIPTIONS: Record<string, string> = {
  'Amplify': 'All party Delay effects gain +{bonus}% resistance to Negate.',
  'Arcane Shell': 'Increase Spell Block by +{bonus}%.',
  'Attuned': 'Increase SPELL by {bonus}%.',
  'Beastly Roar': 'Channel 600 Initiative. Target each enemy. On hit: {bonus}% chance to inflict Daze. 80% chance to Intimidate each target by 15% for 2 turns.',
  'Befuddle': 'On hit, {bonus}% chance to Confuse target.',
  'Blur': 'Increase Speed by {bonus}%.',
  'Bop': 'On hit, {bonus}% chance to Daze target.',
  'Brave': 'Increase resistance to Fear by +{bonus}%.',
  'Brick Wall': 'Increase P.RED by +{bonus}%.',
  'Bruise': "On hit, {bonus}% chance to reduce target's P.DEF by 20% for 15 ticks.",
  'Char': 'On hit, {bonus}% chance to Burn target.',
  'Cleansing Aura': 'Every {bonus} turns, Cleanse a random debuffed party member.',
  'Confident': 'Increase resistance to Intimidate by +{bonus}%.',
  'Conservative': '{bonus}% chance to reduce cost of current skill by 40% (rounded down).',
  'Diamond Hands': 'Increase resistance to Disarm by +{bonus}%.',
  'Divine Intervention': 'Increase Critical Heal chance by +{bonus}%.',
  'Expose': "On hit, {bonus}% chance to reduce target's M.DEF by 20% for 15 ticks.",
  'Flash': "On hit, {bonus}% chance to reduce target's P.ACC by 10% for 15 ticks.",
  'Flow State': 'While Channeling, this Hero gains {bonus}% EVA.',
  'Foil': 'Target enemy. On hit: 90% chance to Dispel target. {bonus}% chance to Negate a single random Delayed action previously cast by target.',
  'Freeze': 'On hit, {bonus}% chance to Chill target.',
  'Gash': 'On hit, {bonus}% chance to inflict target with Bleed.',
  'Good Eye': 'Increase P.ACC by +{bonus}%.',
  'Gouge': 'On hit, {bonus}% chance to inflict target with Blind.',
  'Graceful': 'Increase resistance to Push and Pull by +{bonus}%.',
  'Guardian Shell': "Each Party Member gains a Barrier equal to {bonus}% of target's max HP.",
  'Hard Head': 'Increase resistance to Daze by +{bonus}%.',
  'Harder Head': 'Increase resistance to Stun by +{bonus}%.',
  'Hardy Constitution': 'Increase SER by +{bonus}%.',
  'Healing Bond': 'Target Party Member gains: At the start of the next 3 turns, heal for {bonus}% of max HP. Stack Limit 1.',
  'Heavy Hide': 'Increase P.DEF by {bonus}%.',
  'Hobble': 'On hit, {bonus}% chance to Slow target by 25% for 30 ticks.',
  'Hush': 'On hit, {bonus}% chance to Silence target for 1 turn.',
  'Impenetrable': 'Increase resistance to Bleed by +{bonus}%.',
  'Infect': 'On hit, {bonus}% chance to inflict target with Poison.',
  'Inner Lids': 'Increase resistance to Blind by +{bonus}%.',
  'Insulated': 'Increase resistance to Chill by +{bonus}%.',
  'Intercept': '{bonus}% chance to Negate enemy Delay actions at the moment they are cast.',
  'Lick Wounds': '{bonus}% chance to Heal for 10% of missing HP each turn.',
  'Lucid': 'Increase resistance to Confuse by +{bonus}%.',
  'Magical Shell': 'Increase M.DEF by {bonus}%.',
  'Maul': 'Deal ({bonus}×POWER) damage to target enemy. 60% chance to inflict target with Bleed (×5).',
  'Meat Shield': "On this Hero's 5th turn and every 10 turns thereafter, gain a Barrier with HP up to {bonus}% of this Hero's current HP or the amount needed to reach a final Barrier HP of 30% of this Hero's max HP, whichever is lower.",
  'Moist': 'Increase resistance to Burn by +{bonus}%.',
  'Mystify': "On hit, {bonus}% chance to reduce target's M.ACC by 10% for 15 ticks.",
  'Null Field': 'Reduce enemy buff effectiveness by {bonus}%.',
  'Omni Shell': 'Increase P.DEF and M.DEF by {bonus}%.',
  'Outspoken': 'Increase resistance to Silence by +{bonus}%.',
  'Petrify': 'On hit, {bonus}% chance to Fear target for 1 turn.',
  'Protective Coat': 'Reduce all damage taken by {bonus}%.',
  'Purifying Aura': 'Remove {bonus}% of debuffs from allies each turn.',
  'Quicksand': 'Slow enemies by {bonus}%.',
  'Rebalance': 'Equalize party HP by {bonus}%.',
  'Recuperate': 'Increase Recovery by +{bonus}%.',
  'Reflector': 'Reflect {bonus}% of damage taken.',
  'Relentless': 'Increase resistance to Slow by +{bonus}%.',
  'Rescuer': "{bonus}% chance to Heal the ally with the lowest HP ratio for 10% of target's missing HP each turn.",
  'Resilient': 'Increase resistance to Poison by +{bonus}%.',
  'Rune Sniffer': 'Increase chance of receiving runes from combat (when available) by {bonus}%.',
  'Scavenger': 'Increase loot drop chance by {bonus}%.',
  'Sharpened Claws': 'Increase ATTACK by {bonus}%.',
  'Shock': 'On hit, {bonus}% chance to Stun target for 1 turn.',
  'Skin of Teeth': '{bonus}% chance to survive a lethal hit with 1 HP.',
  'Slippery': 'Increase EVA by +{bonus}%.',
  'Stone Hide': 'Increase Block by +{bonus}%.',
  'Studious': 'Increase XP gained from combat by {bonus}%.',
  'Super Meat Shield': "On this Hero's 5th turn and every 10 turns thereafter, party members gain a Barrier with HP equal to {bonus}% of this Hero's current HP or the amount needed to reach a final Barrier HP of 30% of target's max HP, whichever is lower.",
  'Swift Cast': 'Reduce cast time by {bonus}%.',
  'Third Eye': 'Increase M.ACC by +{bonus}%.',
  'Threaten': 'On hit, {bonus}% chance to Intimidate target by 10% for 2 turns.',
  'Thwack': 'On hit, {bonus}% chance to knockback target.',
  'Total Recall': 'Reduce ability cooldowns by {bonus}%.',
  'Tug': 'On hit, {bonus}% chance to Pull target 1.',
  'Ultra Conservative': 'Reduce all ability costs by {bonus}%.',
  'Vampiric': 'Gain +{bonus}% Lifesteal.',
  'Vorpal Soul': 'Increase CSC by +{bonus}%.',
  'Zoomy': 'Increase movement speed by {bonus}%.',
};

function getAbilityDescription(name: string, scalar: number): string | null {
  const template = COMBAT_ABILITY_DESCRIPTIONS[name];
  if (!template) return null;
  return template.replace(/\{bonus\}/g, String(scalar));
}

function AbilityTooltip({ name, scalar, children }: {
  name: string;
  scalar: number;
  children: React.ReactNode;
}) {
  const desc = getAbilityDescription(name, scalar);
  if (!desc) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
        {desc}
      </TooltipContent>
    </Tooltip>
  );
}

function getRarityColor(rarity: number): string {
  switch (rarity) {
    case 0: return "text-muted-foreground";
    case 1: return "text-green-500";
    case 2: return "text-blue-500";
    case 3: return "text-orange-500";
    case 4: return "text-purple-500";
    default: return "text-muted-foreground";
  }
}

function StarDisplay({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5" data-testid={`stars-${count}`}>
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          className={`w-3 h-3 ${i < count ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground/30"}`}
        />
      ))}
    </span>
  );
}

function formatJewel(val: number): string {
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
  if (val >= 100) return val.toFixed(0);
  if (val >= 10) return val.toFixed(1);
  return val.toFixed(2);
}

export default function CombatPetsShop() {
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [showFilters, setShowFilters] = useState(true);

  const [sortBy, setSortBy] = useState<string>("price-asc");
  const [filterRarity, setFilterRarity] = useState<string>("all");
  const [filterShiny, setFilterShiny] = useState<boolean>(false);
  const [filterEggType, setFilterEggType] = useState<string>("all");
  const [filterElement, setFilterElement] = useState<string>("all");
  const [filterSeason, setFilterSeason] = useState<string>("all");
  const [filterBackground, setFilterBackground] = useState<string>("all");
  const [filterGatheringName, setFilterGatheringName] = useState<string>("");
  const [filterCombatName, setFilterCombatName] = useState<string>("");
  const [topRollMode, setTopRollMode] = useState<"combat" | "gathering" | "both">("combat");
  const [filterMinCombatStars, setFilterMinCombatStars] = useState<string>("0");
  const [filterMinProfStars, setFilterMinProfStars] = useState<string>("0");
  const [filterMinCraftStars, setFilterMinCraftStars] = useState<string>("0");
  const [filterMinTotalStars, setFilterMinTotalStars] = useState<string>("0");
  const [filterMinTopRoll, setFilterMinTopRoll] = useState<string>("");
  const [filterMaxPrice, setFilterMaxPrice] = useState<string>("");
  const [filterMinPrice, setFilterMinPrice] = useState<string>("");
  const [filterCombatOnly, setFilterCombatOnly] = useState<boolean>(false);
  const [filterRealm, setFilterRealm] = useState<string>("all");
  const [filterCombatStarTier, setFilterCombatStarTier] = useState<string>("all");

  const [isForceRefreshing, setIsForceRefreshing] = useState(false);
  const { data: petsResponse, isLoading, error, isFetching, refetch } = useQuery<{ ok: boolean; pets: CombatPet[]; count: number; lastUpdated?: number; loading?: boolean }>({
    queryKey: ["/api/admin/combat-pets"],
    refetchInterval: (query) => {
      const data = query.state.data as { loading?: boolean } | undefined;
      return data?.loading ? 10000 : 120000;
    },
  });
  const isPreparingData = petsResponse?.loading === true;
  const pets = isPreparingData ? undefined : petsResponse?.pets;
  const lastUpdated = petsResponse?.lastUpdated;

  const handleForceRefresh = useCallback(async () => {
    setIsForceRefreshing(true);
    try {
      const res = await fetch('/api/admin/combat-pets?refresh=true', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to refresh');
      const data = await res.json();
      queryClient.setQueryData(["/api/admin/combat-pets"], data);
    } catch (e) {
      refetch();
    } finally {
      setIsForceRefreshing(false);
    }
  }, [refetch]);

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
  };

  const uniqueValues = useMemo(() => {
    if (!pets) return { backgrounds: [], seasons: [] };
    const backgrounds = Array.from(new Set(pets.map(p => p.background))).sort((a: number, b: number) => a - b);
    const seasons = Array.from(new Set(pets.map(p => p.seasonName))).sort();
    return { backgrounds, seasons };
  }, [pets]);

  const filteredPets = useMemo(() => {
    if (!pets) return [];
    let result = [...pets];

    if (filterRarity !== "all") result = result.filter(p => p.rarity === parseInt(filterRarity));
    if (filterShiny) result = result.filter(p => p.shiny);
    if (filterEggType !== "all") result = result.filter(p => p.eggType === parseInt(filterEggType));
    if (filterElement !== "all") result = result.filter(p => p.element === parseInt(filterElement));
    if (filterSeason !== "all") result = result.filter(p => p.seasonName === filterSeason);
    if (filterBackground !== "all") result = result.filter(p => p.background === parseInt(filterBackground));
    if (filterCombatName.trim()) {
      const q = filterCombatName.trim().toLowerCase();
      result = result.filter(p => p.combatBonusName.toLowerCase().includes(q));
    }
    if (filterGatheringName.trim()) {
      const q = filterGatheringName.trim().toLowerCase();
      result = result.filter(p => p.profBonusName.toLowerCase().includes(q) || p.craftBonusName.toLowerCase().includes(q));
    }
    if (filterCombatStarTier !== "all") result = result.filter(p => p.combatBonusStars === parseInt(filterCombatStarTier));
    if (filterRealm !== "all") result = result.filter(p => p.currentRealm === filterRealm);
    if (filterCombatOnly) result = result.filter(p => p.combatBonusStars > 0);

    const minCS = parseInt(filterMinCombatStars);
    if (minCS > 0) result = result.filter(p => p.combatBonusStars >= minCS);
    const minPS = parseInt(filterMinProfStars);
    if (minPS > 0) result = result.filter(p => p.profBonusStars >= minPS);
    const minCrS = parseInt(filterMinCraftStars);
    if (minCrS > 0) result = result.filter(p => p.craftBonusStars >= minCrS);
    const minTS = parseInt(filterMinTotalStars);
    if (minTS > 0) result = result.filter(p => p.totalStars >= minTS);

    const minTR = parseFloat(filterMinTopRoll);
    if (!isNaN(minTR) && minTR > 0) {
      if (topRollMode === "combat") result = result.filter(p => p.topRollPercent !== null && p.topRollPercent >= minTR);
      else if (topRollMode === "gathering") result = result.filter(p => p.profTopRollPercent !== null && p.profTopRollPercent >= minTR);
      else result = result.filter(p => (p.topRollPercent ?? 0) >= minTR && (p.profTopRollPercent ?? 0) >= minTR);
    }

    const maxP = parseFloat(filterMaxPrice);
    if (!isNaN(maxP) && maxP > 0) result = result.filter(p => p.salePriceJewel <= maxP);
    const minP = parseFloat(filterMinPrice);
    if (!isNaN(minP) && minP > 0) result = result.filter(p => p.salePriceJewel >= minP);

    result.sort((a, b) => {
      switch (sortBy) {
        case "price-asc": return a.salePriceJewel - b.salePriceJewel;
        case "price-desc": return b.salePriceJewel - a.salePriceJewel;
        case "toproll-desc": return (b.topRollPercent ?? -1) - (a.topRollPercent ?? -1);
        case "toproll-asc": return (a.topRollPercent ?? 999) - (b.topRollPercent ?? 999);
        case "stars-desc": return b.totalStars - a.totalStars;
        case "stars-asc": return a.totalStars - b.totalStars;
        case "combat-stars-desc": return b.combatBonusStars - a.combatBonusStars;
        case "rarity-desc": return b.rarity - a.rarity;
        default: return a.salePriceJewel - b.salePriceJewel;
      }
    });

    return result;
  }, [pets, filterRarity, filterShiny, filterEggType, filterElement, filterSeason, filterBackground, filterGatheringName, filterCombatName, filterCombatStarTier, filterMinCombatStars, filterMinProfStars, filterMinCraftStars, filterMinTotalStars, filterMinTopRoll, topRollMode, filterMaxPrice, filterMinPrice, filterCombatOnly, filterRealm, sortBy]);

  const resetFilters = () => {
    setSortBy("price-asc");
    setFilterRarity("all");
    setFilterShiny(false);
    setFilterEggType("all");
    setFilterElement("all");
    setFilterSeason("all");
    setFilterBackground("all");
    setFilterGatheringName("");
    setFilterCombatName("");
    setFilterCombatStarTier("all");
    setTopRollMode("combat");
    setFilterMinCombatStars("0");
    setFilterMinProfStars("0");
    setFilterMinCraftStars("0");
    setFilterMinTotalStars("0");
    setFilterMinTopRoll("");
    setFilterMaxPrice("");
    setFilterMinPrice("");
    setFilterCombatOnly(false);
    setFilterRealm("all");
  };

  const activeFilterCount = [
    filterRarity !== "all",
    filterShiny,
    filterEggType !== "all",
    filterElement !== "all",
    filterSeason !== "all",
    filterBackground !== "all",
    filterGatheringName.trim() !== "",
    filterCombatName.trim() !== "",
    filterCombatStarTier !== "all",
    parseInt(filterMinCombatStars) > 0,
    parseInt(filterMinProfStars) > 0,
    parseInt(filterMinCraftStars) > 0,
    parseInt(filterMinTotalStars) > 0,
    filterMinTopRoll !== "" && parseFloat(filterMinTopRoll) > 0,
    topRollMode !== "combat",
    filterMaxPrice !== "" && parseFloat(filterMaxPrice) > 0,
    filterMinPrice !== "" && parseFloat(filterMinPrice) > 0,
    filterCombatOnly,
    filterRealm !== "all",
  ].filter(Boolean).length;

  return (
    <div className="container mx-auto p-4 space-y-4" data-testid="combat-pets-page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Top Combat Pets Shop</h1>
          <p className="text-sm text-muted-foreground">
            {pets ? `${filteredPets.length} of ${pets.length} pets for sale` : "Loading pets..."}
            {isFetching && !isLoading && " (refreshing...)"}
          </p>
          {lastUpdated && (
            <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-last-updated">
              <Clock className="w-3 h-3" />
              Last synced: {formatTimeAgo(lastUpdated)} ({new Date(lastUpdated).toLocaleTimeString()})
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            data-testid="button-toggle-filters"
          >
            <Filter className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "grid" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("grid")}
            data-testid="button-view-grid"
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "table" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("table")}
            data-testid="button-view-table"
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleForceRefresh}
            disabled={isFetching || isForceRefreshing}
            data-testid="button-refresh"
            title="Force refresh from blockchain"
          >
            <RefreshCw className={`w-4 h-4 ${(isFetching || isForceRefreshing) ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card data-testid="filters-panel">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 pt-3 px-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">Filters</h3>
              {activeFilterCount > 0 && (
                <Badge variant="secondary">{activeFilterCount} active</Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={resetFilters} data-testid="button-reset-filters">
              <X className="w-3 h-3 mr-1" /> Reset
            </Button>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Sort By</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger data-testid="select-sort"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="price-asc">Price: Low to High</SelectItem>
                    <SelectItem value="price-desc">Price: High to Low</SelectItem>
                    <SelectItem value="toproll-desc">Top Roll %: Best</SelectItem>
                    <SelectItem value="toproll-asc">Top Roll %: Lowest</SelectItem>
                    <SelectItem value="stars-desc">Total Stars: Most</SelectItem>
                    <SelectItem value="stars-asc">Total Stars: Least</SelectItem>
                    <SelectItem value="combat-stars-desc">Combat Stars: Most</SelectItem>
                    <SelectItem value="rarity-desc">Rarity: Highest</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Rarity</Label>
                <Select value={filterRarity} onValueChange={setFilterRarity}>
                  <SelectTrigger data-testid="select-rarity"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="0">Common</SelectItem>
                    <SelectItem value="1">Uncommon</SelectItem>
                    <SelectItem value="2">Rare</SelectItem>
                    <SelectItem value="3">Legendary</SelectItem>
                    <SelectItem value="4">Mythic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Egg Type</Label>
                <Select value={filterEggType} onValueChange={setFilterEggType}>
                  <SelectTrigger data-testid="select-egg-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="0">Blue (Fishing)</SelectItem>
                    <SelectItem value="1">Grey (Foraging)</SelectItem>
                    <SelectItem value="2">Green (Gardening)</SelectItem>
                    <SelectItem value="3">Mining</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Element</Label>
                <Select value={filterElement} onValueChange={setFilterElement}>
                  <SelectTrigger data-testid="select-element"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="0">Fire</SelectItem>
                    <SelectItem value="1">Water</SelectItem>
                    <SelectItem value="2">Earth</SelectItem>
                    <SelectItem value="3">Wind</SelectItem>
                    <SelectItem value="4">Lightning</SelectItem>
                    <SelectItem value="5">Ice</SelectItem>
                    <SelectItem value="6">Light</SelectItem>
                    <SelectItem value="7">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Season</Label>
                <Select value={filterSeason} onValueChange={setFilterSeason}>
                  <SelectTrigger data-testid="select-season"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {uniqueValues.seasons.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Realm</Label>
                <Select value={filterRealm} onValueChange={setFilterRealm}>
                  <SelectTrigger data-testid="select-realm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="CRY">Crystalvale</SelectItem>
                    <SelectItem value="SER1">Serendale</SelectItem>
                    <SelectItem value="SER2">Serendale 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Combat Name</Label>
                <Input
                  type="text"
                  placeholder="e.g. Stone Hide, Shock..."
                  value={filterCombatName}
                  onChange={(e) => setFilterCombatName(e.target.value)}
                  data-testid="input-combat-name"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Combat Stars</Label>
                <Select value={filterCombatStarTier} onValueChange={setFilterCombatStarTier}>
                  <SelectTrigger data-testid="select-combat-star-tier"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    <SelectItem value="1">1 Star</SelectItem>
                    <SelectItem value="2">2 Stars</SelectItem>
                    <SelectItem value="3">3 Stars</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Gathering Name</Label>
                <Input
                  type="text"
                  placeholder="e.g. Efficient, Fisher..."
                  value={filterGatheringName}
                  onChange={(e) => setFilterGatheringName(e.target.value)}
                  data-testid="input-gathering-name"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Background</Label>
                <Select value={filterBackground} onValueChange={setFilterBackground}>
                  <SelectTrigger data-testid="select-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {uniqueValues.backgrounds.map(b => (
                      <SelectItem key={b} value={String(b)}>BG #{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Min Combat Stars</Label>
                <Select value={filterMinCombatStars} onValueChange={setFilterMinCombatStars}>
                  <SelectTrigger data-testid="select-min-combat-stars"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Any</SelectItem>
                    <SelectItem value="1">1+</SelectItem>
                    <SelectItem value="2">2+</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Min Prof Stars</Label>
                <Select value={filterMinProfStars} onValueChange={setFilterMinProfStars}>
                  <SelectTrigger data-testid="select-min-prof-stars"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Any</SelectItem>
                    <SelectItem value="1">1+</SelectItem>
                    <SelectItem value="2">2+</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Min Craft Stars</Label>
                <Select value={filterMinCraftStars} onValueChange={setFilterMinCraftStars}>
                  <SelectTrigger data-testid="select-min-craft-stars"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Any</SelectItem>
                    <SelectItem value="1">1+</SelectItem>
                    <SelectItem value="2">2+</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Min Total Stars</Label>
                <Select value={filterMinTotalStars} onValueChange={setFilterMinTotalStars}>
                  <SelectTrigger data-testid="select-min-total-stars"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Any</SelectItem>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                      <SelectItem key={n} value={String(n)}>{n}+</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 col-span-2 sm:col-span-1">
                <Label className="text-xs">Min Top Roll %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  placeholder="e.g. 50"
                  value={filterMinTopRoll}
                  onChange={(e) => setFilterMinTopRoll(e.target.value)}
                  data-testid="input-min-top-roll"
                />
                <div className="flex gap-1 pt-0.5">
                  {(["combat", "gathering", "both"] as const).map(mode => (
                    <Button
                      key={mode}
                      type="button"
                      size="sm"
                      variant={topRollMode === mode ? "default" : "outline"}
                      onClick={() => setTopRollMode(mode)}
                      className="flex-1 text-xs"
                      data-testid={`button-top-roll-mode-${mode}`}
                    >
                      {mode === "combat" ? "Combat" : mode === "gathering" ? "Gather" : "Both"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Min Price</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Min"
                  value={filterMinPrice}
                  onChange={(e) => setFilterMinPrice(e.target.value)}
                  data-testid="input-min-price"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Max Price</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Max"
                  value={filterMaxPrice}
                  onChange={(e) => setFilterMaxPrice(e.target.value)}
                  data-testid="input-max-price"
                />
              </div>

              <div className="space-y-1 flex flex-col justify-end">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={filterShiny}
                    onCheckedChange={setFilterShiny}
                    data-testid="switch-shiny"
                  />
                  <Label className="text-xs">Shiny Only</Label>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Switch
                    checked={filterCombatOnly}
                    onCheckedChange={setFilterCombatOnly}
                    data-testid="switch-combat-only"
                  />
                  <Label className="text-xs">Has Combat</Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading || isPreparingData ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">
            {isPreparingData
              ? "Preparing pet data... Fetching listings and verifying on-chain status. This takes a few minutes on first load."
              : "Connecting to pet marketplace..."}
          </span>
          {isPreparingData && (
            <span className="text-xs text-muted-foreground">Checking back every 10 seconds</span>
          )}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Failed to load pets. Please try again.
          </CardContent>
        </Card>
      ) : filteredPets.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No pets match your filters. Try adjusting your criteria.
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" data-testid="pets-grid">
          {filteredPets.map((pet) => (
            <PetCard key={pet.id} pet={pet} />
          ))}
        </div>
      ) : (
        <PetTable pets={filteredPets} />
      )}
    </div>
  );
}

function PetCard({ pet }: { pet: CombatPet }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-visible" data-testid={`card-pet-${pet.id}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-mono text-sm font-semibold" data-testid={`text-pet-id-${pet.id}`}>
                #{pet.normalizedId}
              </span>
              <Badge variant="secondary" className={`text-xs ${getRarityColor(pet.rarity)}`}>
                {pet.rarityName}
              </Badge>
              {pet.shiny && <Badge variant="default" className="text-xs">Shiny</Badge>}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {pet.eggTypeName} | {pet.elementName} | {pet.seasonName}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-bold text-sm" data-testid={`text-price-${pet.id}`}>
              {formatJewel(pet.salePriceJewel)} {pet.priceCurrency === 'CRYSTAL' ? 'C' : 'J'}
            </div>
            <div className="text-xs text-muted-foreground">
              <StarDisplay count={pet.totalStars} max={9} />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium">Combat:</span>
              <StarDisplay count={pet.combatBonusStars} />
            </div>
            <div className="flex items-center gap-1">
              <AbilityTooltip name={pet.combatBonusName} scalar={pet.combatBonusScalar}>
                <span className="text-xs">{pet.combatBonusName}</span>
              </AbilityTooltip>
              {pet.combatBonusScalar > 0 && (
                <span className="text-xs text-muted-foreground">({pet.combatBonusScalar}%)</span>
              )}
            </div>
          </div>

          {pet.topRollPercent !== null && (
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-medium">Top Roll:</span>
              <div className="flex items-center gap-1">
                <Badge variant={getTopRollBadgeVariant(pet.topRollPercent)} className="text-xs">
                  {pet.topRollPercent.toFixed(0)}%
                </Badge>
                <span className={`text-xs font-medium ${getTopRollColor(pet.topRollPercent)}`}>
                  {getTopRollLabel(pet.topRollPercent)}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium">Prof:</span>
              <StarDisplay count={pet.profBonusStars} />
            </div>
            <span className="text-xs">{pet.profBonusName} ({pet.profBonusScalar}%)</span>
          </div>

          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium">Craft:</span>
              <StarDisplay count={pet.craftBonusStars} />
            </div>
            <span className="text-xs">{pet.craftBonusName} ({pet.craftBonusScalar}%)</span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-expand-${pet.id}`}
        >
          {expanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
          {expanded ? "Less" : "More"}
        </Button>

        {expanded && (
          <div className="space-y-1 text-xs border-t pt-2">
            {pet.combatBonusDescription && (
              <p className="text-muted-foreground italic">{pet.combatBonusDescription}</p>
            )}
            {pet.topRollMaxValue !== null && (
              <p className="text-muted-foreground">
                Max possible: {pet.topRollMaxValue}% | Actual: {pet.combatBonusScalar}%
              </p>
            )}
            <p className="text-muted-foreground">
              Gathering: {pet.gatheringType} | BG: #{pet.background}
            </p>
            <p className="text-muted-foreground">
              Realm: {pet.currentRealm} | Bonuses: {pet.bonusCount}
            </p>
            {pet.ownerName && (
              <p className="text-muted-foreground">Owner: {pet.ownerName}</p>
            )}
            <a
              href={`https://game.defikingdoms.com/#/pets/${pet.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-500 hover:underline"
              data-testid={`link-dfk-${pet.id}`}
            >
              View in DFK <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PetTable({ pets }: { pets: CombatPet[] }) {
  return (
    <div className="overflow-x-auto" data-testid="pets-table">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="text-left p-2 font-medium">ID</th>
            <th className="text-left p-2 font-medium">Rarity</th>
            <th className="text-left p-2 font-medium">Egg</th>
            <th className="text-left p-2 font-medium">Element</th>
            <th className="text-center p-2 font-medium">Stars</th>
            <th className="text-left p-2 font-medium">Combat Bonus</th>
            <th className="text-center p-2 font-medium">C.Stars</th>
            <th className="text-right p-2 font-medium">Scalar</th>
            <th className="text-right p-2 font-medium">Top Roll</th>
            <th className="text-left p-2 font-medium">Prof Bonus</th>
            <th className="text-center p-2 font-medium">P.Stars</th>
            <th className="text-left p-2 font-medium">Craft Bonus</th>
            <th className="text-right p-2 font-medium">Price (J)</th>
            <th className="text-center p-2 font-medium">Shiny</th>
            <th className="text-center p-2 font-medium">Link</th>
          </tr>
        </thead>
        <tbody>
          {pets.map((pet) => (
            <tr key={pet.id} className="border-b hover-elevate" data-testid={`row-pet-${pet.id}`}>
              <td className="p-2 font-mono">{pet.normalizedId}</td>
              <td className={`p-2 ${getRarityColor(pet.rarity)}`}>{pet.rarityName}</td>
              <td className="p-2">{pet.eggTypeName}</td>
              <td className="p-2">{pet.elementName}</td>
              <td className="p-2 text-center"><StarDisplay count={pet.totalStars} max={9} /></td>
              <td className="p-2">
                <AbilityTooltip name={pet.combatBonusName} scalar={pet.combatBonusScalar}>
                  {pet.combatBonusName}
                </AbilityTooltip>
              </td>
              <td className="p-2 text-center"><StarDisplay count={pet.combatBonusStars} /></td>
              <td className="p-2 text-right">{pet.combatBonusScalar > 0 ? `${pet.combatBonusScalar}%` : "-"}</td>
              <td className="p-2 text-right">
                {pet.topRollPercent !== null ? (
                  <span className={getTopRollColor(pet.topRollPercent)}>
                    {pet.topRollPercent.toFixed(0)}%
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
              <td className="p-2">{pet.profBonusName} ({pet.profBonusScalar}%)</td>
              <td className="p-2 text-center"><StarDisplay count={pet.profBonusStars} /></td>
              <td className="p-2">{pet.craftBonusName}</td>
              <td className="p-2 text-right font-medium">{formatJewel(pet.salePriceJewel)} {pet.priceCurrency === 'CRYSTAL' ? 'C' : 'J'}</td>
              <td className="p-2 text-center">{pet.shiny ? "Yes" : ""}</td>
              <td className="p-2 text-center">
                <a
                  href={`https://game.defikingdoms.com/#/pets/${pet.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`link-dfk-table-${pet.id}`}
                >
                  <ExternalLink className="w-3 h-3 inline-block text-blue-500" />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
