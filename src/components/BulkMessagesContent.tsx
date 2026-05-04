import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Send, MessageCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables as DBTables } from '@/integrations/supabase/types';

type Employee = DBTables<'employees'>;

const ALL = '__all__';

function normalizePhoneForWhatsApp(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = '20' + digits.slice(1);
  if (digits.length === 10 && digits.startsWith('1')) digits = '20' + digits;
  return digits;
}

function applyVars(template: string, emp: Employee): string {
  return template
    .replaceAll('{name}', emp.name || '')
    .replaceAll('{location}', emp.location || '')
    .replaceAll('{department}', emp.department || '')
    .replaceAll('{shift}', emp.shift || '');
}

export function BulkMessagesContent() {
  const { t, lang } = useLanguage();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [message, setMessage] = useState('');
  const [filterLocation, setFilterLocation] = useState<string>(ALL);
  const [filterDepartment, setFilterDepartment] = useState<string>(ALL);
  const [filterShift, setFilterShift] = useState<string>(ALL);
  const [activeOnly, setActiveOnly] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [logs, setLogs] = useState<any[]>([]);

  const loadEmployees = async () => {
    const { data, error } = await supabase.from('employees').select('*').order('name');
    if (error) { toast.error(error.message); return; }
    setEmployees(data || []);
  };

  const loadLogs = async () => {
    const { data } = await supabase.from('whatsapp_send_attempts' as any)
      .select('id, employee_id, to_number, status, sent_at, error_message')
      .order('sent_at', { ascending: false }).limit(100);
    setLogs((data as any[]) || []);
  };

  useEffect(() => { loadEmployees(); loadLogs(); }, []);

  const locations = useMemo(() => Array.from(new Set(employees.map(e => e.location).filter(Boolean))) as string[], [employees]);
  const departments = useMemo(() => Array.from(new Set(employees.map(e => e.department).filter(Boolean))) as string[], [employees]);
  const shifts = useMemo(() => Array.from(new Set(employees.map(e => e.shift).filter(Boolean))) as string[], [employees]);

  const filtered = useMemo(() => {
    return employees.filter(e => {
      if (activeOnly && e.status !== 'active') return false;
      if (filterLocation !== ALL && e.location !== filterLocation) return false;
      if (filterDepartment !== ALL && e.department !== filterDepartment) return false;
      if (filterShift !== ALL && e.shift !== filterShift) return false;
      return true;
    });
  }, [employees, activeOnly, filterLocation, filterDepartment, filterShift]);

  useEffect(() => {
    setSelectedIds(prev => {
      const next = new Set<string>();
      filtered.forEach(e => {
        if (e.mobile && e.mobile.trim() && prev.has(e.id)) next.add(e.id);
      });
      return next;
    });
  }, [filtered]);

  const eligible = useMemo(() => filtered.filter(e => e.mobile && e.mobile.trim()), [filtered]);
  const ineligibleCount = filtered.length - eligible.length;

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(eligible.map(e => e.id)));
  const clearAll = () => setSelectedIds(new Set());

  const handleSendAll = async () => {
    if (!message.trim()) { toast.error(t('bulkMessageRequired')); return; }
    const targets = eligible.filter(e => selectedIds.has(e.id));
    if (targets.length === 0) { toast.error(t('bulkNoRecipients')); return; }

    setSending(true);
    setProgress({ done: 0, total: targets.length });
    const campaignId = crypto.randomUUID();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id ?? null;

    for (let i = 0; i < targets.length; i++) {
      const emp = targets[i];
      const phone = normalizePhoneForWhatsApp(emp.mobile!);
      if (phone.length < 8) {
        await supabase.from('whatsapp_send_attempts' as any).insert({
          employee_id: emp.id, to_number: emp.mobile, message: applyVars(message, emp),
          campaign_id: campaignId, status: 'failed', error_message: 'invalid phone',
          triggered_by: userId,
        });
        setProgress({ done: i + 1, total: targets.length });
        continue;
      }
      const text = applyVars(message, emp);
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank', 'noopener,noreferrer');

      await supabase.from('whatsapp_send_attempts' as any).insert({
        employee_id: emp.id, to_number: phone, message: text,
        campaign_id: campaignId, status: 'opened', triggered_by: userId,
      });

      setProgress({ done: i + 1, total: targets.length });

      if (i < targets.length - 1) {
        const proceed = window.confirm(
          `(${i + 1}/${targets.length}) ${emp.name}\n\n${t('bulkConfirmNext')}`
        );
        if (!proceed) {
          toast.info(t('bulkSkipped'));
          break;
        }
      }
    }

    setSending(false);
    toast.success(t('bulkDone'));
    await loadLogs();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">{t('bulkMessages')}</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('bulkMessageText')}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={6}
            placeholder={lang === 'ar' ? 'مرحباً {name}،...' : 'Hello {name},...'}
            dir="auto"
          />
          <p className="text-xs text-muted-foreground">{t('bulkMessageHint')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('filter')}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">{t('bulkFilterLocation')}</Label>
            <Select value={filterLocation} onValueChange={setFilterLocation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('bulkAll')}</SelectItem>
                {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('bulkFilterDepartment')}</Label>
            <Select value={filterDepartment} onValueChange={setFilterDepartment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('bulkAll')}</SelectItem>
                {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('bulkFilterShift')}</Label>
            <Select value={filterShift} onValueChange={setFilterShift}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('bulkAll')}</SelectItem>
                {shifts.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Checkbox id="active-only" checked={activeOnly} onCheckedChange={v => setActiveOnly(!!v)} />
            <Label htmlFor="active-only" className="text-sm cursor-pointer">{t('bulkActiveOnly')}</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {t('bulkRecipients')}{' '}
            <Badge variant="secondary">{selectedIds.size}/{eligible.length}</Badge>
            {ineligibleCount > 0 && (
              <Badge variant="outline" className="ms-2 text-xs">
                {ineligibleCount} {t('bulkNoMobile')}
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={selectAll}>{t('bulkSelectAll')}</Button>
            <Button size="sm" variant="outline" onClick={clearAll}>{t('bulkClearAll')}</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{lang === 'ar' ? 'الموبايل' : 'Mobile'}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('bulkFilterLocation')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('bulkFilterDepartment')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(e => {
                  const hasMobile = !!(e.mobile && e.mobile.trim());
                  return (
                    <TableRow key={e.id} className={!hasMobile ? 'opacity-50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(e.id)}
                          disabled={!hasMobile}
                          onCheckedChange={() => toggle(e.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {hasMobile ? e.mobile : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{e.location || '-'}</TableCell>
                      <TableCell className="hidden md:table-cell">{e.department || '-'}</TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">—</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 sticky bottom-2 bg-background/80 backdrop-blur p-2 rounded-lg border">
        <Button onClick={handleSendAll} disabled={sending || selectedIds.size === 0} className="gap-2">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? t('bulkSending') : `${t('bulkSendAll')} (${selectedIds.size})`}
        </Button>
        {sending && (
          <span className="text-sm text-muted-foreground">
            {t('bulkProgress')}: {progress.done}/{progress.total}
          </span>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('bulkLog')}</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{lang === 'ar' ? 'الرقم' : 'Number'}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{lang === 'ar' ? 'الوقت' : 'Time'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(l => {
                  const emp = employees.find(e => e.id === l.employee_id);
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{emp?.name || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{l.to_number}</TableCell>
                      <TableCell>
                        <Badge variant={l.status === 'opened' ? 'default' : 'destructive'}>{l.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {l.sent_at ? new Date(l.sent_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US') : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {logs.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">—</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
