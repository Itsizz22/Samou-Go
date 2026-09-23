import { Link } from 'react-router-dom';
import { usePlatformSettings } from '@samou-go/api-client';
import { formatWhatsAppLink } from '@samou-go/shared-types';

export function LegalScreen({ kind }: { kind: 'privacy' | 'terms' }) {
  const settings = usePlatformSettings();
  const title = kind === 'privacy' ? 'سياسة الخصوصية' : 'شروط الاستخدام';
  const phone = settings.data?.whatsappSupportNumber?.trim();
  return <main dir="rtl" className="min-h-svh bg-canvas px-5 py-8 text-ink">
    <div className="mx-auto max-w-2xl space-y-6">
      <Link className="inline-flex min-h-11 items-center font-bold text-brand-dark" to="/">العودة إلى التطبيق</Link>
      <header><p className="text-sm text-ink-muted">Samou Quick — سموع كويك</p><h1 className="mt-2 text-2xl font-extrabold">{title}</h1><p className="mt-2 text-xs text-ink-muted">آخر تحديث: 23 سبتمبر 2026</p></header>
      {kind === 'privacy' && <div className="space-y-5 leading-8">
        <section><h2 className="font-bold">البيانات التي نعالجها</h2><p>نستخدم الاسم ورقم الهاتف وبيانات تسجيل الدخول لإدارة الحساب والتحقق منه، والعناوين والطلبات والملاحظات لتقديم التوصيل، والصور التي تختار رفعها لملفك أو متجرك. نستخدم رموز إشعارات الجهاز لإرسال تحديثات الطلبات ورسائل الدعم.</p></section>
        <section><h2 className="font-bold">الموقع والإشعارات</h2><p>نطلب إذن الموقع لتحديد عنوان التوصيل أو موقع المتجر وتتبع الكابتن أثناء الخدمة. يشارك موقع الكابتن مع الأطراف المخولة بمتابعة الطلب. يمكنك إدارة الأذونات من إعدادات الهاتف وتفضيلات الإشعارات من التطبيق؛ وقد تتأثر الميزات التي تعتمد عليها.</p></section>
        <section><h2 className="font-bold">مع من تُشارك البيانات؟</h2><p>تُعرض بيانات الطلب الضرورية للمتجر والكابتن والإدارة لإنجازه ومتابعة الشكاوى. نعتمد على Render وVercel وNeon للاستضافة والتخزين، وFirebase للإشعارات، وSupercode لإرسال رسائل التحقق. لا نبيع بياناتك الشخصية.</p></section>
        <section><h2 className="font-bold">حماية البيانات والاحتفاظ بها</h2><p>الاتصال بين التطبيق وخادمنا يستخدم HTTPS. اتصال خادمنا بمزوّد رسائل Supercode يستخدم HTTP حاليًا ولا يوفر تشفير النقل لهذا الجزء. نحتفظ بالبيانات اللازمة لتشغيل الحساب والطلبات وتسوية الحقوق؛ عند حذف الحساب نحذف بياناته الشخصية والجلسات والمحادثات، ونحتفظ بسجلات المعاملات المالية دون ربطها بحسابك أو بيانات التواصل لأغراض المحاسبة.</p></section>
        <section><h2 className="font-bold">حقوقك والتواصل</h2><p>يمكنك تعديل بياناتك من حسابي، وحذف حسابك نهائيًا من الإعدادات ← حذف الحساب، دون التواصل مع الدعم. يمكنك التواصل لطلب الوصول إلى بياناتك أو تصحيحها.</p><Link className="font-bold text-brand-dark underline" to="/delete-account">حذف الحساب نهائيًا</Link></section>
      </div>}
      {kind === 'terms' && <div className="space-y-5 leading-8">
        <p>سموع كويك يتيح الطلب من المتاجر المحلية وتنسيق التوصيل. يلتزم المستخدم بإدخال معلومات صحيحة والحفاظ على سرية حسابه ورمز التحقق.</p>
        <p>راجع المنتجات والكميات والأسعار والعنوان قبل تأكيد الطلب. يوضح التطبيق رسوم التوصيل أو طريقة تحديدها؛ تواصل مع الدعم عند وجود اختلاف، ولا تُدخل معلومات دفع حساسة في ملاحظات الطلب.</p>
        <p>تعتمد إتاحة المنتجات وقبول الطلب ووقت التحضير على المتجر. المواعيد والمسافات المعروضة تقديرية وقد تتأثر بالطريق والازدحام.</p>
        <p>استخدم زر الإلغاء عندما يكون متاحًا. إذا بدأ التحضير أو التوصيل، تواصل مع الدعم لمعالجة الإلغاء أو مشكلة في الطلب وتحديد أي مبالغ مستحقة أو مستردة حسب الحالة، دون انتقاص من الحقوق التي يقررها القانون.</p>
        <p>يُمنع إساءة استخدام الخدمة أو إرسال طلبات وهمية أو محاولة الوصول إلى بيانات الآخرين. يمكن تقييد الحسابات المخالفة مع إتاحة التواصل مع الدعم.</p>
      </div>}
      {phone && <a className="inline-flex min-h-11 items-center font-bold text-brand-dark underline" href={formatWhatsAppLink(phone, 'لدي استفسار عن الخصوصية أو شروط Samou Quick.')} target="_blank" rel="noopener noreferrer">التواصل مع دعم سموع كويك عبر واتساب</a>}
      <nav aria-label="الخصوصية والشروط" className="flex flex-wrap gap-5 border-t border-line pt-5 text-sm text-brand-dark"><Link to="/privacy">الخصوصية</Link><Link to="/terms">الشروط</Link><Link to="/delete-account">حذف الحساب</Link></nav>
    </div>
  </main>;
}
