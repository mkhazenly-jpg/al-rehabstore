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
  sectionBg: 'E8F1ED',    // light emerald section divider
  sectionText: '0F4C3A',
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
  /** Row indices (0-based within `rows`) that should render as section dividers (full-width, bold) */
  sectionRowIndices?: number[];
}

const thin = { style: 'thin' as const, color: { rgb: COLORS.border } };
const border = { top: thin, bottom: thin, left: thin, right: thin };

function buildSheet(spec: SheetSpec): XLSX.WorkSheet {
  const { title, headers, rows, currencyCols = [], sectionRowIndices = [] } = spec;
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
    const dataIdx = r - 3;
    const isSection = sectionRowIndices.includes(dataIdx);
    const isAlt = (dataIdx) % 2 === 1;

    if (isSection) {
      // Merge whole row & style as section divider
      ws['!merges']!.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
      const addr = XLSX.utils.encode_cell({ r, c: 0 });
      const sectionText = headers.map((h) => rows[dataIdx][h]).find((v) => v !== '' && v !== null && v !== undefined) ?? '';
      ws[addr] = { t: 's', v: String(sectionText) };
      ws[addr].s = {
        font: { bold: true, sz: 12, color: { rgb: COLORS.sectionText }, name: 'Cairo' },
        fill: { patternType: 'solid', fgColor: { rgb: COLORS.sectionBg } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border,
      };
      // Clear other cells in the merged range
      for (let c = 1; c <= lastCol; c++) {
        const a = XLSX.utils.encode_cell({ r, c });
        if (ws[a]) delete ws[a];
      }
      ws['!rows']![r] = { hpt: 24 };
      continue;
    }

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
function fmtTime(value: string | null | undefined, locale = 'ar-EG'): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
function fmtDateTime(value: string | null | undefined, locale = 'ar-EG'): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString(locale);
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

  // ---------- DASHBOARD-LIKE AGGREGATES ----------
  const totalAddedByItem: Record<string, number> = {};
  adds.forEach((a) => {
    totalAddedByItem[a.stock_item_id] = (totalAddedByItem[a.stock_item_id] || 0) + num(a.quantity_added);
  });

  const totalConsumedByItem: Record<string, number> = {};
  asns.forEach((a) => {
    totalConsumedByItem[a.stock_item_id] = (totalConsumedByItem[a.stock_item_id] || 0) + num(a.quantity_assigned);
  });

  // Total purchase cost = sum over items of (item.unit_price * total added qty)  — matches dashboard
  const totalPurchaseCost = items.reduce((s, i) => s + num(i.unit_price) * (totalAddedByItem[i.id] || 0), 0);
  const totalStockValue = items.reduce((s, i) => s + num(i.quantity_in_stock) * num(i.unit_price), 0);
  const totalAssignedValue = asns
    .filter((a) => a.status === 'approved' || a.status === 'returned' || a.status === 'replaced')
    .reduce((s, a) => s + num(a.quantity_assigned) * num(a.unit_price_at_assignment), 0);
  const totalDeductions = viols.reduce((s, v) => s + num(v.deduction_amount), 0);

  // Cost by category (same as dashboard: unit_price * total added)
  const costByCategory: Record<string, number> = {};
  items.forEach((i) => {
    const added = totalAddedByItem[i.id] || 0;
    const cost = num(i.unit_price) * added;
    if (cost > 0) {
      costByCategory[i.category] = (costByCategory[i.category] || 0) + cost;
    }
  });

  // Damaged & lost (parsed from notes, same logic as dashboard)
  const damagedByItem: Record<string, number> = {};
  const lostByItem: Record<string, number> = {};
  asns.forEach((a) => {
    if (a.status === 'replaced' || a.status === 'returned') return;
    if (!a.notes) return;
    const notes = a.notes.toLowerCase();
    if (notes.includes('تالف') || notes.includes('damaged')) {
      damagedByItem[a.stock_item_id] = (damagedByItem[a.stock_item_id] || 0) + num(a.quantity_assigned);
    }
    if (notes.includes('فقدان') || notes.includes('مفقود') || notes.includes('lost')) {
      lostByItem[a.stock_item_id] = (lostByItem[a.stock_item_id] || 0) + num(a.quantity_assigned);
    }
  });

  // Renewal needed (shoes >=12mo, gloves/vests >=4mo on approved assignments)
  const renewalNeededByItem: Record<string, number> = {};
  asns.filter((a) => a.status === 'approved').forEach((a) => {
    const it = itemMap.get(a.stock_item_id);
    if (!it) return;
    const combined = (it.name + ' ' + it.category).toLowerCase();
    const isShoes = /shoe|حذاء|بوت|boot|safety/.test(combined);
    const isGlovesOrVest = /glove|جوانتي|قفاز|vest|فيست|سترة/.test(combined);
    const monthsElapsed = (Date.now() - new Date(a.assignment_date).getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
    const isExpired = (isShoes && monthsElapsed >= 12) || (isGlovesOrVest && monthsElapsed >= 4);
    if (isExpired) {
      renewalNeededByItem[a.stock_item_id] = (renewalNeededByItem[a.stock_item_id] || 0) + num(a.quantity_assigned);
    }
  });

  // ---------- OVERVIEW (rich, dashboard-matching) ----------
  const COL_DETAILS = t('details');
  const COL_QTY = t('quantity');
  const COL_TOTAL = t('totalPrice');

  const overviewRows: Row[] = [];
  const sectionIdx: number[] = [];

  // Section: General
  sectionIdx.push(overviewRows.length);
  overviewRows.push({ [COL_DETAILS]: lang === 'ar' ? 'إحصائيات عامة' : 'General Statistics', [COL_QTY]: '', [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: t('totalStock'), [COL_QTY]: items.length, [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: t('activeEmployees'), [COL_QTY]: emps.filter((e) => e.status === 'active').length, [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: lang === 'ar' ? 'إجمالي الموظفين' : 'Total Employees', [COL_QTY]: emps.length, [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: t('assignments'), [COL_QTY]: asns.length, [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: lang === 'ar' ? 'تسليمات معتمدة' : 'Approved Assignments', [COL_QTY]: asns.filter(a => a.status === 'approved').length, [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: lang === 'ar' ? 'تسليمات قيد الاعتماد' : 'Pending Assignments', [COL_QTY]: asns.filter(a => a.status === 'pending').length, [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: t('violations'), [COL_QTY]: viols.length, [COL_TOTAL]: '' });

  // Section: Financial
  sectionIdx.push(overviewRows.length);
  overviewRows.push({ [COL_DETAILS]: lang === 'ar' ? 'الملخص المالي' : 'Financial Summary', [COL_QTY]: '', [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: t('totalPurchaseCost'), [COL_QTY]: '', [COL_TOTAL]: totalPurchaseCost });
  overviewRows.push({ [COL_DETAILS]: lang === 'ar' ? 'قيمة المخزون الحالي' : 'Current Stock Value', [COL_QTY]: '', [COL_TOTAL]: totalStockValue });
  overviewRows.push({ [COL_DETAILS]: lang === 'ar' ? 'قيمة الأصناف المسلمة' : 'Assigned Items Value', [COL_QTY]: '', [COL_TOTAL]: totalAssignedValue });
  overviewRows.push({ [COL_DETAILS]: lang === 'ar' ? 'إجمالي الخصومات من المخالفات' : 'Total Violation Deductions', [COL_QTY]: '', [COL_TOTAL]: totalDeductions });

  // Section: Cost by Category
  if (Object.keys(costByCategory).length > 0) {
    sectionIdx.push(overviewRows.length);
    overviewRows.push({ [COL_DETAILS]: t('categoryCost'), [COL_QTY]: '', [COL_TOTAL]: '' });
    Object.entries(costByCategory).forEach(([cat, cost]) => {
      const totalQty = items.filter(i => i.category === cat).reduce((s, i) => s + (totalAddedByItem[i.id] || 0), 0);
      overviewRows.push({ [COL_DETAILS]: cat, [COL_QTY]: totalQty, [COL_TOTAL]: cost });
    });
  }

  // Section: Damaged Items
  if (Object.keys(damagedByItem).length > 0) {
    sectionIdx.push(overviewRows.length);
    overviewRows.push({ [COL_DETAILS]: t('damagedItems'), [COL_QTY]: '', [COL_TOTAL]: '' });
    Object.entries(damagedByItem).forEach(([itemId, qty]) => {
      const it = itemMap.get(itemId);
      overviewRows.push({ [COL_DETAILS]: it?.name || '-', [COL_QTY]: qty, [COL_TOTAL]: qty * num(it?.unit_price) });
    });
  }

  // Section: Lost Items
  if (Object.keys(lostByItem).length > 0) {
    sectionIdx.push(overviewRows.length);
    overviewRows.push({ [COL_DETAILS]: t('lostItems'), [COL_QTY]: '', [COL_TOTAL]: '' });
    Object.entries(lostByItem).forEach(([itemId, qty]) => {
      const it = itemMap.get(itemId);
      overviewRows.push({ [COL_DETAILS]: it?.name || '-', [COL_QTY]: qty, [COL_TOTAL]: qty * num(it?.unit_price) });
    });
  }

  // Section: Renewal needed
  if (Object.keys(renewalNeededByItem).length > 0) {
    sectionIdx.push(overviewRows.length);
    overviewRows.push({ [COL_DETAILS]: t('renewalNeededItems'), [COL_QTY]: '', [COL_TOTAL]: '' });
    Object.entries(renewalNeededByItem).forEach(([itemId, qty]) => {
      const it = itemMap.get(itemId);
      overviewRows.push({ [COL_DETAILS]: it?.name || '-', [COL_QTY]: qty, [COL_TOTAL]: '' });
    });
  }

  // Section: Per-item consumption
  sectionIdx.push(overviewRows.length);
  overviewRows.push({ [COL_DETAILS]: t('consumptionOverview'), [COL_QTY]: '', [COL_TOTAL]: '' });
  items.forEach((i) => {
    const added = totalAddedByItem[i.id] || 0;
    const consumed = totalConsumedByItem[i.id] || 0;
    if (added === 0 && consumed === 0) return;
    overviewRows.push({
      [COL_DETAILS]: `${i.name} — ${t('totalAdded')}: ${added} / ${t('totalConsumed')}: ${consumed}`,
      [COL_QTY]: i.quantity_in_stock,
      [COL_TOTAL]: num(i.quantity_in_stock) * num(i.unit_price),
    });
  });

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

  // ---------- EMPLOYEE DETAILS (with assigned items per employee) ----------
  const asnsByEmp: Record<string, typeof asns> = {};
  asns.forEach((a) => {
    if (!asnsByEmp[a.employee_id]) asnsByEmp[a.employee_id] = [];
    asnsByEmp[a.employee_id].push(a);
  });

  const empDetailsHeaders = [
    t('name'),
    t('jobTitle'),
    t('department'),
    t('location'),
    t('shift'),
    t('mobile'),
    t('status'),
    t('stockItem'),
    t('category'),
    t('size'),
    t('quantityAssigned'),
    t('unitPrice'),
    t('totalPrice'),
    lang === 'ar' ? 'الحالة' : 'Assignment Status',
    t('assignmentDate'),
    t('returnDate'),
    t('notes'),
  ];
  const STATUS_COL = empDetailsHeaders[13];
  const empDetailsRows: Row[] = [];
  emps.forEach((e) => {
    const list = asnsByEmp[e.id] || [];
    if (list.length === 0) {
      empDetailsRows.push({
        [t('name')]: e.name,
        [t('jobTitle')]: e.job_title || '-',
        [t('department')]: e.department || '-',
        [t('location')]: e.location || '-',
        [t('shift')]: e.shift ? (t(e.shift as never) as string) : '-',
        [t('mobile')]: e.mobile || '-',
        [t('status')]: t(e.status as never) as string,
        [t('stockItem')]: '-',
        [t('category')]: '-',
        [t('size')]: '-',
        [t('quantityAssigned')]: '-',
        [t('unitPrice')]: '-',
        [t('totalPrice')]: '-',
        [STATUS_COL]: '-',
        [t('assignmentDate')]: '-',
        [t('returnDate')]: '-',
        [t('notes')]: '-',
      });
      return;
    }
    list.forEach((a, i) => {
      const it = itemMap.get(a.stock_item_id);
      empDetailsRows.push({
        [t('name')]: i === 0 ? e.name : '',
        [t('jobTitle')]: i === 0 ? (e.job_title || '-') : '',
        [t('department')]: i === 0 ? (e.department || '-') : '',
        [t('location')]: i === 0 ? (e.location || '-') : '',
        [t('shift')]: i === 0 ? (e.shift ? (t(e.shift as never) as string) : '-') : '',
        [t('mobile')]: i === 0 ? (e.mobile || '-') : '',
        [t('status')]: i === 0 ? (t(e.status as never) as string) : '',
        [t('stockItem')]: it?.name || '-',
        [t('category')]: it?.category || '-',
        [t('size')]: it?.size || '-',
        [t('quantityAssigned')]: num(a.quantity_assigned),
        [t('unitPrice')]: num(a.unit_price_at_assignment),
        [t('totalPrice')]: num(a.quantity_assigned) * num(a.unit_price_at_assignment),
        [STATUS_COL]: t(a.status as never) as string,
        [t('assignmentDate')]: fmtDate(a.assignment_date, locale),
        [t('returnDate')]: fmtDate(a.return_date, locale),
        [t('notes')]: a.notes || '',
      });
    });
  });

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
      headers: [COL_DETAILS, COL_QTY, COL_TOTAL],
      rows: overviewRows,
      currencyCols: [COL_TOTAL],
      sectionRowIndices: sectionIdx,
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
      title: lang === 'ar' ? 'تفاصيل الموظفين والأصناف المسلمة' : 'Employee Details & Assigned Items',
      headers: empDetailsHeaders,
      rows: empDetailsRows,
      currencyCols: [t('unitPrice'), t('totalPrice')],
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
