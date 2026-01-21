import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calculator, Sparkles, TrendingUp, Loader2, Search, Info, ArrowUpDown } from "lucide-react";

interface Pool {
  pid: number;
  pairName: string;
  lpToken: string;
  tokens: Array<{ symbol: string; address: string }>;
  tvl: number;
  passiveAPR: number;
  activeAPRMin: number;
  activeAPRMax: number;
  totalAPRMin: number;
  totalAPRMax: number;
}

interface PoolsResponse {
  pools: Pool[];
  count: number;
}

interface HeroData {
  ok: boolean;
  heroId: number;
  level: number;
  class: string;
  subClass: string;
  profession: string;
  hasGardeningGene: boolean;
  gardeningSkill: number;
  wisdom: number;
  vitality: number;
}

interface ProjectedReward {
  pid: number;
  pairName: string;
  tvl: number;
  rewardToken: "CRYSTAL" | "JEWEL";
  per30Stamina: number;
  dailyReward: number;
  weeklyReward: number;
  monthlyReward: number;
}

type SortField = "pairName" | "tvl" | "per30Stamina" | "dailyReward" | "monthlyReward";
type SortDirection = "asc" | "desc";

const CRYSTAL_BASE_PER_ATTEMPT = 1.82;
const JEWEL_BASE_PER_ATTEMPT = 0.14;

const EXAMPLE_HERO = {
  level: 10,
  wisdom: 45,
  vitality: 43,
  gardening: 310,
  hasGardeningGene: true,
};

function computeHeroGardeningFactor(hero: { wisdom: number; vitality: number; gardening: number }) {
  const wis = hero.wisdom ?? 0;
  const vit = hero.vitality ?? 0;
  const gardeningSkill = (hero.gardening ?? 0) / 10;
  return 0.1 + (wis + vit) / 1222.22 + gardeningSkill / 244.44;
}

function computeStaminaPerDay(level: number, hasRapidRenewal: boolean = false) {
  const baseTickSeconds = 20 * 60;
  let tickSeconds = baseTickSeconds;
  if (hasRapidRenewal) {
    const reduction = level * 3;
    tickSeconds = Math.max(baseTickSeconds - reduction, 5 * 60);
  }
  return (24 * 60 * 60) / tickSeconds;
}

function getRewardToken(pool: Pool): "CRYSTAL" | "JEWEL" {
  const tokens = pool.tokens || [];
  const tokenSymbols = tokens.map(t => (t.symbol || '').toUpperCase());
  
  if (tokenSymbols.includes("CRYSTAL")) {
    return "CRYSTAL";
  }
  if (tokenSymbols.includes("WJEWEL") || tokenSymbols.includes("JEWEL")) {
    return "JEWEL";
  }
  if (pool.pairName.toUpperCase().includes("CRYSTAL")) {
    return "CRYSTAL";
  }
  return "JEWEL";
}

