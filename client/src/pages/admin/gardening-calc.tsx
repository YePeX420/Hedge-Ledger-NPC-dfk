import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Calculator, CheckCircle, AlertTriangle, Sprout, Wallet, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const POOL_OPTIONS = [
  { id: 0, name: "wJEWEL-xJEWEL" },
  { id: 1, name: "CRYSTAL-AVAX" },
  { id: 2, name: "CRYSTAL-wJEWEL" },
  { id: 3, name: "CRYSTAL-USDC" },
  { id: 4, name: "ETH-USDC" },
  { id: 5, name: "wJEWEL-USDC" },
  { id: 6, name: "CRYSTAL-ETH" },
  { id: 7, name: "CRYSTAL-BTC.b" },
  { id: 8, name: "CRYSTAL-KLAY" },
  { id: 9, name: "wJEWEL-KLAY" },
  { id: 10, name: "wJEWEL-AVAX" },
  { id: 11, name: "wJEWEL-BTC.b" },
  { id: 12, name: "wJEWEL-ETH" },
  { id: 13, name: "BTC.b-USDC" },
];

interface CalculatorResult {
  ok: boolean;
  poolId: number;
  poolName: string;
  inputs: {
    wisdom: number;
    vitality: number;
    gardeningSkill: number;
    effectiveGrdSkill: number;
    hasGardeningGene: boolean;
    stamina: number;
    petBonusPct: number;
    skilledGreenskeeperBonus: number;
    petFed: boolean;
  };
  formula: {
    heroFactor: number;
    petMultiplier: number;
    poolAllocation: number;
    lpShare: number;
    userLp: number;
    poolTotalLp: number;
    rewardModBase: number;
    geneBonus: number;
  };
  rewardFund: {
    crystalPool: number;
    jewelPool: number;
  };
  perStamina: {
    crystal: number;
    jewel: number;
  };
  totalRewards: {
    crystal: number;
    jewel: number;
  };
}

interface ValidationSummary {
  ok: boolean;
  summary: {
    totalRewards: string;
    withSnapshots: string;
    crystalRewards: string;
    jewelRewards: string;
    avgRewardAmount: string;
    uniqueHeroes: string;
    uniquePlayers: string;
  };
  poolBreakdown: Array<{
    poolId: number;
    poolName: string;
    count: number;
    avgReward: number;
  }>;
}

interface ValidationAccuracy {
  ok: boolean;
  totalIndexedRewards: number;
  validatedCount: number;
  accuracy: {
    avgErrorPct: string;
    accuracyPct: string;
    within5pct: number;
    within10pct: number;
    within20pct: number;
    within5pctRate: string;
    within10pctRate: string;
  };
  assumptions: {
    heroFactor: number;
    hasGardeningGene: boolean;
    gardeningSkill: number;
    note: string;
  };
  validations: Array<{
    heroId: number;
    poolId: number;
    poolName: string;
    rewardSymbol: string;
    actual: number;
    predicted: number;
    errorPct: number;
    lpSharePct: string;
    estimatedStamina: number;
    timestamp: string;
  }>;
}

