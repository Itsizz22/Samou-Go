# Standalone offer checkout and checkout drafts

Standalone offers are priced from the active, store-scoped Offer record, including its dispatch window. Client titles and prices are not trusted. Offer order lines reference the offer with a nullable product relation; no fake catalogue products are inserted. Ordinary product lines retain their product relation.

Single-store orders, multi-store checkout, pending quantity edits, proposals, order history and reorder support the offer line. Reorder uses current offer prices and skips unavailable offers. Historical display retains the server-captured title if the offer is deleted.

Checkout drafts read the same plain-text format that they write. The browser fixture verifies reload persistence and account separation.

## Deployment

Apply migration `20260910000300_standalone_offer_items` before deploying the API. It only removes the NOT NULL requirement from order_items.productId and retains existing data and foreign keys. Both Prisma schemas are synchronized. These changes have not been deployed as part of the repair task.

## Verification

315 API integration/unit tests pass. New cases cover offer quote/create, server title, frozen-price quantity edits, current-price reorder, mixed multi-store checkout, deleted-offer history, and rejection of inactive, future, expired, unpriced and foreign-store offers. The browser draft fixture was checked with Arabic text through reload and account switching.
