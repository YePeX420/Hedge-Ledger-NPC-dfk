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
  TrendingUp, TrendingDown, Coins, Activity, Wallet
} from 'lucide-react';

interface Trade {
  itemType: 'hero' | 'pet';
  type: 'buy' | 'sell';
  held: boolean;
  auctionId: string;
  tokenId: string | null;
  mainClass: string | null;
  subClass: string | null;
  rarity: string | null;
  rarityNum: number | null;
  level: number | null;
  generation: number | null;
  summons: number | null;
  maxSummons: number | null;
  petName: string | null;
  element: string | null;
  seller: string | null;
  buyer: string | null;
  price: number | null;
  realm: 'CRY' | 'SUN' | 'SD';
  currency: 'CRYSTAL' | 'JEWEL' | 'JADE';
  date: string | null;
}

interface CurrencyTotals {
  spent: number;
  earned: number;
}

interface ActivityData {
  ok: boolean;
  address: string;
  buys: Trade[];
  sells: Trade[];
  currencySummary: Record<string, CurrencyTotals>;
  summary: {
    totalBuys: number;
    totalSells: number;
    heldCount: number;
  };
}

type SortField = 'date' | 'price' | 'level' | 'rarityNum' | 'mainClass' | 'itemType' | 'realm';
type SortDir = 'asc' | 'desc';
type ItemFilter = 'all' | 'hero' | 'pet';
type RealmFilter = 'all' | 'CRY' | 'SUN' | 'SD';
type TxFilter = 'all' | 'buy' | 'sell' | 'held';

const RARITY_COLORS: Record<string, string> = {
  Common: 'text-muted-foreground',
  Uncommon: 'text-green-500',
  Rare: 'text-blue-500',
  Legendary: 'text-orange-400',
  Mythic: 'text-purple-500',
};

const REALM_LABELS: Record<string, { label: string; color: string }> = {
  CRY: { label: 'CRY', color: 'border-cyan-500/50 text-cyan-600 dark:text-cyan-400' },
  SUN: { label: 'SUN', color: 'border-amber-500/50 text-amber-600 dark:text-amber-400' },
  SD:  { label: 'SD',  color: 'border-green-500/50 text-green-600 dark:text-green-400' },
};

const CURRENCY_COLORS: Record<string, string> = {
  CRYSTAL: 'text-cyan-600 dark:text-cyan-400',
  JEWEL:   'text-amber-600 dark:text-amber-400',
  JADE:    'text-green-600 dark:text-green-400',
};

