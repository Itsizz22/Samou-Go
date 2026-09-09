import { SupportDesk } from '@samou-go/api-client';
import { useAuth } from '@/hooks/useApi';
import { ScreenShell } from '@/components/ScreenShell';
export function SupportScreen() {
  const auth = useAuth();
  return <ScreenShell title="المساعدة والدعم" subtitle="Help & support">{auth.user && <SupportDesk userId={auth.user.id} isAdmin={auth.user.role === 'ADMIN'} />}</ScreenShell>;
}
