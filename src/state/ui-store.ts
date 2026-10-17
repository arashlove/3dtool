import { create } from 'zustand';

export type Notice = { id: number; message: string; severity: 'success' | 'info' | 'warning' | 'error' };

type UiState = {
  notice: Notice | null;
  measurementsVisible: boolean;
  tourOpen: boolean;
  notify: (message: string, severity?: Notice['severity']) => void;
  dismiss: () => void;
  toggleMeasurements: () => void;
  startTour: () => void;
  closeTour: () => void;
};

let counter = 0;

export const useUiStore = create<UiState>((set) => ({
  notice: null,
  measurementsVisible: true,
  tourOpen: false,
  notify: (message, severity = 'info') => set({ notice: { id: ++counter, message, severity } }),
  dismiss: () => set({ notice: null }),
  toggleMeasurements: () => set((s) => ({ measurementsVisible: !s.measurementsVisible })),
  startTour: () => set({ tourOpen: true }),
  closeTour: () => set({ tourOpen: false }),
}));

export const notify = (message: string, severity?: Notice['severity']) => useUiStore.getState().notify(message, severity);
