import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw, ExternalLink, LayoutGrid, List, Filter, X, Star, ChevronDown, ChevronUp } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

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
  const [filterCombatBonusName, setFilterCombatBonusName] = useState<string>("all");
  const [filterProfBonusName, setFilterProfBonusName] = useState<string>("all");
  const [filterCraftBonusName, setFilterCraftBonusName] = useState<string>("all");
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

  const { data: petsResponse, isLoading, error, isFetching } = useQuery<{ ok: boolean; pets: CombatPet[]; count: number }>({
    queryKey: ["/api/admin/combat-pets"],
    refetchInterval: 120000,
  });
  const pets = petsResponse?.pets;

  const uniqueValues = useMemo(() => {
    if (!pets) return { combatNames: [], profNames: [], craftNames: [], backgrounds: [], seasons: [] };
    const combatNames = Array.from(new Set(pets.map(p => p.combatBonusName).filter(n => n && n !== "None"))).sort();
    const profNames = Array.from(new Set(pets.map(p => p.profBonusName).filter(n => n && n !== "None" && n !== "Unknown"))).sort();
    const craftNames = Array.from(new Set(pets.map(p => p.craftBonusName).filter(n => n && n !== "None" && n !== "Unknown"))).sort();
    const backgrounds = Array.from(new Set(pets.map(p => p.background))).sort((a: number, b: number) => a - b);
    const seasons = Array.from(new Set(pets.map(p => p.seasonName))).sort();
    return { combatNames, profNames, craftNames, backgrounds, seasons };
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
    if (filterCombatBonusName !== "all") result = result.filter(p => p.combatBonusName === filterCombatBonusName);
    if (filterCombatStarTier !== "all") result = result.filter(p => p.combatBonusStars === parseInt(filterCombatStarTier));
    if (filterProfBonusName !== "all") result = result.filter(p => p.profBonusName === filterProfBonusName);
    if (filterCraftBonusName !== "all") result = result.filter(p => p.craftBonusName === filterCraftBonusName);
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
    if (!isNaN(minTR) && minTR > 0) result = result.filter(p => p.topRollPercent !== null && p.topRollPercent >= minTR);

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
  }, [pets, filterRarity, filterShiny, filterEggType, filterElement, filterSeason, filterBackground, filterCombatBonusName, filterCombatStarTier, filterProfBonusName, filterCraftBonusName, filterMinCombatStars, filterMinProfStars, filterMinCraftStars, filterMinTotalStars, filterMinTopRoll, filterMaxPrice, filterMinPrice, filterCombatOnly, filterRealm, sortBy]);

  const resetFilters = () => {
    setSortBy("price-asc");
    setFilterRarity("all");
    setFilterShiny(false);
    setFilterEggType("all");
    setFilterElement("all");
    setFilterSeason("all");
    setFilterBackground("all");
    setFilterCombatBonusName("all");
    setFilterCombatStarTier("all");
    setFilterProfBonusName("all");
    setFilterCraftBonusName("all");
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
    filterCombatBonusName !== "all",
    filterCombatStarTier !== "all",
    filterProfBonusName !== "all",
    filterCraftBonusName !== "all",
    parseInt(filterMinCombatStars) > 0,
    parseInt(filterMinProfStars) > 0,
    parseInt(filterMinCraftStars) > 0,
    parseInt(filterMinTotalStars) > 0,
    filterMinTopRoll !== "" && parseFloat(filterMinTopRoll) > 0,
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
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/combat-pets"] })}
            disabled={isFetching}
            data-testid="button-refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
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
                <Label className="text-xs">Combat Bonus</Label>
                <Select value={filterCombatBonusName} onValueChange={setFilterCombatBonusName}>
                  <SelectTrigger data-testid="select-combat-bonus"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {uniqueValues.combatNames.map(n => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Label className="text-xs">Prof. Bonus</Label>
                <Select value={filterProfBonusName} onValueChange={setFilterProfBonusName}>
                  <SelectTrigger data-testid="select-prof-bonus"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {uniqueValues.profNames.map(n => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Craft Bonus</Label>
                <Select value={filterCraftBonusName} onValueChange={setFilterCraftBonusName}>
                  <SelectTrigger data-testid="select-craft-bonus"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {uniqueValues.craftNames.map(n => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

              <div className="space-y-1">
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

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading pets for sale...</span>
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
              <span className="text-xs">{pet.combatBonusName}</span>
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
              <td className="p-2">{pet.combatBonusName}</td>
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
