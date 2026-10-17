'use client';

import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import ListIcon from '@mui/icons-material/List';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import RedoIcon from '@mui/icons-material/Redo';
import SyncIcon from '@mui/icons-material/Sync';
import TuneIcon from '@mui/icons-material/Tune';
import UndoIcon from '@mui/icons-material/Undo';
import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { createSampleScene } from '@/core/scene/sample-scene';
import { exportGlb } from '@/lab/engine/export';
import { getLabRoot, useLabStore } from '@/lab/store';
import { loadAutosave } from '@/persistence/autosave';
import { useSceneStore } from '@/state/scene-store';
import { ViewInArDialog } from '../ar/ViewInArDialog';
import { Generate3dDialog } from './Generate3dDialog';
import { LabChatPanel } from './LabChatPanel';
import { LabInspector } from './LabInspector';
import { PartsPanel } from './PartsPanel';

const LabViewport = dynamic(() => import('./LabViewport'), {
  ssr: false,
  loading: () => (
    <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
      <CircularProgress size={28} />
    </Box>
  ),
});

const LEFT_WIDTH = 290;
const RIGHT_WIDTH = 350;

/** The Shape Studio document: the live one when Studio was opened in this tab, else its autosave. */
async function studioDocument() {
  const live = useSceneStore.getState();
  if (live.hydrated) return live.doc;
  const saved = await loadAutosave();
  return saved.status === 'found' ? saved.doc : createSampleScene();
}

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
}

