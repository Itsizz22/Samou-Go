export function ScheduledOrderNotice({ value }: { value?: string | null }) {
  if (!value) return null;
  return <p className="my-3 rounded-xl bg-brand-surface p-3 text-sm leading-6 text-brand">
    <strong className="block">طلب مجدول — وقت بدء التحضير</strong>
    {new Intl.DateTimeFormat('ar-PS', { timeZone: 'Asia/Hebron', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))}
    <span className="block text-xs">بتوقيت السموع. يُحدد وقت الجاهزية بعد قبول المتجر.</span>
  </p>;
}
