import { ReactNode, useState, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  X,
  Zap,
  Sparkles,
  Beer,
  Bot,
  Dumbbell,
  UserCog,
  Activity,
  Medal,
  Shield,
  Globe,
  Wrench,
  Wand2,
  ShoppingBag,
  History,
} from 'lucide-react';

interface EnvironmentInfo {
  environment: string;
  isProduction: boolean;
  autoStartIndexers: boolean;
}

interface AdminLayoutProps {
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

// ─── Indexers ──────────────────────────────────────────────────────────────
const indexerItems: NavItem[] = [
  { href: '/admin/pool-indexer', label: 'Pool Indexer V2', icon: Database },
  { href: '/admin/pool-indexer-v1', label: 'Pool Indexer V1', icon: Database },
  { href: '/admin/pool-indexer-harmony', label: 'Pool Indexer Harmony', icon: Database },
  { href: '/admin/jeweler', label: 'Jeweler', icon: Gem },
  { href: '/admin/patrol-rewards', label: 'Patrol Rewards', icon: Coins },
];

// ─── Gardening ─────────────────────────────────────────────────────────────
const gardeningItems: NavItem[] = [
  { href: '/admin/pools', label: 'Pools', icon: Droplets },
  { href: '/admin/gardening-quest', label: 'Gardening Quest', icon: Sprout },
  { href: '/admin/gardening-calc', label: 'Gardening Calculator', icon: Calculator },
  { href: '/admin/yield-calculator', label: 'Yield Calculator', icon: TrendingUp },
];

// ─── Tavern — buying heroes & pets ─────────────────────────────────────────
const tavernItems: NavItem[] = [
  { href: '/admin/tavern-sniper', label: 'Tavern Sniper', icon: Beer },
  { href: '/admin/hero-score', label: 'Hero Score Calc', icon: Calculator },
  { href: '/admin/bargain-hunter', label: 'Bargain Hunter', icon: Zap },
  { href: '/admin/dark-bargain-hunter', label: 'Dark Bargain Hunter', icon: Sparkles },
  { href: '/admin/combat-pets', label: 'Combat Pets Shop', icon: ShoppingBag },
  { href: '/admin/hero-price', label: 'Hero Price Tool', icon: DollarSign },
  { href: '/admin/tavern-wallet-activity', label: 'Wallet Activity', icon: Activity },
  { href: '/admin/tavern-indexer', label: 'Tavern Indexer', icon: Database },
];

// ─── Combat ────────────────────────────────────────────────────────────────
const combatItems: NavItem[] = [
  { href: '/admin/tournament', label: 'DFK Tournaments', icon: Medal },
  { href: '/admin/fight-history', label: 'Fight History', icon: History },
  { href: '/admin/combat-pets', label: 'Combat Pets Shop', icon: ShoppingBag },
  { href: '/admin/pve-droprates', label: 'PVE Drop Rates', icon: TrendingDown },
];

// ─── Summon ────────────────────────────────────────────────────────────────
const summonItems: NavItem[] = [
  { href: '/admin/summoning-calculator', label: 'Summoning Calculator', icon: Dna },
  { href: '/admin/summon-sniper', label: 'Summon Sniper', icon: Target },
];

// ─── Ecosystem ─────────────────────────────────────────────────────────────
const ecosystemItems: NavItem[] = [
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/value-allocation', label: 'Value Allocation', icon: PieChart },
  { href: '/admin/tokens', label: 'Token Registry', icon: Coins },
  { href: '/admin/bridge', label: 'Bridge', icon: ArrowLeftRight },
  { href: '/admin/extractors', label: 'Extractors', icon: TrendingDown },
  { href: '/admin/user-access', label: 'User Access', icon: UserCog },
];

// ─── Unfinished / WIP ──────────────────────────────────────────────────────
const unfinishedItems: NavItem[] = [
  { href: '/admin/combat-toolkit', label: 'Hero Combat Toolkit', icon: Swords },
  { href: '/admin/pvp-matchup', label: 'PVP Matchup Tool', icon: Target },
  { href: '/admin/battle-ready', label: 'Battle-Ready Heroes', icon: Shield },
  { href: '/admin/hedge/combat-sync', label: 'Hedge: Combat Sync', icon: RefreshCw },
  { href: '/admin/quest-optimizer', label: 'Quest Optimizer', icon: Dumbbell },
  { href: '/admin/market-intel', label: 'Market Intel', icon: TrendingUp },
  { href: '/admin/profit-tracker', label: 'Profit Tracker', icon: DollarSign },
  { href: '/admin/challenges', label: 'Challenges', icon: Trophy },
  { href: '/admin/level-racer', label: 'Level Racer', icon: Swords },
  { href: '/admin/hedge/plans', label: 'Hedge: Plans & Access', icon: Crown },
  { href: '/admin/expenses', label: 'Expenses', icon: Receipt },
];

// ─── Always-visible top-level items ────────────────────────────────────────
const topItems: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/ai-consultant', label: 'AI Consultant', icon: Bot },
];

