// Server-side backup generator: builds the same xlsx as the manual download
// but returns a Buffer (no DOM). Uses supabaseAdmin (service role).
import * as XLSX from 'xlsx-js-style';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

// Normalize CommonJS interop: depending on bundler (Vite SSR vs Worker build),
// the module shape may be either the namespace itself or wrapped under `.default`.
// `XLSX` keeps the type namespace; `xlsx` is the runtime-resolved value.
const xlsx = ((XLSX as any)?.utils
  ? (XLSX as any)
  : ((XLSX as any)?.default ?? (XLSX as any))) as typeof XLSX;

const COLORS = {
  primary: '2F8F6E',
  primaryDark: '1E6B52',
  accent: 'E0A93D',
  headerText: 'FFFFFF',
  alt: 'F1F8F5',
  border: 'D9E5DF',
  titleBg: '0F4C3A',
  sectionBg: 'E8F1ED',
  sectionText: '0F4C3A',
};

// Arabic labels (server backup is always Arabic — matches admin language)
const L = {
  appName: 'مخزن الرحاب',
  overview: 'نظرة عامة',
  details: 'تفاصيل',
  quantity: 'الكمية',
  totalPrice: 'السعر الإجمالي',
  totalStock: 'إجمالي الأصناف',
  activeEmployees: 'عدد الموظفين',
  totalEmployees: 'إجمالي الموظفين',
  assignments: 'التسليمات',
  approvedAssignments: 'تسليمات معتمدة',
  pendingAssignments: 'تسليمات قيد الاعتماد',
  violations: 'المخالفات',
  general: 'إحصائيات عامة',
  financial: 'الملخص المالي',
  totalPurchaseCost: 'إجمالي تكلفة الشراء',
  currentStockValue: 'قيمة المخزون الحالي',
  assignedItemsValue: 'قيمة الأصناف المسلمة',
  totalDeductions: 'إجمالي الخصومات من المخالفات',
  categoryCost: 'التكلفة حسب الفئة',
  damagedItems: 'الأصناف التالفة',
  lostItems: 'الأصناف المفقودة',
  renewalNeededItems: 'أصناف تحتاج تجديد',
  consumptionOverview: 'نظرة عامة على الاستهلاك',
  totalAdded: 'إجمالي المضاف',
  totalConsumed: 'إجمالي المستهلك',
  stock: 'المخزون',
  name: 'الاسم',
  category: 'الفئة',
  size: 'المقاس',
  unit: 'الوحدة',
  unitPrice: 'سعر القطعة',
  addedDate: 'تاريخ الإضافة',
  additionHistory: 'سجل الإضافات',
  stockItem: 'الصنف',
  quantityAdded: 'الكمية المضافة',
  remaining: 'المتبقي',
  additionDate: 'تاريخ الإضافة',
  notes: 'ملاحظات',
  jobTitle: 'الوظيفة',
  department: 'القسم',
  location: 'الموقع',
  shift: 'الشفت',
  mobile: 'رقم الموبايل',
  status: 'الحالة',
  quantityAssigned: 'الكمية المسلمة',
  assignmentStatus: 'حالة التسليم',
  assignmentDate: 'تاريخ التسليم',
  returnDate: 'تاريخ الإرجاع',
  employeeDetails: 'تفاصيل الموظفين والأصناف المسلمة',
  employee: 'الموظف',
  violationDescription: 'وصف المخالفة',
  actionTaken: 'الإجراء المتخذ',
  deductionAmount: 'قيمة الخصم',
  violationDate: 'تاريخ المخالفة',
  active: 'نشط',
  resigned: 'مستقيل',
  terminated: 'منتهي الخدمة',
  archived: 'مؤرشف',
  pending: 'قيد الانتظار',
  approved: 'معتمد',
  returned: 'مرتجع',
  replaced: 'تم الاستبدال',
  damaged: 'تالف',
  lost: 'فقدان',
  morning: 'صباحي',
  night: 'مسائي',
  warning: 'تحذير',
  deduction: 'خصم',
  suspension: 'إيقاف',
  termination: 'إنهاء',
  verbal_warning: 'تحذير شفهي',
};

const tr = (k: string): string => (L as Record<string, string>)[k] || k;

type Row = Record<string, string | number | null | undefined>;
interface SheetSpec {
  name: string;
  title: string;
  headers: string[];
  rows: Row[];
  currencyCols?: string[];
  sectionRowIndices?: number[];
}

const thin = { style: 'thin' as const, color: { rgb: COLORS.border } };
const border = { top: thin, bottom: thin, left: thin, right: thin };

