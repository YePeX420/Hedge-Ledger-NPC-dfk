import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, TrendingUp, TrendingDown, DollarSign, ArrowRight, ArrowUpRight, Target, Percent, ShoppingCart, Tag, BarChart3, RefreshCw, Filter, Dna, Crosshair, Brain, Sparkles, MessageSquare } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

const RARITY_NAMES: Record<number, string> = {
  0: 'Common', 1: 'Uncommon', 2: 'Rare', 3: 'Legendary', 4: 'Mythic'
};

const RARITY_COLORS: Record<number, string> = {
  0: 'bg-gray-500', 1: 'bg-green-500', 2: 'bg-blue-500', 3: 'bg-orange-500', 4: 'bg-purple-500'
};

const CONFIDENCE_COLORS: Record<string, string> = {
  'high': 'text-green-500',
  'medium': 'text-yellow-500',
  'medium-low': 'text-orange-500',
  'low': 'text-red-500',
  'very-low': 'text-red-600'
};

const VERDICT_COLORS: Record<string, string> = {
  'STRONG BUY': 'bg-green-600 text-white',
  'BUY': 'bg-green-500/80 text-white',
  'POSSIBLE BUY': 'bg-yellow-500/80 text-white',
  'FAIR': 'bg-blue-500/20',
  'OVERPRICED': 'bg-red-500/20 text-red-500'
};

interface HeroData {
  heroId: string;
  normalizedId: number;
  realm: string;
  mainClass: string;
  subClass: string;
  profession: string;
  rarity: number;
  rarityName: string;
  level: number;
  generation: number;
  summons: number;
  maxSummons: number;
  stats: Record<string, number>;
  traitScore: number;
  combatPower: number;
  currentListingPrice: number | null;
  nativeToken: string;
  isForSale: boolean;
  source: string;
}

type EstimateType = 'SOLD' | 'ASK_ACTIVE' | 'ASK_HISTORY' | 'ASK_THIN' | 'NONE';

interface EstimatedValue {
  fairValue: number | null;
  askMedian: number | null;
  askMin?: number | null;
  askMax?: number | null;
  buyBelow: number | null;
  sellAbove: number | null;
  premiumPrice: number | null;
  bargainPrice: number | null;
  token: string;
  confidence: string;
  matchTier: string;
  matchTierLabel?: string;
  dataSource?: string;
  estimateType?: EstimateType;
  sampleSize: number;
  priceVariation: number;
  warnings?: string[];
  warning?: string;
}

interface FlipOpportunity {
  currentPrice: number;
  estimatedValue: number;
  discount: number;
  potentialProfit: number;
  isUnderpriced: boolean;
  verdict: string;
}

interface ComparableSale {
  heroId: string;
  price: number;
  token: string;
  saleDate: string;
  mainClass: string;
  subClass: string;
  rarity: number;
  level: number;
  generation?: number;
  profession: string;
  realm: string;
  professionMatch?: boolean;
  traitScore?: number;
  traitScoreBand?: string;
  statBoost1?: string;
  statBoost2?: string;
}

interface HeroPriceResult {
  ok: boolean;
  hero?: HeroData;
  estimatedValue?: EstimatedValue | null;
  estimateType?: EstimateType;
  flipOpportunity?: FlipOpportunity | null;
  comparableSales?: ComparableSale[];
  matchTier?: string;
  matchTierLabel?: string;
  dataSource?: string;
  warnings?: string[];
  error?: string;
}

interface FlippableHero {
  heroId: string;
  normalizedId: number;
  realm: string;
  mainClass: string;
  subClass: string;
  profession: string;
  rarity: number;
  rarityName: string;
  level: number;
  generation: number;
  traitScore: number;
  combatPower: number;
  listingPrice: number;
  estimatedValue: number;
  discount: number;
  potentialProfit: number;
  confidence: string;
  sampleSize: number;
  token: string;
  verdict: string;
  sellTarget: number;
  premiumTarget: number;
}

interface FlippableResult {
  ok: boolean;
  flippable?: FlippableHero[];
  totalScanned?: number;
  totalSalesData?: number;
  matchesFound?: number;
  message?: string;
  error?: string;
}

