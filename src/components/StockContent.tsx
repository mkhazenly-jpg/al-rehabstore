import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  unit_price_at_addition: number;
}

const DEFAULT_CATEGORIES = ['safety shoes', 'vests', 'helmets', 'gloves'];
const UNITS = ['pair', 'piece', 'box'];

export function StockContent() {
  const { t, lang } = useLanguage();
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<StockItem[]>([]);
  const [totalValue, setTotalValue] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [form, setForm] = useState({ name: '', category: 'safety shoes', size: '', quantity_in_stock: 0, unit: 'piece', unit_price: 0 });
  const [existingMatch, setExistingMatch] = useState<StockItem | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
  const [additions, setAdditions] = useState<StockAddition[]>([]);
  const [minThreshold, setMinThreshold] = useState(10);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [thresholdInput, setThresholdInput] = useState('10');
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const categoryOptions = [...DEFAULT_CATEGORIES, ...customCategories];

  useEffect(() => { loadItems(); loadSettings(); }, []);

  const loadItems = async () => {
    const [{ data }, { data: additionsData }] = await Promise.all([
      supabase.from('stock_items').select('*').order('added_date', { ascending: false }),
      supabase.from('stock_additions').select('stock_item_id, quantity_added, unit_price_at_addition'),
    ]);
    setItems(data || []);
    // Calculate total value per item based on each addition's price at the time
    const totals: Record<string, number> = {};
    (additionsData || []).forEach((a: any) => {
      totals[a.stock_item_id] = (totals[a.stock_item_id] || 0) + (a.quantity_added * (a.unit_price_at_addition || 0));
    });
    setTotalValue(totals);
  };

  const loadSettings = async () => {
    const { data } = await supabase.from('app_settings').select('key, value').in('key', ['min_stock_threshold', 'custom_stock_categories']);
    (data || []).forEach((row: any) => {
      if (row.key === 'min_stock_threshold') {
        const val = parseInt(row.value);
        setMinThreshold(val);
        setThresholdInput(String(val));
      } else if (row.key === 'custom_stock_categories') {
        try {
          const parsed = JSON.parse(row.value);
          if (Array.isArray(parsed)) setCustomCategories(parsed);
        } catch { /* ignore */ }
      }
    });
  };

  const saveThreshold = async () => {
    const val = parseInt(thresholdInput) || 10;
    await supabase.from('app_settings').update({ value: String(val) }).eq('key', 'min_stock_threshold');
    setMinThreshold(val);
    setSettingsOpen(false);
    toast.success(t('settingsSaved'));
  };

  const saveNewCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (categoryOptions.some(c => c.toLowerCase() === name.toLowerCase())) {
      toast.error(t('categoryExists'));
      return;
    }
    const next = [...customCategories, name];
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'custom_stock_categories', value: JSON.stringify(next) }, { onConflict: 'key' });
    if (error) {
      toast.error(error.message);
      return;
    }
    setCustomCategories(next);
    setForm(f => ({ ...f, category: name }));
    setAddCategoryOpen(false);
    setNewCategoryName('');
    toast.success(t('categoryAdded'));
  };

  const deleteCustomCategory = async (cat: string) => {
    if (items.some(i => i.category === cat)) {
      toast.error(t('categoryInUse'));
      return;
    }
    const next = customCategories.filter(c => c !== cat);
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'custom_stock_categories', value: JSON.stringify(next) }, { onConflict: 'key' });
    if (error) {
      toast.error(error.message);
      return;
    }
    setCustomCategories(next);
  };

  const filtered = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === 'all' || i.category === categoryFilter;
    return matchSearch && matchCat;
  });

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

  // Check for existing item when category/size changes (only in add mode)
  useEffect(() => {
    if (editItem) {
      setExistingMatch(null);
      return;
    }
    const sizeVal = form.category === 'safety shoes' ? form.size.trim() : 'N/A';
    const match = items.find(
      i => i.category === form.category && i.size.trim() === sizeVal
    );
    setExistingMatch(match || null);
  }, [form.category, form.size, editItem, items]);

  const handleSave = async () => {
    const sizeVal = form.category === 'safety shoes' ? form.size.trim() : 'N/A';
    let stockItemId: string | null = editItem?.id ?? existingMatch?.id ?? null;
    let stockError = null;

    if (editItem) {
      const { error } = await supabase.from('stock_items').update({ ...form, size: sizeVal }).eq('id', editItem.id);
      stockError = error;
    } else if (existingMatch) {
      const updatePayload: { quantity_in_stock: number; unit_price?: number } = {
        quantity_in_stock: existingMatch.quantity_in_stock + form.quantity_in_stock,
      };
      // Update unit price if a new price was entered (> 0)
      if (form.unit_price > 0) {
        updatePayload.unit_price = form.unit_price;
      }
      const { error } = await supabase
        .from('stock_items')
        .update(updatePayload)
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
        unit_price_at_addition: form.unit_price,
      });

      if (additionError) {
        console.error('Failed to log stock addition', additionError);
        return;
      }
    }

    setDialogOpen(false);
    setExistingMatch(null);
    await loadItems();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('stock_items').delete().eq('id', id);
    loadItems();
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

  const handleExport = () => {
    exportToExcel(
      filtered.map(i => ({
        [t('name')]: i.name,
        [t('category')]: i.category,
        [t('size')]: i.size,
        [t('quantity')]: i.quantity_in_stock,
        [t('unitPrice')]: (i as any).unit_price || 0,
        [t('totalPrice')]: totalValue[i.id] || 0,
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
            {categoryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
                {filtered.map(item => (
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
                    <TableCell>{totalValue[item.id] > 0 ? `${totalValue[item.id]} ${t('currency')}` : '-'}</TableCell>
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
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">-</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
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
              <div className="flex items-center justify-between">
                <Label>{t('category')}</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setNewCategoryName(''); setAddCategoryOpen(true); }}>
                  <Plus className="h-3 w-3 me-1" />{t('addCategory')}
                </Button>
              </div>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
              <Input type="number" min={0} value={form.quantity_in_stock === 0 ? '' : form.quantity_in_stock} onChange={e => setForm({ ...form, quantity_in_stock: e.target.value === '' ? 0 : parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label>{t('unitPrice')} ({t('currency')})</Label>
              <Input type="number" min={0} step="0.01" value={form.unit_price === 0 ? '' : form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 })} />
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
                  const price = a.unit_price_at_addition || 0;
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
          {additions.length > 0 && additions.some(a => a.unit_price_at_addition > 0) && (
            <div className="mt-3 p-3 rounded-lg bg-muted text-sm font-medium flex justify-between">
              <span>{t('totalPrice')}</span>
              <span>{additions.reduce((s, a) => s + (a.quantity_added * (a.unit_price_at_addition || 0)), 0)} {t('currency')}</span>
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
            {customCategories.length > 0 && (
              <div className="space-y-2">
                <Label>{t('addCategory')}</Label>
                <div className="flex flex-wrap gap-2">
                  {customCategories.map(c => (
                    <div key={c} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm bg-muted/50">
                      <span>{c}</span>
                      <button
                        type="button"
                        onClick={() => deleteCustomCategory(c)}
                        title={t('deleteCategory')}
                        className="text-destructive hover:text-destructive/80"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button onClick={saveThreshold} className="w-full">{t('save')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('addCategory')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('newCategoryName')}</Label>
              <Input
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveNewCategory(); }}
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAddCategoryOpen(false)}>{t('cancel')}</Button>
              <Button onClick={saveNewCategory}>{t('save')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
