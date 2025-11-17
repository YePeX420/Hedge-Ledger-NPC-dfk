import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Search, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface UserData {
  id: number;
  discordId: string;
  discordUsername: string;
  walletAddress: string | null;
  tier: string | null;
  balance: string | null;
  lifetimeDeposits: string | null;
  lastQueryAt: string | null;
  firstSeenAt: string;
  totalMessages: number;
  queryCount: number;
  queryCosts: string;
  queryProfit: string;
  freeQueryCount: number;
  depositCount: number;
  completedDeposits: number;
  totalJewelProvided: string;
  totalCrystalProvided: string;
  conversationSummary: string;
  userState: string;
  conversionStatus: string;
}

export default function UserManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTiers, setSelectedTiers] = useState<{[key: number]: string}>({});

  const { data: users, isLoading } = useQuery<UserData[]>({
    queryKey: ['/api/admin/users'],
  });

  const updateTierMutation = useMutation({
    mutationFn: async ({ userId, tier }: { userId: number; tier: string }) => {
      return await apiRequest(`/api/admin/users/${userId}/tier`, {
        method: 'PATCH',
        body: JSON.stringify({ tier })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    }
  });

  const handleTierChange = (userId: number, tier: string) => {
    setSelectedTiers(prev => ({ ...prev, [userId]: tier }));
  };

  const handleSaveTier = (userId: number) => {
    const tier = selectedTiers[userId];
    if (tier) {
      updateTierMutation.mutate({ userId, tier });
    }
  };

  const filteredUsers = users?.filter(user => 
    user.discordUsername.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.discordId.includes(searchTerm) ||
    (user.walletAddress && user.walletAddress.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="users-container">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold" data-testid="users-title">User Management</h1>
            <p className="text-muted-foreground" data-testid="users-subtitle">
              Manage individual users and update tiers for testing
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 w-64"
              data-testid="input-search"
            />
          </div>
        </div>
      </div>

      <Card data-testid="card-users">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Users ({filteredUsers.length})
          </CardTitle>
          <CardDescription>
            View detailed user stats and manage tier assignments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Discord User</TableHead>
                  <TableHead>Wallet Address</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Focus Activity</TableHead>
                  <TableHead>Hedge Engagement</TableHead>
                  <TableHead>Conversion</TableHead>
                  <TableHead>JEWEL Provided</TableHead>
                  <TableHead>CRYSTAL Provided</TableHead>
                  <TableHead>Query Costs</TableHead>
                  <TableHead>Profit</TableHead>
                  <TableHead>Conversation Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell>
                        <div>
                          <div className="font-medium" data-testid={`text-username-${user.id}`}>
                            {user.discordUsername}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {user.discordId}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-mono">
                          {user.walletAddress ? 
                            `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : 
                            '-'
                          }
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.userState === 'active' ? 'default' : 'secondary'}>
                          {user.userState}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={selectedTiers[user.id] || user.tier || 'free'}
                            onValueChange={(value) => handleTierChange(user.id, value)}
                            data-testid={`select-tier-${user.id}`}
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="free">Free</SelectItem>
                              <SelectItem value="bronze">Bronze</SelectItem>
                              <SelectItem value="silver">Silver</SelectItem>
                              <SelectItem value="gold">Gold</SelectItem>
                              <SelectItem value="whale">Whale</SelectItem>
                            </SelectContent>
                          </Select>
                          {selectedTiers[user.id] && selectedTiers[user.id] !== user.tier && (
                            <Button 
                              size="sm" 
                              onClick={() => handleSaveTier(user.id)}
                              disabled={updateTierMutation.isPending}
                              data-testid={`button-save-tier-${user.id}`}
                            >
                              Save
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {user.conversationSummary === 'No recent conversations' 
                            ? '-' 
                            : user.conversationSummary
                          }
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {user.queryCount} queries
                          <div className="text-xs text-muted-foreground">
                            {user.freeQueryCount} free
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.conversionStatus === 'converted' ? 'default' : 'secondary'}>
                          {user.conversionStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {parseFloat(user.totalJewelProvided || '0').toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {parseFloat(user.totalCrystalProvided || '0').toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          ${parseFloat(user.queryCosts || '0').toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          ${parseFloat(user.queryProfit || '0').toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm max-w-xs truncate" title={user.conversationSummary}>
                          {user.conversationSummary}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
