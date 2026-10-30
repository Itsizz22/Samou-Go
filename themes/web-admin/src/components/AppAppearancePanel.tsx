import { useState } from 'react';
import { Store, LayoutGrid, Utensils, Image, Video, ExternalLink, ChevronLeft } from 'lucide-react';
import { FeaturedStoresSettings } from './FeaturedStoresSettings';
import { CategoryImagesSettings } from './CategoryImagesSettings';
import { FeaturedProductsSettings } from './FeaturedProductsSettings';
import { BannerSettings } from './BannerSettings';
import { VideoAdSettings } from './VideoAdSettings';

const sections = [
  { id: 'stores', title: 'المتاجر المميزة', description: 'اختر المتاجر التي تريد إبرازها للزبائن في الصفحة الرئيسية.', icon: Store, editor: FeaturedStoresSettings },
  { id: 'categories', title: 'صور التصنيفات', description: 'امنح كل تصنيف صورة واضحة تساعد الزبون على الوصول لما يبحث عنه.', icon: LayoutGrid, editor: CategoryImagesSettings },
  { id: 'products', title: 'الأطباق المميزة', description: 'رتّب اختيارات التطبيق وأبرز المنتجات التي تستحق الظهور أولاً.', icon: Utensils, editor: FeaturedProductsSettings },
  { id: 'banners', title: 'البانرات والإعلانات', description: 'جهّز صور الحملات وروابطها، وراجع ترتيب ظهورها قبل الحفظ.', icon: Image, editor: BannerSettings },
  { id: 'videos', title: 'إعلانات الفيديو', description: 'أدر محتوى الفيديو الذي يظهر داخل التطبيق من مكان واحد.', icon: Video, editor: VideoAdSettings },
] as const;

/** Keep editors mounted so switching sections never discards a draft. */
export function AppAppearancePanel() {
  const [active, setActive] = useState<string>('stores');
  const current = sections.find(section => section.id === active) ?? sections[0];
  return <div className="appearance-workspace" dir="rtl">
    <header className="appearance-intro">
      <div>
        <span className="appearance-eyebrow">المحتوى وتجربة الزبون</span>
        <h2>واجهة تعبّر عن سموع كويك</h2>
        <p>اختَر ما يراه زبائنك. رتّب المحتوى، راجع الصور، ثم احفظ تغييرات كل قسم.</p>
      </div>
      <a href="https://samou-go-customer.vercel.app" target="_blank" rel="noopener noreferrer" className="appearance-preview">
        <ExternalLink size={17} aria-hidden="true" />معاينة التطبيق
      </a>
    </header>
    <div className="appearance-layout">
      <aside className="appearance-navigation">
        <p className="appearance-nav-label">مساحة التحرير</p>
        <div role="tablist" aria-label="أدوات إدارة واجهة التطبيق" aria-orientation="vertical">
          {sections.map(({ id, title, icon: Icon }, index) => <button key={id} id={`appearance-tab-${id}`}
            type="button" role="tab" aria-selected={active === id} aria-controls={`appearance-panel-${id}`}
            tabIndex={active === id ? 0 : -1} onClick={() => setActive(id)}
            onKeyDown={event => {
              let next: number | undefined;
              if (event.key === 'ArrowDown') next = (index + 1) % sections.length;
              if (event.key === 'ArrowUp') next = (index + sections.length - 1) % sections.length;
              if (event.key === 'Home') next = 0;
              if (event.key === 'End') next = sections.length - 1;
              if (next === undefined) return;
              event.preventDefault();
              const section = sections[next];
              if (section) { setActive(section.id); document.getElementById(`appearance-tab-${section.id}`)?.focus(); }
            }}>
            <Icon size={19} aria-hidden="true" /><span>{title}</span><ChevronLeft size={14} aria-hidden="true" />
          </button>)}
        </div>
        <p className="appearance-help">تمييز المتاجر يُطبّق مباشرة. باقي الأقسام لها زر حفظ مستقل. التنقل بينها يحتفظ بالمسودة حتى مغادرة الصفحة.</p>
      </aside>
      <div className="appearance-editor">
        <div className="appearance-editor-heading"><span>إدارة واجهة التطبيق / {current.title}</span><p>{current.description}</p></div>
        {sections.map(({id, editor: Editor}) => <div key={id} id={`appearance-panel-${id}`} role="tabpanel"
          aria-labelledby={`appearance-tab-${id}`} hidden={active !== id} tabIndex={0}><Editor /></div>)}
      </div>
    </div>
  </div>;
}
