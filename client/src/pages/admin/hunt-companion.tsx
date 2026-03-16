import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Swords, Loader2, Copy, Check, Wifi, WifiOff, Heart, Zap,
  Shield, ChevronDown, ChevronUp, Bot, Sparkles, Target,
  Skull, Activity, Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiRequest } from '@/lib/queryClient';

interface HeroSnapshot {
  slot: number;
  heroId: string;
  mainClass: string;
  level: number;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  isAlive: boolean;
}

interface EnemySnapshot {
  enemyId: string;
  currentHp: number;
  maxHp: number;
  debuffs: string[];
}

interface Recommendation {
  rank: number;
  action: string;
  skillName: string;
  targetType: string;
  targetSlot: number | null;
  damageEv: number;
  killChance: number;
  survivalDelta: number;
  debuffValue: number;
  manaEfficiency: number;
  totalScore: number;
  reasoning: string;
}

interface TurnEvent {
  turnNumber: number;
  actorSide: string;
  actorSlot: number;
  skillId?: string;
  targets?: Array<{ slot: number; hpBefore: number; hpAfter: number; damage: number }>;
}

interface BattleStateMsg {
  turnNumber: number;
  activeHeroSlot: number;
  heroes: HeroSnapshot[];
  enemies: EnemySnapshot[];
}

interface SessionData {
  id: number;
  session_token: string;
  status: string;
  wallet_address?: string;
  hunt_id?: string;
  created_at: string;
  last_seen_at: string;
}

function HpBar({ current, max, label, color }: { current: number; max: number; label: string; color: string }) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  const barColor = pct > 60 ? 'bg-green-500' : pct > 30 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-0.5" data-testid={`hp-bar-${label}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className="text-[10px] font-mono text-muted-foreground">{current}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${color || barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RecommendationCard({ rec, onExplain, isExplaining, explanation }: {
  rec: Recommendation;
  onExplain: () => void;
  isExplaining: boolean;
  explanation: string | null;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const scoreColor = rec.totalScore > 0.6 ? 'text-green-500' : rec.totalScore > 0.3 ? 'text-amber-500' : 'text-muted-foreground';

  return (
    <div
      className="p-3 rounded-md bg-muted/20 border border-muted-foreground/10 space-y-2"
      data-testid={`recommendation-${rec.rank}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={rec.rank === 1 ? 'default' : 'outline'} className="text-[10px] font-mono">
          #{rec.rank}
        </Badge>
        <span className="font-medium text-sm">{rec.action}</span>
        <span className={`text-xs font-mono ml-auto ${scoreColor}`}>
          {(rec.totalScore * 100).toFixed(0)}pts
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {rec.damageEv > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            <Swords className="w-3 h-3 mr-0.5" />
            {rec.damageEv} dmg
          </Badge>
        )}
        {rec.killChance > 0 && (
          <Badge variant={rec.killChance >= 0.5 ? 'default' : 'secondary'} className="text-[10px]">
            <Skull className="w-3 h-3 mr-0.5" />
            {Math.round(rec.killChance * 100)}% kill
          </Badge>
        )}
        {rec.debuffValue > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            <Target className="w-3 h-3 mr-0.5" />
            CC {(rec.debuffValue * 100).toFixed(0)}%
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{rec.reasoning}</p>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowDetail(!showDetail)}
          data-testid={`button-detail-${rec.rank}`}
        >
          {showDetail ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
          Details
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onExplain}
          disabled={isExplaining}
          data-testid={`button-explain-${rec.rank}`}
        >
          {isExplaining ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Bot className="w-3.5 h-3.5 mr-1" />}
          Explain
        </Button>
      </div>

      {showDetail && (
        <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground pt-1 border-t border-muted-foreground/10">
          <span>Damage EV: {rec.damageEv}</span>
          <span>Kill Chance: {Math.round(rec.killChance * 100)}%</span>
          <span>Survival Delta: {rec.survivalDelta}</span>
          <span>Debuff Value: {rec.debuffValue}</span>
          <span>Mana Efficiency: {rec.manaEfficiency}</span>
          <span>Total Score: {rec.totalScore}</span>
        </div>
      )}

      {explanation && (
        <div className="p-2 rounded bg-muted/30 border border-muted-foreground/10" data-testid={`explanation-${rec.rank}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> AI Explanation
          </p>
          <p className="text-xs leading-relaxed whitespace-pre-wrap">{explanation}</p>
        </div>
      )}
    </div>
  );
}

