# Phone verification page

Customer route: `/verify-phone` (signed-out users).

The page is prepared with sending disabled by default. Existing password login and registration remain available.

After the real SMS provider is configured and delivery is tested on the API, set `VITE_OTP_ENABLED=true` for the customer build and rebuild. This is a UI rollout switch, not an API security control. The page reuses `/auth/otp/request` and `/auth/otp/verify`, only advances when `dispatched` is true, and uses the existing authenticated session response after verification. Server expiry, attempt limits and rate limits remain authoritative.

This does not make phone verification mandatory for registration; that requires a separate coordinated server rollout. No provider credentials belong in Vite variables.
