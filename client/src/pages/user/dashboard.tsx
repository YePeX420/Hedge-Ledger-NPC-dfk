import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { API_BASE_URL } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { 
  LogOut, 
  Dumbbell, 
  Bot, 
  TrendingUp, 
  Calculator, 
  Target, 
  Beer,
  Swords,
  Clock,
  AlertTriangle,
  User
} from 'lucide-react';

interface UserSession {
  id: number;
  username: string;
  displayName: string | null;
  allowedTabs: string[];
  expiresAt: string | null;
}

interface SessionResponse {
  success: boolean;
  user: UserSession;
}

const TAB_CONFIG: Record<string, { label: string; icon: any; href: string; description: string }> = {
  'quest-optimizer': { 
    label: 'Quest Optimizer', 
    icon: Dumbbell, 
    href: '/user/quest-optimizer',
    description: 'Find optimal quests for your heroes'
  },
  'ai-consultant': { 
    label: 'AI Consultant', 
    icon: Bot, 
    href: '/user/ai-consultant',
    description: 'Get AI-powered game advice'
  },
  'yield-calculator': { 
    label: 'Yield Calculator', 
    icon: TrendingUp, 
    href: '/user/yield-calculator',
    description: 'Calculate garden LP yields'
  },
  'yield-optimizer': { 
    label: 'Yield Optimizer', 
    icon: Calculator, 
    href: '/user/yield-optimizer',
    description: 'Optimize pool allocations'
  },
  'summon-sniper': { 
    label: 'Summon Sniper', 
    icon: Target, 
    href: '/user/summon-sniper',
    description: 'Find optimal breeding pairs'
  },
  'tavern-sniper': { 
    label: 'Tavern Sniper', 
    icon: Beer, 
    href: '/user/tavern-sniper',
    description: 'Search hero marketplace'
  },
  'gardening-calculator': { 
    label: 'Gardening Calculator', 
    icon: Calculator, 
    href: '/user/gardening-calculator',
    description: 'Estimate gardening rewards'
  },
  'combat-pets': { 
    label: 'Combat Pets Shop', 
    icon: Swords, 
    href: '/user/combat-pets',
    description: 'Find top combat pets for sale'
  },
};

export default function UserDashboardPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const { data, isLoading, error } = useQuery<SessionResponse>({
    queryKey: ['/api/user/session'],
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (error) {
      setLocation('/user/login');
    }
  }, [error, setLocation]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch(`${API_BASE_URL}/api/user/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      toast({ title: 'Logged out', description: 'You have been signed out' });
      setLocation('/user/login');
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to log out', variant: 'destructive' });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const formatExpirationDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isExpiringSoon = (dateStr: string | null) => {
    if (!dateStr) return false;
    const expiresAt = new Date(dateStr);
    const now = new Date();
    const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysUntilExpiry > 0 && daysUntilExpiry <= 7;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data?.user) {
    return null;
  }

  const user = data.user;
  const allowedTabs = user.allowedTabs || [];

  return (
    <div className="min-h-screen bg-background" data-testid="user-dashboard-page">
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold">
              HL
            </div>
            <div>
              <h1 className="font-semibold">Hedge Ledger</h1>
              <p className="text-sm text-muted-foreground">Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium" data-testid="text-user-name">
                {user.displayName || user.username}
              </p>
              <p className="text-xs text-muted-foreground">@{user.username}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              disabled={isLoggingOut}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-1" />
              {isLoggingOut ? 'Signing out...' : 'Sign out'}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5" />
                <CardTitle>Welcome back!</CardTitle>
              </div>
              {user.expiresAt && (
                <Badge 
                  variant={isExpiringSoon(user.expiresAt) ? 'destructive' : 'secondary'}
                  className="flex items-center gap-1"
                >
                  {isExpiringSoon(user.expiresAt) && <AlertTriangle className="h-3 w-3" />}
                  <Clock className="h-3 w-3" />
                  Expires {formatExpirationDate(user.expiresAt)}
                </Badge>
              )}
            </div>
            <CardDescription>
              Select a tool below to get started. You have access to {allowedTabs.length} dashboard{allowedTabs.length !== 1 ? 's' : ''}.
            </CardDescription>
          </CardHeader>
        </Card>

        {allowedTabs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No tools available.</p>
              <p className="text-sm text-muted-foreground">Contact your administrator to request access.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allowedTabs.map(tabId => {
              const config = TAB_CONFIG[tabId];
              if (!config) return null;
              
              const Icon = config.icon;
              
              return (
                <Card 
                  key={tabId} 
                  className="hover-elevate cursor-pointer transition-all"
                  onClick={() => setLocation(config.href)}
                  data-testid={`card-${tabId}`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold mb-1">{config.label}</h3>
                        <p className="text-sm text-muted-foreground">{config.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
