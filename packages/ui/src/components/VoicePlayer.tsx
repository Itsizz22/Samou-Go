/**
 * VoicePlayer — compact inline audio player for order voice notes.
 *
 * Used by store-manager and captain to listen to customer voice notes
 * on incoming order cards. Shows play/pause, duration, and a progress bar.
 */
import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

export interface VoicePlayerProps {
  /** URL of the audio file (from voiceNoteUrl). */
  src: string;
  /** Duration in seconds (from voiceNoteDuration). */
  duration?: number | null;
}

export function VoicePlayer({ src, duration }: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration ?? 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => setTotalDuration(audio.duration || duration || 0);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnded);
    };
  }, [duration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => {});
      setPlaying(true);
    }
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas p-3">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white transition active:scale-95"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-ink-muted">ملاحظة صوتية من الزبون</p>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-brand transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[9px] text-ink-muted">
          <span>{fmt(currentTime)}</span>
          <span>{fmt(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
}
