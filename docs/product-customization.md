# Product customization

Local implementation; production migration and deployment have not been run.

## Manager
Open a saved product, then **تخصيص الوجبة**. Create or edit groups:
- ADDON: free/paid extras, optional/required and min/max limits.
- SIZE: one required size; enter the full undiscounted price for each size.
- INGREDIENT: included, free ingredients; defaults can be deselected.
- FIXED: included, free ingredients that cannot be deselected.

Items support uploaded photos, editing in place, defaults, availability, deletion and ordering. Existing item IDs survive edits. Option photos use a separate upload namespace and do not replace the product image.

## Prices and orders
The product discount ratio applies to size prices only. Extras retain their full price. The existing coupon calculation consumes the resulting basket subtotal; delivery-voucher rules remain unchanged. The API resolves all option IDs and prices from the database. Excluded default ingredients are stored as `excluded` snapshots named `بدون …` and are filtered out of selected IDs when quoting, checking out, reordering or editing an order. Existing order snapshots are not rewritten by catalogue edits.

## Captain contact
Store order cards show the assigned captain, phone and saved WhatsApp contact. The chat button opens that order's existing conversation with the captain selected. Existing participant authorization and closed-conversation rules remain in force.

## Rollout
1. Apply migration `20260913000000_product_customization` to PostgreSQL before deploying the API.
2. Deploy API and the customer/store-manager web builds together; old clients do not understand full-price sizes.
3. Build and test the Android package before configuring sizes for public customers. Do not enable SIZE groups while unsupported APK clients are still ordering.
4. Configure groups on products and verify one real order before broad rollout.

## Verification
- API suite: 448 passing tests before the final two option-image tests; focused suite passes with both added tests.
- Shared option/domain tests, server size discount arithmetic and ingredient snapshots.
- Browser checks at 320/390/768px: selection, limits, quantity, fixed/default ingredients, editor ID retention and contact/chat targeting.
- Real isolated SQLite: creation/editing, stable IDs, images, size uniqueness and cleanup. Production data was not used.

## UX refinement references (2026-09-13)
Reviewed official DoorDash modifier guidance and Toast's modifier-group guide for required/optional rules and clear editing. HungerStation's public pages did not expose a complete interactive customization flow; no claims are made about inspecting its signed-in app.
- https://help.doordash.com/en-ca/merchants/article/adding-a-new-option-to-a-modifier-on-your-menu
- https://doc.toasttab.com/doc/platformguide/platformWorkingWithModifierGroupsMenuManager.html

Applied: explicit minimum/maximum instructions, selected counts, a focus/scroll action to the incomplete group, manager group-type shortcuts, local name/price validation, and exclusive single-choice defaults. These are adaptations for Samou Quick; no branding or assets were copied.
