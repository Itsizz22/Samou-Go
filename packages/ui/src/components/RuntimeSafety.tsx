import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';

/** A small, dependency-free offline indicator for every Samou' Go surface. */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  if (online) return null;
  return <div role="status" className="fixed inset-x-0 top-0 z-[100] bg-warning px-4 py-2 text-center text-xs font-bold text-white">أنت غير متصل بالإنترنت — ستُستأنف التحديثات عند عودة الاتصال <span dir="ltr">/ You’re offline</span></div>;
}

interface ErrorBoundaryProps { children: ReactNode; }
interface ErrorBoundaryState { failed: boolean; }

/** Prevents a rendering exception from becoming an unrecoverable blank page. */
export class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState { return { failed: true }; }
  override componentDidCatch(_error: Error, _info: ErrorInfo): void { /* host logging may be added here */ }

  override render() {
    if (!this.state.failed) return this.props.children;
    return <main dir="rtl" className="flex min-h-screen items-center justify-center bg-canvas p-5 text-ink"><section className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center shadow-raised"><h1 className="text-lg font-extrabold">حدث خطأ غير متوقع</h1><p dir="ltr" className="mt-1 text-xs text-ink-muted">Something went wrong</p><button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white">إعادة التحميل <span dir="ltr">/ Reload</span></button></section></main>;
  }
}
