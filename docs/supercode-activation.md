# Supercode activation

Implementation follows the supplied HTTP API guide, pages 3–6 and 10.

Server-only Render variables:
- SMS_PROVIDER=supercode
- SMS_SUPERCODE_API_ID: API ID from My Account (secret)
- SMS_SUPERCODE_SENDER: exact approved sender
- SMS_COUNTRY_CODE=+970 (confirm account routing with provider)

Credentials and sender have been configured on Render. If the provider restricts IPs, allow Render outbound addresses through the provider account. Handset delivery still requires confirmation.

POST JSON to the fixed Supercode SendJSON.aspx endpoint, one recipient, mode 0, URI-encoded message. Only the exact documented success STATUS counts as gateway acceptance. It does not prove handset delivery. No automatic retry on uncertain network delivery. No raw provider body or credentials logged. Ten-second timeout and redirects disabled.

Verification: 37 SMS/phone/OTP tests passed, API TypeScript check passed. Adapter tests use mocked transport and consume no credit.

Remaining activation checks: real delivery to the owner's authorized test phone, invalid/expired/reused OTP and resend limits, recovery flow, and enforcing verified registration. Existing password registration is still available; adding this adapter alone does not make every signup require OTP. Delivery callbacks are not used as proof of phone ownership.

Current operator-approved transport: HTTP (SMS_SUPERCODE_ALLOW_HTTP=true, default true). Set false and redeploy once provider HTTPS is operational. This affects only the server-to-Supercode connection; application HTTPS remains unchanged.
