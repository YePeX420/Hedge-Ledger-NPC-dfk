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
import { Loader2, Calculator, CheckCircle, AlertTriangle, Sprout, Wallet, Target, Search, User, Cat, Gem, Diamond } from "lucide-react";
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

interface DualHeroResult {
  ok: boolean;
  poolId: number;
  poolName: string;
  jewelHero: {
    heroId: string;
    heroFactor: number;
    petMultiplier: number;
    reward: number;
    perStamina: number;
  };
  crystalHero: {
    heroId: string;
    heroFactor: number;
    petMultiplier: number;
    reward: number;
    perStamina: number;
  };
  shared: {
    poolAllocation: number;
    lpShare: number;
    userLp: number;
    poolTotalLp: number;
  };
  rewardFund: {
    crystalPool: number;
    jewelPool: number;
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

interface HeroInputProps {
  label: string;
  tokenType: "jewel" | "crystal";
  heroId: string;
  setHeroId: (v: string) => void;
  petId: string;
  setPetId: (v: string) => void;
  heroData: HeroData | null;
  petData: PetData | null;
  onFetchHero: () => void;
  onFetchPet: () => void;
  heroLoading: boolean;
  petLoading: boolean;
  stamina: number[];
  setStamina: (v: number[]) => void;
}

function HeroInputSection({
  label,
  tokenType,
  heroId,
  setHeroId,
  petId,
  setPetId,
  heroData,
  petData,
  onFetchHero,
  onFetchPet,
  heroLoading,
  petLoading,
  stamina,
  setStamina,
}: HeroInputProps) {
  const colorClass = tokenType === "jewel" ? "text-purple-500" : "text-blue-500";
  const bgClass = tokenType === "jewel" ? "bg-purple-500/10" : "bg-blue-500/10";
  const Icon = tokenType === "jewel" ? Gem : Diamond;

  return (
    <div className={`p-4 rounded-lg border ${bgClass}`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`h-5 w-5 ${colorClass}`} />
        <h3 className={`font-semibold ${colorClass}`}>{label}</h3>
        <Badge variant="outline" className={colorClass}>
          Earns {tokenType.toUpperCase()}
        </Badge>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Hero ID
          </Label>
          <div className="flex gap-2">
            <Input
              value={heroId}
              onChange={(e) => setHeroId(e.target.value)}
              placeholder="e.g. 123456"
              data-testid={`input-${tokenType}-hero-id`}
            />
            <Button 
              onClick={onFetchHero} 
              disabled={heroLoading || !heroId}
              size="icon"
              data-testid={`button-fetch-${tokenType}-hero`}
            >
              {heroLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {heroData?.ok && (
            <div className="text-sm p-2 bg-background/50 rounded-md space-y-1">
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
              value={petId}
              onChange={(e) => setPetId(e.target.value)}
              placeholder="e.g. 789"
              data-testid={`input-${tokenType}-pet-id`}
            />
            <Button 
              onClick={onFetchPet} 
              disabled={petLoading || !petId}
              size="icon"
              data-testid={`button-fetch-${tokenType}-pet`}
            >
              {petLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {petData?.ok && (
            <div className="text-sm p-2 bg-background/50 rounded-md space-y-1">
              <div className="flex justify-between">
                <span>Name:</span>
                <span>{petData.name || `Pet #${petData.petId}`}</span>
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
            data-testid={`slider-${tokenType}-stamina`}
          />
        </div>
      </div>
    </div>
  );
}

export default function GardeningCalcAdmin() {
  const { toast } = useToast();
  
  // JEWEL Hero State
  const [jewelHeroId, setJewelHeroId] = useState("");
  const [jewelPetId, setJewelPetId] = useState("");
  const [jewelHeroData, setJewelHeroData] = useState<HeroData | null>(null);
  const [jewelPetData, setJewelPetData] = useState<PetData | null>(null);
  const [jewelStamina, setJewelStamina] = useState([25]);

  // CRYSTAL Hero State
  const [crystalHeroId, setCrystalHeroId] = useState("");
  const [crystalPetId, setCrystalPetId] = useState("");
  const [crystalHeroData, setCrystalHeroData] = useState<HeroData | null>(null);
  const [crystalPetData, setCrystalPetData] = useState<PetData | null>(null);
  const [crystalStamina, setCrystalStamina] = useState([25]);

  // Shared State
  const [walletAddress, setWalletAddress] = useState("");
  const [poolId, setPoolId] = useState("2");
  const [lpSharePct, setLpSharePct] = useState("0.1");
  const [walletPositions, setWalletPositions] = useState<WalletPositions | null>(null);

  const { data: rewardFund, isLoading: rewardFundLoading } = useQuery<{ ok: boolean; crystalPool: number; jewelPool: number }>({
    queryKey: ["/api/admin/gardening-calc/reward-fund"],
    refetchInterval: 60000,
  });

  const { data: validationSummary, isLoading: summaryLoading } = useQuery<ValidationSummary>({
    queryKey: ["/api/admin/gardening-validate/summary"],
  });

  // JEWEL Hero fetch mutations
  const fetchJewelHeroMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/gardening-calc/hero/${jewelHeroId}`);
      return response.json();
    },
    onSuccess: (data: HeroData) => {
      if (data.ok) {
        setJewelHeroData(data);
        setJewelStamina([data.stamina]);
        toast({ title: "JEWEL Hero loaded", description: `${data.class} Lv${data.level} - ${data.profession}` });
      } else {
        toast({ title: "Error", description: data.error || "Hero not found", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const fetchJewelPetMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/gardening-calc/pet/${jewelPetId}`);
      return response.json();
    },
    onSuccess: (data: PetData) => {
      if (data.ok) {
        setJewelPetData(data);
        if (data.isGardeningPet && data.bonusType) {
          toast({ title: "JEWEL Pet loaded", description: `${data.bonusType} +${data.powerSurgeBonus || data.skilledGreenskeeperBonus}%` });
        } else if (!data.isGardeningPet) {
          toast({ title: "Warning", description: `Not a gardening pet (egg type ${data.eggType})`, variant: "destructive" });
        }
      } else {
        toast({ title: "Error", description: data.error || "Pet not found", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // CRYSTAL Hero fetch mutations
  const fetchCrystalHeroMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/gardening-calc/hero/${crystalHeroId}`);
      return response.json();
    },
    onSuccess: (data: HeroData) => {
      if (data.ok) {
        setCrystalHeroData(data);
        setCrystalStamina([data.stamina]);
        toast({ title: "CRYSTAL Hero loaded", description: `${data.class} Lv${data.level} - ${data.profession}` });
      } else {
        toast({ title: "Error", description: data.error || "Hero not found", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const fetchCrystalPetMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/gardening-calc/pet/${crystalPetId}`);
      return response.json();
    },
    onSuccess: (data: PetData) => {
      if (data.ok) {
        setCrystalPetData(data);
        if (data.isGardeningPet && data.bonusType) {
          toast({ title: "CRYSTAL Pet loaded", description: `${data.bonusType} +${data.powerSurgeBonus || data.skilledGreenskeeperBonus}%` });
        } else if (!data.isGardeningPet) {
          toast({ title: "Warning", description: `Not a gardening pet (egg type ${data.eggType})`, variant: "destructive" });
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
      const jewelPetFed = jewelPetData?.isFed ?? true;
      const crystalPetFed = crystalPetData?.isFed ?? true;
      
      return apiRequest("POST", "/api/admin/gardening-calc/calculate-dual", {
        poolId: parseInt(poolId),
        playerAddress: walletAddress || "0x0000000000000000000000000000000000000000",
        lpShareOverride: walletAddress ? null : parseFloat(lpSharePct) / 100,
        jewelHero: {
          heroId: jewelHeroId,
          wisdom: jewelHeroData?.wisdom ?? 50,
          vitality: jewelHeroData?.vitality ?? 50,
          gardeningSkill: jewelHeroData?.gardeningSkill ?? 0,
          hasGardeningGene: jewelHeroData?.hasGardeningGene ?? false,
          stamina: jewelStamina[0],
          petBonusPct: jewelPetFed ? (jewelPetData?.powerSurgeBonus ?? 0) : 0,
          skilledGreenskeeperBonus: jewelPetFed ? (jewelPetData?.skilledGreenskeeperBonus ?? 0) : 0,
          petFed: jewelPetFed,
        },
        crystalHero: {
          heroId: crystalHeroId,
          wisdom: crystalHeroData?.wisdom ?? 50,
          vitality: crystalHeroData?.vitality ?? 50,
          gardeningSkill: crystalHeroData?.gardeningSkill ?? 0,
          hasGardeningGene: crystalHeroData?.hasGardeningGene ?? false,
          stamina: crystalStamina[0],
          petBonusPct: crystalPetFed ? (crystalPetData?.powerSurgeBonus ?? 0) : 0,
          skilledGreenskeeperBonus: crystalPetFed ? (crystalPetData?.skilledGreenskeeperBonus ?? 0) : 0,
          petFed: crystalPetFed,
        },
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const calcResult = calculateMutation.data as DualHeroResult | undefined;

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
            Calculate expected rewards for two heroes per quest iteration
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
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Hero Inputs Column */}
            <div className="xl:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Quest Heroes</CardTitle>
                  <CardDescription>
                    Enter hero and pet IDs for both JEWEL and CRYSTAL earners
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <HeroInputSection
                      label="JEWEL Hero"
                      tokenType="jewel"
                      heroId={jewelHeroId}
                      setHeroId={setJewelHeroId}
                      petId={jewelPetId}
                      setPetId={setJewelPetId}
                      heroData={jewelHeroData}
                      petData={jewelPetData}
                      onFetchHero={() => fetchJewelHeroMutation.mutate()}
                      onFetchPet={() => fetchJewelPetMutation.mutate()}
                      heroLoading={fetchJewelHeroMutation.isPending}
                      petLoading={fetchJewelPetMutation.isPending}
                      stamina={jewelStamina}
                      setStamina={setJewelStamina}
                    />

                    <HeroInputSection
                      label="CRYSTAL Hero"
                      tokenType="crystal"
                      heroId={crystalHeroId}
                      setHeroId={setCrystalHeroId}
                      petId={crystalPetId}
                      setPetId={setCrystalPetId}
                      heroData={crystalHeroData}
                      petData={crystalPetData}
                      onFetchHero={() => fetchCrystalHeroMutation.mutate()}
                      onFetchPet={() => fetchCrystalPetMutation.mutate()}
                      heroLoading={fetchCrystalHeroMutation.isPending}
                      petLoading={fetchCrystalPetMutation.isPending}
                      stamina={crystalStamina}
                      setStamina={setCrystalStamina}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Garden Pool</CardTitle>
                  <CardDescription>
                    Select pool and LP position (shared by both heroes)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
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
                            className={`flex justify-between p-1 rounded cursor-pointer hover-elevate ${poolId === String(pos.poolId) ? 'bg-accent' : ''}`}
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
            </div>

            {/* Results Column */}
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
                      {calcResult.poolName}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
                        <div className="text-xs text-muted-foreground mb-1">JEWEL Hero #{calcResult.jewelHero.heroId || "N/A"}</div>
                        <div className="text-2xl font-bold text-purple-500" data-testid="text-jewel-reward">
                          {calcResult.totalRewards.jewel.toFixed(4)}
                        </div>
                        <div className="text-sm text-muted-foreground">JEWEL</div>
                        <div className="text-xs text-muted-foreground">
                          {calcResult.jewelHero.perStamina.toFixed(6)}/stam
                        </div>
                      </div>
                      <div className="text-center p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                        <div className="text-xs text-muted-foreground mb-1">CRYSTAL Hero #{calcResult.crystalHero.heroId || "N/A"}</div>
                        <div className="text-2xl font-bold text-blue-500" data-testid="text-crystal-reward">
                          {calcResult.totalRewards.crystal.toFixed(4)}
                        </div>
                        <div className="text-sm text-muted-foreground">CRYSTAL</div>
                        <div className="text-xs text-muted-foreground">
                          {calcResult.crystalHero.perStamina.toFixed(6)}/stam
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4 space-y-3 text-sm">
                      <h4 className="font-medium">Hero Details</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-2 bg-purple-500/5 rounded">
                          <div className="text-xs text-purple-500 font-medium mb-1">JEWEL Hero</div>
                          <div className="flex justify-between">
                            <span>Hero Factor:</span>
                            <span className="font-mono">{calcResult.jewelHero.heroFactor.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Pet Mult:</span>
                            <span className="font-mono">{calcResult.jewelHero.petMultiplier.toFixed(2)}x</span>
                          </div>
                        </div>
                        <div className="p-2 bg-blue-500/5 rounded">
                          <div className="text-xs text-blue-500 font-medium mb-1">CRYSTAL Hero</div>
                          <div className="flex justify-between">
                            <span>Hero Factor:</span>
                            <span className="font-mono">{calcResult.crystalHero.heroFactor.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Pet Mult:</span>
                            <span className="font-mono">{calcResult.crystalHero.petMultiplier.toFixed(2)}x</span>
                          </div>
                        </div>
                      </div>
                      
                      <h4 className="font-medium pt-2">Shared Pool Stats</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div>Pool Allocation:</div>
                        <div className="font-mono">{(calcResult.shared.poolAllocation * 100).toFixed(1)}%</div>
                        <div>LP Share:</div>
                        <div className="font-mono">{(calcResult.shared.lpShare * 100).toFixed(4)}%</div>
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