export default function GardeningCalcAdmin() {
  const { toast } = useToast();
  
  const [poolId, setPoolId] = useState("2");
  const [wisdom, setWisdom] = useState("50");
  const [vitality, setVitality] = useState("50");
  const [gardeningSkill, setGardeningSkill] = useState("50");
  const [hasGardeningGene, setHasGardeningGene] = useState(false);
  const [stamina, setStamina] = useState([25]);
  const [petBonusPct, setPetBonusPct] = useState("0");
  const [skilledGreenskeeperBonus, setSkilledGreenskeeperBonus] = useState("0");
  const [petFed, setPetFed] = useState(true);
  const [lpSharePct, setLpSharePct] = useState("0.1");
  const [playerAddress, setPlayerAddress] = useState("");

  const { data: rewardFund, isLoading: rewardFundLoading } = useQuery<{ ok: boolean; crystalPool: number; jewelPool: number }>({
    queryKey: ["/api/admin/gardening-calc/reward-fund"],
    refetchInterval: 60000,
  });

  const { data: validationSummary, isLoading: summaryLoading } = useQuery<ValidationSummary>({
    queryKey: ["/api/admin/gardening-validate/summary"],
  });

  const calculateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/gardening-calc/calculate", {
        poolId: parseInt(poolId),
        playerAddress: playerAddress || "0x0000000000000000000000000000000000000000",
        wisdom: parseInt(wisdom),
        vitality: parseInt(vitality),
        gardeningSkill: parseInt(gardeningSkill),
        hasGardeningGene,
        stamina: stamina[0],
        petBonusPct: parseInt(petBonusPct),
        skilledGreenskeeperBonus: parseInt(skilledGreenskeeperBonus),
        petFed,
        lpShareOverride: playerAddress ? null : parseFloat(lpSharePct) / 100,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/gardening-validate/accuracy", {
        limit: 100,
        assumedHeroFactor: 0.3,
        assumedGeneBonus: false,
        assumedGardeningSkill: 50,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const calcResult = calculateMutation.data as CalculatorResult | undefined;
  const validationResult = validateMutation.data as ValidationAccuracy | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Sprout className="h-6 w-6" />
            Gardening Yield Calculator
          </h1>
          <p className="text-muted-foreground">
            Calculate expected rewards and validate against indexed on-chain data
          </p>
        </div>
      </div>

      <Tabs defaultValue="calculator" className="space-y-4">
        <TabsList>
          <TabsTrigger value="calculator" data-testid="tab-calculator">
            <Calculator className="h-4 w-4 mr-2" />
            Calculator
          </TabsTrigger>
          <TabsTrigger value="validation" data-testid="tab-validation">
            <Target className="h-4 w-4 mr-2" />
            Validation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calculator" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Inputs</CardTitle>
                <CardDescription>
                  Enter hero stats, pool, and stamina to calculate expected rewards
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="poolId">Garden Pool</Label>
                    <Select value={poolId} onValueChange={setPoolId}>
                      <SelectTrigger data-testid="select-pool">
                        <SelectValue placeholder="Select pool" />
                      </SelectTrigger>
                      <SelectContent>
                        {POOL_OPTIONS.map((pool) => (
                          <SelectItem key={pool.id} value={String(pool.id)}>
                            {pool.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lpShare">LP Share %</Label>
                    <Input
                      id="lpShare"
                      type="number"
                      step="0.001"
                      value={lpSharePct}
                      onChange={(e) => setLpSharePct(e.target.value)}
                      placeholder="0.1"
                      data-testid="input-lp-share"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="playerAddress">Player Address (optional)</Label>
                  <Input
                    id="playerAddress"
                    value={playerAddress}
                    onChange={(e) => setPlayerAddress(e.target.value)}
                    placeholder="0x... (leave empty to use LP Share %)"
                    data-testid="input-player-address"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="wisdom">Wisdom</Label>
                    <Input
                      id="wisdom"
                      type="number"
                      value={wisdom}
                      onChange={(e) => setWisdom(e.target.value)}
                      data-testid="input-wisdom"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vitality">Vitality</Label>
                    <Input
                      id="vitality"
                      type="number"
                      value={vitality}
                      onChange={(e) => setVitality(e.target.value)}
                      data-testid="input-vitality"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gardeningSkill">Gardening Skill</Label>
                    <Input
                      id="gardeningSkill"
                      type="number"
                      value={gardeningSkill}
                      onChange={(e) => setGardeningSkill(e.target.value)}
                      placeholder="0-100"
                      data-testid="input-gardening-skill"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="hasGene"
                      checked={hasGardeningGene}
                      onCheckedChange={setHasGardeningGene}
                      data-testid="switch-gardening-gene"
                    />
                    <Label htmlFor="hasGene">Gardening Gene (20% bonus)</Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Stamina: {stamina[0]}</Label>
                  </div>
                  <Slider
                    value={stamina}
                    onValueChange={setStamina}
                    max={250}
                    min={1}
                    step={1}
                    data-testid="slider-stamina"
                  />
                </div>

                <div className="border-t pt-4 space-y-4">
                  <h4 className="font-medium">Pet Bonuses</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="petBonus">Power Surge %</Label>
                      <Input
                        id="petBonus"
                        type="number"
                        value={petBonusPct}
                        onChange={(e) => setPetBonusPct(e.target.value)}
                        placeholder="0-50"
                        data-testid="input-pet-bonus"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="greenskeeper">Skilled Greenskeeper</Label>
                      <Input
                        id="greenskeeper"
                        type="number"
                        value={skilledGreenskeeperBonus}
                        onChange={(e) => setSkilledGreenskeeperBonus(e.target.value)}
                        placeholder="0-50"
                        data-testid="input-greenskeeper"
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="petFed"
                      checked={petFed}
                      onCheckedChange={setPetFed}
                      data-testid="switch-pet-fed"
                    />
                    <Label htmlFor="petFed">Pet Fed (required for bonus)</Label>
                  </div>
                </div>

                <Button 
                  onClick={() => calculateMutation.mutate()} 
                  disabled={calculateMutation.isPending}
                  className="w-full"
                  data-testid="button-calculate"
                >
                  {calculateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Calculator className="h-4 w-4 mr-2" />
                  )}
                  Calculate Rewards
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Quest Reward Fund</CardTitle>
                  <CardDescription>Current balances available for rewards</CardDescription>
                </CardHeader>
                <CardContent>
                  {rewardFundLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-blue-500/10 rounded-lg">
                        <div className="text-2xl font-bold text-blue-500" data-testid="text-crystal-pool">
                          {rewardFund?.crystalPool?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-sm text-muted-foreground">CRYSTAL</div>
                      </div>
                      <div className="text-center p-4 bg-purple-500/10 rounded-lg">
                        <div className="text-2xl font-bold text-purple-500" data-testid="text-jewel-pool">
                          {rewardFund?.jewelPool?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-sm text-muted-foreground">JEWEL</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {calcResult?.ok && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      Calculated Rewards
                    </CardTitle>
                    <CardDescription>
                      {calcResult.poolName} with {calcResult.inputs.stamina} stamina
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-blue-500/10 rounded-lg">
                        <div className="text-2xl font-bold text-blue-500" data-testid="text-crystal-reward">
                          {calcResult.totalRewards.crystal.toFixed(4)}
                        </div>
                        <div className="text-sm text-muted-foreground">CRYSTAL</div>
                        <div className="text-xs text-muted-foreground">
                          {calcResult.perStamina.crystal.toFixed(6)}/stam
                        </div>
                      </div>
                      <div className="text-center p-4 bg-purple-500/10 rounded-lg">
                        <div className="text-2xl font-bold text-purple-500" data-testid="text-jewel-reward">
                          {calcResult.totalRewards.jewel.toFixed(4)}
                        </div>
                        <div className="text-sm text-muted-foreground">JEWEL</div>
                        <div className="text-xs text-muted-foreground">
                          {calcResult.perStamina.jewel.toFixed(6)}/stam
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4 space-y-2 text-sm">
                      <h4 className="font-medium">Formula Details</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div>Hero Factor:</div>
                        <div className="font-mono">{calcResult.formula.heroFactor.toFixed(4)}</div>
                        <div>Pet Multiplier:</div>
                        <div className="font-mono">{calcResult.formula.petMultiplier.toFixed(2)}x</div>
                        <div>Pool Allocation:</div>
                        <div className="font-mono">{(calcResult.formula.poolAllocation * 100).toFixed(2)}%</div>
                        <div>LP Share:</div>
                        <div className="font-mono">{(calcResult.formula.lpShare * 100).toFixed(4)}%</div>
                        <div>Reward Mod Base:</div>
                        <div className="font-mono">{calcResult.formula.rewardModBase}</div>
                        <div>Gene Bonus:</div>
                        <div className="font-mono">{calcResult.formula.geneBonus ? "Yes (20%)" : "No"}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="validation" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Total Indexed Rewards</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-indexed">
                  {summaryLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : validationSummary?.summary?.totalRewards || "0"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">With LP Snapshots</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-with-snapshots">
                  {summaryLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : validationSummary?.summary?.withSnapshots || "0"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Unique Heroes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-unique-heroes">
                  {summaryLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : validationSummary?.summary?.uniqueHeroes || "0"}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Formula Accuracy Validation</span>
                <Button 
                  onClick={() => validateMutation.mutate()} 
                  disabled={validateMutation.isPending}
                  data-testid="button-validate"
                >
                  {validateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Target className="h-4 w-4 mr-2" />
                  )}
                  Run Validation
                </Button>
              </CardTitle>
              <CardDescription>
                Compare formula predictions against actual indexed on-chain rewards
              </CardDescription>
            </CardHeader>
            <CardContent>
              {validationResult?.ok && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold" data-testid="text-accuracy-pct">
                        {validationResult.accuracy.accuracyPct}%
                      </div>
                      <div className="text-sm text-muted-foreground">Accuracy</div>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">{validationResult.validatedCount}</div>
                      <div className="text-sm text-muted-foreground">Validated</div>
                    </div>
                    <div className="text-center p-4 bg-green-500/10 rounded-lg">
                      <div className="text-2xl font-bold text-green-500">
                        {validationResult.accuracy.within5pctRate}%
                      </div>
                      <div className="text-sm text-muted-foreground">Within 5%</div>
                    </div>
                    <div className="text-center p-4 bg-yellow-500/10 rounded-lg">
                      <div className="text-2xl font-bold text-yellow-500">
                        {validationResult.accuracy.within10pctRate}%
                      </div>
                      <div className="text-sm text-muted-foreground">Within 10%</div>
                    </div>
                  </div>

                  <div className="bg-muted/50 p-3 rounded-lg text-sm">
                    <AlertTriangle className="h-4 w-4 inline mr-2" />
                    <strong>Note:</strong> {validationResult.assumptions.note}
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hero</TableHead>
                        <TableHead>Pool</TableHead>
                        <TableHead>Token</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Predicted</TableHead>
                        <TableHead className="text-right">Error %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validationResult.validations.slice(0, 10).map((v, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono">{v.heroId}</TableCell>
                          <TableCell>{v.poolName}</TableCell>
                          <TableCell>
                            <Badge variant={v.rewardSymbol === "CRYSTAL" ? "default" : "secondary"}>
                              {v.rewardSymbol}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">{v.actual.toFixed(4)}</TableCell>
                          <TableCell className="text-right font-mono">{v.predicted.toFixed(4)}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={v.errorPct < 5 ? "default" : v.errorPct < 20 ? "secondary" : "destructive"}>
                              {v.errorPct.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {!validationResult && !validateMutation.isPending && (
                <div className="text-center py-8 text-muted-foreground">
                  Click "Run Validation" to compare formula predictions with indexed data
                </div>
              )}
            </CardContent>
          </Card>

          {validationSummary?.poolBreakdown && validationSummary.poolBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Indexed Data by Pool</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pool</TableHead>
                      <TableHead className="text-right">Rewards Count</TableHead>
                      <TableHead className="text-right">Avg Reward</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationSummary.poolBreakdown.map((pool) => (
                      <TableRow key={pool.poolId}>
                        <TableCell>{pool.poolName}</TableCell>
                        <TableCell className="text-right">{pool.count}</TableCell>
                        <TableCell className="text-right font-mono">{pool.avgReward.toFixed(4)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