// ─── Reusable flyout component ─────────────────────────────────────────────
interface FlyoutMenuProps {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
  groupKey: string;
  location: string;
  onNavClick: () => void;
}

function FlyoutMenu({ label, icon: GroupIcon, items, groupKey, location, onNavClick }: FlyoutMenuProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paths = items.map(i => i.href);
  const isActive = paths.some(p => location === p || location.startsWith(p + '/'));

  const openMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeMenu = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          onMouseEnter={openMenu}
          onMouseLeave={closeMenu}
          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer select-none ${
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
          data-testid={`nav-group-${groupKey}`}
        >
          <GroupIcon className="w-4 h-4 shrink-0" />
          <span>{label}</span>
          <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
        </div>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        sideOffset={4}
        align="start"
        className="p-2 w-56"
        onMouseEnter={openMenu}
        onMouseLeave={closeMenu}
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 pb-1">
          {label}
        </p>
        <div className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            const itemActive = location === item.href || location.startsWith(item.href + '/');
            return (
              <Link
                key={`${groupKey}-${item.href}`}
                href={item.href}
                onClick={() => { setOpen(false); onNavClick(); }}
              >
                <div
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
                    itemActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                  data-testid={`nav-${groupKey}-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
          {/* Top-level always-visible items */}
          {topItems.map((item) => {
            const isActive = location === item.href ||
              (item.href !== '/admin' && location.startsWith(item.href + '/'));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={handleNavClick}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                </div>
              </Link>
            );
          })}

          <div className="pt-1 pb-0.5">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 font-semibold px-3">Tools</p>
          </div>

          {/* Tavern — buying heroes & pets */}
          <FlyoutMenu
            label="Tavern"
            icon={Beer}
            items={tavernItems}
            groupKey="tavern"
            location={location}
            onNavClick={handleNavClick}
          />

          {/* Combat */}
          <FlyoutMenu
            label="Combat"
            icon={Shield}
            items={combatItems}
            groupKey="combat"
            location={location}
            onNavClick={handleNavClick}
          />

          {/* Summon */}
          <FlyoutMenu
            label="Summon"
            icon={Wand2}
            items={summonItems}
            groupKey="summon"
            location={location}
            onNavClick={handleNavClick}
          />

          {/* Ecosystem */}
          <FlyoutMenu
            label="Ecosystem"
            icon={Globe}
            items={ecosystemItems}
            groupKey="ecosystem"
            location={location}
            onNavClick={handleNavClick}
          />

          {/* Gardening */}
          <FlyoutMenu
            label="Gardening"
            icon={Sprout}
            items={gardeningItems}
            groupKey="gardening"
            location={location}
            onNavClick={handleNavClick}
          />

          {/* Indexers */}
          <FlyoutMenu
            label="Indexers"
            icon={Database}
            items={indexerItems}
            groupKey="indexers"
            location={location}
            onNavClick={handleNavClick}
          />

          {/* Unfinished / WIP */}
          <FlyoutMenu
            label="Unfinished"
            icon={Wrench}
            items={unfinishedItems}
            groupKey="unfinished"
            location={location}
            onNavClick={handleNavClick}
          />

          <div className="pt-1 pb-0.5">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 font-semibold px-3">System</p>
          </div>

          {/* Settings */}
          {(() => {
            const isActive = location === '/admin/settings';
            return (
              <Link href="/admin/settings" onClick={handleNavClick}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                  data-testid="nav-settings"
                >
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                </div>
              </Link>
            );
          })()}
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
