import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Send, MessageCircle, Loader2, Paperclip, X, CheckCircle2, AlertCircle, ImageIcon, Video, FileText, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables as DBTables } from '@/integrations/supabase/types';

type Employee = DBTables<'employees'>;

const ALL = '__all__';
const ATTACHMENT_BUCKET = 'bulk-attachments';
const MAX_FILE_MB = 25;
const SEND_SESSION_KEY = 'bulk-whatsapp-send-session';
const ACCEPTED = [
  'image/*', 'video/*',
  '.pdf', '.ppt', '.pptx', '.xls', '.xlsx',
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

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

type AttachmentStatus = 'uploading' | 'uploaded' | 'error';
type Attachment = {
  id: string;
  name: string;
  url?: string;
  localUrl?: string;
  size: number;
  type: string;
  status: AttachmentStatus;
  error?: string;
};

type SendQueueItem = {
  employeeId: string;
  name: string;
  phone: string;
  text: string;
  status: 'pending' | 'opened' | 'failed';
  error?: string;
};

type SendSession = {
  campaignId: string;
  userId: string | null;
  queue: SendQueueItem[];
  index: number;
};

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
  const sendingRef = useRef(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [logs, setLogs] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sendSession, setSendSession] = useState<SendSession | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const saved = window.localStorage.getItem(SEND_SESSION_KEY);
    if (!saved) return;
    try {
      const session = JSON.parse(saved) as SendSession;
      if (session.queue?.length && session.index < session.queue.length) setSendSession(session);
      else window.localStorage.removeItem(SEND_SESSION_KEY);
    } catch {
      window.localStorage.removeItem(SEND_SESSION_KEY);
    }
  }, []);

  useEffect(() => {
    return () => {
      attachments.forEach(a => {
        if (a.localUrl) URL.revokeObjectURL(a.localUrl);
      });
    };
  }, [attachments]);

  const saveSendSession = (session: SendSession | null) => {
    setSendSession(session);
    if (session && session.index < session.queue.length) {
      window.localStorage.setItem(SEND_SESSION_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(SEND_SESSION_KEY);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      toast.error(lang === 'ar' ? 'يجب تسجيل الدخول لرفع الملفات' : 'Login required to upload');
      return;
    }
    setUploading(true);
    const toastId = toast.loading(lang === 'ar' ? 'جارٍ رفع الملفات...' : 'Uploading...');
    try {
      const fileItems = Array.from(files).map(file => ({
        file,
        item: {
          id: crypto.randomUUID(),
          name: file.name,
          localUrl: URL.createObjectURL(file),
          size: file.size,
          type: file.type || 'application/octet-stream',
          status: 'uploading' as AttachmentStatus,
        },
      }));
      setAttachments(prev => [...prev, ...fileItems.map(({ item }) => item)]);

      let uploaded = 0;
      let failed = 0;
      for (const { file, item } of fileItems) {
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          setAttachments(prev => prev.map(a => a.id === item.id ? { ...a, status: 'error', error: `> ${MAX_FILE_MB}MB` } : a));
          toast.error(`${file.name}: > ${MAX_FILE_MB}MB`);
          failed++;
          continue;
        }
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
          contentType: file.type || 'application/octet-stream', upsert: false,
        });
        if (error) {
          console.error('Upload error:', error);
          setAttachments(prev => prev.map(a => a.id === item.id ? { ...a, status: 'error', error: error.message } : a));
          toast.error(`${file.name}: ${error.message}`);
          failed++;
          continue;
        }
        const { data: pub } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path);
        setAttachments(prev => prev.map(a => a.id === item.id ? { ...a, status: 'uploaded', url: pub.publicUrl } : a));
        uploaded++;
      }
      if (uploaded) {
        toast.success(
          lang === 'ar'
            ? `تم رفع ${uploaded} ملف بنجاح${failed ? ` وفشل ${failed}` : ''}`
            : `Uploaded ${uploaded} file(s)${failed ? `, ${failed} failed` : ''}`,
          { id: toastId }
        );
      } else {
        toast.error(
          lang === 'ar' ? 'لم يتم رفع أي ملف' : 'No files uploaded',
          { id: toastId }
        );
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Upload failed', { id: toastId });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const isImage = (url: string) => /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url);

  const removeAttachment = (url: string) => {
    setAttachments(prev => prev.filter(a => a.url !== url));
  };

  const buildFinalMessage = (template: string, emp: Employee) => {
    let text = applyVars(template, emp);
    if (attachments.length > 0) {
      const links = attachments.map(a => `📎 ${a.name}\n${a.url}`).join('\n\n');
      text = text ? `${text}\n\n${links}` : links;
    }
    return text;
  };

  const handleSendAll = async () => {
    // Prevent rapid double-clicks via synchronous ref guard
    if (sendingRef.current) return;
    if (!message.trim() && attachments.length === 0) { toast.error(t('bulkMessageRequired')); return; }
    const targets = eligible.filter(e => selectedIds.has(e.id));
    if (targets.length === 0) { toast.error(t('bulkNoRecipients')); return; }

    sendingRef.current = true;
    setSending(true);
    setProgress({ done: 0, total: targets.length });
    const campaignId = crypto.randomUUID();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id ?? null;

    // Track which employees were already logged in this campaign to avoid duplicates
    const sentInCampaign = new Set<string>();

    try {
      for (let i = 0; i < targets.length; i++) {
        const emp = targets[i];
        if (sentInCampaign.has(emp.id)) {
          setProgress({ done: i + 1, total: targets.length });
          continue;
        }

        const phone = normalizePhoneForWhatsApp(emp.mobile!);
        if (phone.length < 8) {
          await supabase.from('whatsapp_send_attempts' as any).insert({
            employee_id: emp.id, to_number: emp.mobile, message: buildFinalMessage(message, emp),
            campaign_id: campaignId, status: 'failed', error_message: 'invalid phone',
            triggered_by: userId,
          });
          sentInCampaign.add(emp.id);
          setProgress({ done: i + 1, total: targets.length });
          continue;
        }

        const text = buildFinalMessage(message, emp);
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank', 'noopener,noreferrer');

        await supabase.from('whatsapp_send_attempts' as any).insert({
          employee_id: emp.id, to_number: phone, message: text,
          campaign_id: campaignId, status: 'opened', triggered_by: userId,
        });
        sentInCampaign.add(emp.id);

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
      toast.success(t('bulkDone'));
      await loadLogs();
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">{t('bulkMessages')}</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('bulkMessageText')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={6}
            placeholder={lang === 'ar' ? 'مرحباً {name}،...' : 'Hello {name},...'}
            dir="auto"
          />
          <p className="text-xs text-muted-foreground">{t('bulkMessageHint')}</p>

          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED}
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading || sending}
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                {lang === 'ar' ? 'إرفاق ملفات (صور/فيديو/PDF/PPT/Excel)' : 'Attach files (image/video/PDF/PPT/Excel)'}
              </Button>
              <span className="text-xs text-muted-foreground">
                {lang === 'ar' ? `حد أقصى ${MAX_FILE_MB} ميجا للملف` : `Max ${MAX_FILE_MB}MB per file`}
              </span>
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map(a => (
                  <div key={a.url} className="relative flex items-center gap-2 border rounded-md p-2 bg-muted/30 max-w-[260px]">
                    {isImage(a.url) ? (
                      <img src={a.url} alt={a.name} className="h-12 w-12 object-cover rounded" />
                    ) : (
                      <div className="h-12 w-12 flex items-center justify-center bg-background rounded border">
                        <Paperclip className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium truncate max-w-[160px]">{a.name}</span>
                      <span className="text-[10px] text-muted-foreground">{(a.size / 1024).toFixed(1)} KB</span>
                    </div>
                    <button
                      onClick={() => removeAttachment(a.url)}
                      className="ms-1 text-muted-foreground hover:text-destructive"
                      type="button"
                      aria-label="remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {attachments.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {lang === 'ar'
                  ? 'سيتم إرفاق روابط الملفات تلقائيًا في الرسالة.'
                  : 'File links will be appended to the message automatically.'}
              </p>
            )}
          </div>
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
        <Button
          onClick={handleSendAll}
          disabled={sending || uploading || selectedIds.size === 0}
          aria-disabled={sending || uploading}
          className="gap-2"
        >
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
