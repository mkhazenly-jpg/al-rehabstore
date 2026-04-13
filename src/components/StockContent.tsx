import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Download, Search, AlertTriangle } from 'lucide-react';
import { exportToExcel } from '@/lib/export';
import type { Tables } from '@/integrations/supabase/types';

type StockItem = Tables<'stock_items'>;

const CATEGORIES = ['safety shoes', 'vests', 'helmets', 'gloves', 'other'];
const UNITS = ['pair', 'piece', 'box'];

export function StockContent() {
  const { t, lang } = useLanguage();
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<StockItem[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [form, setForm] = useState({ name: '', category: 'safety shoes', size: '', quantity_in_stock: 0, unit: 'piece' });

  useEffect(() => { loadItems(); }, []);

  const loadItems = async () => {
    const { data } = await supabase.from('stock_items').select('*').order('added_date', { ascending: false });
    setItems(data || []);
  };

  const filtered = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === 'all' || i.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const openAdd = () => {
    setEditItem(null);
    setForm({ name: '', category: 'safety shoes', size: '', quantity_in_stock: 0, unit: 'piece' });
    setDialogOpen(true);
  };

  const openEdit = (item: StockItem) => {
    setEditItem(item);
    setForm({ name: item.name, category: item.category, size: item.size, quantity_in_stock: item.quantity_in_stock, unit: item.unit });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const sizeVal = form.category === 'safety shoes' ? form.size : 'N/A';
    if (editItem) {
      await supabase.from('stock_items').update({ ...form, size: sizeVal }).eq('id', editItem.id);
    } else {
      await supabase.from('stock_items').insert({ ...form, size: sizeVal });
    }
    setDialogOpen(false);
    loadItems();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('stock_items').delete().eq('id', id);
    loadItems();
  };

  const handleExport = () => {
    exportToExcel(
      filtered.map(i => ({
        [t('name')]: i.name,
        [t('category')]: i.category,
        [t('size')]: i.size,
        [t('quantity')]: i.quantity_in_stock,
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
                      <span className={`flex items-center gap-1 ${item.quantity_in_stock < 5 ? 'text-destructive font-medium' : ''}`}>
                        {item.quantity_in_stock}
                        {item.quantity_in_stock < 5 && <AlertTriangle className="h-3 w-3" />}
                      </span>
                    </TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>{new Date(item.added_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex gap-1">
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
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">-</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? t('editStock') : t('addStock')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
              <Label>{t('quantity')}</Label>
              <Input type="number" min={0} value={form.quantity_in_stock} onChange={e => setForm({ ...form, quantity_in_stock: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label>{t('unit')}</Label>
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
    </div>
  );
}
