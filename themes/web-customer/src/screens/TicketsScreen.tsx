import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Loader2,
  MessageCircle,
  Mail,
  Edit,
  XMark,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { useLanguage, useToast } from '@samou-go/ui';
import { useAuth } from '@/hooks/useApi';
import { createSupportTicket, listSupportTickets, getSupportTicket, addSupportMessage, updateSupportTicketStatus } from '@/hooks/useApi';
import { SupportTicket, TicketStatus, TicketPriority, type Paginated } from '@samou-go/shared-types';
import { caseInsensitiveContains } from '@/lib/prisma';
import { ScreenShell } from '@/components/ScreenShell';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const CATEGORIES = [
  'استفسار عام',
  'تأخير طلب',
  'مشكلة بالمنتج',
  'شكوى على الكابتن',
  'أخرى',
] as const;

type Category = typeof CATEGORIES[number];

function statusBadgeTone(status: string): 'brand' | 'info' | 'danger' | 'neutral' {
  if (status === 'OPEN') return 'brand';
  if (status === 'IN_PROGRESS') return 'info';
  if (status === 'RESOLVED') return 'danger';
  return 'neutral';
}

function priorityBadgeTone(priority: string): 'brand' | 'warning' | 'danger' | 'neutral' {
  if (priority === 'HIGH') return 'danger';
  if (priority === 'URGENT') return 'warning';
  return 'brand';
}

export function TicketsScreen() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const toast = useToast();
  const isArabic = t('en') === undefined || t('ar') !== t('en');

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);

  const [creating, setCreating] = useState(false);
  const [newTicket, setNewTicket] = useState<{
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

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const result = await listSupportTickets(
        {
          status: statusFilter,
          priority: priorityFilter,
          category: categoryFilter,
        },
        undefined,
        auth.ready ? { sub: auth.user?.id, role: auth.user?.role } : undefined
      );
      setTickets(result.items ?? []);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : cause instanceof typeof cause
            ? String(cause)
            : String(cause);
      toast.error('تعذّر تحميل التذاكر', 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createSupportTicket({
        ticketNumber: `TKT-${Math.floor(1000 + Math.random() * 8999)}`,
        userId: auth.user?.id || '',
        orderId: newTicket.orderId || undefined,
        category: newTicket.category,
        subject: newTicket.subject,
        priority: newTicket.priority,
        status: 'OPEN',
      } as any);

      navigate(`/support/tickets/${result.id}`);
      toast.success('تم إنشاء التذكرة بنجاح', 'Ticket created');
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : cause instanceof typeof cause
            ? String(cause)
            : String(cause);
      toast.error('تعذّر إنشاء التذكرة', 'Failed to create ticket');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (ticketId: string, e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    try {
      await updateSupportTicketStatus(ticketId, { status: newStatus } as any);
      fetchTickets();
      toast.success('تم تحديث الحالة', 'Status updated');
    } catch (cause) {
      toast.error('تعذّر تحديث الحالة', 'Failed to update status');
    }
  };

  if (!auth.ready) {
    return (
      <ScreenShell title="التذاكري" subtitle="Support Tickets">
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-brand" aria-label="Loading" />
        </div>
      </ScreenShell>
    );
  }

  if (!auth.user) {
    return (
      <ScreenShell title="التذاكري" subtitle="Support Tickets">
        <SignInGate auth={auth} reasonAr="سجّل الدخول لعرض التذاكراكر" reasonEn="Sign in to view tickets" />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="التذاكري" subtitle="Support Tickets">
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('تذاكري', 'My Tickets')}</CardTitle>
          <Button onClick={() => navigate('/support/tickets/new')} className="btn-emerald">
            {t('فتح تذكرة جديدة', 'New Ticket')}
          </Button>
        </CardHeader>

        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <select
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="select-field w-full"
            >
              <option value={undefined}>{t('جميع الحالات', 'All statuses')}</option>
              <option value="OPEN">{t('مفتوحة', 'Open')}</option>
              <option value="IN_PROGRESS">{t('قيد المعالجة', 'In Progress')}</option>
              <option value="RESOLVED">{t('已解决', 'Resolved')}</option>
              <option value="CLOSED">{t('مغلقة', 'Closed')}</option>
            </select>

            <select
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="select-field w-full"
            >
              <option value={undefined}>{t('جميع المستويات', 'All levels')}</option>
              <option value="LOW">{t('منخفضة', 'Low')}</option>
              <option value="NORMAL">{t('طبيعية', 'Normal')}</option>
              <option value="HIGH">{t('عالية', 'High')}</option>
              <option value="URGENT">{t(' urgente', 'Urgent')}</option>
            </select>

            <select
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="select-field w-full"
            >
              <option value={undefined}>{t('جميع الفئات', 'All categories')}</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{t(cat, cat)}</option>
              ))}
            </select>
          </div>

          {/* Tickets list */}
          {loading ? (
            <div className="py-12 text-center">
              <Loader2 size={20} className="animate-spin text-brand margin-auto" aria-label="Loading" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-8 text-center text-ink-muted">
              {t('لا توجد تذاكر بعد', 'No tickets yet. Create your first ticket above.')}
            </div>
          ) : (
            <div className="space-y-4">
              {tickets.map((ticket) => (
                <Card key={ticket.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-bold">{ticket.subject}</h3>
                      <p className="text-sm text-ink-muted mt-1">
                        {ticket.ticketNumber} · {t(ticket.category, ticket.category)}
                      </p>
                      <p className="text-xs text-ink-muted mt-1">
                        {new Date(ticket.createdAt).toLocaleDateString(isArabic ? 'ar-EG' : 'en-US')}
                      </p>
                    </div>
                    <Badge tone={statusBadgeTone(ticket.status)} className="ml-2" size="sm">
                      {t(ticket.status, ticket.status)}
                    </Badge>
                    <Badge tone={priorityBadgeTone(ticket.priority)} className="ml-1 text-xs">
                      {t(ticket.priority, ticket.priority)}
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-muted mt-2 line-clamp-2">
                    {ticket.description}
                  </p>
                  <div className="mt-3 pt-3 border-t border-line">
                    <select
                      onChange={(e) => handleStatusChange(ticket.id, e)}
                      className="select-field w-full"
                    >
                      <option value="OPEN">{t('مفتوحة', 'Open')}</option>
                      <option value="IN_PROGRESS">{t('قيد المعالجة', 'In Progress')}</option>
                      <option value="RESOLVED">{t('已解决', 'Resolved')}</option>
                      <option value="CLOSED">{t('مغلقة', 'Closed')}</option>
                    </select>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </ScreenShell>
  );
}