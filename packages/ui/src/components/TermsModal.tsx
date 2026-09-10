/**
 * TermsModal — Terms of Service bottom sheet for Samou Quick.
 *
 * Displays the 5 core clauses of the Arabic Terms of Service during
 * user registration. Uses the shared Modal component with sheet variant
 * for mobile-first UX.
 */
import { Modal } from './Modal';

export interface TermsModalProps {
  open: boolean;
  onClose: () => void;
}

const TERMS_CLAUSES = [
  {
    title: 'طبيعة الخدمة',
    body: 'توفر سموع كويك منصة رقمية لتوصيل الطلبات من المتاجر المحلية في بلدة السموع والمنطقة المحيطة. تنسّق المنصة الطلب والتوصيل، ويمكن التواصل مع الدعم لمعالجة أي مشكلة في الخدمة أو المنتجات.',
  },
  {
    title: 'بيانات الحساب',
    body: 'أنت مسؤول عن الحفاظ على سرية بيانات حسابك (رقم الجوال وكلمة المرور). أنت توافق على استخدام الخدمة لحسابك الشخصي فقط ولا يجوز لك مشاركة بيانات الدخول مع أي طرف ثالث.',
  },
  {
    title: 'الطلبات والأسعار',
    body: 'راجع المنتجات والأسعار والعنوان قبل تأكيد الطلب. يعرض التطبيق رسوم التوصيل أو طريقة تحديدها. قبول الطلب وتوفر المنتجات يعتمدان على المتجر؛ تواصل مع الدعم عند وجود اختلاف.',
  },
  {
    title: 'الإلغاء والاسترداد',
    body: 'استخدم زر الإلغاء عندما يكون متاحًا. بعد بدء التحضير أو التوصيل، تواصل مع الدعم لمعالجة الإلغاء أو الاسترداد حسب الحالة، دون انتقاص من الحقوق التي يقررها القانون.',
  },
  {
    title: 'الخصوصية',
    body: 'نعالج بيانات الحساب والطلبات والعناوين والموقع والصور التي ترفعها ورموز إشعارات الجهاز لتقديم الخدمة. توضح سياسة الخصوصية المفصلة المشاركة والحماية وطلب حذف الحساب.',
  },
];

export function TermsModal({ open, onClose }: TermsModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="شروط وأحكام استخدام سموع كويك"
      variant="sheet"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="btn-primary w-full justify-center"
        >
          أوافق وأفهم الشروط
        </button>
      }
    >
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pe-1 text-sm leading-relaxed">
        {TERMS_CLAUSES.map((clause, i) => (
          <section key={i}>
            <h3 className="mb-1 text-sm font-extrabold text-ink">
              {i + 1}. {clause.title}
            </h3>
            <p className="text-ink-soft">{clause.body}</p>
          </section>
        ))}

        <p className="mt-4 text-sm text-brand-dark"><a href="https://samou-go-customer.vercel.app/privacy" target="_blank" rel="noopener noreferrer" className="underline">سياسة الخصوصية المفصلة</a> · <a href="https://samou-go-customer.vercel.app/terms" target="_blank" rel="noopener noreferrer" className="underline">شروط الاستخدام</a></p>
        <p className="mt-4 text-xs text-ink-muted">
          آخر تحديث: سبتمبر ٢٠٢٦ — يحق لسموع كويك تعديل هذه الشروط في أي
          وقت مع إشعار المستخدمين عبر التطبيق.
        </p>
      </div>
    </Modal>
  );
}
