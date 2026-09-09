import { useSearchParams } from 'react-router-dom';
import { SupportDesk } from '@samou-go/api-client';
import { useAuth } from '@/hooks/useApi';
import { ScreenShell } from '@/components/ScreenShell';
export function SupportScreen() {
  const auth = useAuth();
  const [params] = useSearchParams();
  return <ScreenShell title="المساعدة والدعم" subtitle="Help & support">{auth.user && <SupportDesk key={params.get("orderId") ?? "general"} orderId={params.get("orderId") ?? undefined} userId={auth.user.id} isAdmin={auth.user.role === 'ADMIN'} />}</ScreenShell>;
}
