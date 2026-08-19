import { useState } from 'react';
import { creditWallet, settleWallet, useAdminFinancials, useToast } from '@/hooks/useApi';
import { useLanguage } from '@samou-go/ui';

const money = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ₪`;

export function FinancialsPanel() {
  const { t } = useLanguage();
  const toast = useToast();
  const financials = useAdminFinancials({ pollMs: 15_000 });
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const submit = async (walletId: string, action: 'settle' | 'credit') => {
    const amount = Number(amounts[walletId]);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('أدخل مبلغاً صحيحاً', 'Enter a positive amount');
      return;
    }
    setBusy(`${action}:${walletId}`);
    try {
      if (action === 'settle') await settleWallet(walletId, { amount, method: 'CASH' });
      else await creditWallet(walletId, { amount });
      setAmounts(values => ({ ...values, [walletId]: '' }));
      financials.reload();
      toast.success('تم تحديث المحفظة', 'Wallet updated');
    } catch (error) {
      toast.error('تعذّر تحديث المحفظة', error instanceof Error ? error.message : 'Update failed');
    } finally { setBusy(null); }
  };
  if (financials.loading && !financials.data) return <div className="p-6 text-sm text-ink-muted">Loading financials…</div>;
  return <section className="space-y-5">
    <div className="rounded-2xl bg-brand-surface p-5"><p className="text-xs font-bold text-ink-muted">{t('إيراد الطلبات المسلّمة', 'Delivered revenue')}</p><p dir="ltr" className="mt-1 text-2xl font-extrabold">{money(financials.data?.revenue ?? 0)}</p></div>
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface"><table className="w-full min-w-[620px] text-start text-xs"><thead className="bg-canvas text-ink-muted"><tr><th className="p-3">{t('المحفظة', 'Wallet')}</th><th>{t('الرصيد', 'Balance')}</th><th>{t('إجراء', 'Action')}</th></tr></thead><tbody>{financials.data?.wallets.map(wallet => <tr key={wallet.id} className="border-t border-line"><td className="p-3 font-bold">{wallet.store?.nameAr ?? wallet.user?.name ?? wallet.id}</td><td dir="ltr" className="font-extrabold">{money(wallet.balance)}</td><td className="p-2"><div className="flex gap-2"><input dir="ltr" inputMode="decimal" value={amounts[wallet.id] ?? ''} onChange={event => setAmounts(values => ({ ...values, [wallet.id]: event.target.value }))} className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5" aria-label="Amount"/><button type="button" disabled={busy !== null} onClick={() => void submit(wallet.id, 'settle')} className="rounded-lg bg-brand px-2 py-1.5 font-bold text-white disabled:opacity-50">{t('تسوية', 'Settle')}</button><button type="button" disabled={busy !== null} onClick={() => void submit(wallet.id, 'credit')} className="rounded-lg border border-line px-2 py-1.5 font-bold disabled:opacity-50">{t('إضافة', 'Credit')}</button></div></td></tr>)}</tbody></table></div>
    <div className="rounded-2xl border border-line bg-surface p-4"><h2 className="text-sm font-extrabold">{t('آخر التسويات', 'Recent settlements')}</h2><div className="mt-3 space-y-2">{financials.data?.settlements.slice(0, 10).map(row => <div key={row.id} className="flex justify-between text-xs"><span>{row.method}</span><span dir="ltr" className="font-bold">{money(row.amount)}</span></div>)}</div></div>
  </section>;
}
