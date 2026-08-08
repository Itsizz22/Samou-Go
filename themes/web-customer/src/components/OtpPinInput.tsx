/**
 * Samou' Go — N-digit PIN input for OTP verification.
 *
 * Production details that matter on a phone:
 *   - auto-advance: typing a digit moves focus to the next box
 *   - paste: a pasted code fills every box from the current index
 *   - backspace retreat: clearing a box steps focus back one
 *   - RTL-aware (boxes render right-to-left, digits read left-to-right)
 *   - validation animations: error shake / success pulse via Framer Motion
 *   - `inputmode="numeric"` so Android opens the number pad, not the QWERTY
 */
import { useRef } from 'react';
import { motion } from 'framer-motion';
import { errorShake, successPulse } from '@/lib/motion';

export type PinState = 'idle' | 'error' | 'success';

interface OtpPinInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  state?: PinState;
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
}

export function OtpPinInput({
  length = 6,
  value,
  onChange,
  state = 'idle',
  disabled = false,
  autoFocus = false,
  label,
}: OtpPinInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const focusAt = (index: number) => {
    const input = refs.current[Math.min(Math.max(index, 0), length - 1)];
    input?.focus();
    input?.select();
  };

  const setDigit = (index: number, digit: string) => {
    const clean = digit.replace(/\D/g, '');
    if (!clean) return;
    const next = value.slice(0, index) + clean + value.slice(index + 1);
    const chunk = next.slice(0, length);
    onChange(chunk);
    if (index < length - 1) focusAt(index + 1);
  };

  const handleChange = (index: number, raw: string) => {
    // A single box may receive several characters on some IMEs — take the last.
    const digit = raw.slice(-1);
    setDigit(index, digit);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (value[index]) {
        onChange(value.slice(0, index) + value.slice(index + 1));
      } else if (index > 0) {
        onChange(value.slice(0, index - 1) + value.slice(index));
        focusAt(index - 1);
      }
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusAt(index - 1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusAt(index + 1);
      return;
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const digits = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!digits) return;
    const merged = value.split('');
    for (let index = 0; index < digits.length && index < length; index += 1) {
      merged[index] = digits[index];
    }
    onChange(merged.join(''));
    focusAt(Math.min(digits.length, length - 1));
  };

  const animationProps =
    state === 'error' ? errorShake : state === 'success' ? successPulse : undefined;

  const ringClass =
    state === 'error'
      ? 'border-danger text-danger-ink'
      : state === 'success'
        ? 'border-brand text-brand-dark'
        : 'border-line text-ink';

  return (
    <div className="flex flex-col items-center">
      {label && (
        <label id="otp-label" className="mb-3 text-xs font-bold text-ink-muted">
          {label}
        </label>
      )}
      <motion.div
        className="flex gap-2"
        dir="rtl"
        variants={animationProps}
        initial={animationProps ? 'initial' : false}
        animate="animate"
        aria-label="رمز التحقق / Verification code"
        aria-labelledby={label ? 'otp-label' : undefined}
      >
        {Array.from({ length }).map((_, index) => {
          const char = value[index] ?? '';
          const filled = char !== '';
          return (
            <input
              key={index}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              value={char}
              disabled={disabled}
              onChange={(event) => handleChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              onFocus={(event) => event.target.select()}
              className={`h-12 w-11 rounded-xl border-2 bg-surface text-center text-lg font-extrabold outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/30 ${
                disabled ? 'opacity-60' : ''
              } ${filled ? 'border-brand/60 bg-brand-tint' : ''} ${ringClass}`}
              aria-label={`الرقم ${index + 1} / Digit ${index + 1}`}
            />
          );
        })}
      </motion.div>
    </div>
  );
}
