'use client';

import { LAB_TOUR_KEY } from '@/persistence/tour';
import { GuidedTour, type TourStep } from '../common/GuidedTour';

const STEPS: TourStep[] = [
  {
    target: '[data-tour="lab-parts"]',
    compactTarget: '[data-tour="lab-parts-toggle"]',
    compactHint: 'Tap this button to open the parts list.',
    title: 'Pick a part',
    intro: 'Your model is split into its parts.',
    points: ['Click a part to select it (Ctrl-click for more).', 'Use Search parts to find one by name.'],
  },
  {
    target: '[data-tour="lab-edit"]',
    compactTarget: '[data-tour="lab-edit-toggle"]',
    compactHint: 'Tap this button to open the AI edit panel.',
    title: 'Describe the change',
    intro: 'Tell the AI how to change the selected part.',
    points: ['For example “make the legs longer and gold”.', 'Review the plan, then apply it.'],
  },
  {
    target: '[data-tour="lab-canvas"]',
    compactTarget: '[data-tour="lab-canvas"]',
    compactHint: '',
    title: 'See it in 3D',
    intro: 'Click parts here to select them too.',
    points: ['Move, rotate or scale the selection.', 'Undo anytime, and Export GLB when you are done.'],
  },
];

export function LabTour({ compact }: { compact: boolean }) {
  return <GuidedTour steps={STEPS} storageKey={LAB_TOUR_KEY} compact={compact} />;
}
