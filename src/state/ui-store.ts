import { create } from 'zustand';

export type Notice = { id: number; message: string; severity: 'success' | 'info' | 'warning' | 'error' };

type UiState = {
  notice: Notice | null;
  measurementsVisible: boolean;
  notify: (message: string, severity?: Notice['severity']) => void;
  dismiss: () => void;
  toggleMeasurements: () => void;
};

let counter = 0;

export const useUiStore = create<UiState>((set) => ({
  notice: null,
  measurementsVisible: true,
  notify: (message, severity = 'info') => set({ notice: { id: ++counter, message, severity } }),
  dismiss: () => set({ notice: null }),
  toggleMeasurements: () => set((s) => ({ measurementsVisible: !s.measurementsVisible })),
}));

export const notify = (message: string, severity?: Notice['severity']) => useUiStore.getState().notify(message, severity);