export default function HuntCompanion() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [copied, setCopied] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [battleState, setBattleState] = useState<BattleStateMsg | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [turnFeed, setTurnFeed] = useState<TurnEvent[]>([]);
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const turnFeedRef = useRef<HTMLDivElement>(null);

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const resp = await fetch('/api/admin/pve/companion/session');
      if (!resp.ok) throw new Error('Failed to create session');
      return resp.json();
    },
    onSuccess: (data) => {
      if (data.ok && data.session) {
        setSession(data.session);
      }
    },
  });

  const sessionStatusQuery = useQuery({
    queryKey: ['/api/admin/pve/companion/session', session?.session_token],
    enabled: !!session?.session_token && !wsConnected,
    refetchInterval: 5000,
    queryFn: async () => {
      const resp = await fetch(`/api/admin/pve/companion/session/${session!.session_token}`);
      if (!resp.ok) throw new Error('Failed');
      return resp.json();
    },
  });

  const explainMutation = useMutation({
    mutationFn: async ({ rec, recIndex }: { rec: Recommendation; recIndex: number }) => {
      const resp = await apiRequest('POST', '/api/admin/pve/companion/explain', {
        recommendation: rec,
        battleState,
        enemyId: battleState?.enemies?.[0]?.enemyId || null,
      });
      const data = await resp.json();
      return { explanation: data.explanation, recIndex };
    },
    onSuccess: (data) => {
      setExplanations(prev => ({ ...prev, [data.recIndex]: data.explanation }));
    },
  });

  const connectWs = useCallback(() => {
    if (!session?.session_token || wsRef.current) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/companion`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', sessionToken: session.session_token }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'joined') {
          setWsConnected(true);
        } else if (msg.type === 'recommendation') {
          setRecommendations(msg.recommendations || []);
          if (msg.battleState) setBattleState(msg.battleState);
        } else if (msg.type === 'state_update') {
          if (msg.heroes || msg.enemyId) {
            setBattleState(prev => prev ? { ...prev } : prev);
          }
        } else if (msg.type === 'turn_update') {
          setTurnFeed(prev => [...prev.slice(-9), { turnNumber: msg.turnNumber, actorSide: msg.actorSide, actorSlot: msg.actorSlot, skillId: msg.skillId, effects: msg.effects }]);
        } else if (msg.type === 'error') {
          console.error('[WS] Error:', msg.message);
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      wsRef.current = null;
    };

    ws.onerror = () => {
      setWsConnected(false);
    };
  }, [session?.session_token]);

  useEffect(() => {
    if (session?.session_token && !wsRef.current) {
      connectWs();
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [session?.session_token, connectWs]);

  useEffect(() => {
    if (sessionStatusQuery.data?.turnEvents) {
      const events = sessionStatusQuery.data.turnEvents;
      setTurnFeed(events.slice(-10));
    }
  }, [sessionStatusQuery.data]);

  const copyToken = () => {
    if (session?.session_token) {
      navigator.clipboard.writeText(session.session_token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasLiveData = battleState !== null;

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto" data-testid="hunt-companion-page">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Hunt Companion</h1>
          {wsConnected && (
            <Badge variant="default" className="text-[10px]">
              <Wifi className="w-3 h-3 mr-1" /> LIVE
            </Badge>
          )}
        </div>
      </div>

      {!session && (
        <Card>
          <CardContent className="py-16 text-center">
            <Radio className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground mb-4">
              Start a companion session to receive live battle recommendations during PVE hunts.
            </p>
            <Button
              onClick={() => createSessionMutation.mutate()}
              disabled={createSessionMutation.isPending}
              data-testid="button-create-session"
            >
              {createSessionMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Radio className="w-4 h-4 mr-2" />
              )}
              Start Companion Session
            </Button>
          </CardContent>
        </Card>
      )}

      {session && !hasLiveData && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex-1 min-w-[240px]">
                  <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                    {wsConnected ? (
                      <><Wifi className="w-4 h-4 text-green-500" /> Connected — Waiting for battle data</>
                    ) : (
                      <><WifiOff className="w-4 h-4 text-muted-foreground" /> Pairing</>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Use this session token in the DFK Hunt Companion Chrome Extension to pair your game client with this advisor.
                  </p>

                  <div className="flex items-center gap-2 mb-4">
                    <code className="flex-1 px-3 py-2 rounded-md bg-muted font-mono text-sm select-all" data-testid="text-session-token">
                      {session.session_token}
                    </code>
                    <Button size="icon" variant="outline" onClick={copyToken} data-testid="button-copy-token">
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>1. Install the DFK Hunt Companion Chrome Extension</p>
                    <p>2. Paste this token in the extension popup</p>
                    <p>3. Enter a PVE Hunt battle in DeFi Kingdoms</p>
                    <p>4. Recommendations will appear here automatically</p>
                  </div>
                </div>

                <div className="w-full md:w-auto">
                  <div className="p-3 rounded-md bg-muted/30 space-y-1 text-xs">
                    <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Session Info</p>
                    <p>Status: <Badge variant={wsConnected ? 'default' : 'secondary'} className="text-[10px]">{wsConnected ? 'Connected' : session.status}</Badge></p>
                    <p className="font-mono text-muted-foreground/60">ID: {session.id}</p>
                    {session.hunt_id && <p>Hunt: {session.hunt_id}</p>}
                    {session.wallet_address && <p className="font-mono">Wallet: {session.wallet_address.slice(0, 6)}...{session.wallet_address.slice(-4)}</p>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {!wsConnected && (
            <div className="text-center">
              <Button variant="outline" onClick={connectWs} data-testid="button-reconnect">
                <Wifi className="w-4 h-4 mr-2" />
                Reconnect WebSocket
              </Button>
            </div>
          )}
        </div>
      )}

      {session && hasLiveData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" /> Party Status
                </p>
                <div className="space-y-3">
                  {battleState.heroes.map((hero) => (
                    <div key={hero.slot} className={`p-2 rounded-md ${hero.isAlive ? 'bg-muted/20' : 'bg-red-500/10'}`} data-testid={`hero-status-${hero.slot}`}>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-medium">
                          {hero.mainClass || `Hero`} #{hero.heroId?.slice(-4) || hero.slot}
                        </span>
                        {!hero.isAlive && <Badge variant="destructive" className="text-[10px]">KO</Badge>}
                        {hero.slot === battleState.activeHeroSlot && (
                          <Badge variant="default" className="text-[10px]">
                            <Activity className="w-3 h-3 mr-0.5" /> Active
                          </Badge>
                        )}
                      </div>
                      <HpBar current={hero.currentHp} max={hero.maxHp} label="HP" color="bg-green-500" />
                      <div className="mt-1">
                        <HpBar current={hero.currentMp} max={hero.maxMp} label="MP" color="bg-blue-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {battleState.enemies.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1">
                    <Skull className="w-3.5 h-3.5" /> Enemy
                  </p>
                  {battleState.enemies.map((enemy, i) => (
                    <div key={i} className="space-y-2" data-testid={`enemy-status-${i}`}>
                      <span className="text-sm font-medium">
                        {enemy.enemyId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')}
                      </span>
                      <HpBar current={enemy.currentHp} max={enemy.maxHp} label="HP" color="bg-red-500" />
                      {enemy.debuffs.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {enemy.debuffs.map((d, j) => (
                            <Badge key={j} variant="secondary" className="text-[9px]">{d}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5" /> Turn Feed
                </p>
                <div ref={turnFeedRef} className="space-y-1 max-h-[200px] overflow-y-auto" data-testid="turn-feed">
                  {turnFeed.length === 0 && (
                    <p className="text-xs text-muted-foreground/60 text-center py-4">Waiting for turn data...</p>
                  )}
                  {turnFeed.map((turn, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-1.5 text-[10px] p-1 rounded bg-muted/20">
                      <Badge variant="outline" className="text-[9px] font-mono">T{turn.turnNumber}</Badge>
                      <span className={turn.actorSide === 'hero' ? 'text-blue-400' : 'text-red-400'}>
                        {turn.actorSide === 'hero' ? `Hero ${turn.actorSlot}` : `Enemy ${turn.actorSlot}`}
                      </span>
                      {turn.skillId && <span className="text-muted-foreground">{turn.skillId}</span>}
                      {turn.targets?.map((t, j) => (
                        <span key={j} className={t.damage > 0 ? 'text-red-400' : t.damage < 0 ? 'text-green-400' : 'text-muted-foreground'}>
                          {t.damage > 0 ? `-${t.damage}` : t.damage < 0 ? `+${Math.abs(t.damage)}` : '0'}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" /> Recommended Actions
                  </p>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    Turn {battleState.turnNumber}
                  </Badge>
                </div>

                {recommendations.length === 0 && (
                  <div className="py-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">Waiting for turn data to generate recommendations...</p>
                  </div>
                )}

                <div className="space-y-3" data-testid="recommendations-list">
                  {recommendations.slice(0, 3).map((rec) => (
                    <RecommendationCard
                      key={rec.rank}
                      rec={rec}
                      onExplain={() => explainMutation.mutate({ rec, recIndex: rec.rank })}
                      isExplaining={explainMutation.isPending && explainMutation.variables?.recIndex === rec.rank}
                      explanation={explanations[rec.rank] || null}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Session Info</p>
                  <Badge variant={wsConnected ? 'default' : 'secondary'} className="text-[10px]">
                    {wsConnected ? <><Wifi className="w-3 h-3 mr-1" /> Connected</> : <><WifiOff className="w-3 h-3 mr-1" /> Disconnected</>}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <div>Token: <code className="font-mono text-[10px]">{session.session_token.slice(0, 8)}...</code></div>
                  {session.hunt_id && <div>Hunt: {session.hunt_id}</div>}
                  {session.wallet_address && <div className="font-mono">Wallet: {session.wallet_address.slice(0, 6)}...{session.wallet_address.slice(-4)}</div>}
                  <div>Turns: {turnFeed.length}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
