import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
import { useDebounce } from '@/hooks/use-debounce';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataPagination } from '@/components/ui/data-pagination';
import { Plus, Pencil, Trash2, Download, Search, AlertTriangle, History, Info, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/export';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { Tables } from '@/integrations/supabase/types';

type StockItem = Tables<'stock_items'>;

interface StockAddition {
  id: string;
  stock_item_id: string;
  quantity_added: number;
  added_at: string;
  notes: string | null;
}

const CATEGORIES = ['safety shoes', 'vests', 'helmets', 'gloves', 'other'];
const UNITS = ['pair', 'piece', 'box'];
const PAGE_SIZE = 50;

export function StockContent() {
  const { t, lang } = useLanguage();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebounce(search, 300);

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0); }, [debouncedSearch, categoryFilter]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [form, setForm] = useState({ name: '', category: 'safety shoes', size: '', quantity_in_stock: 0, unit: 'piece', unit_price: 0 });
  const [existingMatch, setExistingMatch] = useState<StockItem | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
  const [additions, setAdditions] = useState<StockAddition[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [thresholdInput, setThresholdInput] = useState('10');

  // Settings query
  const { data: minThreshold = 10 } = useQuery({
    queryKey: ['app_settings', 'min_stock_threshold'],
    queryFn: async () => {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'min_stock_threshold').maybeSingle();
      const val = data ? parseInt(data.value) || 10 : 10;
      return val;
    },
  });

  useEffect(() => { setThresholdInput(String(minThreshold)); }, [minThreshold]);

  // Paginated stock items query — server-side filtering + pagination
  const { data: stockData, isLoading } = useQuery({
    queryKey: ['stock_items', { search: debouncedSearch, category: categoryFilter, page }],
    queryFn: async () => {
      let q = supabase.from('stock_items').select('*', { count: 'exact' });
      if (debouncedSearch.trim()) q = q.ilike('name', `%${debouncedSearch.trim()}%`);
      if (categoryFilter !== 'all') q = q.eq('category', categoryFilter);
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await q.order('added_date', { ascending: false }).range(from, to);
      return { items: (data || []) as StockItem[], total: count || 0 };
    },
  });

  const items = stockData?.items || [];
  const total = stockData?.total || 0;

  // Total added per visible item only (lightweight)
  const { data: totalAdded = {} } = useQuery({
    queryKey: ['stock_additions_totals', items.map(i => i.id).sort().join(',')],
    queryFn: async () => {
      if (items.length === 0) return {};
      const { data } = await supabase
        .from('stock_additions')
        .select('stock_item_id, quantity_added')
        .in('stock_item_id', items.map(i => i.id));
      const totals: Record<string, number> = {};
      (data || []).forEach((a: any) => {
        totals[a.stock_item_id] = (totals[a.stock_item_id] || 0) + a.quantity_added;
      });
      return totals;
    },
    enabled: items.length > 0,
  });

  const invalidateStock = () => {
    qc.invalidateQueries({ queryKey: ['stock_items'] });
    qc.invalidateQueries({ queryKey: ['stock_additions_totals'] });
  };

  const saveThresholdMut = useMutation({
    mutationFn: async (val: number) => {
      await supabase.from('app_settings').update({ value: String(val) }).eq('key', 'min_stock_threshold');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app_settings'] });
      setSettingsOpen(false);
      toast.success(t('settingsSaved'));
    },
  });

  const saveThreshold = () => {
    const val = parseInt(thresholdInput) || 10;
    saveThresholdMut.mutate(val);
  };

  const openAdd = () => {
    setEditItem(null);
    setExistingMatch(null);
    setForm({ name: '', category: 'safety shoes', size: '', quantity_in_stock: 0, unit: 'piece', unit_price: 0 });
    setDialogOpen(true);
  };

  const openEdit = (item: StockItem) => {
    setEditItem(item);
    setExistingMatch(null);
    setForm({ name: item.name, category: item.category, size: item.size, quantity_in_stock: item.quantity_in_stock, unit: item.unit, unit_price: (item as any).unit_price || 0 });
    setDialogOpen(true);
  };

  // Check for existing item when name/category/size changes (only in add mode)
  useEffect(() => {
    if (editItem || !form.name.trim()) {
      setExistingMatch(null);
      return;
    }
    const sizeVal = form.category === 'safety shoes' ? form.size.trim() : 'N/A';
    const match = items.find(
      i => i.name.trim().toLowerCase() === form.name.trim().toLowerCase() &&
           i.category === form.category &&
           i.size.trim() === sizeVal
    );
    setExistingMatch(match || null);
  }, [form.name, form.category, form.size, editItem, items]);

  const handleSave = async () => {
    const sizeVal = form.category === 'safety shoes' ? form.size.trim() : 'N/A';
    let stockItemId: string | null = editItem?.id ?? existingMatch?.id ?? null;
    let stockError = null;

    if (editItem) {
      const { error } = await supabase.from('stock_items').update({ ...form, size: sizeVal }).eq('id', editItem.id);
      stockError = error;
    } else if (existingMatch) {
      const { error } = await supabase
        .from('stock_items')
        .update({ quantity_in_stock: existingMatch.quantity_in_stock + form.quantity_in_stock })
        .eq('id', existingMatch.id);
      stockError = error;
    } else {
      const { data, error } = await supabase.from('stock_items').insert({ ...form, size: sizeVal }).select('id').single();
      stockError = error;
      stockItemId = data?.id ?? null;
    }

    if (stockError || !stockItemId) {
      console.error('Failed to save stock item', stockError);
      return;
    }

    if (!editItem) {
      const { error: additionError } = await supabase.from('stock_additions').insert({
        stock_item_id: stockItemId,
        quantity_added: form.quantity_in_stock,
      });
      if (additionError) {
        console.error('Failed to log stock addition', additionError);
        return;
      }
    }

    setDialogOpen(false);
    setExistingMatch(null);
    invalidateStock();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('stock_items').delete().eq('id', id);
    invalidateStock();
  };

  const openHistory = async (item: StockItem) => {
    setHistoryItem(item);
    const { data } = await supabase
      .from('stock_additions')
      .select('*')
      .eq('stock_item_id', item.id)
      .order('added_at', { ascending: false });
    setAdditions((data as StockAddition[]) || []);
    setHistoryDialogOpen(true);
  };

  const handleExport = async () => {
    // Fetch all matching rows for export (bypass pagination)
    let q = supabase.from('stock_items').select('*');
    if (debouncedSearch.trim()) q = q.ilike('name', `%${debouncedSearch.trim()}%`);
    if (categoryFilter !== 'all') q = q.eq('category', categoryFilter);
    const { data: all } = await q.order('added_date', { ascending: false });
    const rows = (all || []) as StockItem[];

    // Get totals for these items
    const { data: addsData } = await supabase
      .from('stock_additions')
      .select('stock_item_id, quantity_added')
      .in('stock_item_id', rows.map(r => r.id));
    const totals: Record<string, number> = {};
    (addsData || []).forEach((a: any) => {
      totals[a.stock_item_id] = (totals[a.stock_item_id] || 0) + a.quantity_added;
    });

    exportToExcel(
      rows.map(i => ({
        [t('name')]: i.name,
        [t('category')]: i.category,
        [t('size')]: i.size,
        [t('quantity')]: i.quantity_in_stock,
        [t('unitPrice')]: (i as any).unit_price || 0,
        [t('totalPrice')]: ((i as any).unit_price || 0) * (totals[i.id] || i.quantity_in_stock),
        [t('unit')]: i.unit,
        [t('addedDate')]: new Date(i.added_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US'),
      })),
      'stock_items'
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('stock')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 me-1" />{t('exportExcel')}
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 me-1" />{t('addStock')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="ps-9" placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allCategories')}</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('category')}</TableHead>
                  <TableHead>{t('size')}</TableHead>
                  <TableHead>{t('quantity')}</TableHead>
                  <TableHead>{t('unitPrice')}</TableHead>
                  <TableHead>{t('totalPrice')}</TableHead>
                  <TableHead>{t('unit')}</TableHead>
                  <TableHead>{t('addedDate')}</TableHead>
                  {isAdmin && <TableHead>{t('actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>{item.size}</TableCell>
                    <TableCell>
                      <span className={`flex items-center gap-1 ${item.quantity_in_stock <= minThreshold ? 'text-destructive font-bold' : ''}`}>
                        {item.quantity_in_stock}
                        {item.quantity_in_stock <= minThreshold && <AlertTriangle className="h-4 w-4 text-destructive" />}
                      </span>
                    </TableCell>
                    <TableCell>{(item as any).unit_price > 0 ? `${(item as any).unit_price} ${t('currency')}` : '-'}</TableCell>
                    <TableCell>{(item as any).unit_price > 0 ? `${(item as any).unit_price * (totalAdded[item.id] || item.quantity_in_stock)} ${t('currency')}` : '-'}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>{new Date(item.added_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openHistory(item)} title={t('additionHistory')}>
                            <History className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      {isLoading ? t('loading') : '-'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DataPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? t('editStock') : t('addStock')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {existingMatch && !editItem && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>{t('itemExists')}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label>{t('name')}</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('category')}</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.category === 'safety shoes' && (
              <div className="space-y-2">
                <Label>{t('size')}</Label>
                <Input value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} placeholder="40, 41, 42..." />
              </div>
            )}
            <div className="space-y-2">
              <Label>{existingMatch && !editItem ? t('quantityAdded') : t('quantity')}</Label>
              <Input type="number" min={0} value={form.quantity_in_stock} onChange={e => setForm({ ...form, quantity_in_stock: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label>{t('unitPrice')} ({t('currency')})</Label>
              <Input type="number" min={0} step="0.01" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Select value={form.unit} onValueChange={v => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel')}</Button>
              <Button onClick={handleSave}>{t('save')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Addition History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('additionHistory')} - {historyItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto max-h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('quantityAdded')}</TableHead>
                  <TableHead>{t('unitPrice')}</TableHead>
                  <TableHead>{t('totalPrice')}</TableHead>
                  <TableHead>{t('additionDate')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {additions.map(a => {
                  const price = (historyItem as any)?.unit_price || 0;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">+{a.quantity_added}</TableCell>
                      <TableCell>{price > 0 ? `${price} ${t('currency')}` : '-'}</TableCell>
                      <TableCell>{price > 0 ? `${price * a.quantity_added} ${t('currency')}` : '-'}</TableCell>
                      <TableCell>{new Date(a.added_at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</TableCell>
                    </TableRow>
                  );
                })}
                {additions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-4">-</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {additions.length > 0 && (historyItem as any)?.unit_price > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-muted text-sm font-medium flex justify-between">
              <span>{t('totalPrice')}</span>
              <span>{(historyItem as any).unit_price * additions.reduce((s, a) => s + a.quantity_added, 0)} {t('currency')}</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('settings')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('minStockThreshold')}</Label>
              <Input
                type="number"
                min={1}
                value={thresholdInput}
                onChange={e => setThresholdInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {lang === 'ar' ? 'الأصناف التي تصل لهذا الرقم أو أقل ستظهر بعلامة تحذير حمراء' : 'Items at or below this number will show a red warning'}
              </p>
            </div>
            <Button onClick={saveThreshold} className="w-full">{t('save')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
