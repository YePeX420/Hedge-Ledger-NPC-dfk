import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { Search, RefreshCw, ChevronUp, ChevronDown, X, Copy } from 'lucide-react';

interface KPIs {
  engagementScore?: number;
  financialScore?: number;
  retentionScore?: number;
  messagesLast7d?: number;
}

interface DFKSnapshot {
  heroCount?: number;
  gen0Count?: number;
  petCount?: number;
  lpPositionsCount?: number;
  totalLPValue?: number;
  jewelBalance?: number;
  crystalBalance?: number;
  cJewelBalance?: number;
  questingStreakDays?: number;
  heroAge?: number;
  heroRarity?: string;
}

interface UserProfile {
  archetype: string;
  tier: number;
  state: string;
  tags: string[];
  flags: {
    isExtractor?: boolean;
    isWhale?: boolean;
    isHighPotential?: boolean;
  };
}

interface User {
  id: number;
  discordId: string;
  discordUsername: string;
  walletAddress: string | null;
  profile: UserProfile;
  archetype: string;
  state: string;
  behaviorTags: string[];
  kpis: KPIs;
  dfkSnapshot: DFKSnapshot | null;
  flags: {
    isExtractor?: boolean;
    isWhale?: boolean;
    isHighPotential?: boolean;
  };
  tier: number;
  influence?: number;
  walletBalances?: {
    jewel: string;
    crystal: string;
    cJewel: string;
    change7d: string | null;
  } | null;
}

interface UsersResponse {
  success: boolean;
  users: User[];
}

const ARCHETYPES = ['ALL', 'GUEST', 'ADVENTURER', 'PLAYER', 'INVESTOR', 'EXTRACTOR', 'UNKNOWN'];
const TIERS = ['ALL', '0', '1', '2', '3', '4'];

const tierNames: Record<string | number, string> = {
  0: 'Common',
  1: 'Uncommon',
  2: 'Rare',
  3: 'Legendary',
  4: 'Mythic'
};

const tierColors: Record<string | number, string> = {
  0: 'bg-gray-400 text-white',
  1: 'bg-green-500 text-white',
  2: 'bg-blue-500 text-white',
  3: 'bg-purple-500 text-white',
  4: 'bg-orange-500 text-white'
};

const behaviorTagDescriptions: Record<string, string> = {
  'NEWCOMER': 'Recently joined the community',
  'COLLECTOR': 'Focuses on collecting heroes and assets',
  'SPEEDRUNNER': 'Progresses quickly through content',
  'SOCIAL_PLAYER': 'Frequently interacts with community',
  'FREQUENT_TRADER': 'Active in marketplace transactions',
  'HERO_FOCUSED': 'Prioritizes hero-related activities',
  'GARDEN_FOCUSED': 'Concentrates on garden LP activities',
  'QUESTER': 'Regularly participates in quests',
  'GUILD_MEMBER': 'Part of player guild/organization',
  'MULTICHAIN': 'Uses multiple blockchain networks',
  'HIGH_ENGAGEMENT': 'Very active community participation',
  'WHALE': 'Large financial investment in game'
};

