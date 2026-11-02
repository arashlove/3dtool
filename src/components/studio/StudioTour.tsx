'use client';

import { STUDIO_TOUR_KEY } from '@/persistence/tour';
import { GuidedTour, type TourStep } from '../common/GuidedTour';

const STEPS: TourStep[] = [
  {
    target: '[data-tour="prompt"]',
    compactTarget: '[data-tour="prompt-toggle"]',
    compactHint: 'Tap this button to open the prompt panel.',
    title: 'Describe it, the AI builds it',
    intro: 'Type what you want and press Generate.',
    points: ['Try an example prompt to start.', 'Works with presets like chairs, tables, shelves, lamps and sofas.'],
  },
  {
    target: '[data-tour="objects"]',
    compactTarget: '[data-tour="objects-toggle"]',
    compactHint: 'Tap this button to open the objects panel.',
    title: 'Your objects',
    intro: 'Every object in the scene is listed here.',
    points: [
      'Click a row to select that object.',
      'Use the eye to hide it, the padlock to lock it, and ⋯ for more actions.',
      'The Inspector below changes the selected object’s size, position, rotation and colours.',
    ],
  },
  {
    target: '[data-tour="canvas"]',
    compactTarget: '[data-tour="canvas"]',
    compactHint: '',
    title: 'Play around in 3D',
    intro: 'This is your scene. Try things out — Undo always takes you back.',
    points: [
      'Click an object to select it and see its width, depth and height in centimetres.',
      'Drag the coloured arrows to move it, or switch to rotate and scale in the toolbar below.',
      'Use Add in the toolbar to drop in more presets.',
      'Drag empty space to orbit, right-drag to pan and scroll to zoom.',
    ],
  },
];

export function StudioTour({ compact }: { compact: boolean }) {
  return <GuidedTour steps={STEPS} storageKey={STUDIO_TOUR_KEY} compact={compact} />;
}