export default function HeroPricePage() {
  const { toast } = useToast();

  const [heroId, setHeroId] = useState("");
  const [priceResult, setPriceResult] = useState<HeroPriceResult | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);

  const [confidenceSummaries, setConfidenceSummaries] = useState<Record<string, string>>({});
  const [summariesLoading, setSummariesLoading] = useState(false);

  const [flipRealm, setFlipRealm] = useState("all");
  const [flipMinDiscount, setFlipMinDiscount] = useState("20");
  const [flipMaxPrice, setFlipMaxPrice] = useState("");
  const [flipConfidence, setFlipConfidence] = useState("medium-low");
  const [flipLoading, setFlipLoading] = useState(false);
  const [flipResult, setFlipResult] = useState<FlippableResult | null>(null);

  const lookupHeroPrice = async () => {
    const id = heroId.trim();
    if (!id) {
      toast({ title: "Enter a hero ID", description: "Type a hero number to look up its price", variant: "destructive" });
      return;
    }

    setPriceLoading(true);
    setPriceResult(null);
    setNarrative(null);
    try {
      const res = await fetch(`/api/admin/market-intel/hero-price/${id}`, { credentials: 'include' });
      const data: HeroPriceResult = await res.json();
      setPriceResult(data);
      if (!data.ok) {
        toast({ title: "Lookup failed", description: data.error || "Hero not found", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Lookup error", description: err.message, variant: "destructive" });
    } finally {
      setPriceLoading(false);
    }
  };

  const scanFlippableHeroes = async () => {
    setFlipLoading(true);
    setFlipResult(null);
    try {
      const params = new URLSearchParams();
      if (flipRealm !== 'all') params.set('realm', flipRealm);
      params.set('minDiscount', flipMinDiscount || '20');
      params.set('minConfidence', flipConfidence);
      if (flipMaxPrice) params.set('maxPrice', flipMaxPrice);
      params.set('limit', '50');

      const res = await fetch(`/api/admin/market-intel/flippable-heroes?${params.toString()}`, { credentials: 'include' });
      const data: FlippableResult = await res.json();
      setFlipResult(data);
      if (data.ok) {
        toast({
          title: `Scan complete`,
          description: `Found ${data.matchesFound || 0} flippable heroes from ${data.totalScanned || 0} scanned`
        });
      }
    } catch (err: any) {
      toast({ title: "Scan error", description: err.message, variant: "destructive" });
    } finally {
      setFlipLoading(false);
    }
  };

  const fetchConfidenceSummaries = async () => {
    if (!flipResult?.flippable || flipResult.flippable.length === 0) return;
    const uncached = flipResult.flippable.filter(h => !confidenceSummaries[h.heroId]);
    if (uncached.length === 0) {
      toast({ title: "Already generated", description: "All visible heroes already have AI assessments" });
      return;
    }
    setSummariesLoading(true);
    try {
      const batch = uncached.slice(0, 20);
      const res = await fetch('/api/admin/market-intel/confidence-summaries', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heroes: batch })
      });
      const data = await res.json();
      if (data.ok && data.summaries) {
        const newSummaries = { ...confidenceSummaries };
        batch.forEach((h, i) => {
          if (data.summaries[i]) newSummaries[h.heroId] = data.summaries[i];
        });
        setConfidenceSummaries(newSummaries);
        toast({ title: "AI Assessments", description: `Generated ${data.summaries.length} confidence summaries` });
      } else {
        toast({ title: "AI Assessment", description: data.error || "Could not generate summaries", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "AI error", description: err.message, variant: "destructive" });
    } finally {
      setSummariesLoading(false);
    }
  };

  const fetchNarrative = async () => {
    if (!priceResult || !priceResult.ok) return;
    setNarrativeLoading(true);
    try {
      const res = await fetch('/api/admin/market-intel/hero-price-narrative', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(priceResult)
      });
      const data = await res.json();
      if (data.ok && data.narrative) {
        setNarrative(data.narrative);
      } else {
        toast({ title: "AI Analysis", description: data.error || "Could not generate narrative", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "AI error", description: err.message, variant: "destructive" });
    } finally {
      setNarrativeLoading(false);
    }
  };

  const formatPrice = (price: number | undefined | null) => {
    if (price === undefined || price === null) return '-';
    if (price >= 1000) return `${(price / 1000).toFixed(1)}k`;
    if (price >= 100) return price.toFixed(1);
    return price.toFixed(2);
  };

  const hero = priceResult?.hero;
  const estimate = priceResult?.estimatedValue;
  const flip = priceResult?.flipOpportunity;
  const comps = priceResult?.comparableSales || [];
  const isAskType = ['ASK_ACTIVE', 'ASK_HISTORY', 'ASK_THIN'].includes(priceResult?.estimateType || '');

  const askLabel = priceResult?.estimateType === 'ASK_ACTIVE' ? 'Active Listings'
    : priceResult?.estimateType === 'ASK_HISTORY' ? 'Historical Listings (90d)'
    : priceResult?.estimateType === 'ASK_THIN' ? 'Thin Sample'
    : 'Ask-Side';

  return (
    <div className="space-y-6" data-testid="page-hero-price">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Hero Price Tool</h1>
        <p className="text-muted-foreground">Look up any hero by ID for a price estimate, or scan for underpriced flips</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Hero Price Lookup
          </CardTitle>
          <CardDescription>Enter a hero number to get its estimated market value based on comparable sales</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs space-y-2">
              <Label>Hero ID</Label>
              <Input
                type="text"
                placeholder="e.g. 12345"
                value={heroId}
                onChange={(e) => setHeroId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && lookupHeroPrice()}
                data-testid="input-hero-id"
              />
            </div>
            <Button
              onClick={lookupHeroPrice}
              disabled={priceLoading || !heroId.trim()}
              data-testid="button-lookup-hero"
            >
              {priceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Look Up Price</span>
            </Button>
          </div>

          {priceResult && priceResult.ok && hero && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="outline">{hero.realm === 'cv' ? 'Crystalvale' : 'Sundered Isles'}</Badge>
                <Badge className={RARITY_COLORS[hero.rarity]}>{hero.rarityName}</Badge>
                <span className="font-bold text-lg">{hero.mainClass}</span>
                {hero.subClass && <span className="text-muted-foreground">/ {hero.subClass}</span>}
                <Badge variant="secondary">Lv {hero.level}</Badge>
                <Badge variant="secondary">Gen {hero.generation}</Badge>
                {hero.profession && <Badge variant="outline">{hero.profession}</Badge>}
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground mb-1">Combat Power</div>
                    <div className="text-xl font-bold">{hero.combatPower}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground mb-1">Summons</div>
                    <div className="text-xl font-bold">{hero.summons} / {hero.maxSummons}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground mb-1">Trait Score</div>
                    <div className="text-xl font-bold">{hero.traitScore}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground mb-1">
                      {hero.isForSale ? 'Listed Price' : 'Status'}
                    </div>
                    <div className="text-xl font-bold" data-testid="text-current-price">
                      {hero.isForSale
                        ? `${formatPrice(hero.currentListingPrice)} ${hero.nativeToken}`
                        : 'Not for sale'}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {estimate && (
                <div className="grid gap-4 md:grid-cols-3">
                  {isAskType ? (
                    <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <ShoppingCart className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm font-medium">Ask Range</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Min Ask</span>
                          <span className="font-bold text-yellow-500" data-testid="text-ask-min">
                            {formatPrice(estimate.askMin)} {estimate.token}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Max Ask</span>
                          <span className="font-medium" data-testid="text-ask-max">
                            {formatPrice(estimate.askMax)} {estimate.token}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-green-500/30 bg-green-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <ShoppingCart className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">Buy Prices</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Bargain</span>
                          <span className="font-bold text-green-500" data-testid="text-bargain-price">
                            {formatPrice(estimate.bargainPrice)} {estimate.token}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Buy Below</span>
                          <span className="font-medium" data-testid="text-buy-below">
                            {formatPrice(estimate.buyBelow)} {estimate.token}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={`rounded-md border p-4 ${isAskType ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-blue-500/30 bg-blue-500/5'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className={`h-4 w-4 ${isAskType ? 'text-yellow-500' : 'text-blue-500'}`} />
                      <span className="text-sm font-medium">
                        {isAskType ? 'Ask-Based Estimate' : 'Fair Value'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">
                          {isAskType ? 'Median Ask' : 'Estimated'}
                        </span>
                        <span className={`font-bold text-lg ${isAskType ? 'text-yellow-500' : 'text-blue-500'}`} data-testid="text-fair-value">
                          {formatPrice(isAskType ? estimate.askMedian : estimate.fairValue)} {estimate.token}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <Badge variant={
                          estimate.confidence === 'high' ? 'default' :
                          estimate.confidence === 'medium' ? 'secondary' : 'outline'
                        } className="text-xs">
                          {estimate.confidence.toUpperCase()}
                        </Badge>
                        <span>{estimate.sampleSize} comps</span>
                        <span>{estimate.matchTierLabel || estimate.matchTier}</span>
                        {isAskType && (
                          <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-600 dark:text-yellow-400">{askLabel}</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {isAskType ? (
                    <div className="rounded-md border border-muted/30 bg-muted/5 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">Sell Prices</span>
                      </div>
                      <div className="text-center py-2 text-sm text-muted-foreground" data-testid="text-sell-na-ask">
                        Not available for ask-side estimates
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Tag className="h-4 w-4 text-orange-500" />
                        <span className="text-sm font-medium">Sell Prices</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Sell Above</span>
                          <span className="font-medium" data-testid="text-sell-above">
                            {formatPrice(estimate.sellAbove)} {estimate.token}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Premium</span>
                          <span className="font-bold text-orange-500" data-testid="text-premium-price">
                            {formatPrice(estimate.premiumPrice)} {estimate.token}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!estimate && priceResult?.estimateType === 'NONE' && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-md border border-muted/30 bg-muted/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">Buy Prices</span>
                    </div>
                    <div className="text-center py-2 text-lg font-medium text-muted-foreground" data-testid="text-buy-na">N/A</div>
                  </div>
                  <div className="rounded-md border border-muted/30 bg-muted/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">Fair Value</span>
                    </div>
                    <div className="text-center py-2 text-lg font-medium text-muted-foreground" data-testid="text-fair-value-na">N/A</div>
                    <div className="text-center text-xs text-muted-foreground">No comparable data available</div>
                  </div>
                  <div className="rounded-md border border-muted/30 bg-muted/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">Sell Prices</span>
                    </div>
                    <div className="text-center py-2 text-lg font-medium text-muted-foreground" data-testid="text-sell-na">N/A</div>
                  </div>
                </div>
              )}

              {flip && priceResult?.estimateType === 'SOLD' && (
                <Card className={flip.isUnderpriced ? 'border-green-500/50' : ''}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Badge className={VERDICT_COLORS[flip.verdict] || ''} data-testid="badge-verdict">
                          {flip.verdict}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-sm">Listed:</span>
                          <span className="font-medium">{formatPrice(flip.currentPrice)} {estimate?.token}</span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground text-sm">Fair:</span>
                          <span className="font-bold">{formatPrice(flip.estimatedValue)} {estimate?.token}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {flip.discount > 0 && (
                          <span className="text-green-500 font-bold" data-testid="text-discount">
                            {flip.discount}% below value
                          </span>
                        )}
                        {flip.potentialProfit > 0 && (
                          <span className="flex items-center gap-1 text-green-500 font-bold">
                            <ArrowUpRight className="h-4 w-4" />
                            +{formatPrice(flip.potentialProfit)} {estimate?.token} profit
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {hero.generation === 0 && (
                <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 flex items-start gap-2" data-testid="warning-gen0">
                  <Target className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium text-yellow-600 dark:text-yellow-400">Gen 0 Hero</span>
                    <span className="text-muted-foreground"> — Founding heroes are extremely scarce and carry massive premiums (often 10,000-100,000+ CRYSTAL). Price estimates may be unreliable if comparables include later generations.</span>
                  </div>
                </div>
              )}

              {isAskType && (
                <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 flex items-start gap-2" data-testid="warning-ask-side">
                  <BarChart3 className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium text-yellow-600 dark:text-yellow-400">Ask-Side Reference ({askLabel})</span>
                    <span className="text-muted-foreground">
                      {priceResult?.estimateType === 'ASK_ACTIVE'
                        ? ' — No confirmed sales data. Estimate based on currently active tavern listings. Confidence downgraded.'
                        : priceResult?.estimateType === 'ASK_HISTORY'
                        ? ' — No confirmed sales or active listings. Estimate based on listings seen in the last 90 days (may be delisted). Confidence significantly downgraded.'
                        : ' — Very few comparable listings found (thin sample). Treat as a rough reference only.'}
                      {' '}Do not use for flip profit calculations.
                    </span>
                  </div>
                </div>
              )}

              {priceResult?.estimateType === 'NONE' && (
                <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2" data-testid="warning-no-data">
                  <BarChart3 className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium text-red-600 dark:text-red-400">Insufficient Data</span>
                    <span className="text-muted-foreground">
                      {hero?.generation === 0
                        ? ' — No Gen 0 sold comps and no Gen 0 listing comps found in the last 90 days. Run the tavern indexer and auction pipeline to build more data.'
                        : ' — No comparable sales or listings found for this hero type. Run the auction pipeline and tavern indexer to build more pricing data.'}
                    </span>
                  </div>
                </div>
              )}

              {estimate && (estimate.confidence === 'low' || estimate.confidence === 'medium-low') && (
                <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 flex items-start gap-2" data-testid="warning-low-confidence">
                  <Percent className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium text-red-600 dark:text-red-400">Low Confidence</span>
                    <span className="text-muted-foreground"> — The match tier ({estimate.matchTierLabel || estimate.matchTier}) dropped key filters. The estimate is a rough approximation — use caution when trading.</span>
                  </div>
                </div>
              )}

              {estimate && (
                <Card data-testid="card-ai-narrative">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-purple-500" />
                        <span className="text-sm font-medium">AI Price Analysis</span>
                      </div>
                      {!narrative && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchNarrative}
                          disabled={narrativeLoading}
                          data-testid="button-get-narrative"
                        >
                          {narrativeLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Brain className="h-3 w-3 mr-1" />}
                          {narrativeLoading ? 'Analyzing...' : 'Get AI Analysis'}
                        </Button>
                      )}
                    </div>
                    {narrative && (
                      <p className="mt-3 text-sm leading-relaxed" data-testid="text-narrative">
                        {narrative}
                      </p>
                    )}
                    {!narrative && !narrativeLoading && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Click to generate an AI-powered explanation of this price estimate
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {!estimate && !priceResult?.estimateType && (
                <div className="text-center py-4 text-muted-foreground">
                  No comparable data found. Run the tavern indexer and ingestion cycles to build pricing data.
                </div>
              )}

              {comps.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">
                    {isAskType ? 'Comparable Listings' : 'Comparable Sales'} ({comps.length})
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hero</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead>Rarity</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Gen</TableHead>
                        <TableHead>Genes</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>{isAskType ? 'Source' : 'When'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comps.map((sale, idx) => (
                        <TableRow key={`${sale.heroId}-${idx}`} data-testid={`row-comp-${idx}`}>
                          <TableCell className="font-mono text-xs">{sale.heroId}</TableCell>
                          <TableCell>{sale.mainClass || '-'}</TableCell>
                          <TableCell>
                            {sale.rarity !== undefined && sale.rarity !== null && (
                              <Badge className={`${RARITY_COLORS[sale.rarity]} text-xs`}>
                                {RARITY_NAMES[sale.rarity]}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{sale.level || '-'}</TableCell>
                          <TableCell>{sale.generation ?? '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-xs">
                              {sale.professionMatch && (
                                <Crosshair className="h-3 w-3 text-green-400" />
                              )}
                              {sale.traitScore != null && (
                                <span className="text-muted-foreground">TS:{sale.traitScore}</span>
                              )}
                              {sale.statBoost1 && (
                                <span className="text-muted-foreground">{sale.statBoost1}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {sale.price.toFixed(2)} {sale.token}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {sale.saleDate ? new Date(sale.saleDate).toLocaleDateString() : isAskType ? 'Listed' : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {priceResult && !priceResult.ok && (
            <div className="mt-6 text-center py-8 text-muted-foreground">
              {priceResult.error || 'Hero not found'}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Flippable Heroes Scanner
          </CardTitle>
          <CardDescription>Find heroes listed below their estimated market value for profitable flips</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5 items-end">
            <div className="space-y-2">
              <Label>Realm</Label>
              <Select value={flipRealm} onValueChange={setFlipRealm}>
                <SelectTrigger data-testid="select-flip-realm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Realms</SelectItem>
                  <SelectItem value="cv">Crystalvale</SelectItem>
                  <SelectItem value="sd">Sundered Isles</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Min Discount %</Label>
              <Input
                type="number"
                value={flipMinDiscount}
                onChange={(e) => setFlipMinDiscount(e.target.value)}
                placeholder="20"
                data-testid="input-flip-min-discount"
              />
            </div>

            <div className="space-y-2">
              <Label>Max Price</Label>
              <Input
                type="number"
                value={flipMaxPrice}
                onChange={(e) => setFlipMaxPrice(e.target.value)}
                placeholder="No limit"
                data-testid="input-flip-max-price"
              />
            </div>

            <div className="space-y-2">
              <Label>Min Confidence</Label>
              <Select value={flipConfidence} onValueChange={setFlipConfidence}>
                <SelectTrigger data-testid="select-flip-confidence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High only</SelectItem>
                  <SelectItem value="medium">Medium+</SelectItem>
                  <SelectItem value="medium-low">Medium-Low+</SelectItem>
                  <SelectItem value="low">All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={scanFlippableHeroes}
              disabled={flipLoading}
              data-testid="button-scan-flips"
            >
              {flipLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
              <span className="ml-2">Scan for Flips</span>
            </Button>
          </div>

          {flipResult && (
            <div className="mt-6">
              {flipResult.message && (!flipResult.flippable || flipResult.flippable.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">{flipResult.message}</div>
              )}

              {flipResult.flippable && flipResult.flippable.length > 0 && (
                <>
                  <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                    <div className="text-sm text-muted-foreground">
                      {flipResult.matchesFound} flippable heroes found from {flipResult.totalScanned} scanned
                      ({flipResult.totalSalesData} sales in database)
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={fetchConfidenceSummaries}
                      disabled={summariesLoading}
                      data-testid="button-generate-assessments"
                    >
                      {summariesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      <span className="ml-1">AI Assess All</span>
                    </Button>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Verdict</TableHead>
                          <TableHead>Hero</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Rarity</TableHead>
                          <TableHead>Lv</TableHead>
                          <TableHead>Listed</TableHead>
                          <TableHead>Fair Value</TableHead>
                          <TableHead>Discount</TableHead>
                          <TableHead>Profit</TableHead>
                          <TableHead>Conf.</TableHead>
                          <TableHead>AI Assessment</TableHead>
                          <TableHead>Sell Target</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {flipResult.flippable.map((h, idx) => (
                          <TableRow
                            key={h.heroId}
                            className={h.verdict === 'STRONG BUY' ? 'bg-green-500/5' : ''}
                            data-testid={`row-flip-${idx}`}
                          >
                            <TableCell>
                              <Badge className={`${VERDICT_COLORS[h.verdict] || ''} text-xs`}>
                                {h.verdict}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <button
                                  className="font-mono text-xs text-left underline decoration-dotted cursor-pointer"
                                  onClick={() => {
                                    setHeroId(h.normalizedId?.toString() || h.heroId);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                    setTimeout(lookupHeroPrice, 100);
                                  }}
                                  data-testid={`button-flip-lookup-${idx}`}
                                >
                                  {h.normalizedId || h.heroId}
                                </button>
                                <span className="text-xs text-muted-foreground">
                                  {h.realm === 'cv' ? 'CV' : 'SD'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>{h.mainClass}</div>
                              {h.subClass && <div className="text-xs text-muted-foreground">{h.subClass}</div>}
                            </TableCell>
                            <TableCell>
                              <Badge className={`${RARITY_COLORS[h.rarity]} text-xs`}>
                                {h.rarityName}
                              </Badge>
                            </TableCell>
                            <TableCell>{h.level}</TableCell>
                            <TableCell className="font-medium">
                              {formatPrice(h.listingPrice)} {h.token}
                            </TableCell>
                            <TableCell className="font-bold text-blue-500">
                              {formatPrice(h.estimatedValue)} {h.token}
                            </TableCell>
                            <TableCell>
                              <span className="text-green-500 font-bold">
                                {h.discount}%
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-green-500 font-medium flex items-center gap-1">
                                <ArrowUpRight className="h-3 w-3" />
                                +{formatPrice(h.potentialProfit)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={`cursor-help ${CONFIDENCE_COLORS[h.confidence] || ''}`}>
                                    {h.confidence}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs">
                                  {confidenceSummaries[h.heroId]
                                    ? confidenceSummaries[h.heroId]
                                    : `${h.confidence} confidence based on ${h.sampleSize} comparable sales. Click "AI Assess All" for detailed reasoning.`}
                                </TooltipContent>
                              </Tooltip>
                              <div className="text-xs text-muted-foreground">{h.sampleSize} sales</div>
                            </TableCell>
                            <TableCell className="text-xs max-w-[200px]" data-testid={`cell-assessment-${idx}`}>
                              {confidenceSummaries[h.heroId] ? (
                                <span className="text-muted-foreground italic">{confidenceSummaries[h.heroId]}</span>
                              ) : (
                                <span className="text-muted-foreground/50">--</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              <div>{formatPrice(h.sellTarget)} {h.token}</div>
                              <div className="text-xs text-muted-foreground">
                                Premium: {formatPrice(h.premiumTarget)}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {flipResult.flippable && flipResult.flippable.length === 0 && !flipResult.message && (
                <div className="text-center py-8 text-muted-foreground">
                  No flippable heroes found with current filters. Try lowering the minimum discount or confidence requirements.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
