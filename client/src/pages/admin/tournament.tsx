import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Medal, Plus, Trash2, ChevronRight, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Tournament {
  id: number;
  name: string;
  description: string | null;
  format: string;
  status: string;
  realm: string;
  level_min: number | null;
  level_max: number | null;
  rarity_min: number | null;
  rarity_max: number | null;
  notes: string | null;
  created_at: string;
  entry_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  open: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
  active: 'bg-green-500/20 text-green-600 dark:text-green-400',
  completed: 'bg-muted text-muted-foreground',
};

const RARITY_LABELS = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];

export default function AdminTournament() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', format: '1v1', realm: 'cv',
    level_min: '', level_max: '', rarity_min: '', rarity_max: '', notes: ''
  });

  const { data, isLoading } = useQuery({
    queryKey: ['/api/admin/hedge-tournaments'],
    queryFn: async () => {
      const res = await fetch('/api/admin/hedge-tournaments');
      if (!res.ok) throw new Error('Failed to load tournaments');
      const json = await res.json();
      return json.data as Tournament[];
    }
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const res = await fetch('/api/admin/hedge-tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payload.name,
          description: payload.description || null,
          format: payload.format,
          realm: payload.realm,
          level_min: payload.level_min ? parseInt(payload.level_min) : null,
          level_max: payload.level_max ? parseInt(payload.level_max) : null,
          rarity_min: payload.rarity_min ? parseInt(payload.rarity_min) : null,
          rarity_max: payload.rarity_max ? parseInt(payload.rarity_max) : null,
          notes: payload.notes || null,
        })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/hedge-tournaments'] });
      setShowCreate(false);
      setForm({ name: '', description: '', format: '1v1', realm: 'cv', level_min: '', level_max: '', rarity_min: '', rarity_max: '', notes: '' });
      toast({ title: 'Tournament created' });
      navigate(`/admin/tournament/${data.data.id}`);
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' })
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/hedge-tournaments/${id}`, { method: 'DELETE' });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/hedge-tournaments'] });
      toast({ title: 'Tournament deleted' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' })
  });

  const handleCreate = () => {
    if (!form.name.trim()) return toast({ title: 'Name is required', variant: 'destructive' });
    createMutation.mutate(form);
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-tournament-list">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Medal className="w-8 h-8 text-primary" />
            Tournament Bracket
          </h1>
          <p className="text-muted-foreground mt-1">Create and manage community PvP tournaments with bracket tracking.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-tournament">
          <Plus className="w-4 h-4 mr-2" />
          New Tournament
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 h-24" />
            </Card>
          ))}
        </div>
      ) : !data?.length ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <Medal className="w-12 h-12 text-muted-foreground/40" />
            <div>
              <p className="font-semibold text-lg">No tournaments yet</p>
              <p className="text-muted-foreground text-sm">Create your first community tournament to get started.</p>
            </div>
            <Button onClick={() => setShowCreate(true)} data-testid="button-create-first">
              <Plus className="w-4 h-4 mr-2" />
              Create Tournament
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {data.map(t => (
            <Card key={t.id} className="hover-elevate cursor-pointer" data-testid={`card-tournament-${t.id}`} onClick={() => navigate(`/admin/tournament/${t.id}`)}>
              <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-lg" data-testid={`text-tournament-name-${t.id}`}>{t.name}</span>
                    <Badge variant="outline" className={STATUS_COLORS[t.status]}>
                      {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                    </Badge>
                    <Badge variant="outline">{t.format}</Badge>
                    <Badge variant="outline">{t.realm === 'cv' ? 'Crystalvale' : 'Sundered Isles'}</Badge>
                  </div>
                  {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {t.entry_count} participant{t.entry_count !== 1 ? 's' : ''}
                    </span>
                    {t.level_min && <span>Lv {t.level_min}–{t.level_max ?? '∞'}</span>}
                    {t.rarity_min !== null && <span>{RARITY_LABELS[t.rarity_min]}+</span>}
                    <span>{new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    data-testid={`button-delete-tournament-${t.id}`}
                    onClick={(e) => { e.stopPropagation(); if (confirm('Delete this tournament?')) deleteMutation.mutate(t.id); }}
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg" data-testid="dialog-create-tournament">
          <DialogHeader>
            <DialogTitle>New Tournament</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Crystalvale 1v1 Championship" data-testid="input-tournament-name" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional tournament description..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={form.format} onValueChange={v => setForm(p => ({ ...p, format: v }))}>
                  <SelectTrigger data-testid="select-tournament-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1v1">1v1</SelectItem>
                    <SelectItem value="3v3">3v3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Realm</Label>
                <Select value={form.realm} onValueChange={v => setForm(p => ({ ...p, realm: v }))}>
                  <SelectTrigger data-testid="select-tournament-realm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cv">Crystalvale</SelectItem>
                    <SelectItem value="sd">Sundered Isles</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Level</Label>
                <Input type="number" value={form.level_min} onChange={e => setForm(p => ({ ...p, level_min: e.target.value }))} placeholder="1" />
              </div>
              <div className="space-y-2">
                <Label>Max Level</Label>
                <Input type="number" value={form.level_max} onChange={e => setForm(p => ({ ...p, level_max: e.target.value }))} placeholder="100" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Rules, prizes, schedule..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-submit-create">
              {createMutation.isPending ? 'Creating...' : 'Create Tournament'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
