# Login video intro

Active media: login-delivery.mp4 and login-delivery-poster.jpg.
Source: user-supplied Create_a_premium_second_deli.mp4 (September 14, 2026).
The first 4 seconds are cropped to 800x500 at x240/y30 to remove the lower-right Gemini mark and empty margins. Playback is shortened to approximately 3.4 seconds, silent H.264 with faststart. The source file is unchanged.

LoginIntroAnimation plays once per mount, with skip and a 5-second failure deadline. Per the requested presentation, the muted video autoplays on each mount. The form begins its 1.1-second upward reveal when video playback reaches 1.1 seconds, so stalled media does not trigger an early reveal. The video continues independently after the form appears. Form interaction does not replay the video. Authentication is unchanged. Local preview only; not deployed.

The older login-intro.mp4 and render-login-video.py are rejected prototype assets and are not used by the active component.
