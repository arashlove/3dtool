import { useAiStore } from '@/state/ai-store';
import { HF_TOKEN_HEADER } from './token-header';

/** The Future Lab reuses the token entered in Shape Studio's settings (same browser storage). */
export const labAiEnabled = () => Boolean(useAiStore.getState().token);

export const useLabAiEnabled = () => useAiStore((s) => Boolean(s.token));

export function labHeaders(): Record<string, string> {
  const token = useAiStore.getState().token;
  return token ? { 'Content-Type': 'application/json', [HF_TOKEN_HEADER]: token } : { 'Content-Type': 'application/json' };
}

export const NO_TOKEN_MESSAGE = 'Add your Hugging Face token (top bar) to use the AI.';
