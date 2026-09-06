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
    body: 'توفر سموع كويك منصة رقمية لتوصيل الطلبات من المتاجر المحلية في بلدة السموع والمنطقة المحيطة.服务平台充当 الطلب والتوصيل فقط ولا تتحمل المسؤولية عن جودة المنتجات أو سلامة الأغذية المقدمة من المتاجر.',
  },
  {
    title: 'بيانات الحساب',
    body: 'أنت مسؤول عن الحفاظ على سرية بيانات حسابك (رقم الجوال وكلمة المرور). أنت توافق على استخدام الخدمة لحسابك الشخصي فقط ولا يجوز لك مشاركة بيانات الدخول مع أي طرف ثالث.',
  },
  {
    title: 'الطلبات والأسعار',
    body: 'جميع الأسعار المعروضة هي أسعار تقريبية وقد تتغير. رسوم التوصيل يحددها السائق عند الاستلام في حالة عدم تفعيل مناطق التوصيل التلقائية. يحق للمتجر رفض أو تعديل أي طلب.',
  },
  {
    title: 'الإلغاء والاسترداد',
    body: 'يمكنك إلغاء الطلب قبل قبوله من المتجر. بعد القبول، يخضع الإلغاء ل سياسة المتجر. في حالة الدفع نقداً عند التوصيل (COD)، لا يوجد استرداد مالي عبر التطبيق.',
  },
  {
    title: 'الخصوصية',
    body: 'نحترم خصوصيتك. نجمع فقط البيانات الضرورية لتقديم الخدمة (رقم الجوال والاسم وعنوان التوصيل). لن نشارك بياناتك مع أطراف ثالثة لأغراض التسويق_without موافقتك الصريحة.',
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

        <p className="mt-4 text-xs text-ink-muted">
          آخر تحديث: سبتمبر ٢٠٢٦ — يحق لسموع كويك تعديل هذه الشروط في أي
          وقت مع إشعار المستخدمين عبر التطبيق.
        </p>
      </div>
    </Modal>
  );
}