export default function YieldCalculator() {
  const [heroSource, setHeroSource] = useState<"example" | "custom">("example");
  const [customHeroId, setCustomHeroId] = useState<string>("");
  const [heroData, setHeroData] = useState<HeroData | null>(null);
  const [hasRapidRenewal, setHasRapidRenewal] = useState<boolean>(false);
  const [petBonusPct, setPetBonusPct] = useState<string>("0");
  const [sortField, setSortField] = useState<SortField>("monthlyReward");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { data: poolsData, isLoading: poolsLoading } = useQuery<PoolsResponse>({
    queryKey: ["/api/admin/pools"],
  });

  const fetchHeroMutation = useMutation({
    mutationFn: async (heroId: string) => {
      const response = await fetch(`/api/admin/gardening-calc/hero/${heroId}`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.ok) {
        setHeroData(data);
      }
    },
  });

  const handleFetchHero = () => {
    if (customHeroId) {
      fetchHeroMutation.mutate(customHeroId);
    }
  };

  const getActiveHero = () => {
    if (heroSource === "custom" && heroData?.ok) {
      return {
        level: heroData.level,
        wisdom: heroData.wisdom,
        vitality: heroData.vitality,
        gardening: heroData.gardeningSkill * 10,
        hasGardeningGene: heroData.hasGardeningGene,
      };
    }
    return EXAMPLE_HERO;
  };

  const calculateProjectedRewards = (): ProjectedReward[] => {
    if (!poolsData?.pools) return [];

    const hero = getActiveHero();
    const factor = computeHeroGardeningFactor(hero);
    const staminaPerDay = computeStaminaPerDay(hero.level, hasRapidRenewal);
    const petMultiplier = 1 + (parseFloat(petBonusPct) || 0) / 100;

    return poolsData.pools.map((pool) => {
      const rewardToken = getRewardToken(pool);
      const basePerAttempt = rewardToken === "CRYSTAL" ? CRYSTAL_BASE_PER_ATTEMPT : JEWEL_BASE_PER_ATTEMPT;
      
      const perStamina = basePerAttempt * factor * petMultiplier;
      const per30Stamina = perStamina * 30;
      const dailyReward = perStamina * staminaPerDay;

      return {
        pid: pool.pid,
        pairName: pool.pairName,
        tvl: pool.tvl,
        rewardToken,
        per30Stamina,
        dailyReward,
        weeklyReward: dailyReward * 7,
        monthlyReward: dailyReward * 30,
      };
    });
  };

  const projectedRewards = calculateProjectedRewards();

  const sortedRewards = [...projectedRewards].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;

    switch (sortField) {
      case "pairName":
        aVal = a.pairName;
        bVal = b.pairName;
        break;
      case "tvl":
        aVal = a.tvl;
        bVal = b.tvl;
        break;
      case "per30Stamina":
        aVal = a.per30Stamina;
        bVal = b.per30Stamina;
        break;
      case "dailyReward":
        aVal = a.dailyReward;
        bVal = b.dailyReward;
        break;
      case "monthlyReward":
        aVal = a.monthlyReward;
        bVal = b.monthlyReward;
        break;
      default:
        aVal = a.monthlyReward;
        bVal = b.monthlyReward;
    }

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDirection === "asc" 
        ? aVal.localeCompare(bVal) 
        : bVal.localeCompare(aVal);
    }

    return sortDirection === "asc" 
      ? (aVal as number) - (bVal as number) 
      : (bVal as number) - (aVal as number);
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  const formatToken = (value: number, decimals: number = 4) => {
    if (value >= 1000) {
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return value.toFixed(decimals);
  };

  const activeHero = getActiveHero();
  const heroFactor = computeHeroGardeningFactor(activeHero);
  const staminaPerDay = computeStaminaPerDay(activeHero.level, hasRapidRenewal);

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead 
      className="cursor-pointer hover-elevate select-none"
      onClick={() => handleSort(field)}
      data-testid={`header-${field}`}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortField === field ? "opacity-100" : "opacity-40"}`} />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Yield Calculator</h1>
        <p className="text-muted-foreground">
          Calculate expected CRYSTAL/JEWEL rewards per 30 stamina gardening quest
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Hero Configuration
            </CardTitle>
            <CardDescription>
              Choose which hero stats to use for gardening quest calculations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Hero Source</Label>
                <Select
                  value={heroSource}
                  onValueChange={(v) => setHeroSource(v as "example" | "custom")}
                >
                  <SelectTrigger data-testid="select-hero-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="example">Example Hero (Lv10 Gardener)</SelectItem>
                    <SelectItem value="custom">Custom Hero ID</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {heroSource === "custom" && (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="customHeroId">Hero ID</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        id="customHeroId"
                        placeholder="e.g. 123456"
                        value={customHeroId}
                        onChange={(e) => setCustomHeroId(e.target.value)}
                        data-testid="input-custom-hero-id"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleFetchHero}
                        disabled={fetchHeroMutation.isPending || !customHeroId}
                        data-testid="button-fetch-hero"
                      >
                        {fetchHeroMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  {heroData?.ok && (
                    <div className="p-3 rounded-md bg-muted text-sm space-y-1">
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline">{heroData.class}/{heroData.subClass}</Badge>
                        <Badge variant="outline">Lv {heroData.level}</Badge>
                        <Badge variant={heroData.hasGardeningGene ? "default" : "secondary"}>
                          {heroData.profession}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground">
                        WIS/VIT: {heroData.wisdom}/{heroData.vitality} | Gardening: {heroData.gardeningSkill}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {heroSource === "example" && (
                <div className="p-3 rounded-md bg-muted text-sm">
                  <div className="flex gap-2 flex-wrap mb-1">
                    <Badge variant="outline">Lv 10</Badge>
                    <Badge variant="default">Gardener</Badge>
                  </div>
                  <div className="text-muted-foreground">
                    WIS/VIT: 45/43 | Gardening: 31 | Factor: {heroFactor.toFixed(3)}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Bonuses & Modifiers
            </CardTitle>
            <CardDescription>
              Configure pet bonuses and power-ups
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="petBonus">Pet Power Surge Bonus (%)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="petBonus"
                    type="number"
                    placeholder="0"
                    value={petBonusPct}
                    onChange={(e) => setPetBonusPct(e.target.value)}
                    data-testid="input-pet-bonus"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Enter pet's Power Surge % (e.g., 20 for +20% boost)
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[0, 10, 15, 20, 25].map((pct) => (
                  <Button
                    key={pct}
                    variant={petBonusPct === pct.toString() ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPetBonusPct(pct.toString())}
                    data-testid={`button-pet-${pct}`}
                  >
                    {pct === 0 ? "No Pet" : `+${pct}%`}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="rapidRenewal"
                  checked={hasRapidRenewal}
                  onChange={(e) => setHasRapidRenewal(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                  data-testid="checkbox-rapid-renewal"
                />
                <Label htmlFor="rapidRenewal" className="cursor-pointer">
                  Has Rapid Renewal (faster stamina regen)
                </Label>
              </div>

              <div className="p-3 rounded-md bg-muted text-sm">
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div>Stamina/Day:</div>
                  <div className="font-mono">{staminaPerDay.toFixed(1)}</div>
                  <div>30-Stam Quests/Day:</div>
                  <div className="font-mono">{(staminaPerDay / 30).toFixed(2)}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Projected Token Rewards by Pool
          </CardTitle>
          <CardDescription>
            Expected CRYSTAL/JEWEL rewards per 30 stamina quest. Click column headers to sort.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {poolsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader field="pairName">Pool</SortHeader>
                    <SortHeader field="tvl">TVL</SortHeader>
                    <TableHead>Token</TableHead>
                    <SortHeader field="per30Stamina">Per 30 Stamina</SortHeader>
                    <SortHeader field="dailyReward">Daily</SortHeader>
                    <TableHead>Weekly</TableHead>
                    <SortHeader field="monthlyReward">Monthly</SortHeader>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRewards.map((reward) => (
                    <TableRow key={reward.pid} data-testid={`row-pool-${reward.pid}`}>
                      <TableCell className="font-medium">{reward.pairName}</TableCell>
                      <TableCell>{formatCurrency(reward.tvl)}</TableCell>
                      <TableCell>
                        <Badge variant={reward.rewardToken === "CRYSTAL" ? "default" : "secondary"}>
                          {reward.rewardToken}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm font-semibold">
                          {formatToken(reward.per30Stamina)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm">
                          {formatToken(reward.dailyReward, 2)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm">
                          {formatToken(reward.weeklyReward, 2)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm font-semibold text-green-600 dark:text-green-400">
                          {formatToken(reward.monthlyReward, 2)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Note:</strong> Token rewards are calculated using the base yield formula: 
          <code className="mx-1 px-1 bg-muted rounded text-xs">baseRate × heroFactor × petMultiplier × stamina</code>.
          Base rates are {CRYSTAL_BASE_PER_ATTEMPT} CRYSTAL and {JEWEL_BASE_PER_ATTEMPT} JEWEL per stamina for factor-1.0 heroes.
          <span className="block mt-1">
            Hero Factor: {heroFactor.toFixed(3)} | Stamina/Day: {staminaPerDay.toFixed(1)}
          </span>
        </AlertDescription>
      </Alert>
    </div>
  );
}
