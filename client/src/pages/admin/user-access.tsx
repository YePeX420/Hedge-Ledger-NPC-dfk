import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, RefreshCw, Eye, EyeOff, Calendar, Shield, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

interface DashboardUser {
  id: number;
  username: string;
  displayName: string | null;
  isActive: boolean;
  expiresAt: string | null;
  allowedTabs: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

interface DashboardUsersResponse {
  success: boolean;
  users: DashboardUser[];
}

interface ToolGroup {
  id: string;
  label: string;
  description: string;
  tabs: { id: string; label: string; description: string }[];
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'heroes',
    label: 'Hero Tools',
    description: 'Hero analysis, quest optimization, breeding, and combat',
    tabs: [
      { id: 'quest-optimizer', label: 'Quest Optimizer', description: 'Hero quest recommendations' },
      { id: 'summon-sniper', label: 'Summon Sniper', description: 'Breeding pair finder' },
      { id: 'summoning-calculator', label: 'Summoning Calculator', description: 'Summoning probability calculator' },
      { id: 'tavern-sniper', label: 'Tavern Sniper', description: 'Hero marketplace search' },
      { id: 'bargain-hunter', label: 'Bargain Hunter', description: 'Find underpriced heroes' },
      { id: 'dark-bargain-hunter', label: 'Dark Bargain Hunter', description: 'Advanced hero deal finder' },
      { id: 'pvp-matchup', label: 'PVP Matchup', description: 'Head-to-head combat analysis' },
      { id: 'battle-ready', label: 'Battle Ready', description: 'PVP hero readiness checker' },
      { id: 'combat-toolkit', label: 'Combat Toolkit', description: 'Combat stat analysis tools' },
    ],
  },
  {
    id: 'yield',
    label: 'Yield & Garden',
    description: 'Garden LP yield analysis and optimization',
    tabs: [
      { id: 'pools', label: 'Pools', description: 'Liquidity pool analytics and staker data' },
      { id: 'yield-calculator', label: 'Yield Calculator', description: 'Garden LP yields' },
      { id: 'yield-optimizer', label: 'Yield Optimizer', description: 'Optimal pool allocations' },
      { id: 'gardening-calculator', label: 'Gardening Calculator', description: 'Garden rewards estimator' },
      { id: 'gardening-quest', label: 'Gardening Quest', description: 'Gardening quest indexer and rewards' },
      { id: 'patrol-rewards', label: 'Patrol Rewards', description: 'Patrol quest reward tracker' },
      { id: 'profit-tracker', label: 'Profit Tracker', description: 'Wallet profit and loss tracking' },
    ],
  },
  {
    id: 'ai',
    label: 'AI Tools',
    description: 'AI-powered game advice and analysis',
    tabs: [
      { id: 'ai-consultant', label: 'AI Consultant', description: 'AI-powered game advice' },
    ],
  },
  {
    id: 'market',
    label: 'Market & Tavern',
    description: 'Marketplace browsing, market intelligence, hero pricing, and pet analysis',
    tabs: [
      { id: 'combat-pets', label: 'Combat Pets Shop', description: 'Pet marketplace with top roll analysis' },
      { id: 'market-intel', label: 'Market Intel', description: 'Sales analytics and demand metrics' },
      { id: 'hero-score', label: 'Hero Score Calc', description: 'Hero score and divine altar multiplier' },
      { id: 'hero-price', label: 'Hero Price Tool', description: 'AI-powered hero valuation and flip finder' },
      { id: 'tavern-wallet-activity', label: 'Wallet Activity', description: 'Tavern buy/sell history for a wallet' },
    ],
  },
  {
    id: 'competitive',
    label: 'Competitive',
    description: 'Tournaments, leaderboards, and ranked play',
    tabs: [
      { id: 'level-racer', label: 'Level Racer', description: 'Class-based leveling competition' },
      { id: 'dfk-tournaments', label: 'DFK Tournaments', description: 'Tournament browser and bracket viewer' },
      { id: 'previous-tournaments', label: 'Previous Tournaments', description: 'Completed tournament archive' },
      { id: 'fight-history', label: 'Fight History', description: 'Indexed bout archive and analysis' },
      { id: 'pve-droprates', label: 'PVE Drop Rates', description: 'Multi-chain PVE loot drop rate tracker' },
      { id: 'pve-hunts', label: 'PVE Hunt Tracker', description: 'Live hunt expedition tracker with party analysis' },
      { id: 'hunt-companion', label: 'Hunt Companion', description: 'Real-time PVE battle advisor with AI action recommendations' },
      { id: 'telemetry', label: 'DFK Telemetry', description: 'Chrome Extension hunt telemetry viewer and stat reconciliation tool' },
    ],
  },
  {
    id: 'ecosystem',
    label: 'Ecosystem',
    description: 'Chain analytics, bridge flows, token registry, and player data',
    tabs: [
      { id: 'value-allocation', label: 'Value Allocation', description: 'TVL and value breakdown dashboard' },
      { id: 'tokens', label: 'Token Registry', description: 'Token list and metadata sync' },
      { id: 'bridge', label: 'Bridge Analytics', description: 'Cross-chain bridge flow tracker' },
      { id: 'extractors', label: 'Extractors', description: 'Bridge extractor activity' },
      { id: 'users', label: 'Players / Users', description: 'Player profile and wallet browser' },
    ],
  },
  {
    id: 'indexers',
    label: 'Indexers',
    description: 'Live on-chain data indexing tools',
    tabs: [
      { id: 'tavern-indexer', label: 'Tavern Indexer', description: 'Live hero listing indexer' },
      { id: 'jeweler', label: 'Jeweler', description: 'Jeweler staking indexer and leaderboard' },
      { id: 'pool-indexer', label: 'Pool Indexer V2', description: 'Unified pool staker indexer' },
      { id: 'pool-indexer-v1', label: 'Pool Indexer V1', description: 'Legacy pool staker indexer' },
      { id: 'pool-indexer-harmony', label: 'Pool Indexer Harmony', description: 'Harmony chain pool indexer' },
    ],
  },
];

