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
import { Send, MessageCircle, Loader2, Paperclip, X, CheckCircle2, AlertCircle, Video, FileText, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables as DBTables } from '@/integrations/supabase/types';

type Employee = DBTables<'employees'>;
type SendLog = Pick<DBTables<'whatsapp_send_attempts'>, 'id' | 'employee_id' | 'to_number' | 'status' | 'sent_at' | 'error_message'>;

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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  const [violatorIds, setViolatorIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [filterLocation, setFilterLocation] = useState<string>(ALL);
  const [filterDepartment, setFilterDepartment] = useState<string>(ALL);
  const [filterShift, setFilterShift] = useState<string>(ALL);
  const [filterViolations, setFilterViolations] = useState<string>(ALL);
  const [filterHireFrom, setFilterHireFrom] = useState<string>('');
  const [filterHireTo, setFilterHireTo] = useState<string>('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [logs, setLogs] = useState<SendLog[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sendSession, setSendSession] = useState<SendSession | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<Attachment[]>([]);
  const fileInputId = 'bulk-attachment-input';

  const loadEmployees = async () => {
    const { data, error } = await supabase.from('employees').select('*').order('name');
    if (error) { toast.error(error.message); return; }
    setEmployees(data || []);
  };

  const loadViolations = async () => {
    const { data } = await supabase.from('employee_violations').select('employee_id');
    setViolatorIds(new Set((data || []).map((v: any) => v.employee_id).filter(Boolean)));
  };

  const loadLogs = async () => {
    const { data } = await supabase.from('whatsapp_send_attempts')
      .select('id, employee_id, to_number, status, sent_at, error_message')
      .order('sent_at', { ascending: false }).limit(100);
    setLogs(data || []);
  };

  useEffect(() => { loadEmployees(); loadLogs(); loadViolations(); }, []);

  const locations = useMemo(() => Array.from(new Set(employees.map(e => e.location).filter(Boolean))) as string[], [employees]);
  const departments = useMemo(() => Array.from(new Set(employees.map(e => e.department).filter(Boolean))) as string[], [employees]);
  const shifts = useMemo(() => Array.from(new Set(employees.map(e => e.shift).filter(Boolean))) as string[], [employees]);

  const filtered = useMemo(() => {
    return employees.filter(e => {
      if (activeOnly && e.status !== 'active') return false;
      if (filterLocation !== ALL && e.location !== filterLocation) return false;
      if (filterDepartment !== ALL && e.department !== filterDepartment) return false;
      if (filterShift !== ALL && e.shift !== filterShift) return false;
      if (filterHireFrom && (!e.hire_date || e.hire_date < filterHireFrom)) return false;
      if (filterHireTo && (!e.hire_date || e.hire_date > filterHireTo)) return false;
      if (filterViolations === 'has' && !violatorIds.has(e.id)) return false;
      if (filterViolations === 'none' && violatorIds.has(e.id)) return false;
      return true;
    });
  }, [employees, activeOnly, filterLocation, filterDepartment, filterShift, filterHireFrom, filterHireTo, filterViolations, violatorIds]);

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

  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);

  useEffect(() => () => {
    attachmentsRef.current.forEach(a => {
      if (a.localUrl) URL.revokeObjectURL(a.localUrl);
    });
  }, []);

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
    const fileItems = Array.from(files).map(file => ({
      file,
      item: {
        id: createId(),
        name: file.name,
        localUrl: URL.createObjectURL(file),
        size: file.size,
        type: file.type || 'application/octet-stream',
        status: 'uploading' as AttachmentStatus,
      },
    }));
    setAttachments(prev => [...prev, ...fileItems.map(({ item }) => item)]);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      const errorText = lang === 'ar' ? 'يجب تسجيل الدخول لرفع الملفات' : 'Login required to upload';
      setAttachments(prev => prev.map(a => fileItems.some(({ item }) => item.id === a.id) ? { ...a, status: 'error', error: errorText } : a));
      toast.error(lang === 'ar' ? 'يجب تسجيل الدخول لرفع الملفات' : 'Login required to upload');
      return;
    }
    setUploading(true);
    const toastId = toast.loading(lang === 'ar' ? 'جارٍ رفع الملفات...' : 'Uploading...');
    try {
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
        const path = `${userData.user.id}/${Date.now()}-${createId()}.${ext}`;
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
    } catch (e: unknown) {
      console.error(e);
      toast.error(getErrorMessage(e, 'Upload failed'), { id: toastId });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const uploadedAttachments = useMemo(() => attachments.filter(a => a.status === 'uploaded' && a.url), [attachments]);

  const isImage = (a: Attachment) => a.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(a.url || a.localUrl || '');

  const getAttachmentIcon = (a: Attachment) => {
    if (a.type.startsWith('video/')) return <Video className="h-5 w-5 text-muted-foreground" />;
    if (a.type.includes('pdf') || a.type.includes('presentation') || a.type.includes('spreadsheet') || /\.(pdf|pptx?|xlsx?)(\?|$)/i.test(a.name)) {
      return <FileText className="h-5 w-5 text-muted-foreground" />;
    }
    return <Paperclip className="h-5 w-5 text-muted-foreground" />;
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const removed = prev.find(a => a.id === id);
      if (removed?.localUrl) URL.revokeObjectURL(removed.localUrl);
      return prev.filter(a => a.id !== id);
    });
  };

  const buildFinalMessage = (template: string, emp: Employee) => {
    let text = applyVars(template, emp);
    if (uploadedAttachments.length > 0) {
      const links = uploadedAttachments.map(a => `📎 ${a.name}\n${a.url}`).join('\n\n');
      text = text ? `${text}\n\n${links}` : links;
    }
    return text;
  };

  const openCurrentRecipient = async () => {
    if (!sendSession || sendingRef.current) return;
    const item = sendSession.queue[sendSession.index];
    if (!item) {
      saveSendSession(null);
      toast.success(t('bulkDone'));
      await loadLogs();
      return;
    }

    sendingRef.current = true;
    setSending(true);
    const nextSession: SendSession = {
      ...sendSession,
      queue: sendSession.queue.map((q, idx) => idx === sendSession.index ? { ...q, status: 'opened' } : q),
      index: sendSession.index + 1,
    };
    saveSendSession(nextSession);
    setProgress({ done: nextSession.index, total: nextSession.queue.length });

    try {
      await supabase.from('whatsapp_send_attempts').insert({
        employee_id: item.employeeId,
        to_number: item.phone,
        message: item.text,
        campaign_id: sendSession.campaignId,
        status: 'opened',
        triggered_by: sendSession.userId,
      });
      await loadLogs();
    } catch (e: unknown) {
      console.error(e);
      toast.error(getErrorMessage(e, lang === 'ar' ? 'تعذر تسجيل الإرسال' : 'Could not log send'));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }

    window.location.href = `https://wa.me/${item.phone}?text=${encodeURIComponent(item.text)}`;
  };

  const cancelSendSession = () => {
    saveSendSession(null);
    setProgress({ done: 0, total: 0 });
    toast.info(t('bulkSkipped'));
  };

  const handleSendAll = async () => {
    // Prevent rapid double-clicks via synchronous ref guard
    if (sendingRef.current) return;
    if (!message.trim() && uploadedAttachments.length === 0) { toast.error(t('bulkMessageRequired')); return; }
    if (attachments.some(a => a.status === 'uploading')) {
      toast.error(lang === 'ar' ? 'انتظر حتى يكتمل رفع الملفات' : 'Wait until uploads finish');
      return;
    }
    if (attachments.some(a => a.status === 'error')) {
      toast.error(lang === 'ar' ? 'احذف الملفات التي فشل رفعها أو أعد رفعها قبل الإرسال' : 'Remove failed uploads or upload them again before sending');
      return;
    }
    const targets = eligible.filter(e => selectedIds.has(e.id));
    if (targets.length === 0) { toast.error(t('bulkNoRecipients')); return; }

    sendingRef.current = true;
    setSending(true);
    setProgress({ done: 0, total: targets.length });
    const campaignId = crypto.randomUUID();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id ?? null;

    try {
      const seen = new Set<string>();
      const queue: SendQueueItem[] = [];

      for (const emp of targets) {
        if (seen.has(emp.id)) continue;
        seen.add(emp.id);
        const phone = normalizePhoneForWhatsApp(emp.mobile || '');
        const text = buildFinalMessage(message, emp);
        if (phone.length < 8) {
          await supabase.from('whatsapp_send_attempts').insert({
            employee_id: emp.id, to_number: emp.mobile || '', message: text,
            campaign_id: campaignId, status: 'failed', error_message: 'invalid phone',
            triggered_by: userId,
          });
          continue;
        }
        queue.push({ employeeId: emp.id, name: emp.name, phone, text, status: 'pending' });
      }

      if (queue.length === 0) {
        toast.error(t('bulkNoRecipients'));
        await loadLogs();
        return;
      }

      saveSendSession({ campaignId, userId, queue, index: 0 });
      setProgress({ done: 0, total: queue.length });
      toast.success(lang === 'ar' ? `تم تجهيز ${queue.length} رسالة. اضغط فتح التالي للإرسال.` : `${queue.length} messages queued. Press open next to send.`);
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
              <Button
                type="button"
                variant="outline"
                disabled={uploading || sending}
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                {lang === 'ar' ? 'إرفاق ملفات (صور/فيديو/PDF/PPT/Excel)' : 'Attach files (image/video/PDF/PPT/Excel)'}
              </Button>
              <input
                id={fileInputId}
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED}
                className="hidden"
                disabled={uploading || sending}
                onChange={e => handleFiles(e.target.files)}
              />
              <span className="text-xs text-muted-foreground">
                {lang === 'ar' ? `حد أقصى ${MAX_FILE_MB} ميجا للملف` : `Max ${MAX_FILE_MB}MB per file`}
              </span>
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map(a => (
                  <div key={a.id} className="relative flex items-center gap-2 border rounded-md p-2 bg-muted/30 max-w-[280px]">
                    {isImage(a) ? (
                      <img src={a.url || a.localUrl} alt={a.name} className="h-12 w-12 object-cover rounded" />
                    ) : (
                      <div className="h-12 w-12 flex items-center justify-center bg-background rounded border">
                        {getAttachmentIcon(a)}
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium truncate max-w-[160px]">{a.name}</span>
                      <span className="text-[10px] text-muted-foreground">{(a.size / 1024).toFixed(1)} KB</span>
                      <span className="text-[10px] flex items-center gap-1 text-muted-foreground">
                        {a.status === 'uploading' && <><Loader2 className="h-3 w-3 animate-spin" />{lang === 'ar' ? 'جارٍ الرفع' : 'Uploading'}</>}
                        {a.status === 'uploaded' && <><CheckCircle2 className="h-3 w-3 text-primary" />{lang === 'ar' ? 'جاهز للإرسال' : 'Ready'}</>}
                        {a.status === 'error' && <><AlertCircle className="h-3 w-3 text-destructive" />{a.error || (lang === 'ar' ? 'فشل الرفع' : 'Failed')}</>}
                      </span>
                    </div>
                    {a.url && (
                      <a href={a.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary" aria-label="open attachment">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      onClick={() => removeAttachment(a.id)}
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

      <div className="flex flex-wrap items-center gap-3 sticky bottom-2 bg-background/80 backdrop-blur p-2 rounded-lg border">
        <Button
          onClick={handleSendAll}
          disabled={sending || uploading || selectedIds.size === 0 || !!sendSession}
          aria-disabled={sending || uploading}
          className="gap-2"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? t('bulkSending') : sendSession ? (lang === 'ar' ? 'الإرسال قيد التنفيذ' : 'Sending in progress') : `${t('bulkSendAll')} (${selectedIds.size})`}
        </Button>
        {sendSession && sendSession.index < sendSession.queue.length && (
          <>
            <Button onClick={openCurrentRecipient} disabled={sending} variant="secondary" className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              {lang === 'ar' ? `فتح التالي: ${sendSession.queue[sendSession.index]?.name}` : `Open next: ${sendSession.queue[sendSession.index]?.name}`}
            </Button>
            <Button onClick={cancelSendSession} disabled={sending} variant="outline">
              {lang === 'ar' ? 'إلغاء الباقي' : 'Cancel remaining'}
            </Button>
          </>
        )}
        {(sending || sendSession) && (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {t('bulkProgress')}: {sendSession ? sendSession.index : progress.done}/{sendSession ? sendSession.queue.length : progress.total}
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
