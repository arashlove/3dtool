import { useAiStore } from '@/state/ai-store';
import { HF_TOKEN_HEADER, type HealthInfo } from './types';

/**
 * JSON headers for Lab API calls. Adds the visitor's own Hugging Face token (the one saved in Shape Studio
 * or the Lab) so the server uses it for that request; without one the server falls back to HF_TOKEN.
 */
export function labHeaders(): Record<string, string> {
  const token = useAiStore.getState().token;
  return { 'Content-Type': 'application/json', ...(token ? { [HF_TOKEN_HEADER]: token } : {}) };
}

/** AI features work when the server has HF_TOKEN or the visitor has saved their own token. */
export const labAiReady = (health: HealthInfo | null) => Boolean(health?.ai_enabled || useAiStore.getState().token);
