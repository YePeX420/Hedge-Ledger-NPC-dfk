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
  User,
  Sparkles,
  Shield,
  ShieldCheck,
  Flame,
  BarChart3,
  Database,
  Trophy,
  History,
  Layers,
  DollarSign,
  Leaf,
  Droplets,
  Sprout,
  Star,
  ArrowLeftRight,
  PieChart,
  Coins,
  Users,
  Activity,
  Gem,
  TrendingDown,
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
  'pools': {
    label: 'Pools',
    icon: Droplets,
    href: '/user/pools',
    description: 'Liquidity pool analytics and staker data'
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
  'summoning-calculator': {
    label: 'Summoning Calculator',
    icon: Sparkles,
    href: '/user/summoning-calculator',
    description: 'Summoning probability calculator'
  },
  'tavern-sniper': { 
    label: 'Tavern Sniper', 
    icon: Beer, 
    href: '/user/tavern-sniper',
    description: 'Search hero marketplace'
  },
  'bargain-hunter': {
    label: 'Bargain Hunter',
    icon: DollarSign,
    href: '/user/bargain-hunter',
    description: 'Find underpriced heroes'
  },
  'dark-bargain-hunter': {
    label: 'Dark Bargain Hunter',
    icon: Flame,
    href: '/user/dark-bargain-hunter',
    description: 'Advanced hero deal finder'
  },
  'gardening-calculator': { 
    label: 'Gardening Calculator', 
    icon: Leaf, 
    href: '/user/gardening-calculator',
    description: 'Estimate gardening rewards'
  },
  'patrol-rewards': {
    label: 'Patrol Rewards',
    icon: Shield,
    href: '/user/patrol-rewards',
    description: 'Patrol quest reward tracker'
  },
  'profit-tracker': {
    label: 'Profit Tracker',
    icon: BarChart3,
    href: '/user/profit-tracker',
    description: 'Wallet profit and loss tracking'
  },
  'combat-pets': { 
    label: 'Combat Pets Shop', 
    icon: Swords, 
    href: '/user/combat-pets',
    description: 'Find top combat pets for sale'
  },
  'market-intel': {
    label: 'Market Intel',
    icon: TrendingUp,
    href: '/user/market-intel',
    description: 'Sales analytics and demand metrics'
  },
  'pvp-matchup': {
    label: 'PVP Matchup',
    icon: Swords,
    href: '/user/pvp-matchup',
    description: 'Head-to-head combat analysis'
  },
  'battle-ready': {
    label: 'Battle Ready',
    icon: ShieldCheck,
    href: '/user/battle-ready',
    description: 'PVP hero readiness checker'
  },
  'combat-toolkit': {
    label: 'Combat Toolkit',
    icon: Layers,
    href: '/user/combat-toolkit',
    description: 'Combat stat analysis tools'
  },
  'level-racer': {
    label: 'Level Racer',
    icon: Trophy,
    href: '/user/level-racer',
    description: 'Class-based leveling competition'
  },
  'dfk-tournaments': {
    label: 'DFK Tournaments',
    icon: Trophy,
    href: '/user/dfk-tournaments',
    description: 'Tournament browser and bracket viewer'
  },
  'previous-tournaments': {
    label: 'Previous Tournaments',
    icon: History,
    href: '/user/previous-tournaments',
    description: 'Completed tournament archive'
  },
  'fight-history': {
    label: 'Fight History',
    icon: Swords,
    href: '/user/fight-history',
    description: 'Indexed bout archive and analysis'
  },
  'tavern-indexer': {
    label: 'Tavern Indexer',
    icon: Database,
    href: '/user/tavern-indexer',
    description: 'Live hero listing indexer'
  },
  'gardening-quest': {
    label: 'Gardening Quest',
    icon: Sprout,
    href: '/user/gardening-quest',
    description: 'Gardening quest indexer and rewards'
  },
  'hero-score': {
    label: 'Hero Score Calc',
    icon: Star,
    href: '/user/hero-score',
    description: 'Hero score and divine altar multiplier'
  },
  'hero-price': {
    label: 'Hero Price Tool',
    icon: DollarSign,
    href: '/user/hero-price',
    description: 'AI-powered hero valuation and flip finder'
  },
  'tavern-wallet-activity': {
    label: 'Wallet Activity',
    icon: Activity,
    href: '/user/tavern-wallet-activity',
    description: 'Tavern buy/sell history for a wallet'
  },
  'pve-hunts': {
    label: 'PVE Hunt Tracker',
    icon: Swords,
    href: '/user/pve-hunts',
    description: 'Live hunt expedition tracker with party analysis'
  },
  'hunt-companion': {
    label: 'Hunt Companion',
    icon: Swords,
    href: '/user/hunt-companion',
    description: 'Real-time PVE battle advisor with AI action recommendations'
  },
  'telemetry': {
    label: 'DFK Telemetry',
    icon: Database,
    href: '/user/telemetry',
    description: 'Chrome Extension hunt telemetry viewer and stat reconciliation tool'
  },
  'pve-droprates': {
    label: 'PVE Drop Rates',
    icon: TrendingDown,
    href: '/user/pve-droprates',
    description: 'Multi-chain PVE loot drop rate tracker'
  },
  'value-allocation': {
    label: 'Value Allocation',
    icon: PieChart,
    href: '/user/value-allocation',
    description: 'TVL and value breakdown dashboard'
  },
  'tokens': {
    label: 'Token Registry',
    icon: Coins,
    href: '/user/tokens',
    description: 'Token list and metadata sync'
  },
  'bridge': {
    label: 'Bridge Analytics',
    icon: ArrowLeftRight,
    href: '/user/bridge',
    description: 'Cross-chain bridge flow tracker'
  },
  'extractors': {
    label: 'Extractors',
    icon: TrendingDown,
    href: '/user/extractors',
    description: 'Bridge extractor activity'
  },
  'users': {
    label: 'Players / Users',
    icon: Users,
    href: '/user/users',
    description: 'Player profile and wallet browser'
  },
  'jeweler': {
    label: 'Jeweler',
    icon: Gem,
    href: '/user/jeweler',
    description: 'Jeweler staking indexer and leaderboard'
  },
  'pool-indexer': {
    label: 'Pool Indexer V2',
    icon: Database,
    href: '/user/pool-indexer',
    description: 'Unified pool staker indexer'
  },
  'pool-indexer-v1': {
    label: 'Pool Indexer V1',
    icon: Database,
    href: '/user/pool-indexer-v1',
    description: 'Legacy pool staker indexer'
  },
  'pool-indexer-harmony': {
    label: 'Pool Indexer Harmony',
    icon: Database,
    href: '/user/pool-indexer-harmony',
    description: 'Harmony chain pool indexer'
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
