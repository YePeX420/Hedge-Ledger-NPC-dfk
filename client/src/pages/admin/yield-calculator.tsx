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
import { Calculator, DollarSign, TrendingUp, Loader2, Search, Info, ArrowUpDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Pool {
  pid: number;
  pairName: string;
  lpToken: string;
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
  passiveAPR: number;
  activeAPRMin: number;
  activeAPRMax: number;
  dailyPassive: number;
  dailyActiveMin: number;
  dailyActiveMax: number;
  weeklyPassive: number;
  weeklyActiveMin: number;
  weeklyActiveMax: number;
  monthlyPassive: number;
  monthlyActiveMin: number;
  monthlyActiveMax: number;
}

type SortField = "pairName" | "tvl" | "passiveAPR" | "dailyActiveMax" | "monthlyActiveMax";
type SortDirection = "asc" | "desc";

const EXAMPLE_HERO_ID = "123456";
const EXAMPLE_PET_ID = "789";

export default function YieldCalculator() {
  const [investmentAmount, setInvestmentAmount] = useState<string>("1000");
  const [heroSource, setHeroSource] = useState<"example" | "custom">("example");
  const [customHeroId, setCustomHeroId] = useState<string>("");
  const [customPetId, setCustomPetId] = useState<string>("");
  const [heroData, setHeroData] = useState<HeroData | null>(null);
  const [sortField, setSortField] = useState<SortField>("monthlyActiveMax");
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

  const investment = parseFloat(investmentAmount) || 0;

  const calculateProjectedRewards = (): ProjectedReward[] => {
    if (!poolsData?.pools || investment <= 0) return [];

    return poolsData.pools.map((pool) => {
      const passiveAPR = pool.passiveAPR || 0;
      const activeAPRMin = pool.activeAPRMin || 0;
      const activeAPRMax = pool.activeAPRMax || 0;

      const dailyPassive = (investment * passiveAPR) / 365;
      const dailyActiveMin = (investment * activeAPRMin) / 365;
      const dailyActiveMax = (investment * activeAPRMax) / 365;

      return {
        pid: pool.pid,
        pairName: pool.pairName,
        tvl: pool.tvl,
        passiveAPR,
        activeAPRMin,
        activeAPRMax,
        dailyPassive,
        dailyActiveMin,
        dailyActiveMax,
        weeklyPassive: dailyPassive * 7,
        weeklyActiveMin: dailyActiveMin * 7,
        weeklyActiveMax: dailyActiveMax * 7,
        monthlyPassive: dailyPassive * 30,
        monthlyActiveMin: dailyActiveMin * 30,
        monthlyActiveMax: dailyActiveMax * 30,
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
      case "passiveAPR":
        aVal = a.passiveAPR;
        bVal = b.passiveAPR;
        break;
      case "dailyActiveMax":
        aVal = a.dailyActiveMax;
        bVal = b.dailyActiveMax;
        break;
      case "monthlyActiveMax":
        aVal = a.monthlyActiveMax;
        bVal = b.monthlyActiveMax;
        break;
      default:
        aVal = a.monthlyActiveMax;
        bVal = b.monthlyActiveMax;
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

  const formatAPR = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

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
          Calculate expected gardening rewards for any investment amount across all pools
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Investment Amount
            </CardTitle>
            <CardDescription>
              Enter the dollar amount you want to simulate investing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="investment">Investment (USD)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="investment"
                    type="number"
                    placeholder="1000"
                    value={investmentAmount}
                    onChange={(e) => setInvestmentAmount(e.target.value)}
                    data-testid="input-investment"
                  />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[100, 500, 1000, 5000, 10000].map((amt) => (
                  <Button
                    key={amt}
                    variant="outline"
                    size="sm"
                    onClick={() => setInvestmentAmount(amt.toString())}
                    data-testid={`button-preset-${amt}`}
                  >
                    ${amt.toLocaleString()}
                  </Button>
                ))}
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
                    <SelectItem value="example">Example Hero #{EXAMPLE_HERO_ID}</SelectItem>
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
                  <div>
                    <Label htmlFor="customPetId">Pet ID (optional)</Label>
                    <Input
                      id="customPetId"
                      placeholder="e.g. 789"
                      value={customPetId}
                      onChange={(e) => setCustomPetId(e.target.value)}
                      data-testid="input-custom-pet-id"
                    />
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
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Calculations use example Hero #{EXAMPLE_HERO_ID} with Pet #{EXAMPLE_PET_ID}. 
                    Active APR estimates assume a typical Level 10 gardener with the gardening gene.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Projected Rewards by Pool
          </CardTitle>
          <CardDescription>
            Expected returns for ${investment.toLocaleString()} investment. Click column headers to sort.
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
                    <SortHeader field="passiveAPR">Passive APR</SortHeader>
                    <TableHead>Active APR</TableHead>
                    <SortHeader field="dailyActiveMax">Daily Est.</SortHeader>
                    <TableHead>Weekly Est.</TableHead>
                    <SortHeader field="monthlyActiveMax">Monthly Est.</SortHeader>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRewards.map((reward) => (
                    <TableRow key={reward.pid} data-testid={`row-pool-${reward.pid}`}>
                      <TableCell className="font-medium">{reward.pairName}</TableCell>
                      <TableCell>{formatCurrency(reward.tvl)}</TableCell>
                      <TableCell>{formatAPR(reward.passiveAPR)}</TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">
                          {formatAPR(reward.activeAPRMin)} - {formatAPR(reward.activeAPRMax)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="font-mono text-sm">
                            ${reward.dailyPassive.toFixed(2)} - ${(reward.dailyPassive + reward.dailyActiveMax).toFixed(2)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm">
                          ${reward.weeklyPassive.toFixed(2)} - ${(reward.weeklyPassive + reward.weeklyActiveMax).toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm font-semibold text-green-600 dark:text-green-400">
                          ${reward.monthlyPassive.toFixed(2)} - ${(reward.monthlyPassive + reward.monthlyActiveMax).toFixed(2)}
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
          <strong>Note:</strong> These projections are estimates based on current APR rates and assume consistent pool conditions. 
          Actual rewards depend on hero stats, pet bonuses, pool share, market conditions, and CRYSTAL/JEWEL prices.
          {heroSource === "example" && (
            <span className="block mt-1">
              Using example Hero #{EXAMPLE_HERO_ID} with Pet #{EXAMPLE_PET_ID} for calculations.
            </span>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}