function useLabSetup() {
  useEffect(() => {
    const store = useLabStore.getState();
    void store.checkHealth();
    if (store.modelName === null) void studioDocument().then((doc) => useLabStore.getState().importStudio(doc));

    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target) || document.querySelector('.MuiDialog-root')) return;
      const s = useLabStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if (e.key === 'Escape') {
        s.setSelected([]);
      } else if (!mod && e.key.toLowerCase() === 'f') {
        s.requestFocus();
      } else if (!mod && e.key.toLowerCase() === 'w') {
        s.setTransformMode('translate');
      } else if (!mod && e.key.toLowerCase() === 'e') {
        s.setTransformMode('rotate');
      } else if (!mod && e.key.toLowerCase() === 'r') {
        s.setTransformMode('scale');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function HealthChip() {
  const health = useLabStore((s) => s.health);
  const error = useLabStore((s) => s.healthError);
  if (error) return <Chip size="small" color="error" variant="outlined" label="Server unreachable" title={error} />;
  if (!health) return <Chip size="small" variant="outlined" label="Checking AI…" />;
  if (!health.ai_enabled) {
    return (
      <Tooltip title="Add HF_TOKEN to .env.local and restart the server to enable the LLM, vision model and image generation. Texture segmentation works without it.">
        <Chip size="small" color="warning" variant="outlined" label="Offline planner" />
      </Tooltip>
    );
  }
  return (
    <Tooltip
      title={
        <Box sx={{ fontSize: 12 }}>
          <div>LLM: {health.models.llm}</div>
          <div>Vision: {health.models.vlm}</div>
          <div>Images: {health.models.image}</div>
        </Box>
      }
    >
      <Chip size="small" color="success" variant="outlined" label={`Hugging Face (${health.provider})`} />
    </Tooltip>
  );
}

function TopBar({ compact, onOpenLeft, onOpenRight }: { compact: boolean; onOpenLeft: () => void; onOpenRight: () => void }) {
  const modelName = useLabStore((s) => s.modelName);
  const source = useLabStore((s) => s.source);
  const stats = useLabStore((s) => s.stats);
  const partCount = useLabStore((s) => s.parts.length);
  const triangleCount = useLabStore((s) => s.parts.reduce((n, p) => n + p.triangles, 0));
  const canUndo = useLabStore((s) => s.past.length > 0);
  const canRedo = useLabStore((s) => s.future.length > 0);
  const undoLabel = useLabStore((s) => s.past[s.past.length - 1]?.label);
  const redoLabel = useLabStore((s) => s.future[0]?.label);
  const busy = useLabStore((s) => s.busy);
  const split = useLabStore((s) => s.splitComponents);
  const generating = useLabStore((s) => s.generating3d);
  const [textTo3dOpen, setTextTo3dOpen] = useState(false);
  const [arOpen, setArOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const importMode = useRef<'add' | 'replace'>('add');
  const [importMenu, setImportMenu] = useState<HTMLElement | null>(null);
  const chooseFile = (mode: 'add' | 'replace') => {
    importMode.current = mode;
    setImportMenu(null);
    fileInput.current?.click();
  };
  const store = useLabStore.getState;

  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{ px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', alignItems: 'center', flexWrap: 'wrap' }}
    >
      {compact && (
        <IconButton size="small" onClick={onOpenLeft} aria-label="Parts">
          <ListIcon />
        </IconButton>
      )}
      <Box sx={{ minWidth: 0, mr: 1 }}>
        <Typography variant="subtitle2" noWrap>
          {modelName ?? 'No model'}
        </Typography>
        {stats && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {source === 'studio' ? 'From Shape Studio' : 'From file'} · {partCount} parts · {triangleCount.toLocaleString()} tris
          </Typography>
        )}
      </Box>
      <Tooltip title="Rebuild the parts from the current Shape Studio scene (discards Lab edits)">
        <span>
          <Button
            size="small"
            startIcon={<SyncIcon />}
            disabled={Boolean(busy)}
            onClick={() => void studioDocument().then((doc) => store().importStudio(doc))}
          >
            From Studio
          </Button>
        </span>
      </Tooltip>
      <input
        ref={fileInput}
        type="file"
        accept=".glb,.gltf,model/gltf-binary"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void store().importFile(file, importMode.current);
        }}
      />
      <Button
        size="small"
        startIcon={<FileUploadOutlinedIcon />}
        disabled={Boolean(busy)}
        onClick={(e) => (modelName ? setImportMenu(e.currentTarget) : chooseFile('replace'))}
        aria-haspopup="menu"
      >
        Import .glb
      </Button>
      <Menu anchorEl={importMenu} open={Boolean(importMenu)} onClose={() => setImportMenu(null)}>
        <MenuItem onClick={() => chooseFile('add')}>
          <ListItemText primary="Add to scene" secondary="Placed beside the selection (or the scene), ready to move" />
        </MenuItem>
        <MenuItem onClick={() => chooseFile('replace')}>
          <ListItemText primary="Replace scene" secondary="Start over with only this model" />
        </MenuItem>
      </Menu>
      <Tooltip title="Generate a textured 3D model from a description or an image (TRELLIS.2 on Hugging Face)">
        <Button size="small" startIcon={<ViewInArOutlinedIcon />} disabled={Boolean(busy)} onClick={() => setTextTo3dOpen(true)}>
          {generating ? 'Generating 3D…' : 'Text to 3D'}
        </Button>
      </Tooltip>
      <Generate3dDialog open={textTo3dOpen} onClose={() => setTextTo3dOpen(false)} />
      <Tooltip title="On load, split each mesh into its connected pieces (one 'Legs' mesh becomes four legs)">
        <FormControlLabel
          control={<Switch size="small" checked={split} onChange={(e) => store().set({ splitComponents: e.target.checked })} />}
          label={<Typography variant="caption">Split pieces</Typography>}
          sx={{ mr: 0 }}
        />
      </Tooltip>
      <Box sx={{ flex: 1 }} />
      {busy && (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }} aria-live="polite">
          <CircularProgress size={14} />
          <Typography variant="caption" color="text.secondary">
            {busy}
          </Typography>
        </Stack>
      )}
      <HealthChip />
      <Tooltip title={canUndo ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Nothing to undo'}>
        <span>
          <IconButton size="small" onClick={() => store().undo()} disabled={!canUndo || Boolean(busy)} aria-label="Undo">
            <UndoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={canRedo ? `Redo: ${redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'}>
        <span>
          <IconButton size="small" onClick={() => store().redo()} disabled={!canRedo || Boolean(busy)} aria-label="Redo">
            <RedoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Frame the model or selection (F)">
        <IconButton size="small" onClick={() => store().requestFocus()} aria-label="Frame">
          <CenterFocusStrongIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Button size="small" variant="contained" startIcon={<FileDownloadOutlinedIcon />} disabled={!modelName || Boolean(busy)} onClick={() => void store().downloadGlb()}>
        Export GLB
      </Button>
      <Tooltip title="Open the whole scene on your phone and place it in your room at real size">
        <span>
          <Button size="small" variant="outlined" startIcon={<QrCode2Icon />} disabled={!modelName || Boolean(busy)} onClick={() => setArOpen(true)}>
            View in AR
          </Button>
        </span>
      </Tooltip>
      <ViewInArDialog
        open={arOpen}
        onClose={() => setArOpen(false)}
        title={modelName ?? '3D scene'}
        makeGlb={async () => {
          const root = getLabRoot();
          if (!root) throw new Error('There is no model to share.');
          return exportGlb(root, 'label');
        }}
      />
      {compact && (
        <IconButton size="small" onClick={onOpenRight} aria-label="Edit panel">
          <TuneIcon />
        </IconButton>
      )}
    </Stack>
  );
}

function Toasts() {
  const toast = useLabStore((s) => s.toast);
  const dismiss = useLabStore((s) => s.dismissToast);
  return (
    <Snackbar
      key={toast?.id}
      open={Boolean(toast)}
      autoHideDuration={toast?.severity === 'error' ? 8000 : 4500}
      onClose={(_, reason) => reason !== 'clickaway' && dismiss()}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      {toast ? (
        <Alert severity={toast.severity} onClose={dismiss} variant="filled" sx={{ maxWidth: 560 }}>
          {toast.message}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
}

function RightPanel() {
  const [tab, setTab] = useState<'chat' | 'inspect'>('chat');
  const selectedCount = useLabStore((s) => s.selected.length);
  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40, '& .MuiTab-root': { minHeight: 40 } }}>
        <Tab value="chat" label="AI edit" />
        <Tab value="inspect" label={selectedCount ? `Inspector (${selectedCount})` : 'Inspector'} />
      </Tabs>
      <Box sx={{ flex: 1, minHeight: 0 }}>{tab === 'chat' ? <LabChatPanel /> : <LabInspector />}</Box>
    </Stack>
  );
}

function TransformBar() {
  const mode = useLabStore((s) => s.transformMode);
  const count = useLabStore((s) => s.selected.length);
  if (count === 0) return null;
  return (
    <Paper variant="outlined" sx={{ position: 'absolute', top: 8, left: 8, bgcolor: 'rgba(255,255,255,0.94)' }}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={mode}
        onChange={(_, v) => v && useLabStore.getState().setTransformMode(v)}
        aria-label="Gizmo mode"
      >
        <Tooltip title="Move (W)">
          <ToggleButton value="translate" sx={{ px: 1.25, py: 0.4, textTransform: 'none' }}>
            Move
          </ToggleButton>
        </Tooltip>
        <Tooltip title="Rotate (E)">
          <ToggleButton value="rotate" sx={{ px: 1.25, py: 0.4, textTransform: 'none' }}>
            Rotate
          </ToggleButton>
        </Tooltip>
        <Tooltip title="Scale (R)">
          <ToggleButton value="scale" sx={{ px: 1.25, py: 0.4, textTransform: 'none' }}>
            Scale
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>
    </Paper>
  );
}

function EmptyViewport() {
  const hasModel = useLabStore((s) => s.modelName !== null);
  if (hasModel) return null;
  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', p: 2 }}>
      <Paper variant="outlined" sx={{ p: 3, maxWidth: 400, textAlign: 'center', pointerEvents: 'auto' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 650 }} gutterBottom>
          Nothing loaded
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Use <strong>From Studio</strong> to edit the objects from Shape Studio, or <strong>Import .glb</strong> to edit any glTF model.
        </Typography>
      </Paper>
    </Box>
  );
}

export function FutureLabPage() {
  const theme = useTheme();
  // No noSsr: the first client render must match the server HTML; the layout switches right after hydration.
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  useLabSetup();

  const left = (
    <Box sx={{ width: compact ? 'min(88vw, 320px)' : LEFT_WIDTH, height: '100%' }}>
      <PartsPanel />
    </Box>
  );
  const right = (
    <Box sx={{ width: compact ? 'min(92vw, 380px)' : RIGHT_WIDTH, height: '100%' }}>
      <RightPanel />
    </Box>
  );

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <TopBar compact={compact} onOpenLeft={() => setLeftOpen(true)} onOpenRight={() => setRightOpen(true)} />
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {compact ? (
          <Drawer anchor="left" open={leftOpen} onClose={() => setLeftOpen(false)} keepMounted>
            {left}
          </Drawer>
        ) : (
          <Box component="aside" aria-label="Parts" sx={{ borderRight: 1, borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}>
            {left}
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }} data-testid="lab-canvas">
          <LabViewport />
          <EmptyViewport />
          <TransformBar />
        </Box>
        {compact ? (
          <Drawer anchor="right" open={rightOpen} onClose={() => setRightOpen(false)} keepMounted>
            {right}
          </Drawer>
        ) : (
          <Box component="aside" aria-label="AI edit and inspector" sx={{ borderLeft: 1, borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}>
            {right}
          </Box>
        )}
      </Box>
      <Toasts />
    </Box>
  );
}
