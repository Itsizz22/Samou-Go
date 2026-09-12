# Order conversations

Each order has private customer/store, customer/assigned-captain and store/assigned-captain conversations. Users select the recipient explicitly. There is no public user search or arbitrary messaging. The server derives participants from the order on every read/write; a replaced captain loses access immediately. Admin has no access to private conversations unless they are themselves an order participant.

Text only, maximum 2000 characters, no HTML execution or attachments. Messages have stable IDs, per-sender retry keys and per-recipient read timestamps. History is paginated (50 newest, load earlier). Client polls only while visible; the closed panel polls unread counts. Background push uses a generic preview and opens the order. Sending is disabled after cancellation/delivery while history remains readable for current participants.

Authorization applies to REST and the legacy socket write path. Private messages are never broadcast to a shared order room. Unassigned captains must not see chat or customer details. Sending is rate limited. Delivery and read receipt mean database persistence and explicit visible-thread acknowledgement respectively, not guaranteed push delivery.

Verification: all three pairs, unrelated users, reassignment, wrong recipient, blank/oversized text, duplicate retry, conflicting retry, pagination, unread/read, terminal orders, revoked tokens; mobile RTL, offline retry, account change, request failures. Production notifications require device testing; local mocked push tests do not prove device delivery.