export default function TavernWalletActivity() {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ActivityData | null>(null);
  const [itemFilter, setItemFilter] = useState<ItemFilter>('all');
  const [realmFilter, setRealmFilter] = useState<RealmFilter>('all');
  const [txFilter, setTxFilter] = useState<TxFilter>('all');
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

  const allTrades = useMemo(() => {
    if (!data) return [];
    return [...data.buys, ...data.sells];
  }, [data]);

  const rows: Trade[] = useMemo(() => {
    if (!data) return [];
    let list = allTrades;

    if (itemFilter !== 'all') list = list.filter(t => t.itemType === itemFilter);
    if (realmFilter !== 'all') list = list.filter(t => t.realm === realmFilter);
    if (txFilter === 'buy') list = list.filter(t => t.type === 'buy' && !t.held);
    else if (txFilter === 'sell') list = list.filter(t => t.type === 'sell');
    else if (txFilter === 'held') list = list.filter(t => t.held);

    return list.slice().sort((a, b) => {
      let av: any = sortField === 'date'
        ? (a.date ? new Date(a.date).getTime() : 0)
        : sortField === 'mainClass' ? (a.mainClass || a.petName || '')
        : sortField === 'itemType' ? a.itemType
        : sortField === 'realm' ? a.realm
        : (a as any)[sortField];
      let bv: any = sortField === 'date'
        ? (b.date ? new Date(b.date).getTime() : 0)
        : sortField === 'mainClass' ? (b.mainClass || b.petName || '')
        : sortField === 'itemType' ? b.itemType
        : sortField === 'realm' ? b.realm
        : (b as any)[sortField];
      if (av == null) av = sortDir === 'desc' ? -Infinity : Infinity;
      if (bv == null) bv = sortDir === 'desc' ? -Infinity : Infinity;
      return sortDir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
    });
  }, [data, allTrades, itemFilter, realmFilter, txFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === 'desc' ? <ArrowDown className="w-3 h-3 ml-1" /> : <ArrowUp className="w-3 h-3 ml-1" />;
  };

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const formatPrice = (p: number | null) =>
    p == null ? '—' : p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const activeCurrencies = data ? Object.keys(data.currencySummary) : [];

  const heldCount = data?.summary.heldCount ?? 0;
  const buysCount = (data?.buys.length ?? 0) - heldCount;
  const sellsCount = data?.sells.length ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6" />
          Wallet Tavern Activity
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track a wallet's hero and pet buy/sell history across all DeFi Kingdoms realms
        </p>
      </div>

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

      {loading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-md" />)}
          </div>
          <Skeleton className="h-64 rounded-md" />
        </div>
      )}

      {!loading && data && (
        <div className="space-y-4">

          {/* Summary cards — one per active currency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Overall counts */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
                <Activity className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-bold" data-testid="stat-total-buys">
                  {data.summary.totalBuys + data.summary.totalSells}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.summary.totalBuys} bought · {data.summary.totalSells} sold
                  {heldCount > 0 && <span className="ml-1">· {heldCount} held</span>}
                </p>
              </CardContent>
            </Card>

            {activeCurrencies.map(c => {
              const s = data.currencySummary[c];
              const profit = s.earned - s.spent;
              return (
                <Card key={c}>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-1">
                    <CardTitle className={`text-sm font-medium ${CURRENCY_COLORS[c] || ''}`}>{c}</CardTitle>
                    <Coins className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="flex gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Spent</p>
                        <p className="text-base font-semibold text-red-500" data-testid={`stat-spent-${c}`}>{formatPrice(s.spent)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Earned</p>
                        <p className="text-base font-semibold text-green-500" data-testid={`stat-earned-${c}`}>{formatPrice(s.earned)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">P&amp;L</p>
                        <p className={`text-base font-semibold ${profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {profit >= 0 ? '+' : ''}{formatPrice(profit)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Item type */}
            <div className="flex gap-1">
              {(['all', 'hero', 'pet'] as ItemFilter[]).map(f => (
                <Button
                  key={f}
                  variant={itemFilter === f ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setItemFilter(f)}
                  data-testid={`filter-item-${f}`}
                >
                  {f === 'all' ? 'All Items' : f === 'hero' ? 'Heroes' : 'Pets'}
                </Button>
              ))}
            </div>

            <div className="w-px h-6 bg-border mx-1" />

            {/* Realm */}
            <div className="flex gap-1">
              {(['all', 'CRY', 'SUN', 'SD'] as RealmFilter[]).map(r => (
                <Button
                  key={r}
                  variant={realmFilter === r ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRealmFilter(r)}
                  data-testid={`filter-realm-${r}`}
                >
                  {r === 'all' ? 'All Realms' : r === 'CRY' ? 'Crystalvale' : r === 'SUN' ? 'Sundered Isles' : 'Serendale'}
                </Button>
              ))}
            </div>

            <div className="w-px h-6 bg-border mx-1" />

            {/* Transaction type */}
            <div className="flex gap-1">
              {([
                { key: 'all', label: `All (${allTrades.length})` },
                { key: 'buy', label: `Buys (${buysCount})` },
                { key: 'sell', label: `Sells (${sellsCount})` },
                { key: 'held', label: `Held (${heldCount})` },
              ] as { key: TxFilter; label: string }[]).map(f => (
                <Button
                  key={f.key}
                  variant={txFilter === f.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTxFilter(f.key)}
                  data-testid={`filter-tx-${f.key}`}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Table */}
          {rows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No transactions match the selected filters.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground w-20">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground w-16">
                        <button className="flex items-center" onClick={() => toggleSort('realm')} data-testid="sort-realm">
                          Realm <SortIcon field="realm" />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        <button className="flex items-center" onClick={() => toggleSort('itemType')} data-testid="sort-type">
                          Type <SortIcon field="itemType" />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        <button className="flex items-center" onClick={() => toggleSort('mainClass')} data-testid="sort-class">
                          Class / Name <SortIcon field="mainClass" />
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
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">ID</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Info</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                        <button className="flex items-center" onClick={() => toggleSort('price')} data-testid="sort-price">
                          Price <SortIcon field="price" />
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
                    {rows.map((row, i) => {
                      const realmInfo = REALM_LABELS[row.realm] || REALM_LABELS.CRY;
                      return (
                        <tr
                          key={row.auctionId + '-' + i}
                          className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${row.held ? 'bg-blue-500/5' : ''}`}
                          data-testid={`row-trade-${i}`}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex gap-1 flex-wrap">
                              {row.held ? (
                                <Badge variant="outline" className="border-blue-500/50 text-blue-600 dark:text-blue-400">
                                  Held
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className={row.type === 'buy'
                                    ? 'border-green-500/50 text-green-600 dark:text-green-400'
                                    : 'border-red-500/50 text-red-600 dark:text-red-400'}
                                >
                                  {row.type === 'buy' ? 'Buy' : 'Sell'}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className={realmInfo.color}>
                              {realmInfo.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs capitalize">
                            {row.itemType}
                          </td>
                          <td className="px-4 py-2.5">
                            {row.itemType === 'hero' ? (
                              <>
                                <span className="font-medium">{row.mainClass || '—'}</span>
                                {row.subClass && row.subClass !== row.mainClass && (
                                  <span className="text-muted-foreground"> / {row.subClass}</span>
                                )}
                              </>
                            ) : (
                              <span className="font-medium">{row.petName || 'Pet'}</span>
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
                            {row.tokenId ? (
                              <a
                                href={row.itemType === 'hero'
                                  ? `https://defikingdoms.com/heroes/${row.tokenId}`
                                  : `https://defikingdoms.com/pets/${row.tokenId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline font-mono text-xs"
                                data-testid={`link-token-${row.tokenId}`}
                              >
                                #{row.tokenId}
                              </a>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">
                            {row.itemType === 'hero'
                              ? (row.summons != null && row.maxSummons != null
                                  ? `${row.summons}/${row.maxSummons} summons`
                                  : '—')
                              : (row.element || '—')}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-sm">
                            {row.price != null ? (
                              <span>
                                {formatPrice(row.price)}{' '}
                                <span className={`text-xs ${CURRENCY_COLORS[row.currency] || 'text-muted-foreground'}`}>
                                  {row.currency}
                                </span>
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                            {formatDate(row.date)}
                          </td>
                        </tr>
                      );
                    })}
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
            <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Enter a wallet address above to view its tavern buy and sell history.</p>
            <p className="text-xs mt-2 opacity-70">Shows heroes and pets across Crystalvale (CRYSTAL), Sundered Isles (JEWEL) and Serendale (JADE)</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
