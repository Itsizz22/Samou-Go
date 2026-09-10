# Samou Quick

تطبيق طلبات وتوصيل محلي، بواجهات للزبون والمتجر والكابتن والإدارة. المشروع يستخدم TypeScript وReact وExpress وPrisma، مع تطبيق Android وتهيئة iOS عبر Capacitor.

## بنية المشروع

| المسار | الوظيفة |
| --- | --- |
| `packages/api` | الخادم، الصلاحيات، الطلبات، قاعدة البيانات والإشعارات |
| `packages/shared-types` | أنواع البيانات وقواعد الطلبات والرسوم المشتركة |
| `packages/api-client` | اتصال الواجهات بالخادم والمكونات المرتبطة به |
| `packages/ui` | مكونات وتنسيقات مشتركة |
| `themes/web-customer` | التطبيق الموحد للزبون والمتجر والكابتن، ومشروعا Android وiOS |
| `themes/web-*` | الواجهات المستقلة، ومنها الإدارة |
| `scripts` | البناء والتحقق وفحص التحمل |
| `ops` | تشغيل خدمة المسارات وإعدادات الاستضافة |
| `docs` | توثيق الميزات والتشغيل |

## التشغيل المحلي

يلزم Node.js 20.11 أو أحدث وnpm. من جذر المشروع:

```sh
npm install
npm run db:generate
npm run db:push
npm run dev:api
```

وفي نافذة أخرى:

```sh
npm run dev:web-customer
```

انسخ `packages/api/.env.example` إلى `packages/api/.env` واضبط إعدادات التطوير فقط. استخدم SQLite المحلي للتجارب، ولا تضع اتصال قاعدة الإنتاج في بيئة التطوير. لا تشغّل أوامر البذر أو التنظيف على الإنتاج دون مراجعة نطاقها ونسخة احتياطية.

## التحقق

```sh
npm run build
npm run typecheck
npm test
npm run test --workspace @samou-go/api
npm run build:all
node scripts/check-repository-security.mjs
```

تُبنى حزمة UI قبل فحص الواجهات. احتفظ بتطابق مخططي Prisma للإنتاج والتطوير عند تغيير النماذج.

## تطبيقات الهاتف والنشر

- [Android والبناء والتوقيع](themes/web-customer/android/README.md)
- [إعداد iOS والاختبارات المطلوبة](themes/web-customer/ios/README.md)
- [تجهيز الإصدار ومتطلبات الإطلاق المتبقية](docs/launch-release-20260911.md)
- [فهرس التوثيق](docs/README.md)
- [قواعد التطوير](AGENTS.md)
- [نظام التصميم](DESIGN_SYSTEM.md)
- [تراخيص ومصادر الطرف الثالث](THIRD_PARTY_NOTICES.md)

GitHub Actions يفحص المشروع؛ الدفع إلى `master` يشغّل مسار النشر الموجود. أسرار الإنتاج تدار في إعدادات المنصات، ولا تُحفظ في Git. ملفات APK/AAB والمفاتيح والنسخ الاحتياطية ونتائج الفحص المحلي ليست ملفات مصدر.

تبقى بيانات التجربة حتى اكتمال فحص الآيفون. تنظيف هذا المستودع لا يحذف بيانات قاعدة البيانات، ولا يلغي الاختبارات أو ملفات التطبيق المستخدمة.
