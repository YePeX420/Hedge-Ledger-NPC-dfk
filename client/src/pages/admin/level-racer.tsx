import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { 
  Swords, 
  Plus, 
  RefreshCw, 
  Users, 
  Trophy, 
  Loader2, 
  Play,
  Eye,
  Coins,
  Clock,
  CheckCircle2,
  XCircle,
  Sprout,
  Hammer,
  Fish,
  Trees,
  Pencil
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface HeroClass {
  id: number;
  slug: string;
  displayName: string;
  isEnabled: boolean;
  isBasic?: boolean;
}

type TokenType = 'JEWEL' | 'CRYSTAL' | 'USDC';
type QuestProfession = 'gardening' | 'mining' | 'fishing' | 'foraging';

const PROFESSION_ICONS = {
  gardening: Sprout,
  mining: Hammer,
  fishing: Fish,
  foraging: Trees,
} as const;

const PROFESSIONS: { value: QuestProfession; label: string }[] = [
  { value: 'gardening', label: 'Gardening' },
  { value: 'mining', label: 'Mining' },
  { value: 'fishing', label: 'Fishing' },
  { value: 'foraging', label: 'Foraging' },
];

interface Pool {
  id: number;
  heroClassSlug: string;
  heroClassName: string;
  profession: QuestProfession;
  level: number;
  state: 'OPEN' | 'FILLING' | 'RACING' | 'FINISHED';
  maxEntries: number;
  currentEntries: number;
  usdEntryFee: string;
  usdPrize: string;
  tokenType: TokenType;
  jewelEntryFee: number;
  jewelPrize: number;
  rarityFilter: string;
  maxMutations: number | null;
  isRecurrent: boolean;
  createdAt: string;
  totalFeesCollected?: number;
  totalFeesCollectedUsd?: string;
  prizeAwarded?: boolean;
  finishedAt?: string;
}

interface PoolEntry {
  id: number;
  walletAddress: string;
  heroId: string;
  heroClassSlug: string;
  heroLevel: number;
  heroRarity: string;
  heroCurrentXp: number;
  heroReadyToLevel: boolean;
  joinedAt: string;
  isWinner: boolean;
}

interface RaceEvent {
  id: number;
  eventType: string;
  commentary: string;
  createdAt: string;
  heroId?: string;
}

interface PoolDetails {
  id: number;
  heroClassSlug: string;
  heroClassName: string;
  profession: QuestProfession;
  level: number;
  state: string;
  maxEntries: number;
  usdEntryFee: string;
  usdPrize: string;
  tokenType: TokenType;
  jewelEntryFee: number;
  jewelPrize: number;
  rarityFilter: string;
  maxMutations: number | null;
  isRecurrent: boolean;
  totalFeesCollected: number;
  totalFeesCollectedUsd: string;
  prizeAwarded: boolean;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  winnerEntryId?: number;
  entries: PoolEntry[];
}

function getStateBadge(state: string) {
  switch (state) {
    case 'OPEN':
      return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30" data-testid="badge-state-open">Open</Badge>;
    case 'FILLING':
      return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30" data-testid="badge-state-filling">Filling</Badge>;
    case 'RACING':
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30" data-testid="badge-state-racing">Racing</Badge>;
    case 'FINISHED':
      return <Badge variant="outline" className="bg-muted text-muted-foreground" data-testid="badge-state-finished">Finished</Badge>;
    default:
      return <Badge variant="secondary">{state}</Badge>;
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString();
}

function ProfessionIcon({ profession, className }: { profession: QuestProfession; className?: string }) {
  const Icon = PROFESSION_ICONS[profession];
  return <Icon className={className || "w-4 h-4"} />;
}

function PoolListItem({ pool, isSelected, onSelect }: { pool: Pool; isSelected: boolean; onSelect: () => void }) {
  return (
    <div 
      className={`p-3 border rounded-md cursor-pointer transition-colors ${
        isSelected 
          ? 'border-primary bg-primary/5' 
          : 'hover:bg-accent/50'
      }`}
      onClick={onSelect}
      data-testid={`pool-item-${pool.id}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ProfessionIcon profession={pool.profession} className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">{pool.heroClassName}</span>
          {getStateBadge(pool.state)}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="w-3 h-3" />
          {pool.currentEntries}/{pool.maxEntries}
        </div>
      </div>
      <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          Level {pool.level}
          {pool.isRecurrent && <Badge variant="secondary" className="text-[10px] px-1">Recurrent</Badge>}
        </span>
        <span>${pool.usdEntryFee} / ${pool.usdPrize} ({pool.tokenType})</span>
      </div>
      {pool.state !== 'OPEN' && (
        <Progress 
          value={(pool.currentEntries / pool.maxEntries) * 100} 
          className="h-1 mt-2" 
        />
      )}
    </div>
  );
}

const PROFESSION_DEFAULTS: Record<QuestProfession, { entryFee: string; prize: string; maxEntries: string }> = {
  gardening: { entryFee: '25.00', prize: '100.00', maxEntries: '2' },
  mining: { entryFee: '5.00', prize: '40.00', maxEntries: '6' },
  fishing: { entryFee: '5.00', prize: '40.00', maxEntries: '6' },
  foraging: { entryFee: '5.00', prize: '40.00', maxEntries: '6' },
};

export default function LevelRacerAdmin() {
  const { toast } = useToast();
  const [selectedPoolId, setSelectedPoolId] = useState<number | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<Pool | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedProfession, setSelectedProfession] = useState<QuestProfession>('fishing');
  const [professionFilter, setProfessionFilter] = useState<QuestProfession | 'all'>('all');
  const [usdEntryFee, setUsdEntryFee] = useState('5.00');
  const [usdPrize, setUsdPrize] = useState('40.00');
  const [tokenType, setTokenType] = useState<TokenType>('JEWEL');
  const [maxEntries, setMaxEntries] = useState('6');
  const [rarityFilter, setRarityFilter] = useState('common');
  const [maxMutations, setMaxMutations] = useState<string>('');
  const [isRecurrent, setIsRecurrent] = useState(true);
  
  useEffect(() => {
    if (createDialogOpen && !editDialogOpen) {
      const defaults = PROFESSION_DEFAULTS[selectedProfession];
      setUsdEntryFee(defaults.entryFee);
      setUsdPrize(defaults.prize);
      setMaxEntries(defaults.maxEntries);
    }
  }, [selectedProfession, createDialogOpen, editDialogOpen]);

  const { data: classesData, isLoading: classesLoading } = useQuery<{ classes: HeroClass[] }>({
    queryKey: ['/api/level-racer/classes'],
  });

  const { data: poolsData, isLoading: poolsLoading, refetch: refetchPools } = useQuery<{ pools: Pool[] }>({
    queryKey: ['/api/level-racer/admin/pools'],
  });

  const { data: poolDetails, isLoading: detailsLoading } = useQuery<PoolDetails>({
    queryKey: ['/api/level-racer/pools', selectedPoolId],
    enabled: !!selectedPoolId,
  });

  const { data: poolEvents } = useQuery<{ events: RaceEvent[] }>({
    queryKey: ['/api/level-racer/pools', selectedPoolId, 'events'],
    enabled: !!selectedPoolId,
  });

  const createPoolMutation = useMutation({
    mutationFn: async (data: { 
      classSlug: string; 
      profession: QuestProfession;
      usdEntryFee: string;
      usdPrize: string;
      tokenType: TokenType;
      maxEntries: number;
      rarityFilter: string;
      maxMutations: number | null;
      isRecurrent: boolean;
    }) => {
      const res = await apiRequest('POST', '/api/level-racer/admin/pools', data);
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    },
    onSuccess: () => {
      toast({ title: 'Pool created successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/level-racer/admin/pools'] });
      setCreateDialogOpen(false);
      setSelectedClass('');
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to create pool', 
        description: error.message || 'An error occurred',
        variant: 'destructive' 
      });
    },
  });

  const simulateMutation = useMutation({
    mutationFn: async (poolId: number) => {
      const res = await apiRequest('POST', `/api/level-racer/dev/pools/${poolId}/simulate-tick`);
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    },
    onSuccess: (result: any) => {
      toast({ title: 'Simulation tick complete', description: result.message });
      queryClient.invalidateQueries({ queryKey: ['/api/level-racer/pools', selectedPoolId] });
      queryClient.invalidateQueries({ queryKey: ['/api/level-racer/pools', selectedPoolId, 'events'] });
      queryClient.invalidateQueries({ queryKey: ['/api/level-racer/admin/pools'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Simulation failed', 
        description: error.message || 'An error occurred',
        variant: 'destructive' 
      });
    },
  });

  const editPoolMutation = useMutation({
    mutationFn: async (data: { 
      poolId: number;
      usdEntryFee?: string;
      usdPrize?: string;
      tokenType?: TokenType;
      maxEntries?: number;
      rarityFilter?: string;
      maxMutations?: number | null;
      isRecurrent?: boolean;
    }) => {
      const { poolId, ...updates } = data;
      const res = await apiRequest('PATCH', `/api/level-racer/admin/pools/${poolId}`, updates);
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    },
    onSuccess: () => {
      toast({ title: 'Pool updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/level-racer/admin/pools'] });
      queryClient.invalidateQueries({ queryKey: ['/api/level-racer/pools', editingPool?.id] });
      setEditDialogOpen(false);
      setEditingPool(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update pool', 
        description: error.message || 'An error occurred',
        variant: 'destructive' 
      });
    },
  });

  const handleEditPool = (pool: Pool) => {
    setEditingPool(pool);
    setUsdEntryFee(pool.usdEntryFee);
    setUsdPrize(pool.usdPrize);
    setTokenType(pool.tokenType as TokenType);
    setMaxEntries(pool.maxEntries.toString());
    setRarityFilter(pool.rarityFilter || 'common');
    setMaxMutations(pool.maxMutations !== null ? pool.maxMutations.toString() : '');
    setIsRecurrent(pool.isRecurrent);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingPool) return;
    editPoolMutation.mutate({
      poolId: editingPool.id,
      usdEntryFee,
      usdPrize,
      tokenType,
      maxEntries: parseInt(maxEntries),
      rarityFilter,
      maxMutations: maxMutations ? parseInt(maxMutations) : null,
      isRecurrent,
    });
  };

  const handleCreatePool = () => {
    if (!selectedClass) {
      toast({ title: 'Please select a hero class', variant: 'destructive' });
      return;
    }
    createPoolMutation.mutate({
      classSlug: selectedClass,
      profession: selectedProfession,
      usdEntryFee,
      usdPrize,
      tokenType,
      maxEntries: parseInt(maxEntries),
      rarityFilter,
      maxMutations: maxMutations ? parseInt(maxMutations) : null,
      isRecurrent,
    });
  };

  const pools = poolsData?.pools || [];
  const classes = classesData?.classes || [];
  const basicClasses = classes.filter(c => c.isBasic !== false);
  
  const filteredPools = professionFilter === 'all' 
    ? pools 
    : pools.filter(p => p.profession === professionFilter);
  const activePools = filteredPools.filter(p => p.state !== 'FINISHED');
  const finishedPools = filteredPools.filter(p => p.state === 'FINISHED');
  
  const poolsByProfession = PROFESSIONS.reduce((acc, prof) => {
    acc[prof.value] = pools.filter(p => p.profession === prof.value && p.state !== 'FINISHED');
    return acc;
  }, {} as Record<QuestProfession, Pool[]>);

  const totalFeesCollected = pools.reduce((sum, p) => sum + (p.totalFeesCollected || 0), 0);
  const totalPrizesAwarded = pools.filter(p => p.prizeAwarded).reduce((sum, p) => sum + p.jewelPrize, 0);

  return (
    <div className="p-6 space-y-6" data-testid="level-racer-admin">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Swords className="w-6 h-6" />
            Level Racer Admin
          </h1>
          <p className="text-muted-foreground">Manage racing pools and track competitions</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => refetchPools()}
            data-testid="button-refresh-pools"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-pool">
                <Plus className="w-4 h-4 mr-2" />
                Create Pool
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Racing Pool</DialogTitle>
                <DialogDescription>
                  Create a new Level Racer pool for a hero class
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="class">Hero Class</Label>
                    <Select value={selectedClass} onValueChange={setSelectedClass}>
                      <SelectTrigger data-testid="select-hero-class">
                        <SelectValue placeholder="Select a class" />
                      </SelectTrigger>
                      <SelectContent>
                        {basicClasses.map((c) => (
                          <SelectItem key={c.slug} value={c.slug}>
                            {c.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profession">Quest Profession</Label>
                    <Select value={selectedProfession} onValueChange={(v) => setSelectedProfession(v as QuestProfession)}>
                      <SelectTrigger data-testid="select-profession">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROFESSIONS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            <span className="flex items-center gap-2">
                              <ProfessionIcon profession={p.value} className="w-3 h-3" />
                              {p.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <Separator />
                <h4 className="text-sm font-medium">Pricing (USD-based)</h4>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="usdEntryFee">Entry Fee (USD)</Label>
                    <Input 
                      id="usdEntryFee" 
                      type="text" 
                      value={usdEntryFee} 
                      onChange={(e) => setUsdEntryFee(e.target.value)}
                      placeholder="5.00"
                      data-testid="input-usd-entry-fee"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="usdPrize">Prize (USD)</Label>
                    <Input 
                      id="usdPrize" 
                      type="text" 
                      value={usdPrize} 
                      onChange={(e) => setUsdPrize(e.target.value)}
                      placeholder="40.00"
                      data-testid="input-usd-prize"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tokenType">Token Type</Label>
                    <Select value={tokenType} onValueChange={(v) => setTokenType(v as TokenType)}>
                      <SelectTrigger data-testid="select-token-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="JEWEL">JEWEL</SelectItem>
                        <SelectItem value="CRYSTAL">CRYSTAL</SelectItem>
                        <SelectItem value="USDC">USDC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="maxEntries">Max Entries</Label>
                  <Input 
                    id="maxEntries" 
                    type="number" 
                    value={maxEntries} 
                    onChange={(e) => setMaxEntries(e.target.value)}
                    data-testid="input-max-entries"
                  />
                </div>

                <Separator />
                <h4 className="text-sm font-medium">Special Race Filters</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rarityFilter">Rarity Filter</Label>
                    <Select value={rarityFilter} onValueChange={setRarityFilter}>
                      <SelectTrigger data-testid="select-rarity-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="common">Common Only</SelectItem>
                        <SelectItem value="uncommon">Up to Uncommon</SelectItem>
                        <SelectItem value="rare">Up to Rare</SelectItem>
                        <SelectItem value="legendary">Up to Legendary</SelectItem>
                        <SelectItem value="mythic">All Rarities</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxMutations">Max Mutations (empty = no limit)</Label>
                    <Input 
                      id="maxMutations" 
                      type="number" 
                      value={maxMutations} 
                      onChange={(e) => setMaxMutations(e.target.value)}
                      placeholder="No limit"
                      data-testid="input-max-mutations"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isRecurrent">Recurrent Pool</Label>
                    <p className="text-xs text-muted-foreground">Auto-create new pool when this one fills</p>
                  </div>
                  <Switch 
                    id="isRecurrent"
                    checked={isRecurrent}
                    onCheckedChange={setIsRecurrent}
                    data-testid="switch-recurrent"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreatePool} 
                  disabled={createPoolMutation.isPending}
                  data-testid="button-confirm-create"
                >
                  {createPoolMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Pool
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Pool Settings</DialogTitle>
                <DialogDescription>
                  Edit settings for {editingPool?.heroClassName} ({editingPool?.profession}) pool
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-entry-fee">Entry Fee (USD)</Label>
                    <Input
                      id="edit-entry-fee"
                      type="number"
                      step="0.01"
                      value={usdEntryFee}
                      onChange={(e) => setUsdEntryFee(e.target.value)}
                      data-testid="input-edit-entry-fee"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-prize">Prize (USD)</Label>
                    <Input
                      id="edit-prize"
                      type="number"
                      step="0.01"
                      value={usdPrize}
                      onChange={(e) => setUsdPrize(e.target.value)}
                      data-testid="input-edit-prize"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-token">Payment Token</Label>
                    <Select value={tokenType} onValueChange={(v) => setTokenType(v as TokenType)}>
                      <SelectTrigger data-testid="select-edit-token">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="JEWEL">JEWEL</SelectItem>
                        <SelectItem value="CRYSTAL">CRYSTAL</SelectItem>
                        <SelectItem value="USDC">USDC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-max-entries">Max Entries</Label>
                    <Input
                      id="edit-max-entries"
                      type="number"
                      value={maxEntries}
                      onChange={(e) => setMaxEntries(e.target.value)}
                      data-testid="input-edit-max-entries"
                    />
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-rarity">Max Rarity Allowed</Label>
                    <Select value={rarityFilter} onValueChange={setRarityFilter}>
                      <SelectTrigger data-testid="select-edit-rarity">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="common">Common</SelectItem>
                        <SelectItem value="uncommon">Uncommon</SelectItem>
                        <SelectItem value="rare">Rare</SelectItem>
                        <SelectItem value="legendary">Legendary</SelectItem>
                        <SelectItem value="mythic">Mythic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-mutations">Max Mutations (empty = no limit)</Label>
                    <Input
                      id="edit-mutations"
                      type="number"
                      placeholder="No limit"
                      value={maxMutations}
                      onChange={(e) => setMaxMutations(e.target.value)}
                      data-testid="input-edit-mutations"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="edit-recurrent"
                    checked={isRecurrent}
                    onCheckedChange={setIsRecurrent}
                    data-testid="switch-edit-recurrent"
                  />
                  <Label htmlFor="edit-recurrent">Recurrent (auto-restart when finished)</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSaveEdit} 
                  disabled={editPoolMutation.isPending}
                  data-testid="button-confirm-edit"
                >
                  {editPoolMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Pools</CardTitle>
            <Swords className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-active-pools">{activePools.length}</div>
            <p className="text-xs text-muted-foreground">Currently running</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pools</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-pools">{pools.length}</div>
            <p className="text-xs text-muted-foreground">{finishedPools.length} finished</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fees Collected</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-fees-collected">{totalFeesCollected}</div>
            <p className="text-xs text-muted-foreground">JEWEL total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prizes Awarded</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-prizes-awarded">{totalPrizesAwarded}</div>
            <p className="text-xs text-muted-foreground">JEWEL total</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card className="col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Racing Pools</CardTitle>
                <CardDescription>Organized by quest profession</CardDescription>
              </div>
              <Select value={professionFilter} onValueChange={(v) => setProfessionFilter(v as QuestProfession | 'all')}>
                <SelectTrigger className="w-[160px]" data-testid="select-profession-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Professions</SelectItem>
                  {PROFESSIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className="flex items-center gap-2">
                        <ProfessionIcon profession={p.value} className="w-3 h-3" />
                        {p.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {poolsLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : filteredPools.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Swords className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No pools found</p>
                <p className="text-sm">Try a different filter or create a pool</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {professionFilter === 'all' ? (
                    PROFESSIONS.map((prof) => {
                      const profPools = poolsByProfession[prof.value];
                      if (profPools.length === 0) return null;
                      return (
                        <div key={prof.value}>
                          <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                            <ProfessionIcon profession={prof.value} className="w-4 h-4" />
                            <span>{prof.label}</span>
                            <Badge variant="secondary" className="text-[10px]">{profPools.length}</Badge>
                          </div>
                          <div className="space-y-2">
                            {profPools.map((pool) => (
                              <PoolListItem 
                                key={pool.id} 
                                pool={pool} 
                                isSelected={selectedPoolId === pool.id}
                                onSelect={() => setSelectedPoolId(pool.id)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="space-y-2">
                      {activePools.map((pool) => (
                        <PoolListItem 
                          key={pool.id} 
                          pool={pool} 
                          isSelected={selectedPoolId === pool.id}
                          onSelect={() => setSelectedPoolId(pool.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Pool Details</CardTitle>
                <CardDescription>
                  {selectedPoolId ? `Pool #${selectedPoolId}` : 'Select a pool to view details'}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {selectedPoolId && poolDetails?.state === 'OPEN' && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      const pool = pools.find(p => p.id === selectedPoolId);
                      if (pool) handleEditPool(pool);
                    }}
                    data-testid="button-edit-pool"
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                )}
                {selectedPoolId && poolDetails?.state === 'RACING' && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => simulateMutation.mutate(selectedPoolId)}
                    disabled={simulateMutation.isPending}
                    data-testid="button-simulate-tick"
                  >
                    {simulateMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 mr-2" />
                    )}
                    Simulate Tick
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!selectedPoolId ? (
              <div className="text-center py-8 text-muted-foreground">
                <Eye className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Select a pool from the list</p>
              </div>
            ) : detailsLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : poolDetails ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Class:</span>
                    <span className="ml-2 font-medium">{poolDetails.heroClassName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">State:</span>
                    <span className="ml-2">{getStateBadge(poolDetails.state)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Entry Fee:</span>
                    <span className="ml-2 font-medium">${poolDetails.usdEntryFee}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Prize:</span>
                    <span className="ml-2 font-medium">${poolDetails.usdPrize}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Token:</span>
                    <span className="ml-2 font-medium">{poolDetails.tokenType}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fees Collected:</span>
                    <span className="ml-2 font-medium">${poolDetails.totalFeesCollectedUsd}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Rarity:</span>
                    <span className="ml-2 font-medium capitalize">{poolDetails.rarityFilter}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Max Mutations:</span>
                    <span className="ml-2 font-medium">{poolDetails.maxMutations ?? 'No limit'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Recurrent:</span>
                    <span className="ml-2">
                      {poolDetails.isRecurrent ? (
                        <CheckCircle2 className="w-4 h-4 inline text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 inline text-muted-foreground" />
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Prize Awarded:</span>
                    <span className="ml-2">
                      {poolDetails.prizeAwarded ? (
                        <CheckCircle2 className="w-4 h-4 inline text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 inline text-muted-foreground" />
                      )}
                    </span>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Entries ({poolDetails.entries.length}/{poolDetails.maxEntries})
                  </h4>
                  {poolDetails.entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No entries yet</p>
                  ) : (
                    <ScrollArea className="h-[150px]">
                      <div className="space-y-2">
                        {poolDetails.entries.map((entry) => (
                          <div 
                            key={entry.id} 
                            className={`p-2 border rounded-md text-sm ${entry.isWinner ? 'border-yellow-500 bg-yellow-500/10' : ''}`}
                            data-testid={`entry-item-${entry.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs">
                                Hero #{entry.heroId}
                              </span>
                              {entry.isWinner && (
                                <Badge className="bg-yellow-500 text-black">Winner</Badge>
                              )}
                            </div>
                            <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                              <span>XP: {entry.heroCurrentXp}</span>
                              <span>{entry.heroReadyToLevel ? 'Ready to level' : 'Training...'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Recent Events
                  </h4>
                  <ScrollArea className="h-[150px]">
                    {poolEvents?.events && poolEvents.events.length > 0 ? (
                      <div className="space-y-2">
                        {poolEvents.events.slice(-10).reverse().map((event) => (
                          <div key={event.id} className="text-sm border-l-2 border-muted pl-2">
                            <p className="text-muted-foreground text-xs">
                              {event.eventType} - {formatDate(event.createdAt)}
                            </p>
                            <p className="italic">{event.commentary}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No events yet</p>
                    )}
                  </ScrollArea>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Pool not found</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
