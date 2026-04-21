import * as XLSX from 'xlsx-js-style';
import { supabase } from '@/integrations/supabase/client';

// Brand-aligned palette (HEX equivalents of the app's emerald/amber theme)
const COLORS = {
  primary: '2F8F6E',      // emerald (matches --primary)
  primaryDark: '1E6B52',
  accent: 'E0A93D',       // amber (matches --accent)
  headerText: 'FFFFFF',
  alt: 'F1F8F5',          // very light emerald for zebra rows
  border: 'D9E5DF',
  titleBg: '0F4C3A',      // deep emerald for title banner
  danger: 'C0392B',
  success: '2F8F6E',
  warning: 'E0A93D',
  muted: '6B7280',
};

type Row = Record<string, string | number | null | undefined>;

interface SheetSpec {
  name: string;
  title: string;
  headers: string[];
  rows: Row[];
  /** Columns whose values should be rendered as currency */
  currencyCols?: string[];
}

const thin = { style: 'thin' as const, color: { rgb: COLORS.border } };
const border = { top: thin, bottom: thin, left: thin, right: thin };

function buildSheet(spec: SheetSpec): XLSX.WorkSheet {
  const { title, headers, rows, currencyCols = [] } = spec;
  const aoa: (string | number | null)[][] = [];

  // Title row
  aoa.push([title]);
  // Spacer
  aoa.push([]);
  // Headers
  aoa.push(headers);
  // Data
  rows.forEach((r) => {
    aoa.push(headers.map((h) => (r[h] === undefined || r[h] === null ? '' : (r[h] as string | number))));
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const lastCol = headers.length - 1;
  const lastRow = aoa.length - 1;

  // Merge title across all columns
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }];

  // Title styling
  const titleCell = ws['A1'];
  if (titleCell) {
    titleCell.s = {
      font: { bold: true, sz: 16, color: { rgb: COLORS.headerText }, name: 'Cairo' },
      fill: { patternType: 'solid', fgColor: { rgb: COLORS.titleBg } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
  }
  // Title row height
  ws['!rows'] = [{ hpt: 30 }, { hpt: 8 }];

  // Header row styling (row index 2 -> excel row 3)
  for (let c = 0; c <= lastCol; c++) {
    const addr = XLSX.utils.encode_cell({ r: 2, c });
    if (!ws[addr]) ws[addr] = { t: 's', v: headers[c] };
    ws[addr].s = {
      font: { bold: true, color: { rgb: COLORS.headerText }, name: 'Cairo', sz: 11 },
      fill: { patternType: 'solid', fgColor: { rgb: COLORS.primary } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border,
    };
  }
  ws['!rows']![2] = { hpt: 26 };

  // Data row styling (zebra)
  for (let r = 3; r <= lastRow; r++) {
    const isAlt = (r - 3) % 2 === 1;
    for (let c = 0; c <= lastCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      const isCurrency = currencyCols.includes(headers[c]);
      ws[addr].s = {
        font: { name: 'Cairo', sz: 10, color: { rgb: '1F2937' } },
        fill: isAlt ? { patternType: 'solid', fgColor: { rgb: COLORS.alt } } : undefined,
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border,
        numFmt: isCurrency ? '#,##0.00' : undefined,
      };
    }
  }

  // Column widths based on content
  ws['!cols'] = headers.map((h, c) => {
    let max = h.length;
    rows.forEach((r) => {
      const v = r[h];
      const len = v === null || v === undefined ? 0 : String(v).length;
      if (len > max) max = len;
    });
    return { wch: Math.min(Math.max(max + 4, 12), 45) };
  });

  // Freeze title + header
  ws['!freeze'] = { xSplit: 0, ySplit: 3 };
  (ws as any)['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4', activePane: 'bottomLeft' }];

  return ws;
}

function fmtDate(value: string | null | undefined, locale = 'ar-EG'): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(locale);
  } catch {
    return String(value);
  }
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface BackupOptions {
  lang: 'ar' | 'en';
  t: (k: string) => string;
}

export async function exportFullBackup({ lang, t }: BackupOptions): Promise<void> {
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';

  // Fetch everything in parallel
  const [
    { data: stockItems },
    { data: stockAdds },
    { data: employees },
    { data: assignments },
    { data: violations },
  ] = await Promise.all([
    supabase.from('stock_items').select('*').order('name'),
    supabase.from('stock_additions').select('*').order('added_at', { ascending: false }),
    supabase.from('employees').select('*').order('name'),
    supabase.from('assignments').select('*').order('assignment_date', { ascending: false }),
    supabase.from('employee_violations').select('*').order('violation_date', { ascending: false }),
  ]);

  const items = stockItems || [];
  const adds = stockAdds || [];
  const emps = employees || [];
  const asns = assignments || [];
  const viols = violations || [];

  const empMap = new Map(emps.map((e) => [e.id, e]));
  const itemMap = new Map(items.map((i) => [i.id, i]));

  // ---------- OVERVIEW ----------
  const totalStockValue = items.reduce((s, i) => s + num(i.quantity_in_stock) * num(i.unit_price), 0);
  const totalPurchaseCost = adds.reduce((s, a) => s + num(a.quantity_added) * num(a.unit_price_at_addition), 0);
  const totalAssignedValue = asns
    .filter((a) => a.status === 'approved' || a.status === 'returned' || a.status === 'replaced')
    .reduce((s, a) => s + num(a.quantity_assigned) * num(a.unit_price_at_assignment), 0);
  const totalDeductions = viols.reduce((s, v) => s + num(v.deduction_amount), 0);

  const overviewRows: Row[] = [
    { [t('details')]: t('totalStock'), [t('quantity')]: items.length, [t('totalPrice')]: '' },
    { [t('details')]: t('activeEmployees'), [t('quantity')]: emps.filter((e) => e.status === 'active').length, [t('totalPrice')]: '' },
    { [t('details')]: t('assignments'), [t('quantity')]: asns.length, [t('totalPrice')]: '' },
    { [t('details')]: t('violations'), [t('quantity')]: viols.length, [t('totalPrice')]: '' },
    { [t('details')]: t('totalPurchaseCost'), [t('quantity')]: '', [t('totalPrice')]: totalPurchaseCost },
    { [t('details')]: lang === 'ar' ? 'قيمة المخزون الحالي' : 'Current Stock Value', [t('quantity')]: '', [t('totalPrice')]: totalStockValue },
    { [t('details')]: lang === 'ar' ? 'قيمة الأصناف المسلمة' : 'Assigned Items Value', [t('quantity')]: '', [t('totalPrice')]: totalAssignedValue },
    { [t('details')]: lang === 'ar' ? 'إجمالي الخصومات' : 'Total Deductions', [t('quantity')]: '', [t('totalPrice')]: totalDeductions },
  ];

  // ---------- STOCK ----------
  const stockRows: Row[] = items.map((i) => ({
    [t('name')]: i.name,
    [t('category')]: i.category,
    [t('size')]: i.size,
    [t('unit')]: i.unit,
    [t('quantity')]: num(i.quantity_in_stock),
    [t('unitPrice')]: num(i.unit_price),
    [t('totalPrice')]: num(i.quantity_in_stock) * num(i.unit_price),
    [t('addedDate')]: fmtDate(i.added_date, locale),
  }));

  // ---------- ADDITIONS ----------
  const addsRows: Row[] = adds.map((a) => {
    const it = itemMap.get(a.stock_item_id);
    return {
      [t('stockItem')]: it?.name || '-',
      [t('category')]: it?.category || '-',
      [t('quantityAdded')]: num(a.quantity_added),
      [t('remaining')]: num(a.remaining_quantity),
      [t('unitPrice')]: num(a.unit_price_at_addition),
      [t('totalPrice')]: num(a.quantity_added) * num(a.unit_price_at_addition),
      [t('additionDate')]: fmtDate(a.added_at, locale),
      [t('notes')]: a.notes || '',
    };
  });

  // ---------- EMPLOYEES ----------
  const empsRows: Row[] = emps.map((e) => ({
    [t('name')]: e.name,
    [t('jobTitle')]: e.job_title || '',
    [t('department')]: e.department || '',
    [t('location')]: e.location || '',
    [t('shift')]: e.shift || '',
    [t('mobile')]: e.mobile || '',
    [t('hireDate')]: fmtDate(e.hire_date, locale),
    [t('status')]: t(e.status as never) as string,
    [t('terminationDate')]: fmtDate(e.termination_date, locale),
    [t('notes')]: e.notes || '',
  }));

  // ---------- ASSIGNMENTS ----------
  const asnRows: Row[] = asns.map((a) => {
    const emp = empMap.get(a.employee_id);
    const it = itemMap.get(a.stock_item_id);
    return {
      [t('employee')]: emp?.name || '-',
      [t('department')]: emp?.department || '',
      [t('stockItem')]: it?.name || '-',
      [t('category')]: it?.category || '',
      [t('size')]: it?.size || '',
      [t('quantityAssigned')]: num(a.quantity_assigned),
      [t('unitPrice')]: num(a.unit_price_at_assignment),
      [t('totalPrice')]: num(a.quantity_assigned) * num(a.unit_price_at_assignment),
      [t('status')]: t(a.status as never) as string,
      [t('assignmentDate')]: fmtDate(a.assignment_date, locale),
      [t('returnDate')]: fmtDate(a.return_date, locale),
      [t('notes')]: a.notes || '',
    };
  });

  // ---------- VIOLATIONS ----------
  const violRows: Row[] = viols.map((v) => {
    const emp = empMap.get(v.employee_id);
    return {
      [t('employee')]: emp?.name || '-',
      [t('department')]: emp?.department || '',
      [t('violationDescription')]: v.violation_description,
      [t('actionTaken')]: t(v.action_taken as never) as string,
      [t('deductionAmount')]: num(v.deduction_amount),
      [t('violationDate')]: fmtDate(v.violation_date, locale),
      [t('notes')]: v.notes || '',
    };
  });

  // Build workbook
  const wb = XLSX.utils.book_new();

  const sheets: SheetSpec[] = [
    {
      name: lang === 'ar' ? 'نظرة عامة' : 'Overview',
      title: `${t('appName')} — ${t('overview')}  |  ${new Date().toLocaleDateString(locale)}`,
      headers: [t('details'), t('quantity'), t('totalPrice')],
      rows: overviewRows,
      currencyCols: [t('totalPrice')],
    },
    {
      name: lang === 'ar' ? 'المخزون' : 'Stock',
      title: t('stock'),
      headers: [t('name'), t('category'), t('size'), t('unit'), t('quantity'), t('unitPrice'), t('totalPrice'), t('addedDate')],
      rows: stockRows,
      currencyCols: [t('unitPrice'), t('totalPrice')],
    },
    {
      name: lang === 'ar' ? 'سجل الإضافات' : 'Additions',
      title: t('additionHistory'),
      headers: [t('stockItem'), t('category'), t('quantityAdded'), t('remaining'), t('unitPrice'), t('totalPrice'), t('additionDate'), t('notes')],
      rows: addsRows,
      currencyCols: [t('unitPrice'), t('totalPrice')],
    },
    {
      name: lang === 'ar' ? 'الموظفون' : 'Employees',
      title: t('employees'),
      headers: [t('name'), t('jobTitle'), t('department'), t('location'), t('shift'), t('mobile'), t('hireDate'), t('status'), t('terminationDate'), t('notes')],
      rows: empsRows,
    },
    {
      name: lang === 'ar' ? 'التسليمات' : 'Assignments',
      title: t('assignments'),
      headers: [t('employee'), t('department'), t('stockItem'), t('category'), t('size'), t('quantityAssigned'), t('unitPrice'), t('totalPrice'), t('status'), t('assignmentDate'), t('returnDate'), t('notes')],
      rows: asnRows,
      currencyCols: [t('unitPrice'), t('totalPrice')],
    },
    {
      name: lang === 'ar' ? 'المخالفات' : 'Violations',
      title: t('violations'),
      headers: [t('employee'), t('department'), t('violationDescription'), t('actionTaken'), t('deductionAmount'), t('violationDate'), t('notes')],
      rows: violRows,
      currencyCols: [t('deductionAmount')],
    },
  ];

  sheets.forEach((spec) => {
    const ws = buildSheet(spec);
    // RTL view for Arabic
    if (lang === 'ar') {
      (ws as any)['!views'] = [
        ...(((ws as any)['!views'] as unknown[]) || []),
        { rightToLeft: true },
      ];
    }
    XLSX.utils.book_append_sheet(wb, ws, spec.name.slice(0, 31));
  });

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().split('T')[0];
  link.href = url;
  link.download = `al-rehab-backup-${stamp}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
