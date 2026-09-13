/**
 * VoiceRecorder — lightweight inline voice recorder for order voice notes.
 *
 * Uses the MediaRecorder API (widely supported in mobile WebViews).
 * Records up to 30 seconds, displays live duration and a simple waveform,
 * and exposes the recorded Blob via a callback for upload before checkout.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Play, Square, Trash2, Loader2 } from 'lucide-react';

export interface VoiceRecorderProps {
  /** Called with the recorded Blob and duration in seconds when the user confirms. */
  onRecorded: (blob: Blob, durationSec: number) => void;
  /** Called when the recording is deleted. */
  onClear?: () => void;
  /** Whether an upload is in progress (disables controls). */
  uploading?: boolean;
  /** Max recording duration in seconds (default 30). */
  maxSeconds?: number;
  /** Disable the entire widget (e.g. while submitting order). */
  disabled?: boolean;
}

export function VoiceRecorder({
  onRecorded,
  onClear,
  uploading = false,
  maxSeconds = 30,
  disabled = false,
}: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [analyserData, setAnalyserData] = useState<number[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const requestingRef = useRef(false);

  const cleanup = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; cleanup(); };
  }, [cleanup]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const startRecording = useCallback(async () => {
    if (disabled || uploading || requestingRef.current) return;
    requestingRef.current = true;
    setRequesting(true);
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setError('التسجيل غير مدعوم هنا. افتح التطبيق أو متصفحًا يدعم تسجيل الصوت.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;

      // Set up analyser for waveform visualization
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        setRecording(false);
        setAnalyserData([]);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        setBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        cleanup();
      };

      recorder.start(100); // collect data every 100ms for waveform
      setRecording(true);
      setDuration(0);
      setBlob(null);
      setAudioUrl(null);

      // Duration timer
      let elapsed = 0;
      timerRef.current = setInterval(() => {
        elapsed += 1;
        setDuration(elapsed);
        if (elapsed >= maxSeconds) {
          recorder.stop();
          if (timerRef.current) clearInterval(timerRef.current);
        }
      }, 1000);

      // Waveform animation loop
      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastPaint = 0;
      const drawWaveform = (now = 0) => {
        if (!analyserRef.current) return;
        if (now - lastPaint >= 80 && !document.hidden) {
          lastPaint = now;
          analyserRef.current.getByteFrequencyData(data);
          setAnalyserData(Array.from(data.subarray(0, 8), v => v / 255));
        }
        animFrameRef.current = requestAnimationFrame(drawWaveform);
      };
      drawWaveform();
    } catch (cause) {
      cleanup();
      if (mountedRef.current) {
        setRecording(false);
        setError(cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'لم يُسمح بالميكروفون. فعّل إذنه من إعدادات التطبيق أو المتصفح، ثم اضغط للتسجيل مجددًا.'
          : 'تعذّر تشغيل الميكروفون. تأكد أنه متاح ولا يستخدمه تطبيق آخر، ثم حاول مجددًا.');
      }
    } finally {
      requestingRef.current = false;
      if (mountedRef.current) setRequesting(false);
    }
  }, [disabled, uploading, maxSeconds, cleanup]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setRecording(false);
    setAnalyserData([]);
  }, []);

  const discardRecording = useCallback(() => {
    setBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setAnalyserData([]);
    onClear?.();
  }, [onClear]);

  const confirmRecording = useCallback(() => {
    if (blob) onRecorded(blob, duration);
  }, [blob, duration, onRecorded]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Idle state: show record button
  if (!recording && !blob) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas p-3">
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled || uploading || requesting}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white transition active:scale-95 disabled:opacity-50"
          aria-label="السماح بالميكروفون وتسجيل ملاحظة صوتية"
        >
          {requesting ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
        </button>
        <div className="flex-1">
          <p className="text-[11px] font-bold text-ink-muted">ملاحظة صوتية</p>
          <p className="text-[10px] text-ink-muted">اضغط للتسجيل — حتى {maxSeconds} ثانية</p>
          <p className="mt-1 text-xs text-ink-muted">سنطلب إذن الميكروفون عند الحاجة. لا يُرسل الصوت حتى تؤكده.</p>
          {error && <p role="alert" className="mt-2 text-xs text-danger-ink">{error}</p>}
        </div>
      </div>
    );
  }

  // Recording in progress
  if (recording) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-danger bg-danger-tint/30 p-3">
        <button
          type="button"
          onClick={stopRecording}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger text-white transition active:scale-95 animate-pulse"
          aria-label="Stop recording"
        >
          <Square size={16} fill="white" />
        </button>
        <div className="flex-1">
          <p className="text-[11px] font-bold text-danger-ink">جاري التسجيل…</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-danger-ink">{formatTime(duration)}</span>
            {/* Simple waveform bars */}
            <div className="flex items-end gap-[2px] h-4">
              {analyserData.map((v, i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full bg-danger transition-all duration-75"
                  style={{ height: `${Math.max(4, v * 16)}px` }}
                />
              ))}
              {analyserData.length === 0 && Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="w-[3px] h-1 rounded-full bg-danger/40"
                />
              ))}
            </div>
            <span className="text-[9px] text-danger-ink/70">/{formatTime(maxSeconds)}</span>
          </div>
        </div>
      </div>
    );
  }

  // Recorded — show playback + confirm/discard
  return (
    <div className="flex items-center gap-3 rounded-xl border border-brand bg-brand-tint/30 p-3">
      {uploading ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : (
        <button
          type="button"
          onClick={confirmRecording}
          disabled={disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white transition active:scale-95 disabled:opacity-50"
          aria-label="Confirm recording"
        >
          <Play size={16} fill="white" />
        </button>
      )}
      <div className="flex-1">
        <p className="text-[11px] font-bold text-brand-dark">ملاحظة صوتية — {formatTime(duration)}</p>
        {audioUrl && (
          <audio ref={(el) => { if (el) el.src = audioUrl; }} className="hidden" />
        )}
      </div>
      {!uploading && (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={discardRecording}
            disabled={disabled}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-ink-muted transition active:scale-95"
            aria-label="Delete recording"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={confirmRecording}
            disabled={disabled}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white transition active:scale-95"
            aria-label="Use recording"
          >
            <MicOff size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
