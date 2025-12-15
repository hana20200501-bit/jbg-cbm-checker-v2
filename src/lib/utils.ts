import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const HANGUL_START_CHAR_CODE = '가'.charCodeAt(0);
const CHO_SUNG_LIST = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

export function getChosung(str: string): string {
  if (!str) return "";
  return str.split('').map(char => {
    const charCode = char.charCodeAt(0);
    if (charCode >= HANGUL_START_CHAR_CODE) {
      const hangulIndex = charCode - HANGUL_START_CHAR_CODE;
      const chosungIndex = Math.floor(hangulIndex / (21 * 28));
      return CHO_SUNG_LIST[chosungIndex];
    }
    return char;
  }).join('');
}
