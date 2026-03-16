import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, ChevronLeft, ChevronRight, Eye, Clock, Hash, Crosshair } from 'lucide-react';
import { API_BASE_URL } from '@/lib/queryClient';

interface HuntSession {
  id: number;
  hunt_id: string | null;
  wallet_address: string | null;
  mode: string;
  status: string;
  event_count: number;
  snapshot_count: number;
  created_at: string;
  updated_at: string;
}

interface BattleLogEvent {
  id: number;
  hunt_session_id: number;
  turn_number: number;
  actor: string | null;
  actor_side: string | null;
  target: string | null;
  ability: string | null;
  damage: number | null;
  mana_delta: number | null;
  effects: Array<{ type: string; value: number; target?: string }> | null;
  raw_text: string | null;
  captured_at: string;
}

interface UnitSnapshot {
  id: number;
  hunt_session_id: number;
  unit_name: string;
  unit_side: string;
  position: number;
  hero_id: string | null;
  stats: Record<string, number>;
  captured_at_turn: number | null;
  captured_at: string;
}

interface ReconciliationResult {
  id: number;
  unit_snapshot_id: number;
  field: string;
  observed: number;
  expected: number;
  delta: number;
  suspected_cause: string | null;
}

const PAGE_SIZE = 20;

export default function TelemetryPage() {
  const [page, setPage] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<{
    ok: boolean;
    sessions: HuntSession[];
    total: number;
  }>({
    queryKey: ['/api/admin/telemetry/sessions', page],
    queryFn: async () => {
      const url = `${API_BASE_URL}/api/admin/telemetry/sessions?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery<{
    ok: boolean;
    events: BattleLogEvent[];
  }>({
    queryKey: ['/api/admin/telemetry/sessions', selectedSessionId, 'events'],
    enabled: !!selectedSessionId,
  });

  const { data: snapshotsData, isLoading: snapshotsLoading } = useQuery<{
    ok: boolean;
    unitSnapshots: UnitSnapshot[];
    turnSnapshots: Array<{ id: number; turn_number: number; full_state: Record<string, unknown> }>;
    reconciliations: ReconciliationResult[];
  }>({
    queryKey: ['/api/admin/telemetry/sessions', selectedSessionId, 'snapshots'],
    enabled: !!selectedSessionId,
  });

  const sessions = sessionsData?.sessions || [];
  const total = sessionsData?.total || 0;
  const events = eventsData?.events || [];
  const unitSnapshots = snapshotsData?.unitSnapshots || [];
  const reconciliations = snapshotsData?.reconciliations || [];

  const reconciliationsBySnapshot = reconciliations.reduce<Record<number, ReconciliationResult[]>>((acc, r) => {
    if (!acc[r.unit_snapshot_id]) acc[r.unit_snapshot_id] = [];
    acc[r.unit_snapshot_id].push(r);
    return acc;
  }, {});

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-6" data-testid="telemetry-page">
      <div className="flex items-center gap-3 flex-wrap">
        <Activity className="w-6 h-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">DFK Telemetry</h1>
        <Badge variant="secondary" data-testid="badge-session-count">{total} sessions</Badge>
      </div>

      {!selectedSessionId ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-lg">Hunt Sessions</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {page + 1} / {Math.max(1, totalPages)}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                data-testid="button-next-page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <div className="text-muted-foreground text-sm py-8 text-center" data-testid="text-loading">Loading sessions...</div>
            ) : sessions.length === 0 ? (
              <div className="text-muted-foreground text-sm py-8 text-center" data-testid="text-empty">No telemetry sessions recorded yet. Sessions are created when the Chrome extension connects and sends battle data.</div>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 p-3 rounded-md border cursor-pointer hover-elevate"
                    onClick={() => setSelectedSessionId(s.id)}
                    data-testid={`card-session-${s.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">Session #{s.id}</span>
                        <Badge variant={s.status === 'active' ? 'default' : 'secondary'}>
                          {s.status}
                        </Badge>
                        <Badge variant="outline">{s.mode}</Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                        {s.hunt_id && (
                          <span className="flex items-center gap-1">
                            <Crosshair className="w-3 h-3" />
                            Hunt: {s.hunt_id}
                          </span>
                        )}
                        {s.wallet_address && (
                          <span>Wallet: {s.wallet_address.slice(0, 6)}...{s.wallet_address.slice(-4)}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(s.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground shrink-0">
                      <span className="flex items-center gap-1">
                        <Hash className="w-3.5 h-3.5" />
                        {s.event_count} events
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" />
                        {s.snapshot_count} snapshots
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Button
            variant="outline"
            onClick={() => setSelectedSessionId(null)}
            data-testid="button-back-to-sessions"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Sessions
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Battle Log Events — Session #{selectedSessionId}</CardTitle>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="text-muted-foreground text-sm py-4 text-center">Loading events...</div>
              ) : events.length === 0 ? (
                <div className="text-muted-foreground text-sm py-4 text-center">No battle log events recorded for this session.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-events">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 px-2">Turn</th>
                        <th className="py-2 px-2">Actor</th>
                        <th className="py-2 px-2">Side</th>
                        <th className="py-2 px-2">Ability</th>
                        <th className="py-2 px-2">Target</th>
                        <th className="py-2 px-2">Damage</th>
                        <th className="py-2 px-2">Mana</th>
                        <th className="py-2 px-2">Raw</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e) => (
                        <tr key={e.id} className="border-b" data-testid={`row-event-${e.id}`}>
                          <td className="py-1.5 px-2 font-mono">{e.turn_number}</td>
                          <td className="py-1.5 px-2">{e.actor || '-'}</td>
                          <td className="py-1.5 px-2">
                            {e.actor_side && (
                              <Badge variant={e.actor_side === 'hero' ? 'default' : 'secondary'}>
                                {e.actor_side}
                              </Badge>
                            )}
                          </td>
                          <td className="py-1.5 px-2">{e.ability || '-'}</td>
                          <td className="py-1.5 px-2">{e.target || '-'}</td>
                          <td className="py-1.5 px-2 font-mono">{e.damage ?? '-'}</td>
                          <td className="py-1.5 px-2 font-mono">{e.mana_delta ?? '-'}</td>
                          <td className="py-1.5 px-2 text-xs text-muted-foreground max-w-48 truncate">{e.raw_text || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Unit Snapshots — Session #{selectedSessionId}</CardTitle>
            </CardHeader>
            <CardContent>
              {snapshotsLoading ? (
                <div className="text-muted-foreground text-sm py-4 text-center">Loading snapshots...</div>
              ) : unitSnapshots.length === 0 ? (
                <div className="text-muted-foreground text-sm py-4 text-center">No unit snapshots recorded for this session.</div>
              ) : (
                <div className="space-y-4">
                  {unitSnapshots.map((snap) => {
                    const recon = reconciliationsBySnapshot[snap.id] || [];
                    return (
                      <div key={snap.id} className="border rounded-md p-3 space-y-2" data-testid={`card-snapshot-${snap.id}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{snap.unit_name}</span>
                          <Badge variant={snap.unit_side === 'hero' ? 'default' : 'secondary'}>
                            {snap.unit_side}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Pos {snap.position}
                            {snap.hero_id && ` | Hero #${snap.hero_id}`}
                            {snap.captured_at_turn !== null && ` | Turn ${snap.captured_at_turn}`}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 text-xs">
                          {Object.entries(snap.stats).map(([key, val]) => (
                            <div key={key} className="flex items-center gap-1">
                              <span className="text-muted-foreground">{key}:</span>
                              <span className="font-mono">{val}</span>
                            </div>
                          ))}
                        </div>

                        {recon.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-semibold text-muted-foreground mb-1">Reconciliation Diffs</p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs" data-testid={`table-recon-${snap.id}`}>
                                <thead>
                                  <tr className="border-b text-left text-muted-foreground">
                                    <th className="py-1 px-2">Field</th>
                                    <th className="py-1 px-2">Observed</th>
                                    <th className="py-1 px-2">Expected</th>
                                    <th className="py-1 px-2">Delta</th>
                                    <th className="py-1 px-2">Suspected Cause</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {recon.map((r) => (
                                    <tr key={r.id} className="border-b">
                                      <td className="py-1 px-2 font-mono">{r.field}</td>
                                      <td className="py-1 px-2 font-mono">{r.observed}</td>
                                      <td className="py-1 px-2 font-mono">{r.expected}</td>
                                      <td className={`py-1 px-2 font-mono ${r.delta > 0 ? 'text-green-500' : r.delta < 0 ? 'text-red-500' : ''}`}>
                                        {r.delta > 0 ? '+' : ''}{r.delta}
                                      </td>
                                      <td className="py-1 px-2 text-muted-foreground">{r.suspected_cause || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
