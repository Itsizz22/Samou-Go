import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage, useToast } from '@samou-go/ui';
import { useAuth } from '@/hooks/useApi';
import { SupportTicket, TicketMessage, TicketStatus, TicketPriority } from '@samou-go/shared-types';
import { ScreenShell } from '@/components/ScreenShell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useSupportTickets, useAddMessage, useUpdateTicketStatus } from '@/hooks/useApi';
import { caseInsensitiveContains } from '@/lib/prisma';

export function TicketDetailScreen() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();

  if (!auth.ready || !auth.user) {
    return (
      <ScreenShell title="التذكرة" subtitle="Ticket Details">
        <SignInGate auth={auth} reasonAr="سجّل الدخول لعرض التفاصيل" reasonEn="Sign in to view details" />
      </ScreenShell>
    );
  }

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState({ role: 'CUSTOMER' as const, text: '' });
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    fetchTicket();
    fetchMessages();
  }, [id]);

  const fetchTicket = async () => {
    try {
      const result = await getSupportTicket(id!, undefined);
      setTicket(result);
    } catch (cause) {
      toast.error('تعذّر تحميل التذكرة', 'Failed to load ticket');
    } finally {
      setLoadingMessages(false);
    }
  };

  const fetchMessages = async () => {
    if (!id) return;
    setLoadingMessages(true);
    try {
      const result = await getSupportTicket(id!);
      setMessages(result?.messages ?? []);
    } catch (cause) {
      toast.error('تعذّر تحميل الرسائل', 'Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.text.trim()) return;
    try {
      await addSupportMessage(id!, {
        senderId: auth.user.id,
        senderRole: 'CUSTOMER',
        message: newMessage.text,
      } as any);
      setNewMessage({ role: 'CUSTOMER' as const, text: '' });
      fetchMessages();
      toast.success('تم إرسال الرسالة', 'Message sent');
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : cause instanceof typeof cause
            ? String(cause)
            : String(cause);
      toast.error('تعذّر إرسال الرسالة', 'Failed to send message');
    }
  };

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    setUpdatingStatus(true);
    try {
      await updateSupportTicketStatus(id!, { status: e.target.value } as any);
      fetchTicket();
      fetchMessages();
      toast.success('تم تحديث الحالة', 'Status updated');
    } catch (cause) {
      toast.error('تعذّر تحديث الحالة', 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (!ticket) {
    return (
      <ScreenShell title="التذكرة" subtitle="Ticket Details">
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-brand" aria-label="Loading" />
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="التذكرة" subtitle={ticket.ticketNumber}>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{ticket.subject}</CardTitle>
        </CardHeader>

        <CardContent>
          {/* Ticket info bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-ink-muted">{t('رقم التذكرة', 'Ticket Number')}</p>
              <p className="font-bold">{ticket.ticketNumber}</p>
            </div>
            <div>
              <p className="text-sm text-ink-muted">{t('الحالة', 'Status')}</p>
              <select
                value={ticket.status}
                onChange={handleStatusChange}
                className="select-field w-full"
              >
                <option value="OPEN">{t('مفتوحة', 'Open')}</option>
                <option value="IN_PROGRESS">{t('قيد المعالجة', 'In Progress')}</option>
                <option value="RESOLVED">{t('已解决', 'Resolved')}</option>
                <option value="CLOSED">{t('مغلقة', 'Closed')}</option>
              </select>
            </div>
            <div>
              <p className="text-sm text-ink-muted">{t('الأهمية', 'Priority')}</p>
              <Badge tone={priorityBadgeTone(ticket.priority)} className="text-xs">
                {t(ticket.priority, ticket.priority)}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-ink-muted">{t('الفئة', 'Category')}</p>
              <span>{t(ticket.category, ticket.category)}</span>
            </div>
          </div>

          {/* Message thread */}
          {loadingMessages ? (
            <div className="py-12 text-center">
              <Loader2 size={20} className="animate-spin text-brand margin-auto" aria-label="Loading" />
            </div>
          ) : messages.length === 0 ? (
            <div className="py-8 text-center text-ink-muted">
              {t('لا توجد رسائل بعد', 'No messages yet. Send your first follow-up above.')}
            </div>
          ) : (
            <div className="space-y-4 h-96 overflow-y-auto">
              {messages.map((msg, idx) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${
                    msg.senderRole === 'CUSTOMER' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-xl p-3 ${
                      msg.senderRole === 'CUSTOMER'
                        ? 'bg-brand text-white'
                        : 'bg-surface text-ink'
                    }`}
                  >
                    <p className="text-sm line-clamp-3">{msg.message}</p>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-2 text-xxs text-ink-muted">
                        {msg.attachments.map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-brand underline"
                          >
                            {t('ملف مرفق', 'Attachment')}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-xxs text-ink-muted">
                    {new Date(msg.createdAt).toLocaleTimeString(isArabic ? 'ar-EG' : 'en-US')}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* New message form */}
          <div className="pt-4 border-t border-line flex gap-3">
            <Input
              value={newMessage.text}
              onChange={(e) =>
                setNewMessage({ ...newMessage, text: e.target.value })
              }
              placeholder={t('اكتب ردك...', 'Write your follow-up...')}
              className="input-field flex-1"
              disabled={updatingStatus}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!newMessage.text.trim() || updatingStatus}
              className="btn-emerald"
            >
              {updatingStatus ? 'إرسال...' : t('إرسال', 'Send')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </ScreenShell>
  );
}
