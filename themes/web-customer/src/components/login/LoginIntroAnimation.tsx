import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useVideoFirstFrame } from '@/lib/useVideoFirstFrame';
import { motion } from 'framer-motion';

const VIDEO = '/assets/login/login-delivery.mp4';
const POSTER = '/assets/login/login-delivery-poster.jpg';
const FORM_REVEAL_AT = 1.1;

/** Playback belongs to this mount, never to the form's input/validation state. */
export function LoginIntroAnimation({ children }: { children: ReactNode }) {
  const { video, frameReady, revealVideo } = useVideoFirstFrame();
  const [finished, setFinished] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const shown = revealed || finished;
  const finish = useCallback(() => {
    video.current?.pause();
    setFinished(true);
  }, []);

  useEffect(() => {
    let active = true;
    // Autoplay refusal or a stalled download must not lock login.
    const timeout = window.setTimeout(finish, 5000);
    const player = video.current;
    if (player) {
      player.muted = true;
      void player.play().catch(() => { if (active) finish(); });
    }
    return () => {
      active = false;
      window.clearTimeout(timeout);
      player?.pause();
    };
  }, [finish]);

  return (
    <div className="login-film">
      <div className="login-film__stage">
        {finished ? (
          <img src={POSTER} alt="" width={800} height={500} className="login-film__media" />
        ) : (
          <>
          <img src={POSTER} alt="" aria-hidden="true" width={800} height={500} className="login-film__media absolute inset-0" />
          <video ref={video} className="inline-autoplay-video login-film__media relative" width={800} height={500}
            style={{ opacity: frameReady ? 1 : 0 }} onPlaying={revealVideo} controls={false}
            src={VIDEO} muted playsInline autoPlay preload="auto" aria-hidden="true"
            onTimeUpdate={(event) => {
              if (event.currentTarget.currentTime >= FORM_REVEAL_AT) setRevealed(true);
            }}
            onEnded={finish} onError={finish} disablePictureInPicture disableRemotePlayback />
          </>
        )}
      </div>
      <motion.div inert={!shown} aria-hidden={!shown} initial={false}
        animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 64, scale: shown ? 1 : 0.98 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}>
        {children}
      </motion.div>
    </div>
  );
}
