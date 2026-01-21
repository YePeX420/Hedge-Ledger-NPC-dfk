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
import { Calculator, DollarSign, Sparkles, TrendingUp, Loader2, Search, Info, ArrowUpDown, RefreshCw, Wallet, User } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

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

interface PoolProjection {
  pid: number;
  pairName: string;
  tvl: number;
  newTvl: number;
  lpShare: number;
  lpSharePct: string;
  poolAllocation: number;
  poolAllocationPct: string;
  crystalPerQuest: number;
  jewelPerQuest: number;
}

interface YieldProjectionResponse {
  ok: boolean;
  inputs: {
    investmentUSD: number;
    wisdom: number;
    vitality: number;
    gardeningSkill: number;
    hasGardeningGene: boolean;
    stamina: number;
    petBonusPct: number;
    petFed: boolean;
    heroFactor: number;
    petMultiplier: number;
  };
  rewardFund: {
    crystalPool: number;
    jewelPool: number;
  };
  projections: PoolProjection[];
}

type SortField = "pairName" | "tvl" | "lpSharePct" | "crystalPerQuest" | "jewelPerQuest";
type SortDirection = "asc" | "desc";

interface YieldEntry {
  heroId: string;
  level: number;
  class: string;
  subClass: string;
  profession: string;
  poolId: number;
  poolName: string;
  wisdom: number;
  vitality: number;
  gardeningSkill: number;
  hasGardeningGene: boolean;
  heroFactor: number;
  petMultiplier: number;
  lpShare: number;
  lpSharePct: string;
  poolAllocation: number;
  crystalPerStamina: number;
  jewelPerStamina: number;
  crystalPer25Stam: number;
  jewelPer25Stam: number;
  crystalPer30Stam: number;
  jewelPer30Stam: number;
}

interface QuestingHeroesResponse {
  ok: boolean;
  wallet: string;
  totalHeroes: number;
  questingHeroes: number;
  lpPositions: number;
  yields: YieldEntry[];
}

const EXAMPLE_HERO = {
  wisdom: 45,
  vitality: 43,
  gardeningSkill: 31,
  hasGardeningGene: true,
};

