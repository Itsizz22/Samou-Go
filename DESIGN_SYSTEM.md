# Samou' Go — نظام التصميم الموحّد / Unified Design System

> المرجع الوحيد (single source of truth) لهوية تطبيق **Samou' Go** — تطبيق توصيل محلي
> لبلدة السموع، الخليل. عربي أولاً (RTL)، ثنائي اللغة، أخضر زمردي.
>
> **الإصدار:** 2.0 — إعادة توحيد الهوية على `#10B981`
> **النطاق:** جميع مشاريع الواجهات السبعة داخل `themes/`

---

## جدول المحتويات

1. [جرد المشاريع الحالية](#1-جرد-المشاريع-الحالية)
2. [التقنيات المستخدمة](#2-التقنيات-المستخدمة)
3. [لوحة الألوان](#3-لوحة-الألوان)
4. [رموز التصميم Design Tokens](#4-رموز-التصميم-design-tokens)
5. [الخطوط والطباعة](#5-الخطوط-والطباعة)
6. [الاتجاه والتعريب RTL](#6-الاتجاه-والتعريب-rtl)
7. [قواعد المكوّنات](#7-قواعد-المكوّنات)
8. [رسوم التوصيل — قاعدة إلزامية](#8-رسوم-التوصيل--قاعدة-إلزامية)
9. [خريطة ترحيل الألوان](#9-خريطة-ترحيل-الألوان)
10. [بنية الملفات](#10-بنية-الملفات)
11. [قواعد المساهمة](#11-قواعد-المساهمة)
12. [حالة التحقّق](#12-حالة-التحقق--verification-status)

---

## 1. جرد المشاريع الحالية

مجلد `themes/` يضم **7 مشاريع Vite مستقلة**، كل واحد يمثّل شاشة أو لوحة واحدة.
جميعها مولَّدة بأداة توليد واجهات (اسم الحزمة في `package.json` هو `component-forge`)،
ولذلك تحتوي على نفس السكافولد تماماً.

| # | المجلد | المكوّن الرئيسي | الدور | الاتجاه | الجهاز |
|---|--------|------------------|-------|---------|--------|
| 1 | `Customer shop` | `SamouGoHome` | الرئيسية للزبون | RTL | موبايل |
| 2 | `Store Details & Product Menu` | `StoreDetailsMenu` | صفحة المتجر وقائمة المنتجات | RTL | موبايل |
| 3 | `Store Details & Product Menu_1` | `CartCheckoutSummary` | السلة وإتمام الدفع | RTL | موبايل |
| 4 | `Live Order Tracking` | `LiveOrderTracking` | تتبّع الطلب المباشر | RTL | موبايل |
| 5 | `Delivery Captain Dashboard` | `SamouGoCaptain` | لوحة السائق (الكابتن) | RTL | موبايل |
| 6 | `Store Manager Dashboard` | `SamouGoStoreManager` | لوحة صاحب المتجر | RTL | موبايل |
| 7 | `admin` | `SamouGoAdminDashboard` | لوحة تحكّم النظام | RTL (كان LTR) | سطح مكتب |

### 1.1 تفصيل كل شاشة

#### 1 — `SamouGoHome` (الرئيسية للزبون)
- **هيدر أخضر** يحوي: زر قائمة، شعار `Samou' Go`، جرس إشعارات بنقطة حمراء، سلة.
- **شريط الموقع**: `السموع، الخليل` / `Al-Samou', Hebron` + تحية `مرحباً! 👋`.
- **حقل بحث** عائم يتداخل مع الهيدر بمقدار `-mt-6`.
- **بانر عروض** بتدرّج لوني + مؤشران قابلان للنقر (`banner` state).
- **الفئات** (5): مطاعم `Utensils`، سوبرماركت `ShoppingBag`، صيدليات `Pill`، محلات `Store`، مقاهي `Coffee`.
- **المتاجر المميزة** (3): سوبرماركت أبو خليل ★4.8، صيدلية السموع ★4.9، مطعم النور ★4.7 — بطاقات أفقية مع زر مفضّلة (`liked` state).
- **قريب منك** (3): سوبرماركت السلطان، مقهى الورد، ساموع فريش (مغلق).
- **تبويب سفلي** ثابت بـ5 عناصر: Home / Search / Orders / Favorites / Profile.
- **State**: `activeCategory`, `banner`, `liked`.

#### 2 — `StoreDetailsMenu` (صفحة المتجر)
- يستهلك المكوّنين المشتركين `HeaderNav` و `BottomTabs`.
- صورة غلاف `h-48`، شارة `Open now · مفتوح الآن`، تقييم 4.8، `20–30 min`، `0.8 km`.
- **الأقسام** (4): الكل / ألبان / تسالي / مشروبات — فلترة فورية.
- **شبكة منتجات** بعمودين: حليب 7.50، لبنة 12.00، رقائق 5.00، عصير برتقال 8.50 (بالشيكل).
- عدّاد كمية لكل منتج (`+` يظهر، ثم `−/عدد/+`)، وحذف تلقائي عند الصفر.
- شريط عائم `View Cart (n items)` يظهر فقط عند `itemCount > 0`.
- **State**: `activeCategory`, `cartItems: Record<string, number>`.
- الصور من Unsplash (روابط خارجية).

#### 3 — `CartCheckoutSummary` (السلة والدفع)
- 3 أصناف: زيت زيتون بكر ممتاز 24، زعتر أخضر بلدي 12، خبز طابون 9.
- تعديل الكميات بحد أدنى 1 (`Math.max(1, …)`).
- عنوان التوصيل: `شارع السموع الرئيسي` + زر تغيير.
- طريقة الدفع: **الدفع عند الاستلام (COD)** فقط.
- **ملخص الفاتورة**: المجموع الفرعي + رسوم التوصيل (٣ ₪ لأقل من ٥ أصناف، ٥ ₪ لـ٥ أصناف أو أكثر) = الإجمالي.
- زر `Place Order / اطلب الآن`.
- **State**: `items: CartItem[]`.

#### 4 — `LiveOrderTracking` (تتبّع الطلب)
- بطاقة الطلب `#SM-2048` عبر المكوّن المشترك `OrderCard`.
- **خط زمني بـ6 مراحل**: Pending → Accepted → **Preparing (النشطة)** → Ready for Pickup → On the Way → Delivered، لكل مرحلة `state: 'completed' | 'active' | 'pending'`.
- **خريطة SVG مرسومة يدوياً** (`viewBox="0 0 360 190"`): 3 شوارع خلفية + مسار أخضر + نقطتان (المطبخ / موقعك) + `1.8 km`.
- زرّا اتصال: `Call Store` (`022740555`) و `Call Driver` (`0599002048`) عبر `tel:`.
- **بلا state** — عرض ثابت.

#### 5 — `SamouGoCaptain` (لوحة السائق)
- تحية `مرحباً عمر 👋` + مفتاح `متاح / غير متاح`.
- **أرباح اليوم**: `35 ₪`، 8 توصيلات، 3.5 ساعة، شريط تقدّم 70% من الهدف.
- **التوصيل الحالي**: صيدلية السموع → سارة محمود، 3 ₪، مؤشر مراحل (Picked Up → On the Way → Delivered)، زرّا اتصال وتأكيد.
- **طلبات متاحة** (2): صيدلية السموع 1.2 km / 3 ₪، سوبرماركت أبو خليل 2.4 km / 5 ₪ — قبول أو تجاهل.
- **توصيلات اليوم** (3 مكتملة) بالوقت والأجرة.
- تبويب سفلي بـ5 عناصر: الرئيسية / الطلبات / الخريطة / الأرباح / حسابي.
- **State**: `available`, `activeDelivery`, `acceptedOrders`, `activeTab`.

#### 6 — `SamouGoStoreManager` (لوحة صاحب المتجر)
- هيدر باسم `سوبرماركت أبو خليل` + جرس بعدّاد `2` + مفتاح `متجر مفتوح`.
- **KPIs** (3): مبيعات اليوم 420 ₪، الطلبات النشطة 3، مكتملة 18.
- **الطلبات الواردة** (3): `#1048`, `#1047` (قيد التحضير مع شريط 2/3), `#1046` — قبول/رفض مع `notice` مؤقت لمدة 2200ms.
- **إجراءات سريعة** (4): إدارة القائمة، تقرير المبيعات، الإشعارات، إعدادات المتجر.
- **النشاط الأخير** (3 أحداث).
- تبويب سفلي بـ4 عناصر.
- **State**: `isOpen`, `orders`, `activeTab`, `notice`.

#### 7 — `SamouGoAdminDashboard` (لوحة النظام)
- **شريط جانبي** `w-[244px]` بـ8 أقسام: Dashboard / Users / Stores / Captains / Orders / Finance / Reports / Settings — قابل للطي على الموبايل.
- هيدر ثابت (sticky) مع بحث، إشعارات، بروفايل.
- **KPIs** (4): 142 طلب `+12.5%`، 8 توصيل نشط `+4.2%`، 24 متجر `+8.1%`، 890 ILS `+16.8%`.
- **جدول الطلبات المباشرة** (5 صفوف) بأعمدة: Order ID / Customer / Store / Captain / Status / Amount، وأربع حالات بألوان (`green`, `orange`, `blue`, `yellow`).
- **النشاط الأخير** (4 أحداث بأيقونات ملوّنة).
- **رسم أعمدة أسبوعي** (السبت→الجمعة، ذروة 142 يوم الجمعة) — أعمدة `div` بارتفاع محسوب.
- **دائرة الفئات** بـ`conic-gradient`: مطاعم 54%، صيدليات 24%، سوبرماركت 22%.
- **State**: `activeNav`, `sidebarOpen`.

### 1.2 المكوّنات المشتركة

| المكوّن | يُستخدم في | الواجهة (Props) |
|---------|-----------|------------------|
| `HeaderNav` | 2, 3, 4 | `title`, `arabicTitle?`, `showBack?`, `onBack?`, `showCart?`, `cartCount?`, `onCartClick?` |
| `BottomTabs` | 2, 3, 4 | `activeTab: 'home' \| 'explore' \| 'orders' \| 'profile'`, `onTabChange?` |
| `OrderCard` | 4 | `id`, `storeName`, `arabicStoreName?`, `status: OrderStatus`, `itemsCount`, `totalPrice`, `date`, `onDetailsClick?` |

`OrderStatus = 'pending' | 'preparing' | 'on_the_way' | 'delivered' | 'cancelled'`

### 1.3 ملاحظات مهمة على الوضع الحالي

- **كل البيانات ثابتة (hard-coded)** داخل المكوّنات: لا API، لا routing، لا إدارة حالة عامة.
  هذه نماذج تصميم (design mockups) لا تطبيق متكامل.
- `Store Details & Product Menu` هو المشروع الوحيد الذي ثُبِّتت فيه `node_modules`.
- المشروعان `Store Details & Product Menu` و `…_1` يتشاركان الاسم لكنهما شاشتان مختلفتان.
- ملفات `src/settings/theme.ts` تقرأ `'%INJECTED_THEME%'` و `'%INJECTED_CONTAINER%'` —
  وهي placeholders تستبدلها أداة التوليد وقت البناء. **لا تلمسها.**
- `src/main.tsx` يفرض الوضع الفاتح دائماً (`classList.remove('dark')`) ويعطّل الرسوم
  المتحركة عند `?mode=editable`.

---

## 2. التقنيات المستخدمة

| الطبقة | الاختيار |
|--------|----------|
| Build | Vite 6 + `@vitejs/plugin-react` |
| Framework | React 19 + TypeScript 5.7 |
| Styling | **Tailwind CSS v4** عبر `@tailwindcss/vite` |
| تهيئة Tailwind | **CSS-first** — لا يوجد `tailwind.config.js`، كل شيء داخل `@theme` في `src/index.css` |
| مكتبة المكوّنات | shadcn/ui (`components.json`, `style: new-york`) |
| الأيقونات | `lucide-react` |
| الحركة | `framer-motion` |
| الرسوم البيانية | `recharts` (متوفّرة، غير مستخدمة بعد) |
| النماذج | `react-hook-form` + `zod` |
| Alias | `@` → `./src` |
| التنسيق | Prettier — `singleQuote`, `printWidth: 100`, `tabWidth: 2` |

> ⚠️ **مهم:** لأن Tailwind v4 يعتمد CSS-first، فإن **تسجيل الألوان يحدث في
> `src/index.css` داخل `@theme`** وليس في ملف config جافاسكربت. إنشاء
> `tailwind.config.js` هنا لن يكون له أي أثر.

---

## 3. لوحة الألوان

### 3.1 الهوية الأساسية

| الدور | القيمة | Token | الاستخدام |
|-------|--------|-------|-----------|
| **Primary Brand** | `#10B981` | `brand` | أزرار رئيسية، أيقونات نشطة، تبويب نشط، مؤشرات |
| **Primary Dark / Hover** | `#059669` | `brand-dark` | `hover:` و `active:` للأزرار الرئيسية، أرقام بارزة |
| **Primary Deep** | `#047857` | `brand-deep` | خلفيات غامقة (شريط الأدمن الجانبي، شريط السلة)، نص على تدرّج فاتح |
| **Primary Light / Accent** | `#D1FAE5` | `brand-tint` | خلفيات الشارات، حلقات المؤشرات، الفواصل الخفيفة |
| **Primary Wash** | `#ECFDF5` | `brand-surface` | أفتح خلفية خضراء: hover على البطاقات، حاويات الأيقونات |
| **Primary Soft** | `#6EE7B7` | `brand-soft` | أعمدة الرسوم الثانوية، تدرّجات |

### 3.2 المحايدة

| الدور | القيمة | Token |
|-------|--------|-------|
| Neutral Dark (نص أساسي) | `#111827` | `ink` |
| نص ثانوي داكن | `#4B5563` | `ink-soft` |
| نص ثانوي | `#6B7280` | `ink-muted` |
| نص ثالثي / تلميحات | `#9CA3AF` | `ink-subtle` |
| سطح البطاقات | `#FFFFFF` | `surface` |
| خلفية الصفحة | `#F3F4F6` | `canvas` |
| حدود | `#E5E7EB` | `line` |
| فواصل خفيفة | `#F3F4F6` | `line-soft` |

### 3.3 الحالات

| الحالة | أساسي | تِنت | نص على التِنت | Tokens |
|--------|-------|------|----------------|--------|
| **Danger / ملغى / رفض** | `#EF4444` | `#FEE2E2` | `#B91C1C` | `danger`, `danger-tint`, `danger-ink` |
| **Warning / قيد الانتظار** | `#F59E0B` | `#FEF3C7` | `#B45309` | `warning`, `warning-tint`, `warning-ink` |
| **Info / قيد التحضير** | `#3B82F6` | `#DBEAFE` | `#1D4ED8` | `info`, `info-tint`, `info-ink` |
| **Success / تم التوصيل** | `#10B981` | `#D1FAE5` | `#047857` | `brand`, `brand-tint`, `brand-deep` |

### 3.4 قواعد ملزمة

- ❌ **ممنوع** استخدام hex مباشرة في `className` (`bg-[#10B981]`).
- ❌ **ممنوع** استخدام ألوان Tailwind الافتراضية للأخضر (`bg-green-600`, `text-emerald-500`).
- ✅ **استخدم دائماً** utility الرموز: `bg-brand`, `text-ink-muted`, `border-line`.
- نسبة التباين: كل نص على `brand` يجب أن يكون `white`؛ النص على `brand-tint` يكون `brand-deep`.

---

## 4. رموز التصميم Design Tokens

مسجّلة في `src/index.css`:

```css
@theme {
  /* Brand */
  --color-brand: #10b981;
  --color-brand-dark: #059669;
  --color-brand-deep: #047857;
  --color-brand-tint: #d1fae5;
  --color-brand-surface: #ecfdf5;
  --color-brand-soft: #6ee7b7;

  /* Neutrals */
  --color-ink: #111827;
  --color-ink-soft: #4b5563;
  --color-ink-muted: #6b7280;
  --color-ink-subtle: #9ca3af;
  --color-surface: #ffffff;
  --color-canvas: #f3f4f6;
  --color-line: #e5e7eb;
  --color-line-soft: #f3f4f6;

  /* Status */
  --color-danger: #ef4444;      --color-danger-tint: #fee2e2;   --color-danger-ink: #b91c1c;
  --color-warning: #f59e0b;     --color-warning-tint: #fef3c7;  --color-warning-ink: #b45309;
  --color-info: #3b82f6;        --color-info-tint: #dbeafe;     --color-info-ink: #1d4ed8;

  /* Type */
  --font-sans: 'Tajawal', 'Cairo', system-ui, sans-serif;

  /* Radius */
  --radius-card: 0.75rem;   /* rounded-xl  */
  --radius-panel: 1rem;     /* rounded-2xl */

  /* Elevation */
  --shadow-card: 0 1px 2px 0 rgb(17 24 39 / 0.05);
  --shadow-raised: 0 4px 12px -2px rgb(17 24 39 / 0.08);
  --shadow-brand: 0 8px 20px -4px rgb(16 185 129 / 0.35);
}
```

يقابلها ملف TypeScript مطابق في `src/theme/tokens.ts` للاستخدام داخل
`style={{}}` أو حسابات SVG (حيث لا تعمل classes):

```ts
import { tokens } from '@/theme/tokens';
tokens.brand;      // '#10B981'
tokens.inkMuted;   // '#6B7280'
```

### الـ utilities المتاحة تلقائياً

| النمط | أمثلة |
|-------|-------|
| خلفية | `bg-brand`, `bg-brand-tint`, `bg-canvas`, `bg-surface`, `bg-danger-tint` |
| نص | `text-brand`, `text-brand-deep`, `text-ink`, `text-ink-muted`, `text-warning-ink` |
| حدود | `border-line`, `border-brand`, `border-danger` |
| حلقة | `ring-brand`, `ring-brand-tint`, `focus:ring-brand/40` |
| أيقونات SVG | `fill-brand`, `stroke-brand` |
| تدرّج | `from-brand-dark`, `to-brand-soft`, `via-brand` |
| ظل | `shadow-card`, `shadow-raised`, `shadow-brand` |

---

## 5. الخطوط والطباعة

```css
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=Cairo:wght@400;600;700;800&display=swap');
```

- **الخط الأساسي:** `Tajawal` — خط عربي نظيف هندسي.
- **البديل الأول:** `Cairo`، ثم `system-ui`, `sans-serif`.
- يُطبّق على `body` وكل العناوين `h1–h6` عبر `--font-sans`.

### مقياس الطباعة

| الاستخدام | Classes |
|-----------|---------|
| عنوان شاشة | `text-2xl font-extrabold tracking-tight` |
| عنوان قسم | `text-lg font-extrabold` |
| ترجمة القسم (الثانية) | `text-xs text-ink-muted` |
| عنوان بطاقة | `text-sm font-bold` |
| نص متن | `text-sm` |
| تفاصيل | `text-xs text-ink-muted` |
| بيانات دقيقة | `text-[10px] text-ink-subtle` |
| رقم/سعر بارز | `text-2xl font-black text-brand-dark` |

### نمط ثنائي اللغة

كل عنوان يظهر بالعربية أولاً ثم الإنجليزية أصغر وأخفت، مع `dir="ltr"`
على الجزء اللاتيني/الأرقام:

```tsx
<div>
  <h2 className="text-lg font-extrabold text-ink">الفئات</h2>
  <p className="text-xs text-ink-muted" dir="ltr">Categories</p>
</div>
```

---

## 6. الاتجاه والتعريب RTL

### 6.1 الافتراضي

```html
<html lang="ar" dir="rtl">
```

مطبَّق على **كل** ملفات `index.html` السبعة. لوحة الأدمن أيضاً أصبحت RTL
(كانت `dir="ltr"`) لتوحيد التجربة.

### 6.2 استخدم الخصائص المنطقية دائماً

| ❌ فيزيائي (يكسر RTL) | ✅ منطقي |
|----------------------|----------|
| `pl-4` / `pr-4` | `ps-4` / `pe-4` |
| `ml-2` / `mr-2` | `ms-2` / `me-2` |
| `left-0` / `right-0` | `start-0` / `end-0` |
| `text-left` / `text-right` | `text-start` / `text-end` |
| `rounded-l-xl` | `rounded-s-xl` |
| `border-l` | `border-s` |
| `-translate-x-full` | `-translate-x-full rtl:translate-x-full` |
| `inset-x-0` | ✅ آمن كما هو |

### 6.3 الأيقونات الاتجاهية

`ChevronLeft` / `ChevronRight` / `ArrowRight` تحتاج قلباً في RTL:

```tsx
<ChevronRight className="h-4 w-4 rtl:rotate-180" />
```

### 6.4 الجزر اللاتينية (LTR islands)

الأرقام، الأسعار، الأكواد (`#SG-1042`)، الأسماء الإنجليزية، والمسافات
(`1.8 km`) تُغلَّف بـ `dir="ltr"` لتُقرأ صحيحاً داخل سياق RTL:

```tsx
<p dir="ltr" className="text-xl font-black">35 ₪</p>
<span dir="ltr">#SG-1042</span>
```

### 6.5 flex / grid

`flex-row` في RTL يعكس ترتيب العناصر تلقائياً — وهذا **مطلوب**.
لا تستخدم `flex-row-reverse` لتصحيح شيء عكسه المتصفح أصلاً؛
استخدمه فقط عندما تريد عكساً متعمّداً بغض النظر عن الاتجاه.

---

## 7. قواعد المكوّنات

### 7.1 الأزرار

| النوع | Classes |
|-------|---------|
| **Primary** | `rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-brand transition hover:bg-brand-dark active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand/40` |
| **Secondary** | `rounded-xl border border-line bg-surface px-4 py-3 text-sm font-bold text-ink-soft transition hover:border-brand hover:bg-brand-surface active:scale-[0.98]` |
| **Danger** | `rounded-xl border border-danger/40 px-4 py-3 text-sm font-bold text-danger transition hover:bg-danger-tint active:scale-[0.98]` |
| **Ghost / أيقونة** | `rounded-full p-2 transition hover:bg-canvas active:scale-95` |

قاعدة ثابتة: **كل زر رئيسي يحمل `hover:bg-brand-dark` و `active:scale-[0.98]`
و`focus:ring-brand/40`.** لا استثناءات.

### 7.2 البطاقات والأسطح

```tsx
className="rounded-xl border border-line bg-surface p-4 shadow-card"
```

- الشعاع: `rounded-xl` للبطاقات، `rounded-2xl` للألواح والحاويات الكبيرة.
- الظل: `shadow-card` افتراضياً، `shadow-raised` عند `hover` أو للعناصر العائمة.
- ❌ لا ظلال ملوّنة يدوية مثل `shadow-[0_3px_14px_rgba(22,76,40,0.08)]`.

### 7.3 حقول الإدخال

```tsx
className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-sm text-ink
           placeholder:text-ink-subtle focus:border-brand focus:outline-none
           focus:ring-2 focus:ring-brand/30"
```

### 7.4 الشارات ومؤشرات الحالة

القاعدة: **خلفية تِنت فاتحة + نص بلون الحالة الغامق.**

```tsx
<span className="rounded-full bg-brand-tint px-2.5 py-1 text-[10px] font-bold text-brand-deep">
  مفتوح
</span>
```

| الحالة | Classes |
|--------|---------|
| مفتوح / تم التوصيل / مقبول | `bg-brand-tint text-brand-deep` |
| قيد الانتظار / معلّق | `bg-warning-tint text-warning-ink` |
| قيد التحضير / في الطريق | `bg-info-tint text-info-ink` |
| مغلق / ملغى / مرفوض | `bg-danger-tint text-danger-ink` |
| محايد | `bg-canvas text-ink-muted` |

كما تتوفّر أصناف جاهزة في `@layer components`: `badge-brand`, `badge-warning`,
`badge-info`, `badge-danger`, `badge-neutral` — وكلٌّ منها **مكتفٍ بذاته**
(يحمل قواعد `badge-base` كاملةً بداخله). السبب: Tailwind v4 لا يسمح بـ
`@apply` لصنف مخصّص، فقط للـ utilities الحقيقية — لذلك لا تكتب
`@apply badge-base …` وإلا فشل البناء برسالة
`Cannot apply unknown utility class: badge-base`.

### 7.5 `HeaderNav`

`sticky top-0 z-50`، خلفية `bg-surface`، حد سفلي `border-line`، ارتفاع `h-16`،
عدّاد السلة شارة `bg-brand` دائرية بحد أبيض، أيقونة الرجوع `rtl:rotate-180`.

### 7.6 `BottomTabs`

`fixed inset-x-0 bottom-0 z-50`، `bg-surface/95 backdrop-blur`، حد أعلى `border-line`،
حشوة سفلية آمنة `pb-[max(0.625rem,env(safe-area-inset-bottom))]`،
التبويب النشط `text-brand` مع `fill-current` و `strokeWidth={2.5}`.

### 7.7 `OrderCard`

بطاقة قابلة للنقر: `rounded-xl border-line bg-surface shadow-card hover:shadow-raised
active:scale-[0.98] cursor-pointer`، وشارة حالة مبنية على `statusConfig` بحسب الجدول أعلاه.

### 7.8 الخطوط الزمنية (Timelines)

- مكتملة: دائرة `bg-brand border-brand text-white` + `Check`.
- نشطة: `border-brand bg-surface text-brand ring-4 ring-brand-tint`.
- منتظرة: `border-line bg-surface text-ink-subtle` + `opacity-55` على النص.
- الخط الواصل: `bg-brand-tint` للمكتمل، `bg-line` لغير ذلك.

---

## 8. رسوم التوصيل — قاعدة إلزامية

كل عرض لرسوم التوصيل **يجب** أن يمرّ عبر `src/lib/delivery.ts`.
لا نصوص مكتوبة يدوياً، ولا قيم مضمّنة، ولا `'3 ILS'.split(' ')[0]`.

**التعريفة الرسمية (السموع):** ٣ ₪ للسلة الأقل من ٥ أصناف، و٥ ₪ عند ٥ أصناف أو
أكثر. العدد المحسوب هو عدد **الوحدات** لا عدد المنتجات المختلفة: ٥ أرغفة خبز سلةٌ
كبيرة. السلة الفارغة = ٠.

**المصدر الوحيد للحقيقة** بعد إضافة الـBackend هو
`packages/shared-types/src/delivery.ts` — وهو ما يستورده الـAPI فعلياً.
أما `themes/*/src/lib/delivery.ts` فهي **نسخ مطابقة** موجودة فقط لأن تطبيقات
Vite لم تُوصَل بعد بحزمة الـworkspace. أي تغيير في التعريفة يبدأ من
`shared-types` ثم يُنسخ حرفياً إلى السبعة.

```ts
// packages/shared-types/src/delivery.ts  ≡  themes/*/src/lib/delivery.ts
export const DELIVERY_FEE_LABEL = { ar: 'رسوم التوصيل', en: 'Delivery Fee' } as const;
export const CURRENCY = { code: 'ILS', symbol: '₪' } as const;

export interface DeliveryFeeConfig {
  baseFee: number;        // 3
  bulkFee: number;        // 5
  bulkThreshold: number;  // 5
  currency: 'ILS';
}
export const DEFAULT_DELIVERY_FEE_CONFIG: DeliveryFeeConfig;

export function formatCurrency(amount: number, opts?): string;
export function formatDeliveryFee(amount: number, opts?): string;
export function calculateDeliveryFee(itemCount: number, config?: DeliveryFeeConfig): number;
export function deliveryFeeLabel(locale?: 'ar' | 'en' | 'both'): string;
```

```tsx
// src/components/ui/DeliveryFee.tsx
<DeliveryFee amount={3} />                       // رسوم التوصيل / Delivery Fee ⋯ ₪3
<DeliveryFee amount={fee} variant="inline" />    // سطر واحد مختصر
<DeliveryFee amount={fee} variant="badge" />     // شارة تِنت
<DeliveryFee amount={fee} variant="row" />       // صف فاتورة (label ⋯ value)
```

القيم تُحسب دائماً من `calculateDeliveryFee(itemCount)` أو تأتي من الـAPI
كـ`number` — **never** كسلسلة نصية `'3 ILS'`. والواجهة **لا ترسل** أي مبلغ إلى
الـAPI: الخادم يُسعّر السلة من قاعدة البيانات ويعيد `subtotal` و`deliveryFee`
و`totalAmount`.

---

## 9. خريطة ترحيل الألوان

الألوان القديمة (الأخضر `#16A34A` ودرجاته الرمادية المائلة للأخضر) → الرموز الجديدة.

### 9.1 الأخضر

| قديم | جديد |
|------|------|
| `#16A34A`, `#22C55E`, `#39B968`, `green-600` | `brand` |
| `#15803D`, `#0EA574`, `green-700` | `brand-dark` |
| `#14532D`, `#166534`, `#287A50`, `#27583A`, `#214B30`, `#263F2E`, `#294C35`, `#304F3B`, `#356046` | `brand-deep` |
| `#DCFCE7`, `#BBF7D0`, `#B7E4C7`, `#B9E5C5`, `#A7DDB6`, `#B9D7C1` | `brand-tint` |
| `#F0FDF4`, `#F0F7F2`, `#F0F9F2`, `#EAF7EC`, `#EAF4EC`, `#F3FAF4`, `#F7FCF8`, `#E8F5EC`, `#F4F8F4`, `#F8FBF8`, `#EDF5EF` | `brand-surface` |
| `#86D6A1`, `#34D399` | `brand-soft` |

### 9.2 المحايدة

| قديم | جديد |
|------|------|
| `#163022`, `#17221B`, `#183225`, `#183326`, `#15251B`, `#173822` | `ink` |
| `#466355`, `#496454`, `#4E6E5B`, `#526A5B`, `#536158`, `#536E5E`, `#557263`, `#5E7968` | `ink-soft` |
| `#607569`, `#60766A`, `#657267`, `#657A6C`, `#667F70`, `#6B8071`, `#718078`, `#71847A`, `#789082`, `#7A877E`, `#7A8C80`, `#7B8D82`, `#7C8D84`, `#809287`, `#81938A`, `#82938A`, `#829187`, `#83938A`, `#849087`, `#84968A`, `#87938A`, `#8A9A90`, `#8AA096`, `#8B9B90`, `#8BA194`, `#8C9C92`, `#8C9C93`, `#8DA096` | `ink-muted` |
| `#91A096`, `#91A097`, `#94A39A`, `#97A69C`, `#9AA89F`, `#9AA8A0`, `#9AA9A0`, `#9AAF9F`, `#9AAFA0`, `#9BA69E`, `#A0AEA6`, `#A0ACA4`, `#A1AEA5` | `ink-subtle` |
| `#F7FAF8`, `#F7FAF7`, `#F4F7F5`, `#FAFCFA`, `#FBFDFB` | `canvas` |
| `#B7C4BC`, `#C0CEC4`, `#C3D0C7`, `#C7D4CA`, `#D9E8DD`, `#DCE7DF`, `#DDE8E0`, `#E1E9E1`, `#E2EAE3`, `#E3ECE5`, `#E4ECE6`, `#E4EEE7`, `#E5ECE7`, `#E5EEE7`, `#E5F0E8`, `#E6ECE8`, `#E6EEE8`, `#E6EFE8`, `#E6F0E9`, `#E7EEE9`, `#E9F1EB` | `line` |
| `#EDF2EE`, `#EEF3EF`, `#EFF5F0`, `#F0F4F1` | `line-soft` |

### 9.3 الحالات

| قديم | جديد |
|------|------|
| `#EF4444`, `#DC2626` | `danger` |
| `#FEE2E2`, `#FEF2F2`, `#FCA5A5` | `danger-tint` |
| `#B91C1C` | `danger-ink` |
| `#F59E0B` | `warning` |
| `#FEF3C7`, `#FFF1DD`, `#FDE2C5`, `#FFEDD5`, `#F7E8C9` | `warning-tint` |
| `#A16207`, `#B45309`, `#C46A12`, `#C2410C`, `#9A642C` | `warning-ink` |
| `#2563EB` | `info-ink` |
| `#DBEAFE` | `info-tint` |

---

## 10. بنية الملفات

كل مشروع من السبعة يتبع البنية التالية (الملفات المضافة في هذا الإصدار معلَّمة بـ ✨):

```
<project>/
├── index.html                     ← lang="ar" dir="rtl" ✨
├── package.json
├── vite.config.ts                 ← alias '@' → ./src
├── components.json                ← shadcn، css: src/index.css
└── src/
    ├── main.tsx                   ← يفرض الوضع الفاتح
    ├── App.tsx                    ← يركّب الشاشة الرئيسية
    ├── index.css                  ← 🎨 طبقة الرموز الموحّدة (@theme) ✨
    ├── theme/
    │   └── tokens.ts              ← مرآة TypeScript للرموز ✨
    ├── lib/
    │   ├── utils.ts               ← cn()
    │   └── delivery.ts            ← رسوم التوصيل الديناميكية ✨
    ├── components/
    │   ├── ui/
    │   │   └── DeliveryFee.tsx    ← مكوّن عرض الرسوم ✨
    │   └── generated/
    │       └── <Screen>.tsx       ← الشاشة
    ├── hooks/use-mobile.ts
    └── settings/
        ├── theme.ts               ← ⚠️ placeholders — لا تُعدّل
        └── types.d.ts
```

`src/index.css` **متطابق حرفياً** في المشاريع السبعة. أي تغيير في الهوية
يُطبَّق على النسخة الواحدة ثم يُنسخ للسبعة.

---

## 11. قواعد المساهمة

1. **لا hex في JSX.** استخدم رموز التصميم. لو احتجت لوناً غير موجود، أضفه إلى
   `@theme` في `index.css` + `tokens.ts` + هذا الملف — بهذا الترتيب.
2. **لا خصائص فيزيائية للاتجاه.** `ps/pe/ms/me/start/end` فقط.
3. **لا تلمس `src/settings/theme.ts`** — placeholders أداة التوليد.
4. **حافظ على منطق المكوّنات وأنواع TypeScript كما هي** عند تعديل طبقة العرض.
5. **رسوم التوصيل** تمر عبر `src/lib/delivery.ts` حصراً.
6. عند تعديل مكوّن مشترك (`HeaderNav`, `BottomTabs`, `OrderCard`) — طبّق التعديل على
   كل النسخ في المشاريع التي تستخدمه.
7. شغّل `yarn format` قبل الالتزام (Prettier مُهيّأ في كل مشروع).

### فحص سريع قبل الالتزام

```bash
# لا يجب أن يُرجع أي نتيجة
grep -rnE "(bg|text|border|ring|fill|stroke|from|to|via)-\[#" src/
grep -rnE "(bg|text|border)-(green|emerald)-[0-9]" src/
```

---

## 12. حالة التحقّق / Verification status

آخر تشغيل: 2026-07-28.

### 12.1 نتائج الفحص على كامل الشجرة (`themes/`)

| الفحص | النتيجة |
|-------|---------|
| أصناف hex عشوائية `bg-[#…]` في الـ TSX | **0** |
| أصناف `green-*` / `emerald-*` / `lime-*` الافتراضية | **0** |
| قيم hex خام داخل JSX أو `style={{}}` أو SVG | **0** |
| خصائص اتجاه فيزيائية (`left-`, `mr-`, `text-right` …) | **0** |
| `fontFamily` inline | **0** |
| `<html lang="ar" dir="rtl">` | **7 / 7** |
| نص «رسوم التوصيل / Delivery Fee» مكتوب يدوياً خارج `lib/delivery.ts` | **0** |
| تطابق `src/index.css` في المشاريع السبعة (md5) | **متطابق** |

### 12.2 TypeScript

`tsc --noEmit` على المشاريع السبعة: **نجح بلا أخطاء** (TypeScript 5.7.3).

المشاريع الستة التي لا تحتوي `node_modules` فُحصت بإعادة استخدام سلسلة أدوات
`Store Details & Product Menu` عبر `paths` مؤقت.

### 12.3 البناء

`vite build` في `Store Details & Product Menu` (المشروع الوحيد المثبَّتة حزمه):
**نجح**. تحقّقنا من أن CSS الناتج يحتوي فعلياً على:

- `--color-brand:#10b981`
- `direction:rtl`
- عائلة الخط `Tajawal`
- الـ utilities المولَّدة: `.bg-brand`, `.bg-brand-tint`, `.text-ink-muted`,
  `.border-line`, `.shadow-card`, `.text-warning-ink`, `.safe-bottom`,
  `.rtl\:rotate-180`, ومعدّلات الشفافية مثل `.focus\:ring-brand\/40`

بُنِيَت أيضاً نسخة تجريبية أُضيفت فيها `@source` لمجلدات المشاريع الستة الأخرى،
للتأكّد من أن **كل** صنف رمزي مستخدم في الشاشات السبع يولّد قاعدة CSS حقيقية —
ولم يُعثر على أي صنف ميت. (تلك الإضافة أُزيلت بعد الفحص.)

### 12.4 خطأ TS5103 — مُصلَح

كان `themes/Store Details & Product Menu/tsconfig.app.json` — **وهو المشروع
الوحيد من السبعة** الذي حمل هذا السطر — يحتوي `"ignoreDeprecations": "6.0"`،
وهي قيمة لا يقبلها TypeScript 5.7.3، فيفشل `tsc -b` وبالتالي `yarn build`
(المُعرَّف كـ `tsc -b && vite build`) بالخطأ:

```
error TS5103: Invalid value for '--ignoreDeprecations'.
```

حُذف السطر. `tsc -b --force` يمرّ نظيفاً و`vite build` ينتج
`index.html` + `index-*.css` (30.20 kB) + `index-*.js` (203.89 kB) في 2.79s.

**قاعدة:** لا تُعِد إضافة `ignoreDeprecations` ما لم تُرقَّ TypeScript إلى 6.x؛
القيمة الوحيدة التي يقبلها الإصدار 5.7 هي `"5.0"`.

---

*آخر تحديث: 2026-07-28*