export default function AdminUsers() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [archetypeFilter, setArchetypeFilter] = useState('ALL');
  const [tierFilter, setTierFilter] = useState('ALL');
  const [sortField, setSortField] = useState<'discordUsername' | 'tier'>('discordUsername');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery<UsersResponse>({
    queryKey: ['/api/admin/users'],
  });

  const updateTierMutation = useMutation({
    mutationFn: async ({ userId, tier }: { userId: number; tier: number }) => {
      return apiRequest(`/api/admin/users/${userId}/tier`, {
        method: 'PATCH',
        body: JSON.stringify({ tier }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'User tier updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update tier', variant: 'destructive' });
    },
  });

  const users = (data?.users ?? []) as User[];
  const selectedUser = users.find(u => u.id === selectedUserId);

  const filteredUsers = users
    .filter((user) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!user.discordUsername.toLowerCase().includes(query) &&
            !user.discordId.includes(query) &&
            !(user.walletAddress?.toLowerCase().includes(query))) {
          return false;
        }
      }
      if (archetypeFilter !== 'ALL' && user.archetype !== archetypeFilter) {
        return false;
      }
      if (tierFilter !== 'ALL' && user.tier !== parseInt(tierFilter)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'discordUsername') {
        cmp = a.discordUsername.localeCompare(b.discordUsername);
      } else if (sortField === 'tier') {
        cmp = a.tier - b.tier;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const handleSort = (field: 'discordUsername' | 'tier') => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: 'discordUsername' | 'tier' }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  const getArchetypeBadgeVariant = (archetype: string) => {
    switch (archetype) {
      case 'INVESTOR': return 'default';
      case 'PLAYER': return 'secondary';
      case 'ADVENTURER': return 'outline';
      case 'EXTRACTOR': return 'destructive';
      default: return 'outline';
    }
  };

  const getTierBadgeClass = (tier: number) => {
    return tierColors[tier ?? 0] || 'bg-gray-400 text-white';
  };

  const copyToClipboard = async (text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied!', description: 'Wallet address copied to clipboard' });
    } catch {
      toast({ title: 'Error', description: 'Failed to copy to clipboard', variant: 'destructive' });
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="admin-users-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground">
            Manage player profiles, tiers, and classifications
          </p>
        </div>
        <Button 
          onClick={() => refetch()} 
          variant="outline" 
          disabled={isRefetching}
          data-testid="button-refresh-users"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by username, Discord ID, or wallet..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-users"
                />
              </div>
            </div>
            <Select value={archetypeFilter} onValueChange={setArchetypeFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-archetype-filter">
                <SelectValue placeholder="Archetype" />
              </SelectTrigger>
              <SelectContent>
                {ARCHETYPES.map((a) => (
                  <SelectItem key={a} value={a}>{a === 'ALL' ? 'All Archetypes' : a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-[120px]" data-testid="select-tier-filter">
                <SelectValue placeholder="Tier" />
              </SelectTrigger>
              <SelectContent>
                {TIERS.map((t) => (
                  <SelectItem key={t} value={t}>{t === 'ALL' ? 'All Tiers' : tierNames[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Players ({filteredUsers.length})</CardTitle>
          <CardDescription>
            Click on a user row to view detailed profile
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="cursor-pointer select-none"
                      onClick={() => handleSort('discordUsername')}
                    >
                      <div className="flex items-center gap-1">
                        Discord
                        <SortIcon field="discordUsername" />
                      </div>
                    </TableHead>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Archetype</TableHead>
                    <TableHead 
                      className="cursor-pointer select-none"
                      onClick={() => handleSort('tier')}
                    >
                      <div className="flex items-center gap-1">
                        Tier
                        <SortIcon field="tier" />
                      </div>
                    </TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No users found matching your filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow 
                        key={user.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        data-testid={`row-user-${user.id}`}
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        <TableCell>
                          <div>
                            <div className="font-medium">{user.discordUsername}</div>
                            <div className="text-xs text-muted-foreground">{user.discordId}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.walletAddress ? (
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-xs">
                                {user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => copyToClipboard(user.walletAddress!, e)}
                                data-testid={`button-copy-wallet-${user.id}`}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Not linked</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getArchetypeBadgeVariant(user.archetype)}>
                            {user.archetype}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getTierBadgeClass(user.tier ?? 0)}>
                            {tierNames[user.tier ?? 0]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{user.state}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {user.flags?.isWhale && (
                              <Badge variant="secondary" className="text-xs">Whale</Badge>
                            )}
                            {user.flags?.isExtractor && (
                              <Badge variant="destructive" className="text-xs">Extractor</Badge>
                            )}
                            {user.flags?.isHighPotential && (
                              <Badge variant="default" className="text-xs">High Pot.</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={(user.tier ?? 0).toString()}
                            onValueChange={(value) => {
                              updateTierMutation.mutate({ 
                                userId: user.id, 
                                tier: parseInt(value) 
                              });
                            }}
                          >
                            <SelectTrigger className="w-[100px] h-8" data-testid={`select-tier-${user.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[0, 1, 2, 3, 4].map((t) => (
                                <SelectItem key={t} value={t.toString()}>{tierNames[t]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Darkening overlay behind panel */}
      {selectedUser && (
        <div className="fixed inset-0 pointer-events-none z-40" style={{background: 'radial-gradient(circle at right, rgba(0,0,0,0.4), transparent)'}} />
      )}
      
      {/* User Detail Panel */}
      {selectedUser && (
        <div className="fixed right-0 top-0 bottom-0 w-96 z-50 flex flex-col border-l border-border shadow-2xl" style={{backgroundColor: 'hsl(var(--background))', backdropFilter: 'none'}}>
          <div className="sticky top-0 border-b border-border p-4 flex items-center justify-between" style={{backgroundColor: 'hsl(var(--background))'}}>
            <div>
              <button 
                onClick={() => window.open(`${window.location.origin}/admin/account?userId=${selectedUser.discordId}`, '_blank')}
                className="text-lg font-semibold text-blue-600 dark:text-blue-400 hover:underline hover-elevate"
                data-testid={`button-open-user-dashboard-${selectedUser.id}`}
              >
                {selectedUser.discordUsername}
              </button>
              <p className="text-xs text-muted-foreground">{selectedUser.discordId}</p>
            </div>
            <Button 
              size="icon" 
              variant="ghost" 
              onClick={() => setSelectedUserId(null)}
              data-testid="button-close-detail"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-6 p-4">
            {/* Basic Info */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Basic Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discord</span>
                  <span className="font-medium truncate">{selectedUser.discordUsername}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Wallet</span>
                  {selectedUser.walletAddress ? (
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-xs truncate">{selectedUser.walletAddress.slice(0, 6)}...{selectedUser.walletAddress.slice(-4)}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyToClipboard(selectedUser.walletAddress!)}
                        data-testid="button-copy-wallet-detail"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <span className="font-medium text-xs">Not linked</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Archetype</span>
                  <Badge variant={getArchetypeBadgeVariant(selectedUser.archetype)}>{selectedUser.archetype}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tier</span>
                  <Badge className={getTierBadgeClass(selectedUser.tier ?? 0)}>{tierNames[selectedUser.tier ?? 0]}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">State</span>
                  <span className="font-medium">{selectedUser.state}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Influence</span>
                  <span className="font-medium">{selectedUser.influence ?? 0}</span>
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Performance KPIs</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Engagement</span>
                  <span className="font-medium">{selectedUser.kpis?.engagementScore?.toFixed(0) || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Financial</span>
                  <span className="font-medium">{selectedUser.kpis?.financialScore?.toFixed(0) || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Retention</span>
                  <span className="font-medium">{selectedUser.kpis?.retentionScore?.toFixed(0) || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Messages (7d)</span>
                  <span className="font-medium">{selectedUser.kpis?.messagesLast7d || 0}</span>
                </div>
              </div>
            </div>

            {/* Wallet Balances - Debug */}
            {selectedUser.walletBalances ? (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Wallet Balances</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">JEWEL</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{parseFloat(selectedUser.walletBalances.jewel).toFixed(2)}</span>
                      {selectedUser.walletBalances.change7d && (
                        <span className={parseFloat(selectedUser.walletBalances.change7d) >= 0 ? 'text-green-600 dark:text-green-400 text-xs font-medium' : 'text-red-600 dark:text-red-400 text-xs font-medium'}>
                          {parseFloat(selectedUser.walletBalances.change7d) >= 0 ? '+' : ''}{parseFloat(selectedUser.walletBalances.change7d).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">CRYSTAL</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{parseFloat(selectedUser.walletBalances.crystal).toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground">7d: —</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">cJEWEL</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{parseFloat(selectedUser.walletBalances.cJewel).toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground">7d: —</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              selectedUser.walletAddress && (
                <div className="text-xs text-muted-foreground p-2 bg-muted rounded">No wallet snapshot data yet</div>
              )
            )}

            {/* DFK Snapshot */}
            {selectedUser.dfkSnapshot && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">DFK Portfolio</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Heroes</span>
                    <span className="font-medium">{selectedUser.dfkSnapshot.heroCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gen0 Heroes</span>
                    <span className="font-medium">{selectedUser.dfkSnapshot.gen0Count || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">DFK Age</span>
                    <span className="font-medium">{selectedUser.dfkSnapshot.dfkAgeDays ? `${selectedUser.dfkSnapshot.dfkAgeDays} days` : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">LP Positions</span>
                    <span className="font-medium">{selectedUser.dfkSnapshot.lpPositionsCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total LP Value</span>
                    <span className="font-medium">${selectedUser.dfkSnapshot.totalLPValue?.toFixed(2) || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">JEWEL Balance</span>
                    <span className="font-medium">{selectedUser.dfkSnapshot.jewelBalance?.toFixed(0) || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CRYSTAL Balance</span>
                    <span className="font-medium">{selectedUser.dfkSnapshot.crystalBalance?.toFixed(2) || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">cJEWEL Balance</span>
                    <span className="font-medium">{selectedUser.dfkSnapshot.cJewelBalance?.toFixed(2) || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Questing Streak</span>
                    <span className="font-medium">{selectedUser.dfkSnapshot.questingStreakDays || 0}d</span>
                  </div>
                </div>
              </div>
            )}

            {/* Behavior Tags */}
            {selectedUser.behaviorTags && selectedUser.behaviorTags.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Behavior Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedUser.behaviorTags.map((tag) => (
                    <Tooltip key={tag}>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-xs cursor-help">{tag}</Badge>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-xs">
                        {behaviorTagDescriptions[tag] || 'Player behavior indicator'}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}

            {/* Flags */}
            {(selectedUser.flags?.isWhale || selectedUser.flags?.isExtractor || selectedUser.flags?.isHighPotential) && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Flags</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedUser.flags.isWhale && (
                    <Badge variant="secondary" className="text-xs">Whale</Badge>
                  )}
                  {selectedUser.flags.isExtractor && (
                    <Badge variant="destructive" className="text-xs">Extractor</Badge>
                  )}
                  {selectedUser.flags.isHighPotential && (
                    <Badge variant="default" className="text-xs">High Potential</Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
