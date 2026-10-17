'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { createSampleScene } from '@/core/scene/sample-scene';
import { createEmptyDocument } from '@/core/schema/scene';
import { loadAutosave, saveAutosave } from '@/persistence/autosave';
import { useAiStore } from '@/state/ai-store';
import { useSceneStore } from '@/state/scene-store';
import { notify, useUiStore } from '@/state/ui-store';
import { EditorToolbar } from '../editor/EditorToolbar';
import { Inspector } from '../editor/Inspector';
import { ObjectTree } from '../editor/ObjectTree';
import { ProjectBar } from './ProjectBar';
import { PromptPanel } from './PromptPanel';

const SceneCanvas = dynamic(() => import('../canvas/SceneCanvas'), {
  ssr: false,
  loading: () => (
    <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
      <CircularProgress size={28} />
    </Box>
  ),
});

const PANEL_WIDTH = 330;

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.getAttribute('role') === 'slider';
}

function useHydrateAndAutosave() {
  const hydrated = useSceneStore((s) => s.hydrated);

  useEffect(() => {
    useAiStore.getState().hydrateFromStorage();
    let cancelled = false;
    void loadAutosave().then((result) => {
      if (cancelled) return;
      const store = useSceneStore.getState();
      if (result.status === 'found') {
        store.replaceDocument(result.doc, { markClean: true });
      } else if (result.status === 'invalid') {
        store.replaceDocument(createEmptyDocument(), { markClean: true });
        notify(`The autosaved scene could not be restored (${result.error}). Started a new scene.`, 'warning');
      } else {
        store.replaceDocument(createSampleScene(), { markClean: true });
        if (result.status === 'unavailable') notify('Browser storage is unavailable: use Save JSON to keep your work.', 'warning');
      }
      store.setHydrated();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useSceneStore.subscribe((state, prev) => {
      if (state.doc === prev.doc) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void saveAutosave(state.doc), 800);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [hydrated]);

  return hydrated;
}

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (document.querySelector('.MuiDialog-root')) return;
      const s = useSceneStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId) {
        e.preventDefault();
        const r = s.runOperations([{ op: 'delete', target: s.selectedId }]);
        if (!r.ok) notify(r.error, 'error');
      } else if (e.key === 'Escape') {
        s.select(null);
      } else if (!mod && e.key.toLowerCase() === 'w') {
        s.setTransformMode('translate');
      } else if (!mod && e.key.toLowerCase() === 'e') {
        s.setTransformMode('rotate');
      } else if (!mod && e.key.toLowerCase() === 'r') {
        s.setTransformMode('scale');
      } else if (!mod && e.key.toLowerCase() === 'f' && s.selectedId) {
        s.requestFocus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function EmptyState() {
  const empty = useSceneStore((s) => s.doc.objects.length === 0);
  if (!empty) return null;
  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', p: 2 }}>
      <Paper variant="outlined" sx={{ p: 3, maxWidth: 380, textAlign: 'center', pointerEvents: 'auto', bgcolor: 'rgba(255,255,255,0.92)' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 650 }} gutterBottom>
          Your scene is empty
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Describe furniture or shapes in the prompt panel, use <strong>Add</strong> in the toolbar, or start from the preset
          sample scene.
        </Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={() => useSceneStore.getState().replaceDocument(createSampleScene(), { undoable: true })}
        >
          Load sample scene (preset)
        </Button>
      </Paper>
    </Box>
  );
}

function Notifications() {
  const notice = useUiStore((s) => s.notice);
  const dismiss = useUiStore((s) => s.dismiss);
  return (
    <Snackbar
      key={notice?.id}
      open={Boolean(notice)}
      autoHideDuration={notice?.severity === 'error' ? 7000 : 4000}
      onClose={(_, reason) => reason !== 'clickaway' && dismiss()}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      {notice ? (
        <Alert severity={notice.severity} onClose={dismiss} variant="filled" sx={{ maxWidth: 520 }}>
          {notice.message}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
}

export function StudioPage() {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const hydrated = useHydrateAndAutosave();
  useKeyboardShortcuts();

  const left = (
    <Box sx={{ width: compact ? 'min(92vw, 360px)' : PANEL_WIDTH, height: '100%', overflowY: 'auto' }}>
      <PromptPanel />
    </Box>
  );
  const right = (
    <Box sx={{ width: compact ? 'min(92vw, 360px)' : PANEL_WIDTH, height: '100%', overflowY: 'auto' }}>
      <ObjectTree />
      <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
        <Inspector />
      </Box>
    </Box>
  );

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <ProjectBar compact={compact} onOpenPrompt={() => setLeftOpen(true)} onOpenPanel={() => setRightOpen(true)} />
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {compact ? (
          <Drawer anchor="left" open={leftOpen} onClose={() => setLeftOpen(false)} keepMounted>
            {left}
          </Drawer>
        ) : (
          <Box component="aside" aria-label="AI prompt" sx={{ borderRight: 1, borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}>
            {left}
          </Box>
        )}

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }} data-testid="scene-canvas">
            {hydrated && <SceneCanvas />}
            {hydrated && <EmptyState />}
          </Box>
          <EditorToolbar />
        </Box>

        {compact ? (
          <Drawer anchor="right" open={rightOpen} onClose={() => setRightOpen(false)} keepMounted>
            {right}
          </Drawer>
        ) : (
          <Box component="aside" aria-label="Objects and inspector" sx={{ borderLeft: 1, borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}>
            {right}
          </Box>
        )}
      </Box>
      <Notifications />
    </Box>
  );
}
