import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Users, Trophy, Swords, Trash2, Plus, GitFork, ChevronRight, Loader2, Medal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { STARTER_ARMORS } from '@/lib/dfk-combat-formulas';

interface Entry {
  id: number;
  tournament_id: number;
  participant_name: string;
  wallet_address: string | null;
  hero_id: number | null;
  main_class: string | null;
  sub_class: string | null;
  rarity: number | null;
  level: number | null;
  stats_json: Record<string, number> | null;
  weapon_type: string;
  armor_name: string;
  combat_power_score: number | null;
  is_seeded: boolean;
  seed_rank: number | null;
  eliminated: boolean;
  registered_at: string;
}

interface Match {
  id: number;
  tournament_id: number;
  round: number;
  match_number: number;
  entry_a_id: number | null;
  entry_b_id: number | null;
  winner_entry_id: number | null;
  is_bye: boolean;
  tx_hash: string | null;
  completed_at: string | null;
}

interface TournamentDetail {
  id: number;
  name: string;
  description: string | null;
  format: string;
  status: string;
  realm: string;
  level_min: number | null;
  level_max: number | null;
  notes: string | null;
  created_at: string;
  entries: Entry[];
  matches: Match[];
}

interface OddsData {
  entryA: { name: string; heroId: number; combatPower: number; initPct: number; class: string | null; level: number | null; stats: Record<string, number> };
  entryB: { name: string; heroId: number; combatPower: number; initPct: number; class: string | null; level: number | null; stats: Record<string, number> };
  verdict: string;
  powerOddsA: number;
}

const RARITY_LABELS = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
const RARITY_COLORS = ['text-muted-foreground', 'text-green-500', 'text-blue-500', 'text-purple-500', 'text-amber-500'];

const STATUS_NEXT: Record<string, { label: string; next: string }> = {
  draft: { label: 'Open Registration', next: 'open' },
  open: { label: 'Generate Bracket & Start', next: 'active' },
  active: { label: 'Mark Completed', next: 'completed' },
};

const ROUND_LABELS: Record<number, string> = { 1: 'Round 1', 2: 'Quarterfinals', 3: 'Semifinals', 4: 'Final' };

function getRoundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinals';
  if (fromEnd === 2) return 'Quarterfinals';
  return `Round ${round}`;
}