const ALL_TABS = TOOL_GROUPS.flatMap(g => g.tabs);

interface UserFormProps {
  formData: {
    username: string;
    password: string;
    displayName: string;
    expiresAt: string;
    allowedTabs: string[];
  };
  setFormData: React.Dispatch<React.SetStateAction<UserFormProps['formData']>>;
  isEditing: boolean;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
}

function UserFormContent({ formData, setFormData, isEditing, showPassword, setShowPassword }: UserFormProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(TOOL_GROUPS.map(g => [g.id, true]))
  );

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleTabToggle = (tabId: string) => {
    setFormData(prev => ({
      ...prev,
      allowedTabs: prev.allowedTabs.includes(tabId)
        ? prev.allowedTabs.filter(t => t !== tabId)
        : [...prev.allowedTabs, tabId],
    }));
  };

  const toggleGroupTabs = (group: ToolGroup) => {
    const groupTabIds = group.tabs.map(t => t.id);
    const allSelected = groupTabIds.every(id => formData.allowedTabs.includes(id));
    if (allSelected) {
      setFormData(prev => ({ ...prev, allowedTabs: prev.allowedTabs.filter(id => !groupTabIds.includes(id)) }));
    } else {
      setFormData(prev => ({ ...prev, allowedTabs: [...new Set([...prev.allowedTabs, ...groupTabIds])] }));
    }
  };

  const selectAllTabs = () => setFormData(prev => ({ ...prev, allowedTabs: ALL_TABS.map(t => t.id) }));
  const clearAllTabs = () => setFormData(prev => ({ ...prev, allowedTabs: [] }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="form-username">Username</Label>
          <Input
            id="form-username"
            value={formData.username}
            onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
            placeholder="Enter username"
            data-testid="input-user-username"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="form-displayName">Display Name (optional)</Label>
          <Input
            id="form-displayName"
            value={formData.displayName}
            onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
            placeholder="Enter display name"
            data-testid="input-user-displayname"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="form-password">
          {isEditing ? 'New Password (leave blank to keep current)' : 'Password'}
        </Label>
        <div className="relative">
          <Input
            id="form-password"
            type={showPassword ? 'text' : 'password'}
            value={formData.password}
            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
            placeholder={isEditing ? 'Leave blank to keep current' : 'Enter password'}
            data-testid="input-user-password"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="form-expiresAt">Access Expires (optional)</Label>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="form-expiresAt"
            type="date"
            value={formData.expiresAt}
            onChange={(e) => setFormData(prev => ({ ...prev, expiresAt: e.target.value }))}
            className="pl-10"
            data-testid="input-user-expires"
          />
        </div>
        <p className="text-xs text-muted-foreground">Leave empty for unlimited access</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Tool Group Permissions</Label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={selectAllTabs}>
              Select All
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={clearAllTabs}>
              Clear All
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {TOOL_GROUPS.map(group => {
            const groupTabIds = group.tabs.map(t => t.id);
            const selectedCount = groupTabIds.filter(id => formData.allowedTabs.includes(id)).length;
            const allSelected = selectedCount === groupTabIds.length;
            const someSelected = selectedCount > 0 && !allSelected;
            const isExpanded = expandedGroups[group.id];

            return (
              <div key={group.id} className="border border-border/50 rounded-md overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/20 cursor-pointer" onClick={() => toggleGroup(group.id)}>
                  <Checkbox
                    id={`group-${group.id}`}
                    checked={allSelected}
                    data-state={someSelected ? 'indeterminate' : allSelected ? 'checked' : 'unchecked'}
                    onCheckedChange={() => toggleGroupTabs(group)}
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`checkbox-group-${group.id}`}
                    className={someSelected ? 'opacity-70' : ''}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor={`group-${group.id}`}
                        className="text-sm font-medium cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {group.label}
                      </label>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {selectedCount}/{groupTabIds.length}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{group.description}</p>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </div>
                {isExpanded && (
                  <div className="px-3 py-2 space-y-2 bg-background/50">
                    {group.tabs.map(tab => (
                      <div key={tab.id} className="flex items-center space-x-3 pl-6">
                        <Checkbox
                          id={`tab-${tab.id}`}
                          checked={formData.allowedTabs.includes(tab.id)}
                          onCheckedChange={() => handleTabToggle(tab.id)}
                          data-testid={`checkbox-tab-${tab.id}`}
                        />
                        <div className="flex-1">
                          <label htmlFor={`tab-${tab.id}`} className="text-sm cursor-pointer">
                            {tab.label}
                          </label>
                          <p className="text-xs text-muted-foreground">{tab.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function UserAccessManagement() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<DashboardUser | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<DashboardUser | null>(null);

  const emptyForm = {
    username: '',
    password: '',
    displayName: '',
    expiresAt: '',
    allowedTabs: [] as string[],
  };

  const [createFormData, setCreateFormData] = useState(emptyForm);
  const [editFormData, setEditFormData] = useState(emptyForm);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery<DashboardUsersResponse>({
    queryKey: ['/api/admin/dashboard-users'],
  });

  const createUserMutation = useMutation({
    mutationFn: async (userData: typeof emptyForm) => {
      return apiRequest('POST', '/api/admin/dashboard-users', userData);
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'User created successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard-users'] });
      setIsCreateOpen(false);
      setCreateFormData(emptyForm);
      setShowCreatePassword(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message || 'Failed to create user', variant: 'destructive' });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, ...userData }: { id: number } & typeof emptyForm) => {
      return apiRequest('PATCH', `/api/admin/dashboard-users/${id}`, userData);
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'User updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard-users'] });
      setEditingUser(null);
      setEditFormData(emptyForm);
      setShowEditPassword(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message || 'Failed to update user', variant: 'destructive' });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/dashboard-users/${id}`);
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'User deleted successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard-users'] });
      setDeleteConfirmUser(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message || 'Failed to delete user', variant: 'destructive' });
    },
  });

  const toggleUserMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return apiRequest('PATCH', `/api/admin/dashboard-users/${id}/toggle`, { isActive });
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'User status updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard-users'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message || 'Failed to update status', variant: 'destructive' });
    },
  });

  const openEditDialog = (user: DashboardUser) => {
    setEditingUser(user);
    setEditFormData({
      username: user.username,
      password: '',
      displayName: user.displayName || '',
      expiresAt: user.expiresAt ? new Date(user.expiresAt).toISOString().split('T')[0] : '',
      allowedTabs: user.allowedTabs || [],
    });
    setShowEditPassword(false);
  };

  const handleCreateSubmit = () => {
    if (!createFormData.username) {
      toast({ title: 'Error', description: 'Username is required', variant: 'destructive' });
      return;
    }
    if (!createFormData.password) {
      toast({ title: 'Error', description: 'Password is required for new users', variant: 'destructive' });
      return;
    }
    if (createFormData.allowedTabs.length === 0) {
      toast({ title: 'Error', description: 'Select at least one tool permission', variant: 'destructive' });
      return;
    }
    createUserMutation.mutate(createFormData);
  };

  const handleEditSubmit = () => {
    if (!editingUser) return;
    if (!editFormData.username) {
      toast({ title: 'Error', description: 'Username is required', variant: 'destructive' });
      return;
    }
    if (editFormData.allowedTabs.length === 0) {
      toast({ title: 'Error', description: 'Select at least one tool permission', variant: 'destructive' });
      return;
    }
    updateUserMutation.mutate({ id: editingUser.id, ...editFormData });
  };

  const users = data?.users ?? [];
  const now = new Date();

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < now;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const getTabGroupSummary = (tabs: string[]) => {
    const groupLabels = TOOL_GROUPS.filter(g =>
      g.tabs.some(t => tabs.includes(t.id))
    ).map(g => g.label);
    return groupLabels;
  };

  return (
    <div className="p-6 space-y-6" data-testid="user-access-page">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">User Access Management</h1>
          <p className="text-muted-foreground">
            Create and manage dashboard user accounts with password authentication and tool group permissions
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            onClick={() => refetch()}
            variant="outline"
            disabled={isRefetching}
            data-testid="button-refresh-users"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) {
              setCreateFormData(emptyForm);
              setShowCreatePassword(false);
            }
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-user">
                <Plus className="w-4 h-4 mr-2" />
                Create User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>
                  Create a new dashboard user with password authentication and tool group permissions.
                </DialogDescription>
              </DialogHeader>
              <UserFormContent
                formData={createFormData}
                setFormData={setCreateFormData}
                isEditing={false}
                showPassword={showCreatePassword}
                setShowPassword={setShowCreatePassword}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleCreateSubmit}
                  disabled={createUserMutation.isPending}
                  data-testid="button-submit-create"
                >
                  {createUserMutation.isPending ? 'Creating...' : 'Create User'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Dashboard Users ({users.length})
          </CardTitle>
          <CardDescription>
            Users with password-based access to the dashboard (separate from admin Discord OAuth)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No users created yet.</p>
              <p className="text-sm">Click "Create User" to add your first dashboard user.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Tool Groups</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{user.displayName || user.username}</div>
                          <div className="text-xs text-muted-foreground">@{user.username}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {!user.isActive ? (
                          <Badge variant="secondary">Disabled</Badge>
                        ) : isExpired(user.expiresAt) ? (
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                            <AlertTriangle className="h-3 w-3" />
                            Expired
                          </Badge>
                        ) : (
                          <Badge variant="default" className="bg-green-600">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={isExpired(user.expiresAt) ? 'text-destructive' : ''}>
                          {formatDate(user.expiresAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {getTabGroupSummary(user.allowedTabs || []).map(group => (
                            <Badge key={group} variant="outline" className="text-xs">
                              {group}
                            </Badge>
                          ))}
                          {(user.allowedTabs || []).length === 0 && (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => toggleUserMutation.mutate({ id: user.id, isActive: !user.isActive })}
                            data-testid={`button-toggle-${user.id}`}
                            title={user.isActive ? 'Disable user' : 'Enable user'}
                          >
                            {user.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEditDialog(user)}
                            data-testid={`button-edit-${user.id}`}
                            title="Edit user"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteConfirmUser(user)}
                            data-testid={`button-delete-${user.id}`}
                            title="Delete user"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
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

      <Dialog open={!!editingUser} onOpenChange={(open) => {
        if (!open) {
          setEditingUser(null);
          setEditFormData(emptyForm);
          setShowEditPassword(false);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user settings, password, or tool group permissions.
            </DialogDescription>
          </DialogHeader>
          <UserFormContent
            formData={editFormData}
            setFormData={setEditFormData}
            isEditing={true}
            showPassword={showEditPassword}
            setShowPassword={setShowEditPassword}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button
              onClick={handleEditSubmit}
              disabled={updateUserMutation.isPending}
              data-testid="button-submit-edit"
            >
              {updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmUser} onOpenChange={(open) => {
        if (!open) setDeleteConfirmUser(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConfirmUser?.displayName || deleteConfirmUser?.username}"?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmUser(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmUser && deleteUserMutation.mutate(deleteConfirmUser.id)}
              disabled={deleteUserMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteUserMutation.isPending ? 'Deleting...' : 'Delete User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
