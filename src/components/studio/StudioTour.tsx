'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { markTourSeen } from '@/persistence/tour';
import { useUiStore } from '@/state/ui-store';

type TourStep = { target: string; compactTarget: string; compactHint: string; title: string; intro: string; points: string[] };
type Rect = { top: number; left: number; width: number; height: number };

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

const CARD_WIDTH = 340;
const GAP = 16;
const MARGIN = 12;
const SPOT_PAD = 6;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/** Beside the target if there is room, otherwise above or below, otherwise inside its top edge. */
function placeCard(rect: Rect | null, cardW: number, cardH: number, vw: number, vh: number) {
  if (!rect) return { left: (vw - cardW) / 2, top: (vh - cardH) / 2 };
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const sideTop = clamp(rect.top, MARGIN, vh - cardH - MARGIN);
  if (vw - right - GAP >= cardW + MARGIN) return { left: right + GAP, top: sideTop };
  if (rect.left - GAP >= cardW + MARGIN) return { left: rect.left - GAP - cardW, top: sideTop };
  const left = clamp(rect.left + rect.width / 2 - cardW / 2, MARGIN, vw - cardW - MARGIN);
  if (vh - bottom - GAP >= cardH + MARGIN) return { left, top: bottom + GAP };
  if (rect.top - GAP >= cardH + MARGIN) return { left, top: rect.top - GAP - cardH };
  return { left, top: clamp(rect.top + 24, MARGIN, vh - cardH - MARGIN) };
}

export function StudioTour({ compact }: { compact: boolean }) {
  const closeTour = useUiStore((s) => s.closeTour);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ w: 1280, h: 800 });
  const [cardH, setCardH] = useState(260);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const step = STEPS[index];
  const selector = compact ? step.compactTarget : step.target;
  const last = index === STEPS.length - 1;

  const finish = () => {
    markTourSeen();
    closeTour();
  };

  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>(selector);
    const measure = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
      if (cardRef.current) setCardH(cardRef.current.offsetHeight);
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    if (el) observer.observe(el);
    if (cardRef.current) observer.observe(cardRef.current);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [selector]);

  useEffect(() => {
    nextRef.current?.focus();
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      markTourSeen();
      closeTour();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeTour]);

  const cardW = Math.min(CARD_WIDTH, viewport.w - MARGIN * 2);
  const position = placeCard(rect, cardW, cardH, viewport.w, viewport.h);

  return createPortal(
    <Box data-tour-open sx={{ position: 'fixed', inset: 0, zIndex: 1450 }}>
      <Box sx={{ position: 'absolute', inset: 0 }} onClick={(e) => e.stopPropagation()} />
      {rect ? (
        <Box
          aria-hidden
          sx={{
            position: 'fixed',
            top: rect.top - SPOT_PAD,
            left: rect.left - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
            borderRadius: 2,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.62)',
            outline: '2px solid',
            outlineColor: 'primary.main',
            pointerEvents: 'none',
            transition: 'top 250ms ease, left 250ms ease, width 250ms ease, height 250ms ease',
          }}
        />
      ) : (
        <Box aria-hidden sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(15, 23, 42, 0.62)', pointerEvents: 'none' }} />
      )}
      <Paper
        ref={cardRef}
        elevation={8}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        sx={{ position: 'fixed', top: position.top, left: position.left, width: cardW, p: 2.5, borderRadius: 2 }}
      >
        <Typography variant="overline" color="primary" sx={{ lineHeight: 1.6 }}>
          Step {index + 1} of {STEPS.length}
        </Typography>
        <Typography id="tour-title" variant="h6" sx={{ fontWeight: 650, mb: 1 }}>
          {step.title}
        </Typography>
        <Box id="tour-body">
          <Typography variant="body2" sx={{ mb: 1 }}>
            {step.intro}
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {step.points.map((p) => (
              <Typography key={p} component="li" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {p}
              </Typography>
            ))}
          </Box>
          {compact && step.compactHint && (
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>
              {step.compactHint}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: 'center' }}>
          <Button size="small" color="inherit" onClick={finish}>
            Skip tour
          </Button>
          <Stack direction="row" spacing={0.75} sx={{ flex: 1, justifyContent: 'center' }} aria-hidden>
            {STEPS.map((s, i) => (
              <Box key={s.title} sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: i === index ? 'primary.main' : 'action.disabled' }} />
            ))}
          </Stack>
          {index > 0 && (
            <Button size="small" onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          )}
          <Button ref={nextRef} size="small" variant="contained" onClick={() => (last ? finish() : setIndex(index + 1))}>
            {last ? 'Start building' : 'Next'}
          </Button>
        </Stack>
      </Paper>
    </Box>,
    document.body,
  );
}
