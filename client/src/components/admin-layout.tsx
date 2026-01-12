import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Users, 
  Receipt, 
  LayoutDashboard, 
  LogOut,
  Settings,
  ChevronRight,
  ArrowLeftRight,
  Trophy,
  Swords,
  PieChart,
  Coins,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Droplets,
  Database,
  Gem,
  Sprout,
  RefreshCw,
  Crown,
  Calculator,
  Dna,
  Target,
  Menu,
  X
} from 'lucide-react';

interface EnvironmentInfo {
  environment: string;
  isProduction: boolean;
  autoStartIndexers: boolean;
}

interface AdminLayoutProps {
  children: ReactNode;
}

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/value-allocation', label: 'Value Allocation', icon: PieChart },
  { href: '/admin/tokens', label: 'Token Registry', icon: Coins },
  { href: '/admin/pools', label: 'Pools', icon: Droplets },
  { href: '/admin/pool-indexer', label: 'Pool Indexer V2', icon: Database },
  { href: '/admin/pool-indexer-v1', label: 'Pool Indexer V1', icon: Database },
  { href: '/admin/pool-indexer-harmony', label: 'Pool Indexer Harmony', icon: Database },
  { href: '/admin/jeweler', label: 'Jeweler', icon: Gem },
  { href: '/admin/gardening-quest', label: 'Gardening Quest', icon: Sprout },
  { href: '/admin/gardening-calc', label: 'Gardening Calculator', icon: Calculator },
  { href: '/admin/battle-ready', label: 'Battle-Ready Heroes', icon: Swords },
  { href: '/admin/summoning-calculator', label: 'Summoning Calculator', icon: Dna },
  { href: '/admin/summon-sniper', label: 'Summon Sniper', icon: Target },
  { href: '/admin/tavern-indexer', label: 'Tavern Indexer', icon: Database },
  { href: '/admin/market-intel', label: 'Market Intel', icon: TrendingUp },
  { href: '/admin/profit-tracker', label: 'Profit Tracker', icon: DollarSign },
  { href: '/admin/pve-droprates', label: 'PVE Drop Rates', icon: Swords },
  { href: '/admin/challenges', label: 'Challenges', icon: Trophy },
  { href: '/admin/level-racer', label: 'Level Racer', icon: Swords },
  { href: '/admin/hedge/combat-sync', label: 'Hedge: Combat Sync', icon: RefreshCw },
  { href: '/admin/hedge/plans', label: 'Hedge: Plans & Access', icon: Crown },
  { href: '/admin/expenses', label: 'Expenses', icon: Receipt },
  { href: '/admin/bridge', label: 'Bridge', icon: ArrowLeftRight },
  { href: '/admin/extractors', label: 'Extractors', icon: TrendingDown },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: envInfo } = useQuery<EnvironmentInfo>({
    queryKey: ['/api/admin/environment'],
    staleTime: Infinity,
  });

  const avatarUrl = user?.avatar 
    ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`
    : null;

  const handleNavClick = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen w-full bg-background" data-testid="admin-layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 border-r bg-card flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo/Brand */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              HL
            </div>
            <div className="flex-1">
              <h1 className="font-semibold text-sm">Hedge Ledger</h1>
              <div className="flex items-center gap-1">
                <p className="text-xs text-muted-foreground">Admin</p>
                {envInfo && (
                  <Badge 
                    variant={envInfo.isProduction ? "default" : "secondary"}
                    className="text-[10px] px-1 py-0"
                    data-testid="badge-environment"
                  >
                    {envInfo.isProduction ? 'PROD' : 'DEV'}
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8"
              onClick={() => setSidebarOpen(false)}
              data-testid="button-close-sidebar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href || 
              (item.href !== '/admin' && location.startsWith(item.href));
            const Icon = item.icon;
            
            return (
              <Link key={item.href} href={item.href} onClick={handleNavClick}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                    isActive 
                      ? 'bg-primary text-primary-foreground' 
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-3 border-t">
          <div className="flex items-center gap-3 p-2 rounded-md bg-accent/50">
            <Avatar className="w-8 h-8">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={user?.username} />}
              <AvatarFallback className="text-xs">
                {user?.username?.charAt(0).toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" data-testid="user-username">
                {user?.username}
              </p>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={logout}
              className="h-8 w-8"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 p-3 border-b bg-card">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            data-testid="button-open-sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold">Hedge Ledger</span>
          {envInfo && (
            <Badge 
              variant={envInfo.isProduction ? "default" : "secondary"}
              className="text-[10px] px-1 py-0"
            >
              {envInfo.isProduction ? 'PROD' : 'DEV'}
            </Badge>
          )}
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