function buildSheet(spec: SheetSpec): XLSX.WorkSheet {
  const { title, headers, rows, currencyCols = [], sectionRowIndices = [] } = spec;
  const aoa: (string | number | null)[][] = [];
  aoa.push([title]);
  aoa.push([]);
  aoa.push(headers);
  rows.forEach((r) => {
    aoa.push(headers.map((h) => (r[h] === undefined || r[h] === null ? '' : (r[h] as string | number))));
  });

  const ws = xlsx.utils.aoa_to_sheet(aoa);
  const lastCol = headers.length - 1;
  const lastRow = aoa.length - 1;

  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }];
  const titleCell = ws['A1'];
  if (titleCell) {
    titleCell.s = {
      font: { bold: true, sz: 16, color: { rgb: COLORS.headerText }, name: 'Cairo' },
      fill: { patternType: 'solid', fgColor: { rgb: COLORS.titleBg } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
  }
  ws['!rows'] = [{ hpt: 30 }, { hpt: 8 }];

  for (let c = 0; c <= lastCol; c++) {
    const addr = xlsx.utils.encode_cell({ r: 2, c });
    if (!ws[addr]) ws[addr] = { t: 's', v: headers[c] };
    ws[addr].s = {
      font: { bold: true, color: { rgb: COLORS.headerText }, name: 'Cairo', sz: 11 },
      fill: { patternType: 'solid', fgColor: { rgb: COLORS.primary } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border,
    };
  }
  ws['!rows']![2] = { hpt: 26 };

  for (let r = 3; r <= lastRow; r++) {
    const dataIdx = r - 3;
    const isSection = sectionRowIndices.includes(dataIdx);
    const isAlt = dataIdx % 2 === 1;

    if (isSection) {
      ws['!merges']!.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
      const addr = xlsx.utils.encode_cell({ r, c: 0 });
      const sectionText =
        headers.map((h) => rows[dataIdx][h]).find((v) => v !== '' && v !== null && v !== undefined) ?? '';
      ws[addr] = { t: 's', v: String(sectionText) };
      ws[addr].s = {
        font: { bold: true, sz: 12, color: { rgb: COLORS.sectionText }, name: 'Cairo' },
        fill: { patternType: 'solid', fgColor: { rgb: COLORS.sectionBg } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border,
      };
      for (let c = 1; c <= lastCol; c++) {
        const a = xlsx.utils.encode_cell({ r, c });
        if (ws[a]) delete ws[a];
      }
      ws['!rows']![r] = { hpt: 24 };
      continue;
    }

    for (let c = 0; c <= lastCol; c++) {
      const addr = xlsx.utils.encode_cell({ r, c });
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

  ws['!cols'] = headers.map((h) => {
    let max = h.length;
    rows.forEach((r) => {
      const v = r[h];
      const len = v === null || v === undefined ? 0 : String(v).length;
      if (len > max) max = len;
    });
    return { wch: Math.min(Math.max(max + 4, 12), 45) };
  });
  ws['!freeze'] = { xSplit: 0, ySplit: 3 };
  (ws as any)['!views'] = [
    { state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4', activePane: 'bottomLeft', rightToLeft: true },
  ];
  return ws;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('ar-EG');
  } catch {
    return String(value);
  }
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function buildBackupBuffer(): Promise<Uint8Array> {
  const [
    { data: stockItems },
    { data: stockAdds },
    { data: employees },
    { data: assignments },
    { data: violations },
  ] = await Promise.all([
    supabaseAdmin.from('stock_items').select('*').order('name'),
    supabaseAdmin.from('stock_additions').select('*').order('added_at', { ascending: false }),
    supabaseAdmin.from('employees').select('*').order('name'),
    supabaseAdmin.from('assignments').select('*').order('assignment_date', { ascending: false }),
    supabaseAdmin.from('employee_violations').select('*').order('violation_date', { ascending: false }),
  ]);

  const items = stockItems || [];
  const adds = stockAdds || [];
  const emps = employees || [];
  const asns = assignments || [];
  const viols = violations || [];

  const empMap = new Map(emps.map((e) => [e.id, e]));
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const totalAddedByItem: Record<string, number> = {};
  adds.forEach((a) => {
    totalAddedByItem[a.stock_item_id] = (totalAddedByItem[a.stock_item_id] || 0) + num(a.quantity_added);
  });
  const totalConsumedByItem: Record<string, number> = {};
  asns.forEach((a) => {
    totalConsumedByItem[a.stock_item_id] = (totalConsumedByItem[a.stock_item_id] || 0) + num(a.quantity_assigned);
  });

  const totalPurchaseCost = items.reduce((s, i) => s + num(i.unit_price) * (totalAddedByItem[i.id] || 0), 0);
  const totalStockValue = items.reduce((s, i) => s + num(i.quantity_in_stock) * num(i.unit_price), 0);
  const totalAssignedValue = asns
    .filter((a) => a.status === 'approved' || a.status === 'returned' || a.status === 'replaced')
    .reduce((s, a) => s + num(a.quantity_assigned) * num(a.unit_price_at_assignment), 0);
  const totalDeductions = viols.reduce((s, v) => s + num(v.deduction_amount), 0);

  const costByCategory: Record<string, number> = {};
  items.forEach((i) => {
    const added = totalAddedByItem[i.id] || 0;
    const cost = num(i.unit_price) * added;
    if (cost > 0) costByCategory[i.category] = (costByCategory[i.category] || 0) + cost;
  });

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
      renewalNeededByItem[a.stock_item_id] =
        (renewalNeededByItem[a.stock_item_id] || 0) + num(a.quantity_assigned);
    }
  });

  // Overview rows (matches client export)
  const COL_DETAILS = tr('details');
  const COL_QTY = tr('quantity');
  const COL_TOTAL = tr('totalPrice');
  const overviewRows: Row[] = [];
  const sectionIdx: number[] = [];

  sectionIdx.push(overviewRows.length);
  overviewRows.push({ [COL_DETAILS]: tr('general'), [COL_QTY]: '', [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: tr('totalStock'), [COL_QTY]: items.length, [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: tr('activeEmployees'), [COL_QTY]: emps.filter((e) => e.status === 'active').length, [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: tr('totalEmployees'), [COL_QTY]: emps.length, [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: tr('assignments'), [COL_QTY]: asns.length, [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: tr('approvedAssignments'), [COL_QTY]: asns.filter((a) => a.status === 'approved').length, [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: tr('pendingAssignments'), [COL_QTY]: asns.filter((a) => a.status === 'pending').length, [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: tr('violations'), [COL_QTY]: viols.length, [COL_TOTAL]: '' });

  sectionIdx.push(overviewRows.length);
  overviewRows.push({ [COL_DETAILS]: tr('financial'), [COL_QTY]: '', [COL_TOTAL]: '' });
  overviewRows.push({ [COL_DETAILS]: tr('totalPurchaseCost'), [COL_QTY]: '', [COL_TOTAL]: totalPurchaseCost });
  overviewRows.push({ [COL_DETAILS]: tr('currentStockValue'), [COL_QTY]: '', [COL_TOTAL]: totalStockValue });
  overviewRows.push({ [COL_DETAILS]: tr('assignedItemsValue'), [COL_QTY]: '', [COL_TOTAL]: totalAssignedValue });
  overviewRows.push({ [COL_DETAILS]: tr('totalDeductions'), [COL_QTY]: '', [COL_TOTAL]: totalDeductions });

  if (Object.keys(costByCategory).length > 0) {
    sectionIdx.push(overviewRows.length);
    overviewRows.push({ [COL_DETAILS]: tr('categoryCost'), [COL_QTY]: '', [COL_TOTAL]: '' });
    Object.entries(costByCategory).forEach(([cat, cost]) => {
      const totalQty = items.filter((i) => i.category === cat).reduce((s, i) => s + (totalAddedByItem[i.id] || 0), 0);
      overviewRows.push({ [COL_DETAILS]: cat, [COL_QTY]: totalQty, [COL_TOTAL]: cost });
    });
  }

  if (Object.keys(damagedByItem).length > 0) {
    sectionIdx.push(overviewRows.length);
    overviewRows.push({ [COL_DETAILS]: tr('damagedItems'), [COL_QTY]: '', [COL_TOTAL]: '' });
    Object.entries(damagedByItem).forEach(([itemId, qty]) => {
      const it = itemMap.get(itemId);
      overviewRows.push({ [COL_DETAILS]: it?.name || '-', [COL_QTY]: qty, [COL_TOTAL]: qty * num(it?.unit_price) });
    });
  }
  if (Object.keys(lostByItem).length > 0) {
    sectionIdx.push(overviewRows.length);
    overviewRows.push({ [COL_DETAILS]: tr('lostItems'), [COL_QTY]: '', [COL_TOTAL]: '' });
    Object.entries(lostByItem).forEach(([itemId, qty]) => {
      const it = itemMap.get(itemId);
      overviewRows.push({ [COL_DETAILS]: it?.name || '-', [COL_QTY]: qty, [COL_TOTAL]: qty * num(it?.unit_price) });
    });
  }
  if (Object.keys(renewalNeededByItem).length > 0) {
    sectionIdx.push(overviewRows.length);
    overviewRows.push({ [COL_DETAILS]: tr('renewalNeededItems'), [COL_QTY]: '', [COL_TOTAL]: '' });
    Object.entries(renewalNeededByItem).forEach(([itemId, qty]) => {
      const it = itemMap.get(itemId);
      overviewRows.push({ [COL_DETAILS]: it?.name || '-', [COL_QTY]: qty, [COL_TOTAL]: '' });
    });
  }

  sectionIdx.push(overviewRows.length);
  overviewRows.push({ [COL_DETAILS]: tr('consumptionOverview'), [COL_QTY]: '', [COL_TOTAL]: '' });
  items.forEach((i) => {
    const added = totalAddedByItem[i.id] || 0;
    const consumed = totalConsumedByItem[i.id] || 0;
    if (added === 0 && consumed === 0) return;
    overviewRows.push({
      [COL_DETAILS]: `${i.name} — ${tr('totalAdded')}: ${added} / ${tr('totalConsumed')}: ${consumed}`,
      [COL_QTY]: i.quantity_in_stock,
      [COL_TOTAL]: num(i.quantity_in_stock) * num(i.unit_price),
    });
  });

  // Stock
  const stockRows: Row[] = items.map((i) => ({
    [tr('name')]: i.name,
    [tr('category')]: i.category,
    [tr('size')]: i.size,
    [tr('unit')]: i.unit,
    [tr('quantity')]: num(i.quantity_in_stock),
    [tr('unitPrice')]: num(i.unit_price),
    [tr('totalPrice')]: num(i.quantity_in_stock) * num(i.unit_price),
    [tr('addedDate')]: fmtDate(i.added_date),
  }));

  // Additions
  const addsRows: Row[] = adds.map((a) => {
    const it = itemMap.get(a.stock_item_id);
    return {
      [tr('stockItem')]: it?.name || '-',
      [tr('category')]: it?.category || '-',
      [tr('quantityAdded')]: num(a.quantity_added),
      [tr('remaining')]: num(a.remaining_quantity),
      [tr('unitPrice')]: num(a.unit_price_at_addition),
      [tr('totalPrice')]: num(a.quantity_added) * num(a.unit_price_at_addition),
      [tr('additionDate')]: fmtDate(a.added_at),
      [tr('notes')]: a.notes || '',
    };
  });

  // Employee details with assigned items
  const asnsByEmp: Record<string, typeof asns> = {};
  asns.forEach((a) => {
    if (!asnsByEmp[a.employee_id]) asnsByEmp[a.employee_id] = [];
    asnsByEmp[a.employee_id].push(a);
  });
  const empDetailsHeaders = [
    tr('name'), tr('jobTitle'), tr('department'), tr('location'), tr('shift'), tr('mobile'), tr('status'),
    tr('stockItem'), tr('category'), tr('size'), tr('quantityAssigned'), tr('unitPrice'), tr('totalPrice'),
    tr('assignmentStatus'), tr('assignmentDate'), tr('returnDate'), tr('notes'),
  ];
  const STATUS_COL = empDetailsHeaders[13];
  const empDetailsRows: Row[] = [];
  emps.forEach((e) => {
    const list = asnsByEmp[e.id] || [];
    if (list.length === 0) {
      empDetailsRows.push({
        [tr('name')]: e.name,
        [tr('jobTitle')]: e.job_title || '-',
        [tr('department')]: e.department || '-',
        [tr('location')]: e.location || '-',
        [tr('shift')]: e.shift ? tr(e.shift) : '-',
        [tr('mobile')]: e.mobile || '-',
        [tr('status')]: tr(e.status),
        [tr('stockItem')]: '-', [tr('category')]: '-', [tr('size')]: '-',
        [tr('quantityAssigned')]: '-', [tr('unitPrice')]: '-', [tr('totalPrice')]: '-',
        [STATUS_COL]: '-', [tr('assignmentDate')]: '-', [tr('returnDate')]: '-', [tr('notes')]: '-',
      });
      return;
    }
    list.forEach((a, i) => {
      const it = itemMap.get(a.stock_item_id);
      empDetailsRows.push({
        [tr('name')]: i === 0 ? e.name : '',
        [tr('jobTitle')]: i === 0 ? (e.job_title || '-') : '',
        [tr('department')]: i === 0 ? (e.department || '-') : '',
        [tr('location')]: i === 0 ? (e.location || '-') : '',
        [tr('shift')]: i === 0 ? (e.shift ? tr(e.shift) : '-') : '',
        [tr('mobile')]: i === 0 ? (e.mobile || '-') : '',
        [tr('status')]: i === 0 ? tr(e.status) : '',
        [tr('stockItem')]: it?.name || '-',
        [tr('category')]: it?.category || '-',
        [tr('size')]: it?.size || '-',
        [tr('quantityAssigned')]: num(a.quantity_assigned),
        [tr('unitPrice')]: num(a.unit_price_at_assignment),
        [tr('totalPrice')]: num(a.quantity_assigned) * num(a.unit_price_at_assignment),
        [STATUS_COL]: tr(a.status),
        [tr('assignmentDate')]: fmtDate(a.assignment_date),
        [tr('returnDate')]: fmtDate(a.return_date),
        [tr('notes')]: a.notes || '',
      });
    });
  });

  // Assignments
  const asnRows: Row[] = asns.map((a) => {
    const emp = empMap.get(a.employee_id);
    const it = itemMap.get(a.stock_item_id);
    return {
      [tr('employee')]: emp?.name || '-',
      [tr('department')]: emp?.department || '',
      [tr('stockItem')]: it?.name || '-',
      [tr('category')]: it?.category || '',
      [tr('size')]: it?.size || '',
      [tr('quantityAssigned')]: num(a.quantity_assigned),
      [tr('unitPrice')]: num(a.unit_price_at_assignment),
      [tr('totalPrice')]: num(a.quantity_assigned) * num(a.unit_price_at_assignment),
      [tr('status')]: tr(a.status),
      [tr('assignmentDate')]: fmtDate(a.assignment_date),
      [tr('returnDate')]: fmtDate(a.return_date),
      [tr('notes')]: a.notes || '',
    };
  });

  // Violations
  const violRows: Row[] = viols.map((v) => {
    const emp = empMap.get(v.employee_id);
    return {
      [tr('employee')]: emp?.name || '-',
      [tr('department')]: emp?.department || '',
      [tr('violationDescription')]: v.violation_description,
      [tr('actionTaken')]: tr(v.action_taken),
      [tr('deductionAmount')]: num(v.deduction_amount),
      [tr('violationDate')]: fmtDate(v.violation_date),
      [tr('notes')]: v.notes || '',
    };
  });

  const wb = xlsx.utils.book_new();
  const sheets: SheetSpec[] = [
    {
      name: 'نظرة عامة',
      title: `${tr('appName')} — ${tr('overview')}  |  ${new Date().toLocaleDateString('ar-EG')}`,
      headers: [COL_DETAILS, COL_QTY, COL_TOTAL],
      rows: overviewRows,
      currencyCols: [COL_TOTAL],
      sectionRowIndices: sectionIdx,
    },
    {
      name: 'المخزون',
      title: tr('stock'),
      headers: [tr('name'), tr('category'), tr('size'), tr('unit'), tr('quantity'), tr('unitPrice'), tr('totalPrice'), tr('addedDate')],
      rows: stockRows,
      currencyCols: [tr('unitPrice'), tr('totalPrice')],
    },
    {
      name: 'سجل الإضافات',
      title: tr('additionHistory'),
      headers: [tr('stockItem'), tr('category'), tr('quantityAdded'), tr('remaining'), tr('unitPrice'), tr('totalPrice'), tr('additionDate'), tr('notes')],
      rows: addsRows,
      currencyCols: [tr('unitPrice'), tr('totalPrice')],
    },
    {
      name: 'الموظفون',
      title: tr('employeeDetails'),
      headers: empDetailsHeaders,
      rows: empDetailsRows,
      currencyCols: [tr('unitPrice'), tr('totalPrice')],
    },
    {
      name: 'التسليمات',
      title: tr('assignments'),
      headers: [tr('employee'), tr('department'), tr('stockItem'), tr('category'), tr('size'), tr('quantityAssigned'), tr('unitPrice'), tr('totalPrice'), tr('status'), tr('assignmentDate'), tr('returnDate'), tr('notes')],
      rows: asnRows,
      currencyCols: [tr('unitPrice'), tr('totalPrice')],
    },
    {
      name: 'المخالفات',
      title: tr('violations'),
      headers: [tr('employee'), tr('department'), tr('violationDescription'), tr('actionTaken'), tr('deductionAmount'), tr('violationDate'), tr('notes')],
      rows: violRows,
      currencyCols: [tr('deductionAmount')],
    },
  ];

  sheets.forEach((spec) => {
    const ws = buildSheet(spec);
    xlsx.utils.book_append_sheet(wb, ws, spec.name.slice(0, 31));
  });

  const buffer = xlsx.write(wb, { bookType: 'xlsx', type: 'array', compression: true }) as Uint8Array;
  return buffer;
}
