export const TOUR_SEEN_KEY = '3dtool:tour-seen:v1';

export function hasSeenTour(): boolean {
  try {
    return window.localStorage.getItem(TOUR_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export function markTourSeen(): void {
  try {
    window.localStorage.setItem(TOUR_SEEN_KEY, '1');
  } catch {
    // Storage blocked: the tour simply shows again next visit.
  }
}
