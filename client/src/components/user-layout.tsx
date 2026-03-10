import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { API_BASE_URL } from '@/lib/queryClient';
import {
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Dumbbell,
  Bot,
  TrendingUp,
  Calculator,
  Target,
  Beer,
  Swords,
  Shield,
  ShieldCheck,
  Layers,
  Trophy,
  History,
  Database,
  DollarSign,
  Flame,
  Leaf,
  BarChart3,
  Sparkles,
  ShoppingBag,
  Droplets,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const TAB_NAV: Record<string, NavItem> = {
  'pools': { href: '/user/pools', label: 'Pools', icon: Droplets },
  'quest-optimizer': { href: '/user/quest-optimizer', label: 'Quest Optimizer', icon: Dumbbell },
  'ai-consultant': { href: '/user/ai-consultant', label: 'AI Consultant', icon: Bot },
  'yield-calculator': { href: '/user/yield-calculator', label: 'Yield Calculator', icon: TrendingUp },
  'yield-optimizer': { href: '/user/yield-optimizer', label: 'Yield Optimizer', icon: Calculator },
  'summon-sniper': { href: '/user/summon-sniper', label: 'Summon Sniper', icon: Target },
  'summoning-calculator': { href: '/user/summoning-calculator', label: 'Summoning Calculator', icon: Sparkles },
  'tavern-sniper': { href: '/user/tavern-sniper', label: 'Tavern Sniper', icon: Beer },
  'bargain-hunter': { href: '/user/bargain-hunter', label: 'Bargain Hunter', icon: DollarSign },
  'dark-bargain-hunter': { href: '/user/dark-bargain-hunter', label: 'Dark Bargain Hunter', icon: Flame },
  'gardening-calculator': { href: '/user/gardening-calculator', label: 'Gardening Calculator', icon: Leaf },
  'patrol-rewards': { href: '/user/patrol-rewards', label: 'Patrol Rewards', icon: Shield },
  'profit-tracker': { href: '/user/profit-tracker', label: 'Profit Tracker', icon: BarChart3 },
  'combat-pets': { href: '/user/combat-pets', label: 'Combat Pets', icon: ShoppingBag },
  'market-intel': { href: '/user/market-intel', label: 'Market Intel', icon: TrendingUp },
  'pvp-matchup': { href: '/user/pvp-matchup', label: 'PVP Matchup', icon: Target },
  'battle-ready': { href: '/user/battle-ready', label: 'Battle Ready', icon: ShieldCheck },
  'combat-toolkit': { href: '/user/combat-toolkit', label: 'Combat Toolkit', icon: Layers },
  'level-racer': { href: '/user/level-racer', label: 'Level Racer', icon: Trophy },
  'dfk-tournaments': { href: '/user/dfk-tournaments', label: 'DFK Tournaments', icon: Trophy },
  'previous-tournaments': { href: '/user/previous-tournaments', label: 'Previous Tournaments', icon: History },
  'fight-history': { href: '/user/fight-history', label: 'Fight History', icon: Swords },
  'tavern-indexer': { href: '/user/tavern-indexer', label: 'Tavern Indexer', icon: Database },
};

interface UserLayoutProps {
  children: ReactNode;
  allowedTabs: string[];
  username: string;
}

export function UserLayout({ children, allowedTabs, username }: UserLayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = allowedTabs
    .map(tabId => TAB_NAV[tabId])
    .filter(Boolean);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/user/logout`, { method: 'POST', credentials: 'include' });
    } catch (_) {}
    window.location.href = '/user/login';
  };

  const handleNavClick = () => setSidebarOpen(false);

  const isToolActive = (href: string) => {
    return location === href || location.startsWith(href + '/') || location.startsWith(href.replace('/user/', '/user/dfk-tournament'));
  };

  return (
    <div className="flex h-screen w-full bg-background">
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
        w-64 border-r bg-popover flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo/Brand */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
              HL
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-sm">Hedge Ledger</h1>
              <p className="text-xs text-muted-foreground">Member</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {/* Dashboard link */}
          <Link href="/user/dashboard" onClick={handleNavClick}>
            <div
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                location === '/user/dashboard'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
              data-testid="nav-user-dashboard"
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span>Dashboard</span>
              {location === '/user/dashboard' && <ChevronRight className="w-4 h-4 ml-auto" />}
            </div>
          </Link>

          {navItems.length > 0 && (
            <div className="pt-2 pb-1">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 font-semibold px-3">
                Your Tools
              </p>
            </div>
          )}

          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isToolActive(item.href);
            return (
              <Link key={item.href} href={item.href} onClick={handleNavClick}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                  data-testid={`nav-user-${item.href.replace('/user/', '')}`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                  {active && <ChevronRight className="w-4 h-4 ml-auto shrink-0" />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-3 border-t">
          <div className="flex items-center gap-3 p-2 rounded-md bg-accent/50">
            <Avatar className="w-8 h-8 shrink-0">
              <AvatarFallback className="text-xs">
                {username?.charAt(0).toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" data-testid="user-username">{username}</p>
              <p className="text-xs text-muted-foreground">Member</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              data-testid="button-user-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 p-3 border-b bg-popover">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            data-testid="button-open-user-sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold text-sm">Hedge Ledger</span>
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
