# Home video advertisements

Admin → Application appearance → Video advertisements manages an ordered list (up to 20). Upload a video, optionally a poster, set a title and visibility, then save. Removing an entry unpublishes it without deleting an immutable asset that cached clients may still reference.

Only ADMIN can presign, stream and finalize video files; keys belong to their uploading admin. Platform settings mutation retains the existing server ADMIN authorization. Settings accept video URLs only from the configured API upload origin. Disabled and empty collections are hidden on the customer home page.

Accepted files: MP4/H.264, up to 40 MiB and 120 seconds, dimensions up to 3840 per edge. Recommend 1080p landscape, H.264 with AAC audio and web-optimized/fast-start export. The server validates container structure, duration and the video sample entry and preserves original bytes; it does not transcode or improve a poor source. Uploads use the existing durable storage adapter. Public media supports byte ranges even after local cache loss. Large-scale video traffic should eventually use object storage/CDN rather than the current database-backed adapter.

Customer behavior: one active video, muted inline playback, manual sound/pause controls, native touch scrolling and previous/next buttons. Playback advances on ended and wraps around. Offscreen or hidden-tab playback pauses. Reduced motion disables automatic playback/advance. A blocked autoplay attempt offers manual playback; loading errors offer retry. The section polls the existing settings endpoint every minute.

Deployment: apply `20260915110000_home_video_ads` with the normal production migration process before deploying the API, then deploy customer and admin apps. Both Prisma schemas include the nullable `homeVideosJson` field. No APK change is required to store or edit the content, but an old bundled client needs the updated frontend to render the new section.

Validation: customer/admin/API typechecks; upload authorization and file preservation tests; malformed/unsupported MP4 tests; isolated HTTP settings authorization/persistence tests. Browser preview tested at 390×844, including reduced-motion behavior, muted autoplay and automatic transition. No test ads are published to production.
