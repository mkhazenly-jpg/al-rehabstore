import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';

interface DataPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function DataPagination({ page, pageSize, total, onPageChange }: DataPaginationProps) {
  const { t, lang } = useLanguage();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);

  if (total <= pageSize) return null;

  // RTL-aware chevrons
  const isRtl = lang === 'ar';
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="flex items-center justify-between gap-2 px-2 py-3 text-sm">
      <span className="text-muted-foreground">
        {t('showing')} {from}-{to} {t('of')} {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
        >
          <PrevIcon className="h-4 w-4" />
        </Button>
        <span className="px-2 text-xs text-muted-foreground whitespace-nowrap">
          {page + 1} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
        >
          <NextIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