export default function YieldCalculator() {
  const [investmentAmount, setInvestmentAmount] = useState<string>("1000");
  const [staminaPerQuest, setStaminaPerQuest] = useState<string>("30");
  const [heroSource, setHeroSource] = useState<"example" | "custom">("example");
  const [customHeroId, setCustomHeroId] = useState<string>("");
  const [heroData, setHeroData] = useState<HeroData | null>(null);
  const [petBonusPct, setPetBonusPct] = useState<string>("0");
  const [sortField, setSortField] = useState<SortField>("crystalPerQuest");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [questingHeroes, setQuestingHeroes] = useState<QuestingHeroesResponse | null>(null);

  const walletMutation = useMutation({
    mutationFn: async (address: string) => {
      const response = await fetch(`/api/admin/gardening-calc/wallet/${address.toLowerCase()}/questing-heroes`);
      return response.json() as Promise<QuestingHeroesResponse>;
    },
    onSuccess: (data) => {
      setQuestingHeroes(data);
    },
  });

  const handleWalletLookup = () => {
    if (walletAddress && walletAddress.length >= 40) {
      walletMutation.mutate(walletAddress);
    }
  };

  const getActiveHeroStats = () => {
    if (heroSource === "custom" && heroData?.ok) {
      return {
        wisdom: heroData.wisdom,
        vitality: heroData.vitality,
        gardeningSkill: heroData.gardeningSkill,
        hasGardeningGene: heroData.hasGardeningGene,
      };
    }
    return EXAMPLE_HERO;
  };

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

  const yieldMutation = useMutation({
    mutationFn: async () => {
      const heroStats = getActiveHeroStats();
      const response = await apiRequest("POST", "/api/admin/gardening-calc/yield-projection", {
        investmentUSD: parseFloat(investmentAmount) || 1000,
        wisdom: heroStats.wisdom,
        vitality: heroStats.vitality,
        gardeningSkill: heroStats.gardeningSkill,
        hasGardeningGene: heroStats.hasGardeningGene,
        stamina: parseInt(staminaPerQuest) || 30,
        petBonusPct: parseFloat(petBonusPct) || 0,
        petFed: parseFloat(petBonusPct) > 0,
      });
      return response.json() as Promise<YieldProjectionResponse>;
    },
  });

  const handleFetchHero = () => {
    if (customHeroId) {
      fetchHeroMutation.mutate(customHeroId);
    }
  };

  const handleCalculate = () => {
    yieldMutation.mutate();
  };

  const projections = yieldMutation.data?.projections || [];

  const sortedProjections = [...projections].sort((a, b) => {
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
      case "lpSharePct":
        aVal = parseFloat(a.lpSharePct);
        bVal = parseFloat(b.lpSharePct);
        break;
      case "crystalPerQuest":
        aVal = a.crystalPerQuest;
        bVal = b.crystalPerQuest;
        break;
      case "jewelPerQuest":
        aVal = a.jewelPerQuest;
        bVal = b.jewelPerQuest;
        break;
      default:
        aVal = a.crystalPerQuest;
        bVal = b.crystalPerQuest;
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
    if (value < 0.0001) {
      return value.toExponential(2);
    }
    return value.toFixed(decimals);
  };

  const responseData = yieldMutation.data;

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
          Calculate expected CRYSTAL + JEWEL rewards per {staminaPerQuest} stamina quest
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Investment
            </CardTitle>
            <CardDescription>
              How much USD are you investing in the pool?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="investment">Investment (USD)</Label>
                <Input
                  id="investment"
                  type="number"
                  placeholder="1000"
                  value={investmentAmount}
                  onChange={(e) => setInvestmentAmount(e.target.value)}
                  data-testid="input-investment"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {[100, 500, 1000, 5000, 10000].map((amt) => (
                  <Button
                    key={amt}
                    variant={investmentAmount === amt.toString() ? "default" : "outline"}
                    size="sm"
                    onClick={() => setInvestmentAmount(amt.toString())}
                    data-testid={`button-preset-${amt}`}
                  >
                    ${amt.toLocaleString()}
                  </Button>
                ))}
              </div>
              <div>
                <Label htmlFor="stamina">Stamina per Quest</Label>
                <Input
                  id="stamina"
                  type="number"
                  placeholder="30"
                  value={staminaPerQuest}
                  onChange={(e) => setStaminaPerQuest(e.target.value)}
                  data-testid="input-stamina"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Hero Configuration
            </CardTitle>
            <CardDescription>
              Choose hero stats for calculations
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
                    WIS/VIT: {EXAMPLE_HERO.wisdom}/{EXAMPLE_HERO.vitality} | Gardening: {EXAMPLE_HERO.gardeningSkill}
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
              Pet Bonuses
            </CardTitle>
            <CardDescription>
              Configure pet Power Surge bonus
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="petBonus">Power Surge Bonus (%)</Label>
                <Input
                  id="petBonus"
                  type="number"
                  placeholder="0"
                  value={petBonusPct}
                  onChange={(e) => setPetBonusPct(e.target.value)}
                  data-testid="input-pet-bonus"
                />
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

              <Button 
                onClick={handleCalculate} 
                disabled={yieldMutation.isPending}
                className="w-full"
                data-testid="button-calculate"
              >
                {yieldMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Calculate Yields
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {responseData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Expected Rewards per {staminaPerQuest} Stamina Quest
            </CardTitle>
            <CardDescription>
              Both CRYSTAL and JEWEL rewards for ${parseFloat(investmentAmount).toLocaleString()} investment. Click headers to sort.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 p-3 rounded-md bg-muted text-sm">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-muted-foreground">
                <div>Hero Factor: <span className="font-mono">{responseData.inputs.heroFactor.toFixed(4)}</span></div>
                <div>Pet Multiplier: <span className="font-mono">{responseData.inputs.petMultiplier.toFixed(2)}x</span></div>
                <div>CRYSTAL Fund: <span className="font-mono">{(responseData.rewardFund.crystalPool / 1000000).toFixed(2)}M</span></div>
                <div>JEWEL Fund: <span className="font-mono">{(responseData.rewardFund.jewelPool / 1000).toFixed(0)}K</span></div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader field="pairName">Pool</SortHeader>
                    <SortHeader field="tvl">Current TVL</SortHeader>
                    <SortHeader field="lpSharePct">Your Share</SortHeader>
                    <SortHeader field="crystalPerQuest">CRYSTAL / Quest</SortHeader>
                    <SortHeader field="jewelPerQuest">JEWEL / Quest</SortHeader>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedProjections.map((proj) => (
                    <TableRow key={proj.pid} data-testid={`row-pool-${proj.pid}`}>
                      <TableCell className="font-medium">{proj.pairName}</TableCell>
                      <TableCell>
                        <div>{formatCurrency(proj.tvl)}</div>
                        <div className="text-xs text-muted-foreground">
                          → {formatCurrency(proj.newTvl)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{proj.lpSharePct}%</span>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                          {formatToken(proj.crystalPerQuest, 2)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm font-semibold text-purple-600 dark:text-purple-400">
                          {formatToken(proj.jewelPerQuest, 4)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {!responseData && !yieldMutation.isPending && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Enter your investment amount and click <strong>Calculate Yields</strong> to see expected CRYSTAL + JEWEL rewards per quest for each pool.
            Your LP share is calculated as: investment / (current TVL + your investment).
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallet Lookup
          </CardTitle>
          <CardDescription>
            Enter a wallet address to see active questing heroes with expected yields
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="0x..."
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              data-testid="input-wallet-address"
              className="font-mono"
            />
            <Button
              onClick={handleWalletLookup}
              disabled={walletMutation.isPending || !walletAddress || walletAddress.length < 40}
              data-testid="button-wallet-lookup"
            >
              {walletMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {questingHeroes?.ok && questingHeroes.yields.length === 0 && (
            <div className="text-center text-muted-foreground py-4">
              No active questing heroes found for this wallet
            </div>
          )}

          {questingHeroes?.ok && questingHeroes.yields.length > 0 && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {questingHeroes.questingHeroes} hero(es) questing across {questingHeroes.lpPositions} LP position(s) = {questingHeroes.yields.length} yield entries
                {questingHeroes.yields.length > 50 && (
                  <span className="block mt-1 text-orange-600 dark:text-orange-400">
                    Showing first 50 results. Use a wallet with fewer heroes for full details.
                  </span>
                )}
              </div>
              
              <Alert className="text-xs">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Pet bonuses not yet included. Actual yields may be higher with fed pets.
                </AlertDescription>
              </Alert>
              
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hero</TableHead>
                      <TableHead>Pool</TableHead>
                      <TableHead>Hero Factor</TableHead>
                      <TableHead>LP Share</TableHead>
                      <TableHead>CRYSTAL/30 stam</TableHead>
                      <TableHead>JEWEL/30 stam</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {questingHeroes.yields.slice(0, 50).map((entry, idx) => (
                      <TableRow key={`${entry.heroId}-${entry.poolId}-${idx}`} data-testid={`row-yield-${idx}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium">#{entry.heroId}</div>
                              <div className="text-xs text-muted-foreground">
                                Lv{entry.level} {entry.class}
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {entry.hasGardeningGene ? "Gardener" : entry.profession} | Grd: {entry.gardeningSkill / 10}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{entry.poolName}</div>
                          <div className="text-xs text-muted-foreground">
                            Pool {entry.poolId}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{entry.heroFactor.toFixed(4)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{entry.lpSharePct}%</span>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                            {formatToken(entry.crystalPer30Stam, 2)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-sm font-semibold text-purple-600 dark:text-purple-400">
                            {formatToken(entry.jewelPer30Stam, 4)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {responseData && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Formula:</strong> earnRate = rewardPool × poolAllocation × lpShare × heroFactor / ((300 - 50×geneBonus) × rewardModBase)
            <span className="block mt-1 text-muted-foreground">
              LP Share = Investment / (Current TVL + Investment). Assumes dual-hero gardening (one hero earns CRYSTAL, one earns JEWEL).
            </span>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
