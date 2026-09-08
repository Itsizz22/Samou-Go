import { useState } from 'react';
import { useNavigate, useToast } from '@samou-go/ui';
import { SignInGate, useAuth } from '@/hooks/useApi';
import { SupportTicket, TicketPriority, TicketStatus } from '@samou-go/shared-types';
import { ScreenShell } from '@/components/ScreenShell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const CATEGORIES = [
  'استفسار عام',
  'تأخر طلب',
  'مشكلة بالمنتج',
  'شكوى على الكابتن',
  'أخرى',
] as const;

type Category = typeof CATEGORIES[number];

export function NewTicketScreen() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const toast = useToast();

  if (!auth.ready || !auth.user) {
    return (
      <ScreenShell title="فتح تذكرة جديدة" subtitle="New Ticket">
        <SignInGate auth={auth} reasonAr="سجّل الدخول لإنشاء تذكرة" reasonEn="Sign in to create a ticket" />
      </ScreenShell>
    );
  }

  const [form, setForm] = useState<{
    category: Category;
    orderId?: string;
    subject: string;
    description: string;
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  }>({
    category: 'أخرى',
    subject: '',
    description: '',
    priority: 'NORMAL',
  });

  const [submitting, setSubmitting] = useState(false);

  const categoriesMap: Record<Category, string> = {
    'استفسار عام': 'General inquiry',
    'تأخر طلب': 'Order delay',
    'مشكلة بالمنتج': 'Product issue',
    'شكوى على الكابتن': 'Captain complaint',
    'أخرى': 'Other',
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const result = await createSupportTicket({
        ticketNumber: `TKT-${Math.floor(1000 + Math.random() * 8999)}`,
        userId: auth.user.id,
        orderId: form.orderId || undefined,
        category: form.category,
        subject: form.subject,
        priority: form.priority,
        status: 'OPEN',
      } as any);

      toast.success('تم إنشاء التذكرة بنجاح', 'Ticket created');
      navigate(`/support/tickets/${result.id}`);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : cause instanceof typeof cause
            ? String(cause)
            : String(cause);
      toast.error('تعذّر إنشاء التذكرة', 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenShell title="فتح تذكرة جديدة" subtitle="New Ticket">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('فتح تذكرة جديدة', 'New Ticket')}</CardTitle>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={async (e: React.FormEvent) => {
              e.preventDefault();
              await handleSubmit();
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <select
                value={form.category}
                onChange={(e) =>
                  setForm(({ category }) => ({ ...form, category: e.target.value as Category }))
                }
                className="select-field w-full"
              >
                <option value={undefined}>{t('حدد فئة', 'Select category')}</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {t(cat, categoriesMap[cat])}
                  </option>
                ))}
              </select>

              <select
                value={form.priority || 'NORMAL'}
                onChange={(e) =>
                  setForm(({ priority }) => ({ ...form, priority: e.target.value as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' }))
                }
                className="select-field w-full"
              >
                <option value={undefined}>{t('حدد الأهمية', 'Select priority')}</option>
                <option value="LOW">{t('منخفضة', 'Low')}</option>
                <option value="NORMAL">{t('طبيعية', 'Normal')}</option>
                <option value="HIGH">{t('عالية', 'High')}</option>
                <option value="URGENT">{t(' urgente', 'Urgent')}</option>
              </select>
            </div>

            <Input
              type="text"
              placeholder={t('موضوع التذكرة', 'Ticket subject')}
              value={form.subject}
              onChange={(e) =>
                setForm(({ subject }) => ({ ...form, subject: e.target.value }))
              }
              required
              className="input-field w-full"
            />

            <Input
              type="textarea"
              placeholder={t('وصف المشكلة أو الاستفسار', 'Describe the issue or inquiry')}
              rows={4}
              value={form.description}
              onChange={(e) =>
                setForm(({ description }) => ({ ...form, description: e.target.value }))
              }
              className="input-field w-full"
            />

            {form.orderId && (
              <div className="mt-3">
                <label className="text-sm text-ink-muted">
                  {t('طلب مرتبط (اختياري', 'Related order (optional)')}
                </label>
                <p className="text-xs text-ink-muted mt-1">
                  {t('SG-260728-0042', 'SG-260728-0042')}
                </p>
              </div>
            )}

            <div className="mt-4">
              <Button type="submit" disabled={submitting} className="btn-emerald">
                {submitting ? 'جاري الإرسال...' : t('إنشاء التذكرة', 'Create Ticket')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </ScreenShell>
  );
}