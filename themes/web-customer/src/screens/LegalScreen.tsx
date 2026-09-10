import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createSupportTicket, usePlatformSettings } from '@samou-go/api-client';
import { formatWhatsAppLink } from '@samou-go/shared-types';
import { useAuth } from '@/hooks/useApi';

export function LegalScreen({ kind }: { kind: 'privacy' | 'terms' | 'deletion' }) {
  const auth = useAuth();
  const settings = usePlatformSettings();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState('');
  const [error, setError] = useState('');
  const title = kind === 'privacy' ? 'سياسة الخصوصية' : kind === 'terms' ? 'شروط الاستخدام' : 'طلب حذف الحساب والبيانات';
  const phone = settings.data?.whatsappSupportNumber?.trim();
  async function requestDeletion() {
    if (!confirmed || busy || ticket) return;
    setBusy(true); setError('');
    try {
      const result = await createSupportTicket({ category: 'ACCOUNT_DELETION', subject: 'طلب حذف حسابي وبياناتي', message: 'أطلب حذف حسابي وبياناتي الشخصية المرتبطة به. يرجى التواصل معي لتأكيد الهوية وتوضيح السجلات التي يتطلب الاحتفاظ بها قبل إتمام الحذف.' });
      setTicket(result.ticketNumber);
    } catch { setError('تعذر إرسال الطلب. حاول مجددًا أو تواصل مع الدعم.'); }
    finally { setBusy(false); }
  }
  return <main dir="rtl" className="min-h-svh bg-canvas px-5 py-8 text-ink">
    <div className="mx-auto max-w-2xl space-y-6">
      <Link className="inline-flex min-h-11 items-center font-bold text-brand-dark" to="/">العودة إلى التطبيق</Link>
      <header><p className="text-sm text-ink-muted">Samou Quick — سموع كويك</p><h1 className="mt-2 text-2xl font-extrabold">{title}</h1><p className="mt-2 text-xs text-ink-muted">آخر تحديث: 11 سبتمبر 2026</p></header>
      {kind === 'privacy' && <div className="space-y-5 leading-8">
        <section><h2 className="font-bold">البيانات التي نعالجها</h2><p>نستخدم الاسم ورقم الهاتف وبيانات تسجيل الدخول لإدارة الحساب والتحقق منه، والعناوين والطلبات والملاحظات لتقديم التوصيل، والصور التي تختار رفعها لملفك أو متجرك. نستخدم رموز إشعارات الجهاز لإرسال تحديثات الطلبات ورسائل الدعم.</p></section>
        <section><h2 className="font-bold">الموقع والإشعارات</h2><p>نطلب إذن الموقع لتحديد عنوان التوصيل أو موقع المتجر وتتبع الكابتن أثناء الخدمة. يشارك موقع الكابتن مع الأطراف المخولة بمتابعة الطلب. يمكنك إدارة الأذونات من إعدادات الهاتف وتفضيلات الإشعارات من التطبيق؛ وقد تتأثر الميزات التي تعتمد عليها.</p></section>
        <section><h2 className="font-bold">مع من تُشارك البيانات؟</h2><p>تُعرض بيانات الطلب الضرورية للمتجر والكابتن والإدارة لإنجازه ومتابعة الشكاوى. نعتمد على Render وVercel وNeon للاستضافة والتخزين، وFirebase للإشعارات، وSupercode لإرسال رسائل التحقق. لا نبيع بياناتك الشخصية.</p></section>
        <section><h2 className="font-bold">حماية البيانات والاحتفاظ بها</h2><p>الاتصال بين التطبيق وخادمنا يستخدم HTTPS. اتصال خادمنا بمزوّد رسائل Supercode يستخدم HTTP حاليًا ولا يوفر تشفير النقل لهذا الجزء. نحتفظ بالبيانات اللازمة لتشغيل الحساب والطلبات وتسوية الحقوق؛ وقد يلزم الاحتفاظ ببعض سجلات المعاملات بعد طلب الحذف لأسباب قانونية أو محاسبية، مع توضيح ذلك عند معالجة الطلب.</p></section>
        <section><h2 className="font-bold">حقوقك والتواصل</h2><p>يمكنك تعديل بياناتك من حسابي، أو التواصل مع الدعم لطلب الوصول إلى بياناتك أو تصحيحها أو حذفها.</p><Link className="font-bold text-brand-dark underline" to="/delete-account">طلب حذف الحساب والبيانات</Link></section>
      </div>}
      {kind === 'terms' && <div className="space-y-5 leading-8">
        <p>سموع كويك يتيح الطلب من المتاجر المحلية وتنسيق التوصيل. يلتزم المستخدم بإدخال معلومات صحيحة والحفاظ على سرية حسابه ورمز التحقق.</p>
        <p>راجع المنتجات والكميات والأسعار والعنوان قبل تأكيد الطلب. يوضح التطبيق رسوم التوصيل أو طريقة تحديدها؛ تواصل مع الدعم عند وجود اختلاف، ولا تُدخل معلومات دفع حساسة في ملاحظات الطلب.</p>
        <p>تعتمد إتاحة المنتجات وقبول الطلب ووقت التحضير على المتجر. المواعيد والمسافات المعروضة تقديرية وقد تتأثر بالطريق والازدحام.</p>
        <p>استخدم زر الإلغاء عندما يكون متاحًا. إذا بدأ التحضير أو التوصيل، تواصل مع الدعم لمعالجة الإلغاء أو مشكلة في الطلب وتحديد أي مبالغ مستحقة أو مستردة حسب الحالة، دون انتقاص من الحقوق التي يقررها القانون.</p>
        <p>يُمنع إساءة استخدام الخدمة أو إرسال طلبات وهمية أو محاولة الوصول إلى بيانات الآخرين. يمكن تقييد الحسابات المخالفة مع إتاحة التواصل مع الدعم.</p>
      </div>}
      {kind === 'deletion' && <section className="space-y-4 rounded-2xl border border-line bg-surface p-5 leading-8">
        <p>يمكنك طلب حذف حساب Samou Quick والبيانات الشخصية المرتبطة به. هذا طلب يراجعه الدعم، ولا يُحذف الحساب فور الضغط. نتحقق من الهوية والطلبات الجارية والأرصدة قبل التنفيذ، ونوضح لك أي سجلات يتطلب الاحتفاظ بها والسبب.</p>
        {auth.user ? ticket ? <p role="status">تم تسجيل طلبك برقم <b dir="ltr">{ticket}</b>. يمكنك متابعته في <Link className="text-brand-dark underline" to="/support">المساعدة والدعم</Link>.</p> : <>
          <label className="flex items-start gap-3"><input type="checkbox" className="mt-2 h-5 w-5" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />أؤكد أنني أريد إرسال طلب حذف حسابي وبياناتي.</label>
          <button type="button" disabled={!confirmed || busy} onClick={() => void requestDeletion()} className="btn-primary min-h-11 w-full justify-center disabled:opacity-50">{busy ? 'جارٍ إرسال الطلب…' : 'إرسال طلب الحذف إلى الدعم'}</button>
          {error && <p role="alert">{error}</p>}
        </> : <p>يمكنك إرسال الطلب دون تثبيت التطبيق عبر وسيلة الدعم أدناه، أو <Link className="text-brand-dark underline" to="/login">تسجيل الدخول</Link> وإرساله من هذه الصفحة.</p>}
        <p>لا ترسل كلمة المرور أو رمز التحقق في رسالة الدعم.</p>
      </section>}
      {phone && <a className="inline-flex min-h-11 items-center font-bold text-brand-dark underline" href={formatWhatsAppLink(phone, kind === 'deletion' ? 'أريد طلب حذف حسابي وبياناتي من Samou Quick.' : 'لدي استفسار عن الخصوصية أو شروط Samou Quick.')} target="_blank" rel="noopener noreferrer">التواصل مع دعم سموع كويك عبر واتساب</a>}
      <nav aria-label="الخصوصية والشروط" className="flex flex-wrap gap-5 border-t border-line pt-5 text-sm text-brand-dark"><Link to="/privacy">الخصوصية</Link><Link to="/terms">الشروط</Link><Link to="/delete-account">حذف الحساب</Link></nav>
    </div>
  </main>;
}
