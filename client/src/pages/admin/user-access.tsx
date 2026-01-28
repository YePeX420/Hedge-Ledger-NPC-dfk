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
import { Plus, Pencil, Trash2, RefreshCw, Eye, EyeOff, Calendar, Shield, AlertTriangle } from 'lucide-react';

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

const AVAILABLE_TABS = [
  { id: 'quest-optimizer', label: 'Quest Optimizer', description: 'Hero quest recommendations' },
  { id: 'ai-consultant', label: 'AI Consultant', description: 'AI-powered game advice' },
  { id: 'yield-calculator', label: 'Yield Calculator', description: 'Garden LP yields' },
  { id: 'yield-optimizer', label: 'Yield Optimizer', description: 'Optimal pool allocations' },
  { id: 'summon-sniper', label: 'Summon Sniper', description: 'Breeding pair finder' },
  { id: 'tavern-sniper', label: 'Tavern Sniper', description: 'Hero marketplace search' },
  { id: 'gardening-calculator', label: 'Gardening Calculator', description: 'Garden rewards estimator' },
];

export default function UserAccessManagement() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<DashboardUser | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<DashboardUser | null>(null);
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    displayName: '',
    expiresAt: '',
    allowedTabs: [] as string[],
  });
  const [showPassword, setShowPassword] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery<DashboardUsersResponse>({
    queryKey: ['/api/admin/dashboard-users'],
  });

  const createUserMutation = useMutation({
    mutationFn: async (userData: typeof formData) => {
      return apiRequest('POST', '/api/admin/dashboard-users', userData);
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'User created successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard-users'] });
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message || 'Failed to create user', variant: 'destructive' });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, ...userData }: { id: number } & typeof formData) => {
      return apiRequest('PATCH', `/api/admin/dashboard-users/${id}`, userData);
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'User updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard-users'] });
      setEditingUser(null);
      resetForm();
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

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      displayName: '',
      expiresAt: '',
      allowedTabs: [],
    });
    setShowPassword(false);
  };

  const openEditDialog = (user: DashboardUser) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      displayName: user.displayName || '',
      expiresAt: user.expiresAt ? new Date(user.expiresAt).toISOString().split('T')[0] : '',
      allowedTabs: user.allowedTabs || [],
    });
  };

  const handleTabToggle = (tabId: string) => {
    setFormData(prev => ({
      ...prev,
      allowedTabs: prev.allowedTabs.includes(tabId)
        ? prev.allowedTabs.filter(t => t !== tabId)
        : [...prev.allowedTabs, tabId],
    }));
  };

  const selectAllTabs = () => {
    setFormData(prev => ({
      ...prev,
      allowedTabs: AVAILABLE_TABS.map(t => t.id),
    }));
  };

  const clearAllTabs = () => {
    setFormData(prev => ({
      ...prev,
      allowedTabs: [],
    }));
  };

  const handleSubmit = () => {
    if (!formData.username) {
      toast({ title: 'Error', description: 'Username is required', variant: 'destructive' });
      return;
    }
    if (!editingUser && !formData.password) {
      toast({ title: 'Error', description: 'Password is required for new users', variant: 'destructive' });
      return;
    }
    if (formData.allowedTabs.length === 0) {
      toast({ title: 'Error', description: 'Select at least one tab permission', variant: 'destructive' });
      return;
    }

    if (editingUser) {
      updateUserMutation.mutate({ id: editingUser.id, ...formData });
    } else {
      createUserMutation.mutate(formData);
    }
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
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const UserFormContent = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={formData.username}
            onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
            placeholder="Enter username"
            data-testid="input-user-username"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name (optional)</Label>
          <Input
            id="displayName"
            value={formData.displayName}
            onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
            placeholder="Enter display name"
            data-testid="input-user-displayname"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">
          {editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={formData.password}
            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
            placeholder={editingUser ? 'Leave blank to keep current' : 'Enter password'}
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
        <Label htmlFor="expiresAt">Access Expires (optional)</Label>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="expiresAt"
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
          <Label>Tab Permissions</Label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={selectAllTabs}>
              Select All
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={clearAllTabs}>
              Clear All
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 border rounded-md p-3 bg-muted/20">
          {AVAILABLE_TABS.map(tab => (
            <div key={tab.id} className="flex items-center space-x-3">
              <Checkbox
                id={`tab-${tab.id}`}
                checked={formData.allowedTabs.includes(tab.id)}
                onCheckedChange={() => handleTabToggle(tab.id)}
                data-testid={`checkbox-tab-${tab.id}`}
              />
              <div className="flex-1">
                <label htmlFor={`tab-${tab.id}`} className="text-sm font-medium cursor-pointer">
                  {tab.label}
                </label>
                <p className="text-xs text-muted-foreground">{tab.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6" data-testid="user-access-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Access Management</h1>
          <p className="text-muted-foreground">
            Create and manage dashboard user accounts with password authentication
          </p>
        </div>
        <div className="flex gap-2">
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
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-user">
                <Plus className="w-4 h-4 mr-2" />
                Create User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>
                  Create a new dashboard user with password authentication and tab permissions.
                </DialogDescription>
              </DialogHeader>
              <UserFormContent />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
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
                    <TableHead>Allowed Tabs</TableHead>
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
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(user.allowedTabs || []).slice(0, 3).map(tab => (
                            <Badge key={tab} variant="outline" className="text-xs">
                              {AVAILABLE_TABS.find(t => t.id === tab)?.label || tab}
                            </Badge>
                          ))}
                          {(user.allowedTabs || []).length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{user.allowedTabs.length - 3} more
                            </Badge>
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
                            onClick={() => toggleUserMutation.mutate({
                              id: user.id,
                              isActive: !user.isActive
                            })}
                            data-testid={`button-toggle-${user.id}`}
                          >
                            {user.isActive ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEditDialog(user)}
                            data-testid={`button-edit-${user.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteConfirmUser(user)}
                            data-testid={`button-delete-${user.id}`}
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
          resetForm();
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user settings, password, or tab permissions.
            </DialogDescription>
          </DialogHeader>
          <UserFormContent />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
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
            <Button variant="outline" onClick={() => setDeleteConfirmUser(null)}>
              Cancel
            </Button>
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
