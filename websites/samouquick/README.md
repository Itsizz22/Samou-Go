# Samou Quick download page

Static download-only landing page. Deploy this directory as a Vercel project, with no build command and output directory `.`. No links to staff/admin/customer web frontends. The only external action is company WhatsApp support.

Tajawal is self-hosted under the SIL Open Font License (assets/Tajawal-OFL.txt). Images and scripts are served locally. The responsive slider supports touch, keyboard, manual selection, pause, visibility handling, and reduced motion. Section reveal content remains visible without JavaScript.

## Android artifact
`downloads/Samou-Quick.apk`: version 1.0.30, versionCode 31, package com.samougo.customer. SHA256 F83309E77EE32822AEC525FD4DAA20296F7A28856365CE40FDCA9063527EC79A. Signed with the existing upload certificate. Replace this file and the page version/size together for future releases. APK may conflict with a Google Play app-signing installation; support guidance is included in the page.

Apply backend migrations before promoting this APK: 20260912000300_route_pricing and 20260912000400_order_conversations. Git upload alone does not verify production deployment.

QR is deliberately NOT on the website. Separate chat deliverable targets https://samouquick.com/#download; domain connection is still pending verification.

## Security
vercel.json supplies CSP with no inline scripts, no frames/forms/API connections, HSTS, nosniff, referrer and permissions policies. Verify response headers after deployment. No forms, cookies, credentials or API requests are introduced here. Local Python preview does not apply Vercel headers.

API has 1200 requests/IP/minute before body parsing and tighter auth/OTP/order limits. In-memory counters are per process; shared/edge rate limiting is required for multiple instances. CDN/WAF protection of static APK bandwidth requires hosting configuration and has not yet been activated.

## Validation
Local UI at 320, 390, 1365 pixels: loaded fonts/images, no horizontal overflow or JavaScript errors; slider next, indicators, FAQ and actual APK HTTP download checked. API security tests include 429, Retry-After and unthrottled liveness.
