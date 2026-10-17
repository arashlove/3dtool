import { create } from 'zustand';

export type Notice = { id: number; message: string; severity: 'success' | 'info' | 'warning' | 'error' };

type UiState = {
  notice: Notice | null;
  notify: (message: string, severity?: Notice['severity']) => void;
  dismiss: () => void;
};

let counter = 0;

export const useUiStore = create<UiState>((set) => ({
  notice: null,
  notify: (message, severity = 'info') => set({ notice: { id: ++counter, message, severity } }),
  dismiss: () => set({ notice: null }),
}));

export const notify = (message: string, severity?: Notice['severity']) => useUiStore.getState().notify(message, severity);
