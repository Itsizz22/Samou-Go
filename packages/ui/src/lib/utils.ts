import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility to merge Tailwind classes with clsx + tailwind-merge.
 * Usage: cn('base-class', conditional && 'conditional-class', { 'object-class': condition })
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}