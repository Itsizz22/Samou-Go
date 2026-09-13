/**
 * AccountStatement — shared "Account Statement / كشف حساب" view for
 * store managers and captains. Shows a balance card + paginated ledger
 * entries with type badges and credit/debit styling.
 */

import { Clock, CreditCard, Banknote, TrendingUp, TrendingDown } from 'lucide-react';
import { useLanguage } from '../lib/LanguageProvider';
import { Button } from './Button';

export interface AccountStatementEntry {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
}

export interface AccountStatementProps {
  balance: number;
  entries: AccountStatementEntry[];
  total: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  currentPage: number;
  pageSize?: number;
  /** "store" or "captain" — controls the label style */
  ownerLabel?: 'store' | 'captain';
}

const TYPE_CONFIG: Record<string, { ar: string; en: string; color: string; icon: typeof TrendingUp }> = {
  EARNING: { ar: 'أرباح', en: 'Earning', color: 'bg-emerald-100 text-emerald-700', icon: TrendingUp },
  COMMISSION: { ar: 'عمولة', en: 'Commission', color: 'bg-red-100 text-red-700', icon: TrendingDown },
  SETTLEMENT: { ar: 'تسوية', en: 'Settlement', color: 'bg-blue-100 text-blue-700', icon: Banknote },
  ADJUSTMENT: { ar: 'تعديل', en: 'Adjustment', color: 'bg-amber-100 text-amber-700', icon: CreditCard },
};

export function AccountStatement({
  balance,
  entries,
  total,
  loading,
  onPageChange,
  currentPage,
  pageSize = 50,
  ownerLabel = 'store',
}: AccountStatementProps) {
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <div className="skeleton h-20 rounded-2xl" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Balance card */}
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <p className="text-xs font-medium text-ink-muted">
          {ownerLabel === 'store'
            ? t('رصيد مستحق للمتجر', 'Store outstanding balance')
            : t('رصيد الكابتن', 'Captain balance')}
        </p>
        <p className="mt-1 text-2xl font-extrabold" dir="ltr">
          {balance.toFixed(2)} <span className="text-sm text-ink-muted">₪</span>
        </p>
        <p className="mt-1 text-[11px] text-ink-muted">
          {t(`${total} معاملة في السجل`, `${total} transactions in ledger`)}
        </p>
      </div>

      {/* Transaction list */}
      {entries.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center">
          <Clock size={32} className="mx-auto text-ink-muted/40" />
          <p className="mt-2 text-sm text-ink-muted">
            {t('لا توجد معاملات بعد', 'No transactions yet')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const fallback = TYPE_CONFIG['ADJUSTMENT'];
            const config = TYPE_CONFIG[entry.type] ?? fallback!;
            const isCredit = entry.amount > 0;
            const Icon = config.icon;
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.color}`}>
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${config.color}`}>
                      {t(config.ar, config.en)}
                    </span>
                    {entry.description && (
                      <span className="truncate text-[11px] text-ink-muted">{entry.description}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px] text-ink-muted" dir="ltr">
                    {new Date(entry.createdAt).toLocaleString(isArabic ? 'ar-PS' : 'en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <span
                  className={`text-sm font-bold ${isCredit ? 'text-emerald-600' : 'text-red-500'}`}
                  dir="ltr"
                >
                  {isCredit ? '+' : ''}{entry.amount.toFixed(2)} ₪
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            {t('السابق', 'Previous')}
          </Button>
          <span className="text-xs text-ink-muted">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            {t('التالي', 'Next')}
          </Button>
        </div>
      )}
    </div>
  );
}
