# Public reference codes

New orders use YYMMDD-001, with a minimum three-digit decimal sequence that grows beyond 999. Existing order numbers and internal IDs are unchanged, so old notifications and links remain valid.

Accounts receive atomically allocated C-10001 (customer), D-10001 (captain), M-10001 (manager), or A-10001 (admin) references; stores receive S-10001. Codes are stable account references and are not authentication credentials. Role changes do not reassign an existing reference. Database unique indexes prevent duplicate codes. Rejected creations may leave harmless gaps.

Migration 20260910000400_public_reference_codes backfills existing users/stores ordered by creation time and ID, then initializes each prefix counter above the allocated range. Runtime password, OTP, Firebase, staff creation, and guest-adapter creation paths allocate codes. Legacy userCode values remain intact for existing records; new records use publicCode.

The customer profile, store page, both captain dashboards and admin user/store tables show these codes. Admin user search and store search accept codes. No internal foreign key or navigation parameter has been replaced.

These changes are local pending deployment; apply migrations before deploying the new API.
