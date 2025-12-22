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
import { Loader2, Calculator, CheckCircle, AlertTriangle, Sprout, Wallet, Target, Search, User, Cat } from "lucide-react";
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

interface HeroData {
  ok: boolean;
  heroId: string;
  class: string;
  subClass: string;
  profession: string;
  level: number;
  wisdom: number;
  vitality: number;
  gardeningSkill: number;
  hasGardeningGene: boolean;
  stamina: number;
  error?: string;
}

interface PetData {
  ok: boolean;
  petId: string;
  name: string;
  eggType: number;
  rarity: number;
  isGardeningPet: boolean;
  isFed: boolean;
  powerSurgeBonus: number;
  skilledGreenskeeperBonus: number;
  bonusType: string | null;
  error?: string;
}

interface PoolPosition {
  poolId: number;
  poolName: string;
  userLp: number;
  poolTotalLp: number;
  lpShare: number;
  lpSharePct: string;
}

interface WalletPositions {
  ok: boolean;
  positions: PoolPosition[];
  error?: string;
}

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

export default function GardeningCalcAdmin() {
  const { toast } = useToast();
  
  const [heroId, setHeroId] = useState("");
  const [petId, setPetId] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [poolId, setPoolId] = useState("2");
  const [lpSharePct, setLpSharePct] = useState("0.1");
  const [stamina, setStamina] = useState([25]);
  
  const [heroData, setHeroData] = useState<HeroData | null>(null);
  const [petData, setPetData] = useState<PetData | null>(null);
  const [walletPositions, setWalletPositions] = useState<WalletPositions | null>(null);

  const { data: rewardFund, isLoading: rewardFundLoading } = useQuery<{ ok: boolean; crystalPool: number; jewelPool: number }>({
    queryKey: ["/api/admin/gardening-calc/reward-fund"],
    refetchInterval: 60000,
  });

  const { data: validationSummary, isLoading: summaryLoading } = useQuery<ValidationSummary>({
    queryKey: ["/api/admin/gardening-validate/summary"],
  });

  const fetchHeroMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/gardening-calc/hero/${heroId}`);
      return response.json();
    },
    onSuccess: (data: HeroData) => {
      if (data.ok) {
        setHeroData(data);
        setStamina([data.stamina]);
        toast({ title: "Hero loaded", description: `${data.class} Lv${data.level} - ${data.profession} profession` });
      } else {
        toast({ title: "Error", description: data.error || "Hero not found", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const fetchPetMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/gardening-calc/pet/${petId}`);
      return response.json();
    },
    onSuccess: (data: PetData) => {
      if (data.ok) {
        setPetData(data);
        if (data.isGardeningPet && data.bonusType) {
          toast({ title: "Pet loaded", description: `${data.name} - ${data.bonusType} ${data.powerSurgeBonus || data.skilledGreenskeeperBonus}%` });
        } else if (!data.isGardeningPet) {
          toast({ title: "Warning", description: `${data.name} is not a gardening pet (egg type ${data.eggType})`, variant: "destructive" });
        } else {
          toast({ title: "Pet loaded", description: `${data.name} - No gardening bonus skill` });
        }
      } else {
        toast({ title: "Error", description: data.error || "Pet not found", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const fetchWalletMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/gardening-calc/wallet/${walletAddress}/positions`);
      return response.json();
    },
    onSuccess: (data: WalletPositions) => {
      if (data.ok) {
        setWalletPositions(data);
        if (data.positions.length > 0) {
          setPoolId(String(data.positions[0].poolId));
          setLpSharePct(data.positions[0].lpSharePct);
          toast({ title: "Wallet loaded", description: `Found ${data.positions.length} LP position(s)` });
        } else {
          toast({ title: "No positions", description: "No staked LP found for this wallet" });
        }
      } else {
        toast({ title: "Error", description: data.error || "Failed to fetch wallet", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const calculateMutation = useMutation({
    mutationFn: async () => {
      const petFed = petData?.isFed ?? true;
      const powerSurgeBonus = petData?.powerSurgeBonus ?? 0;
      const greenskeeperBonus = petData?.skilledGreenskeeperBonus ?? 0;
      
      return apiRequest("POST", "/api/admin/gardening-calc/calculate", {
        poolId: parseInt(poolId),
        playerAddress: walletAddress || "0x0000000000000000000000000000000000000000",
        wisdom: heroData?.wisdom ?? 50,
        vitality: heroData?.vitality ?? 50,
        gardeningSkill: heroData?.gardeningSkill ?? 0,
        hasGardeningGene: heroData?.hasGardeningGene ?? false,
        stamina: stamina[0],
        petBonusPct: petFed ? powerSurgeBonus : 0,
        skilledGreenskeeperBonus: petFed ? greenskeeperBonus : 0,
        petFed,
        lpShareOverride: walletAddress ? null : parseFloat(lpSharePct) / 100,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const calcResult = calculateMutation.data as CalculatorResult | undefined;

  const handlePoolSelect = (value: string) => {
    setPoolId(value);
    const position = walletPositions?.positions.find(p => p.poolId === parseInt(value));
    if (position) {
      setLpSharePct(position.lpSharePct);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Sprout className="h-6 w-6" />
            Gardening Yield Calculator
          </h1>
          <p className="text-muted-foreground">
            Calculate expected rewards using hero and pet IDs
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
                  Enter hero #, pet #, and wallet to calculate expected rewards
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Hero ID
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="heroId"
                      value={heroId}
                      onChange={(e) => setHeroId(e.target.value)}
                      placeholder="e.g. 123456"
                      data-testid="input-hero-id"
                    />
                    <Button 
                      onClick={() => fetchHeroMutation.mutate()} 
                      disabled={fetchHeroMutation.isPending || !heroId}
                      data-testid="button-fetch-hero"
                    >
                      {fetchHeroMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                  {heroData?.ok && (
                    <div className="text-sm p-2 bg-muted rounded-md space-y-1">
                      <div className="flex justify-between">
                        <span>Class:</span>
                        <Badge variant="outline">{heroData.class}/{heroData.subClass}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Level:</span>
                        <span className="font-mono">{heroData.level}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>WIS/VIT:</span>
                        <span className="font-mono">{heroData.wisdom}/{heroData.vitality}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Gardening:</span>
                        <span className="font-mono">{heroData.gardeningSkill}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Profession:</span>
                        <Badge variant={heroData.hasGardeningGene ? "default" : "secondary"}>
                          {heroData.profession}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Cat className="h-4 w-4" />
                    Pet ID (optional)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="petId"
                      value={petId}
                      onChange={(e) => setPetId(e.target.value)}
                      placeholder="e.g. 789"
                      data-testid="input-pet-id"
                    />
                    <Button 
                      onClick={() => fetchPetMutation.mutate()} 
                      disabled={fetchPetMutation.isPending || !petId}
                      data-testid="button-fetch-pet"
                    >
                      {fetchPetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                  {petData?.ok && (
                    <div className="text-sm p-2 bg-muted rounded-md space-y-1">
                      <div className="flex justify-between">
                        <span>Name:</span>
                        <span>{petData.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Type:</span>
                        <Badge variant={petData.isGardeningPet ? "default" : "secondary"}>
                          {petData.isGardeningPet ? "Gardening" : `Egg Type ${petData.eggType}`}
                        </Badge>
                      </div>
                      {petData.bonusType && (
                        <div className="flex justify-between">
                          <span>{petData.bonusType}:</span>
                          <span className="font-mono text-green-500">
                            +{petData.powerSurgeBonus || petData.skilledGreenskeeperBonus}%
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Fed:</span>
                        <Badge variant={petData.isFed ? "default" : "destructive"}>
                          {petData.isFed ? "Yes" : "Hungry"}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t pt-4 space-y-2">
                  <Label className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Wallet Address (optional)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="walletAddress"
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      placeholder="0x... to auto-detect LP positions"
                      data-testid="input-wallet-address"
                    />
                    <Button 
                      onClick={() => fetchWalletMutation.mutate()} 
                      disabled={fetchWalletMutation.isPending || !walletAddress}
                      data-testid="button-fetch-wallet"
                    >
                      {fetchWalletMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                  {walletPositions?.ok && walletPositions.positions.length > 0 && (
                    <div className="text-sm p-2 bg-muted rounded-md">
                      <div className="font-medium mb-2">Staked LP Positions:</div>
                      {walletPositions.positions.map((pos) => (
                        <div 
                          key={pos.poolId} 
                          className={`flex justify-between p-1 rounded cursor-pointer hover:bg-accent ${poolId === String(pos.poolId) ? 'bg-accent' : ''}`}
                          onClick={() => handlePoolSelect(String(pos.poolId))}
                        >
                          <span>{pos.poolName}</span>
                          <span className="font-mono">{pos.lpSharePct}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="poolId">Garden Pool</Label>
                    <Select value={poolId} onValueChange={handlePoolSelect}>
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
                      step="0.0001"
                      value={lpSharePct}
                      onChange={(e) => setLpSharePct(e.target.value)}
                      placeholder="0.1"
                      disabled={!!walletAddress}
                      data-testid="input-lp-share"
                    />
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
                        <div className="font-mono">{(calcResult.formula.poolAllocation * 100).toFixed(1)}%</div>
                        <div>LP Share:</div>
                        <div className="font-mono">{(calcResult.formula.lpShare * 100).toFixed(4)}%</div>
                        <div>Reward Mod Base:</div>
                        <div className="font-mono">{calcResult.formula.rewardModBase}</div>
                        <div>Gene Bonus:</div>
                        <div className="font-mono">{calcResult.formula.geneBonus ? "Yes (+20%)" : "No"}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Indexed Rewards Summary</CardTitle>
              <CardDescription>
                Statistics from on-chain gardening quest reward data
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : validationSummary?.ok ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold" data-testid="text-total-rewards">
                        {parseInt(validationSummary.summary.totalRewards).toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Rewards</div>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold" data-testid="text-unique-heroes">
                        {parseInt(validationSummary.summary.uniqueHeroes).toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">Unique Heroes</div>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold" data-testid="text-unique-players">
                        {parseInt(validationSummary.summary.uniquePlayers).toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">Unique Players</div>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold" data-testid="text-avg-reward">
                        {parseFloat(validationSummary.summary.avgRewardAmount).toFixed(4)}
                      </div>
                      <div className="text-sm text-muted-foreground">Avg Reward</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-blue-500/10 rounded-lg">
                      <div className="text-xl font-bold text-blue-500">
                        {parseInt(validationSummary.summary.crystalRewards).toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">CRYSTAL Rewards</div>
                    </div>
                    <div className="text-center p-4 bg-purple-500/10 rounded-lg">
                      <div className="text-xl font-bold text-purple-500">
                        {parseInt(validationSummary.summary.jewelRewards).toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">JEWEL Rewards</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Rewards by Pool</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pool</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead className="text-right">Avg Reward</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {validationSummary.poolBreakdown
                          .filter(p => p.poolId !== 255)
                          .sort((a, b) => b.count - a.count)
                          .map((pool) => (
                            <TableRow key={pool.poolId}>
                              <TableCell>{pool.poolName}</TableCell>
                              <TableCell className="text-right font-mono">
                                {pool.count.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {pool.avgReward.toFixed(4)}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>

                  {parseInt(validationSummary.summary.withSnapshots) === 0 && (
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                      <div className="flex items-center gap-2 text-yellow-600">
                        <AlertTriangle className="h-5 w-5" />
                        <span className="font-medium">LP Snapshots Not Available</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Historical rewards don't have LP position snapshots. New rewards indexed going forward 
                        will include heroLpStake and poolTotalLp for accurate yield validation.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-muted-foreground">No validation data available</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
