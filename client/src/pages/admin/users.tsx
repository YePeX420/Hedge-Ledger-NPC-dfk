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
import { useToast } from '@/hooks/use-toast';
import { Search, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react';

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
  wallet: string | null;
  profile: UserProfile;
}

interface UsersResponse {
  success: boolean;
  users: User[];
}

const ARCHETYPES = ['ALL', 'GUEST', 'ADVENTURER', 'PLAYER', 'INVESTOR', 'EXTRACTOR', 'UNKNOWN'];
const TIERS = ['ALL', '0', '1', '2', '3', '4'];

const tierNames: Record<string | number, string> = {
  0: 'Guest',
  1: 'Bronze',
  2: 'Silver',
  3: 'Gold',
  4: 'Council of Hedge'
};

export default function AdminUsers() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [archetypeFilter, setArchetypeFilter] = useState('ALL');
  const [tierFilter, setTierFilter] = useState('ALL');
  const [sortField, setSortField] = useState<'discordUsername' | 'tier'>('discordUsername');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

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

  const users = data?.users ?? [];

  const filteredUsers = users
    .filter((user) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!user.discordUsername.toLowerCase().includes(query) &&
            !user.discordId.includes(query) &&
            !(user.wallet?.toLowerCase().includes(query))) {
          return false;
        }
      }
      if (archetypeFilter !== 'ALL' && user.profile.archetype !== archetypeFilter) {
        return false;
      }
      if (tierFilter !== 'ALL' && user.profile.tier !== parseInt(tierFilter)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'discordUsername') {
        cmp = a.discordUsername.localeCompare(b.discordUsername);
      } else if (sortField === 'tier') {
        cmp = a.profile.tier - b.profile.tier;
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
    switch (tier) {
      case 4: return 'bg-purple-500 text-white';
      case 3: return 'bg-yellow-500 text-black';
      case 2: return 'bg-blue-500 text-white';
      case 1: return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
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
            Click on a user row to view detailed profile (coming soon)
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
                      >
                        <TableCell>
                          <div>
                            <div className="font-medium">{user.discordUsername}</div>
                            <div className="text-xs text-muted-foreground">{user.discordId}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.wallet ? (
                            <span className="font-mono text-xs">
                              {user.wallet.slice(0, 6)}...{user.wallet.slice(-4)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">Not linked</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getArchetypeBadgeVariant(user.profile.archetype)}>
                            {user.profile.archetype}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getTierBadgeClass(user.profile.tier)}>
                            {tierNames[user.profile.tier]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{user.profile.state}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {user.profile.flags?.isWhale && (
                              <Badge variant="secondary" className="text-xs">Whale</Badge>
                            )}
                            {user.profile.flags?.isExtractor && (
                              <Badge variant="destructive" className="text-xs">Extractor</Badge>
                            )}
                            {user.profile.flags?.isHighPotential && (
                              <Badge variant="default" className="text-xs">High Pot.</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={user.profile.tier.toString()}
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
    </div>
  );
}
