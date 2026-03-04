import { useState, useMemo } from 'react';
import { AdminLayout } from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowUpDown, ArrowDown, ArrowUp, Search, ShoppingCart,
  TrendingUp, TrendingDown, Coins, Activity
} from 'lucide-react';

interface HeroTrade {
  type: 'buy' | 'sell';
  auctionId: string;
  heroId: string | null;
  mainClass: string | null;
  subClass: string | null;
  rarity: string | null;
  rarityNum: number | null;
  level: number | null;
  generation: number | null;
  summons: number | null;
  maxSummons: number | null;
  seller: string | null;
  buyer: string | null;
  price: number | null;
  date: string | null;
}

interface ActivityData {
  ok: boolean;
  address: string;
  buys: HeroTrade[];
  sells: HeroTrade[];
  summary: {
    totalBuys: number;
    totalSells: number;
    totalSpent: number;
    totalEarned: number;
  };
}

type SortField = 'date' | 'price' | 'level' | 'rarityNum' | 'mainClass';
type SortDir = 'asc' | 'desc';
type FilterType = 'all' | 'buy' | 'sell';

const RARITY_COLORS: Record<string, string> = {
  Common: 'text-muted-foreground',
  Uncommon: 'text-green-500',
  Rare: 'text-blue-500',
  Legendary: 'text-orange-400',
  Mythic: 'text-purple-500',
};

export default function TavernWalletActivity() {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ActivityData | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const { toast } = useToast();

  const handleLookup = async () => {
    const addr = address.trim();
    if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      toast({ title: 'Invalid address', description: 'Enter a valid 0x wallet address', variant: 'destructive' });
      return;
    }
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(`/api/admin/tavern/wallet-activity?address=${encodeURIComponent(addr)}`, { credentials: 'include' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Lookup failed');
      setData(json);
    } catch (err: any) {
      toast({ title: 'Lookup failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const rows: HeroTrade[] = useMemo(() => {
    if (!data) return [];
    let list: HeroTrade[] = filter === 'all'
      ? [...data.buys, ...data.sells]
      : filter === 'buy' ? data.buys : data.sells;

    list = list.slice().sort((a, b) => {
      let av: any = a[sortField];
      let bv: any = b[sortField];
      if (sortField === 'date') {
        av = a.date ? new Date(a.date).getTime() : 0;
        bv = b.date ? new Date(b.date).getTime() : 0;
      }
      if (sortField === 'mainClass') {
        av = a.mainClass || '';
        bv = b.mainClass || '';
      }
      if (av == null) av = sortDir === 'desc' ? -Infinity : Infinity;
      if (bv == null) bv = sortDir === 'desc' ? -Infinity : Infinity;
      return sortDir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
    });
    return list;
  }, [data, filter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === 'desc'
      ? <ArrowDown className="w-3 h-3 ml-1" />
      : <ArrowUp className="w-3 h-3 ml-1" />;
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const formatPrice = (p: number | null) =>
    p == null ? '—' : p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6" />
          Wallet Tavern Activity
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track a wallet's hero buy and sell history from the DeFi Kingdoms marketplace
        </p>
      </div>

      {/* Search */}
      <div className="flex gap-2 max-w-xl">
        <Input
          placeholder="0x wallet address..."
          value={address}
          onChange={e => setAddress(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLookup()}
          data-testid="input-wallet-address"
        />
        <Button onClick={handleLookup} disabled={loading} data-testid="button-lookup">
          <Search className="w-4 h-4 mr-2" />
          {loading ? 'Loading...' : 'Look Up'}
        </Button>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-md" />)}
          </div>
          <Skeleton className="h-64 rounded-md" />
        </div>
      )}

      {/* Results */}
      {!loading && data && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Buys</CardTitle>
                <ShoppingCart className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid="stat-total-buys">{data.summary.totalBuys.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Sells</CardTitle>
                <TrendingDown className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid="stat-total-sells">{data.summary.totalSells.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">JEWEL Spent</CardTitle>
                <Coins className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-500" data-testid="stat-total-spent">{formatPrice(data.summary.totalSpent)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">JEWEL Earned</CardTitle>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-500" data-testid="stat-total-earned">{formatPrice(data.summary.totalEarned)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2" data-testid="filter-tabs">
            {(['all', 'buy', 'sell'] as FilterType[]).map(f => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(f)}
                data-testid={`filter-${f}`}
              >
                {f === 'all' ? `All (${data.buys.length + data.sells.length})` :
                 f === 'buy' ? `Buys (${data.buys.length})` :
                 `Sells (${data.sells.length})`}
              </Button>
            ))}
          </div>

          {/* Table */}
          {rows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No transactions found for this wallet.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground w-16">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        <button className="flex items-center" onClick={() => toggleSort('mainClass')} data-testid="sort-class">
                          Class <SortIcon field="mainClass" />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        <button className="flex items-center" onClick={() => toggleSort('rarityNum')} data-testid="sort-rarity">
                          Rarity <SortIcon field="rarityNum" />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        <button className="flex items-center" onClick={() => toggleSort('level')} data-testid="sort-level">
                          Lv <SortIcon field="level" />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Hero ID</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Summons</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        <button className="flex items-center" onClick={() => toggleSort('price')} data-testid="sort-price">
                          Price (JEWEL) <SortIcon field="price" />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        <button className="flex items-center" onClick={() => toggleSort('date')} data-testid="sort-date">
                          Date <SortIcon field="date" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr
                        key={row.auctionId + '-' + i}
                        className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                        data-testid={`row-trade-${i}`}
                      >
                        <td className="px-4 py-2.5">
                          <Badge
                            variant="outline"
                            className={row.type === 'buy'
                              ? 'border-green-500/50 text-green-600 dark:text-green-400'
                              : 'border-red-500/50 text-red-600 dark:text-red-400'}
                          >
                            {row.type === 'buy' ? 'Buy' : 'Sell'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-medium">{row.mainClass || '—'}</span>
                          {row.subClass && row.subClass !== row.mainClass && (
                            <span className="text-muted-foreground"> / {row.subClass}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={RARITY_COLORS[row.rarity || ''] || ''}>
                            {row.rarity || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {row.level ?? '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.heroId ? (
                            <a
                              href={`https://defikingdoms.com/heroes/${row.heroId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline font-mono text-xs"
                              data-testid={`link-hero-${row.heroId}`}
                            >
                              #{row.heroId}
                            </a>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {row.summons != null && row.maxSummons != null
                            ? `${row.summons}/${row.maxSummons}`
                            : '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-sm">
                          {formatPrice(row.price)}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                          {formatDate(row.date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {!loading && !data && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Enter a wallet address above to view its tavern buy and sell history.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