export default function AdminTournamentDetail({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showRegister, setShowRegister] = useState(false);
  const [oddsMatch, setOddsMatch] = useState<Match | null>(null);
  const [winnerInput, setWinnerInput] = useState<Record<number, { tx_hash: string }>>({});
  const [regForm, setRegForm] = useState({
    participant_name: '', wallet_address: '', hero_id: '',
    weapon_type: 'Physical', armor_name: 'Tattered Tunic',
    STR: '10', DEX: '10', AGI: '10', INT: '10', WIS: '10', VIT: '10', END: '10', LCK: '10',
    level: '1', main_class: '', notes: ''
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/admin/hedge-tournaments', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/hedge-tournaments/${id}`);
      if (!res.ok) throw new Error('Tournament not found');
      const json = await res.json();
      return json.data as TournamentDetail;
    }
  });

  const { data: oddsData, isLoading: oddsLoading } = useQuery({
    queryKey: ['/api/admin/hedge-tournaments', id, 'odds', oddsMatch?.id],
    enabled: !!oddsMatch && !!oddsMatch.entry_a_id && !!oddsMatch.entry_b_id,
    queryFn: async () => {
      const res = await fetch(`/api/admin/hedge-tournaments/${id}/matches/${oddsMatch!.id}/odds`);
      if (!res.ok) throw new Error('Failed to compute odds');
      const json = await res.json();
      return json.data as OddsData;
    }
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(`/api/admin/hedge-tournaments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/admin/hedge-tournaments', id] }),
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' })
  });

  const generateBracketMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/hedge-tournaments/${id}/generate-bracket`, { method: 'POST' });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/hedge-tournaments', id] });
      toast({ title: 'Bracket generated!' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' })
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const stats_json = {
        STR: parseInt(regForm.STR), DEX: parseInt(regForm.DEX), AGI: parseInt(regForm.AGI),
        INT: parseInt(regForm.INT), WIS: parseInt(regForm.WIS), VIT: parseInt(regForm.VIT),
        END: parseInt(regForm.END), LCK: parseInt(regForm.LCK)
      };
      const res = await fetch(`/api/admin/hedge-tournaments/${id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participant_name: regForm.participant_name,
          wallet_address: regForm.wallet_address || null,
          hero_id: regForm.hero_id || null,
          weapon_type: regForm.weapon_type,
          armor_name: regForm.armor_name,
          level: parseInt(regForm.level) || 1,
          stats_json,
          notes: regForm.notes || null
        })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/hedge-tournaments', id] });
      setShowRegister(false);
      setRegForm({ participant_name: '', wallet_address: '', hero_id: '', weapon_type: 'Physical', armor_name: 'Tattered Tunic', STR: '10', DEX: '10', AGI: '10', INT: '10', WIS: '10', VIT: '10', END: '10', LCK: '10', level: '1', main_class: '', notes: '' });
      toast({ title: 'Participant registered' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' })
  });

  const removeEntryMutation = useMutation({
    mutationFn: async (entryId: number) => {
      const res = await fetch(`/api/admin/hedge-tournaments/${id}/entries/${entryId}`, { method: 'DELETE' });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/admin/hedge-tournaments', id] }),
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' })
  });

  const recordResultMutation = useMutation({
    mutationFn: async ({ matchId, winnerId }: { matchId: number; winnerId: number }) => {
      const res = await fetch(`/api/admin/hedge-tournaments/${id}/matches/${matchId}/result`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winner_entry_id: winnerId, tx_hash: winnerInput[matchId]?.tx_hash || null })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/hedge-tournaments', id] });
      toast({ title: 'Result recorded' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' })
  });

  const handleStatusAdvance = () => {
    if (!data) return;
    if (data.status === 'open') {
      generateBracketMutation.mutate();
    } else {
      statusMutation.mutate(STATUS_NEXT[data.status]?.next);
    }
  };

  if (isLoading) return (
    <div className="p-6 flex items-center gap-3 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
      Loading tournament...
    </div>
  );

  if (error || !data) return (
    <div className="p-6">
      <p className="text-destructive">Tournament not found.</p>
      <Button variant="outline" onClick={() => navigate('/admin/tournament')} className="mt-4">Back to Tournaments</Button>
    </div>
  );

  const entryMap = Object.fromEntries(data.entries.map(e => [e.id, e]));
  const allRounds = [...new Set(data.matches.map(m => m.round))].sort((a, b) => a - b);
  const totalRounds = allRounds.length;
  const hasBracket = data.matches.length > 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="page-tournament-detail">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/tournament')} className="mb-1 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-1" /> All Tournaments
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Medal className="w-6 h-6 text-primary" />
            {data.name}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{data.status.charAt(0).toUpperCase() + data.status.slice(1)}</Badge>
            <Badge variant="outline">{data.format}</Badge>
            <Badge variant="outline">{data.realm === 'cv' ? 'Crystalvale' : 'Sundered Isles'}</Badge>
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" />{data.entries.length} registered
            </span>
          </div>
          {data.description && <p className="text-sm text-muted-foreground mt-1">{data.description}</p>}
        </div>

        {STATUS_NEXT[data.status] && (
          <Button
            onClick={handleStatusAdvance}
            disabled={generateBracketMutation.isPending || statusMutation.isPending}
            data-testid="button-status-advance"
          >
            {(generateBracketMutation.isPending || statusMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {STATUS_NEXT[data.status].label}
          </Button>
        )}
      </div>

      {/* Participants section (show when no bracket yet) */}
      {!hasBracket && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle>Participants</CardTitle>
              <CardDescription>
                Register participants before generating the bracket. Need 2, 4, 8, or 16 players (padded with BYEs).
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowRegister(true)} data-testid="button-register-participant">
              <Plus className="w-4 h-4 mr-1" /> Register Hero
            </Button>
          </CardHeader>
          <CardContent>
            {data.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No participants yet. Register heroes to get started.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Participant</TableHead>
                    <TableHead>Hero ID</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Weapon</TableHead>
                    <TableHead>Combat Power</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.entries.map(entry => (
                    <TableRow key={entry.id} data-testid={`row-entry-${entry.id}`}>
                      <TableCell className="font-medium">{entry.participant_name}</TableCell>
                      <TableCell className="text-muted-foreground">{entry.hero_id ?? '—'}</TableCell>
                      <TableCell>{entry.main_class ?? '—'}</TableCell>
                      <TableCell>{entry.level ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{entry.weapon_type}</Badge>
                      </TableCell>
                      <TableCell>
                        {entry.combat_power_score != null ? (
                          <span className="font-mono font-bold">{entry.combat_power_score}</span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => { if (confirm('Remove this participant?')) removeEntryMutation.mutate(entry.id); }}
                          data-testid={`button-remove-entry-${entry.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bracket visualization */}
      {hasBracket && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitFork className="w-5 h-5" />
              Bracket
            </CardTitle>
            <CardDescription>
              {data.entries.length} participants • {totalRounds} round{totalRounds !== 1 ? 's' : ''}
              {data.status === 'active' && <span className="ml-2 text-green-500">• In Progress</span>}
              {data.status === 'completed' && <span className="ml-2 text-muted-foreground">• Completed</span>}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="flex gap-8 min-w-max pb-4">
                {allRounds.map(round => {
                  const roundMatches = data.matches.filter(m => m.round === round).sort((a, b) => a.match_number - b.match_number);
                  return (
                    <div key={round} className="flex flex-col gap-4 min-w-[260px]">
                      <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider text-center pb-1 border-b">
                        {getRoundLabel(round, totalRounds)}
                      </div>
                      <div className="flex flex-col" style={{ gap: `${Math.pow(2, round - 1) * 8}px` }}>
                        {roundMatches.map(match => {
                          const entryA = match.entry_a_id ? entryMap[match.entry_a_id] : null;
                          const entryB = match.entry_b_id ? entryMap[match.entry_b_id] : null;
                          const winner = match.winner_entry_id ? entryMap[match.winner_entry_id] : null;
                          const isPending = !match.is_bye && !match.winner_entry_id && entryA && entryB;
                          const isBye = match.is_bye;

                          return (
                            <Card
                              key={match.id}
                              className={`border ${match.winner_entry_id ? 'border-border' : isPending ? 'border-primary/40' : 'border-border/50'}`}
                              data-testid={`card-match-${match.id}`}
                            >
                              <CardContent className="p-3 space-y-2">
                                {isBye ? (
                                  <div className="text-xs text-muted-foreground text-center py-2">
                                    BYE — {winner?.participant_name ?? 'Auto-advance'}
                                  </div>
                                ) : (
                                  <>
                                    {/* Participant A */}
                                    <div className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${match.winner_entry_id === match.entry_a_id ? 'bg-green-500/10' : match.winner_entry_id && match.winner_entry_id !== match.entry_a_id ? 'opacity-40' : ''}`}>
                                      <span className={`text-sm font-medium truncate ${match.winner_entry_id === match.entry_a_id ? 'text-green-600 dark:text-green-400' : ''}`}>
                                        {entryA ? entryA.participant_name : <span className="text-muted-foreground italic">TBD</span>}
                                      </span>
                                      {entryA?.main_class && <Badge variant="outline" className="text-xs shrink-0">{entryA.main_class}</Badge>}
                                      {match.winner_entry_id === match.entry_a_id && <Trophy className="w-3 h-3 text-green-500 shrink-0" />}
                                    </div>

                                    <div className="text-center text-xs text-muted-foreground">vs</div>

                                    {/* Participant B */}
                                    <div className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${match.winner_entry_id === match.entry_b_id ? 'bg-green-500/10' : match.winner_entry_id && match.winner_entry_id !== match.entry_b_id ? 'opacity-40' : ''}`}>
                                      <span className={`text-sm font-medium truncate ${match.winner_entry_id === match.entry_b_id ? 'text-green-600 dark:text-green-400' : ''}`}>
                                        {entryB ? entryB.participant_name : <span className="text-muted-foreground italic">TBD</span>}
                                      </span>
                                      {entryB?.main_class && <Badge variant="outline" className="text-xs shrink-0">{entryB.main_class}</Badge>}
                                      {match.winner_entry_id === match.entry_b_id && <Trophy className="w-3 h-3 text-green-500 shrink-0" />}
                                    </div>

                                    {/* Actions */}
                                    {isPending && data.status === 'active' && (
                                      <div className="space-y-2 pt-1 border-t">
                                        <Input
                                          placeholder="Tx hash (optional)"
                                          className="h-7 text-xs"
                                          value={winnerInput[match.id]?.tx_hash ?? ''}
                                          onChange={e => setWinnerInput(p => ({ ...p, [match.id]: { tx_hash: e.target.value } }))}
                                          data-testid={`input-tx-hash-${match.id}`}
                                        />
                                        <div className="flex gap-2">
                                          <Button
                                            size="sm"
                                            className="flex-1 h-7 text-xs"
                                            onClick={() => recordResultMutation.mutate({ matchId: match.id, winnerId: match.entry_a_id! })}
                                            disabled={recordResultMutation.isPending}
                                            data-testid={`button-winner-a-${match.id}`}
                                          >
                                            {entryA?.participant_name} wins
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="flex-1 h-7 text-xs"
                                            onClick={() => recordResultMutation.mutate({ matchId: match.id, winnerId: match.entry_b_id! })}
                                            disabled={recordResultMutation.isPending}
                                            data-testid={`button-winner-b-${match.id}`}
                                          >
                                            {entryB?.participant_name} wins
                                          </Button>
                                        </div>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="w-full h-7 text-xs"
                                          onClick={() => setOddsMatch(match)}
                                          data-testid={`button-view-odds-${match.id}`}
                                        >
                                          <Swords className="w-3 h-3 mr-1" />
                                          View Matchup Odds
                                        </Button>
                                      </div>
                                    )}

                                    {match.winner_entry_id && (
                                      <div className="pt-1 border-t">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="w-full h-7 text-xs"
                                          onClick={() => setOddsMatch(match)}
                                        >
                                          <Swords className="w-3 h-3 mr-1" />
                                          View Analysis
                                        </Button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Champion display */}
                {data.status === 'completed' && (() => {
                  const finalMatch = data.matches.find(m => m.round === totalRounds);
                  const champion = finalMatch?.winner_entry_id ? entryMap[finalMatch.winner_entry_id] : null;
                  return champion ? (
                    <div className="flex flex-col justify-center min-w-[200px]">
                      <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider text-center pb-1 border-b mb-4">
                        Champion
                      </div>
                      <Card className="border-2 border-amber-500/50 bg-amber-500/5 text-center">
                        <CardContent className="p-4 space-y-2">
                          <Trophy className="w-8 h-8 text-amber-500 mx-auto" />
                          <p className="font-bold text-lg">{champion.participant_name}</p>
                          {champion.main_class && <Badge>{champion.main_class}</Badge>}
                        </CardContent>
                      </Card>
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Register Dialog */}
      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-register-participant">
          <DialogHeader>
            <DialogTitle>Register Participant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Participant Name *</Label>
                <Input value={regForm.participant_name} onChange={e => setRegForm(p => ({ ...p, participant_name: e.target.value }))} placeholder="Player name" data-testid="input-participant-name" />
              </div>
              <div className="space-y-2">
                <Label>Hero ID (optional)</Label>
                <Input value={regForm.hero_id} onChange={e => setRegForm(p => ({ ...p, hero_id: e.target.value }))} placeholder="e.g. 134639" data-testid="input-hero-id" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Wallet Address (optional)</Label>
              <Input value={regForm.wallet_address} onChange={e => setRegForm(p => ({ ...p, wallet_address: e.target.value }))} placeholder="0x..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Weapon Type</Label>
                <Select value={regForm.weapon_type} onValueChange={v => setRegForm(p => ({ ...p, weapon_type: v }))}>
                  <SelectTrigger data-testid="select-weapon-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Physical">Physical</SelectItem>
                    <SelectItem value="Magical">Magical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Armor</Label>
                <Select value={regForm.armor_name} onValueChange={v => setRegForm(p => ({ ...p, armor_name: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STARTER_ARMORS.map(a => <SelectItem key={a.name} value={a.name}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Level</Label>
              <Input type="number" value={regForm.level} onChange={e => setRegForm(p => ({ ...p, level: e.target.value }))} min={1} max={100} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Hero Stats (used for matchup odds)</Label>
              <div className="grid grid-cols-4 gap-2">
                {(['STR','DEX','AGI','INT','WIS','VIT','END','LCK'] as const).map(stat => (
                  <div key={stat} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{stat}</Label>
                    <Input
                      type="number"
                      value={regForm[stat]}
                      onChange={e => setRegForm(p => ({ ...p, [stat]: e.target.value }))}
                      min={1} max={100}
                      className="h-8 text-sm"
                      data-testid={`input-stat-${stat.toLowerCase()}`}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">If a Hero ID is provided, stats will be auto-fetched from the DFK subgraph. These manual stats are used as fallback.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegister(false)}>Cancel</Button>
            <Button
              onClick={() => { if (!regForm.participant_name.trim()) return; registerMutation.mutate(); }}
              disabled={registerMutation.isPending}
              data-testid="button-submit-register"
            >
              {registerMutation.isPending ? 'Registering...' : 'Register'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Odds Sheet */}
      <Sheet open={!!oddsMatch} onOpenChange={(open) => { if (!open) setOddsMatch(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto" data-testid="sheet-odds">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Swords className="w-5 h-5" />
              Matchup Odds
            </SheetTitle>
          </SheetHeader>

          {oddsLoading ? (
            <div className="flex items-center gap-2 mt-8 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Computing odds...
            </div>
          ) : oddsData ? (
            <div className="space-y-6 mt-6">
              <div className="text-center p-4 bg-muted/30 rounded-lg">
                <p className="text-sm font-medium text-muted-foreground">Verdict</p>
                <p className="font-semibold mt-1" data-testid="text-odds-verdict">{oddsData.verdict}</p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-sm font-medium">
                  <span data-testid="text-odds-entry-a">{oddsData.entryA.name}</span>
                  <span data-testid="text-odds-entry-b">{oddsData.entryB.name}</span>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Combat Power Advantage</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs w-16 text-right font-mono">{(oddsData.powerOddsA * 100).toFixed(1)}%</span>
                    <Progress value={oddsData.powerOddsA * 100} className="flex-1 h-3" />
                    <span className="text-xs w-16 font-mono">{((1 - oddsData.powerOddsA) * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Initiative Probability</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs w-16 text-right font-mono">{(oddsData.entryA.initPct * 100).toFixed(1)}%</span>
                    <Progress value={oddsData.entryA.initPct * 100} className="flex-1 h-3" />
                    <span className="text-xs w-16 font-mono">{(oddsData.entryB.initPct * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[oddsData.entryA, oddsData.entryB].map((entry, idx) => (
                  <Card key={idx}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{entry.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {entry.class ?? 'Unknown'} • Lv {entry.level ?? '?'} • CP {entry.combatPower}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {entry.stats && Object.entries(entry.stats).map(([stat, val]) => (
                        <div key={stat} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{stat}</span>
                          <span className="font-mono font-medium">{val}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : oddsMatch && (!oddsMatch.entry_a_id || !oddsMatch.entry_b_id) ? (
            <p className="mt-8 text-sm text-muted-foreground">Both participants must be known to compute odds.</p>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
