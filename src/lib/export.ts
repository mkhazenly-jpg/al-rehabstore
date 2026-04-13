import * as XLSX from 'xlsx';

const EXCEL_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function exportToExcel(data: Record<string, unknown>[], filename: string) {
  const wb = XLSX.utils.book_new();

  if (!data || data.length === 0) {
    const emptySheet = XLSX.utils.aoa_to_sheet([['No data to export']]);
    XLSX.utils.book_append_sheet(wb, emptySheet, 'Sheet1');
  } else {
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = Object.keys(data[0]).map((key) => {
      const maxLen = Math.max(key.length, ...data.map((row) => String(row[key] ?? '').length));
      return { wch: Math.min(maxLen + 2, 40) };
    });
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  }

  const buffer = XLSX.write(wb, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
  });

  const blob = new Blob([buffer], { type: EXCEL_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

