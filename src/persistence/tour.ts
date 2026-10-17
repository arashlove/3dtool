export const STUDIO_TOUR_KEY = '3dtool:tour-seen:v1';
export const LAB_TOUR_KEY = '3dtool:lab-tour-seen:v1';

export function hasSeenTour(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return true;
  }
}

export function markTourSeen(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Storage blocked: the tour simply shows again next visit.
  }
}
