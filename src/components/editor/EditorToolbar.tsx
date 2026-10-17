'use client';

import AddIcon from '@mui/icons-material/Add';
import CenterFocusStrongOutlinedIcon from '@mui/icons-material/CenterFocusStrongOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import Grid4x4Icon from '@mui/icons-material/Grid4x4';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import PhotoSizeSelectSmallIcon from '@mui/icons-material/PhotoSizeSelectSmall';
import RedoIcon from '@mui/icons-material/Redo';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import Rotate90DegreesCcwOutlinedIcon from '@mui/icons-material/Rotate90DegreesCcwOutlined';
import StraightenIcon from '@mui/icons-material/Straighten';
import UndoIcon from '@mui/icons-material/Undo';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import { useState, type ReactNode } from 'react';
import { CATEGORY_LABELS, KIND_CATEGORIES, KIND_DEFS, OBJECT_KINDS, type ObjectKind } from '@/core/schema/kinds';
import { selectSelectedObject, useSceneStore, type TransformMode } from '@/state/scene-store';
import { notify } from '@/state/ui-store';
import { ConfirmDialog } from '../common/ConfirmDialog';

function Action({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Tooltip title={title}>
      <span>
        <IconButton size="small" aria-label={title} onClick={onClick} disabled={disabled}>
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}

export function EditorToolbar() {
  const selected = useSceneStore(selectSelectedObject);
  const canUndo = useSceneStore((s) => s.past.length > 0);
  const canRedo = useSceneStore((s) => s.future.length > 0);
  const hasObjects = useSceneStore((s) => s.doc.objects.length > 0);
  const settings = useSceneStore((s) => s.doc.settings);
  const mode = useSceneStore((s) => s.transformMode);
  const { undo, redo, runOperations, setTransformMode, requestFocus, requestResetView, updateSettings, clearScene } =
    useSceneStore.getState();
  const [addMenu, setAddMenu] = useState<HTMLElement | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const add = (kind: ObjectKind) => {
    setAddMenu(null);
    const r = runOperations([{ op: 'create', kind }]);
    if (!r.ok) notify(r.error, 'error');
  };

  const runOnSelected = (op: 'duplicate' | 'delete') => {
    if (!selected) return;
    const r = runOperations([{ op, target: selected.id }]);
    if (!r.ok) notify(r.error, 'error');
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.5,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        flexWrap: 'wrap',
      }}
      role="toolbar"
      aria-label="Editor tools"
    >
      <Action title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
        <UndoIcon fontSize="small" />
      </Action>
      <Action title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
        <RedoIcon fontSize="small" />
      </Action>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      <Button size="small" startIcon={<AddIcon />} onClick={(e) => setAddMenu(e.currentTarget)}>
        Add
      </Button>
      <Menu anchorEl={addMenu} open={Boolean(addMenu)} onClose={() => setAddMenu(null)}>
        {KIND_CATEGORIES.flatMap((category) => {
          const kinds = OBJECT_KINDS.filter((k) => KIND_DEFS[k].category === category);
          if (kinds.length === 0) return [];
          return [
            <ListSubheader key={`header-${category}`}>{CATEGORY_LABELS[category]}</ListSubheader>,
            ...kinds.map((k) => (
              <MenuItem key={k} onClick={() => add(k)}>
                {KIND_DEFS[k].label}
              </MenuItem>
            )),
          ];
        })}
      </Menu>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={mode}
        onChange={(_, v: TransformMode | null) => v && setTransformMode(v)}
        aria-label="Transform mode"
        sx={{ '& .MuiToggleButton-root': { px: 1, py: 0.5 } }}
      >
        <ToggleButton value="translate" aria-label="Move">
          <Tooltip title="Move">
            <OpenWithIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="rotate" aria-label="Rotate">
          <Tooltip title="Rotate">
            <Rotate90DegreesCcwOutlinedIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="scale" aria-label="Scale">
          <Tooltip title="Scale">
            <PhotoSizeSelectSmallIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>
      <Action title="Duplicate selected" onClick={() => runOnSelected('duplicate')} disabled={!selected}>
        <ContentCopyOutlinedIcon fontSize="small" />
      </Action>
      <Action title="Delete selected (Del)" onClick={() => runOnSelected('delete')} disabled={!selected || selected.locked}>
        <DeleteOutlineIcon fontSize="small" />
      </Action>
      <Action title="Focus selected" onClick={requestFocus} disabled={!selected}>
        <CenterFocusStrongOutlinedIcon fontSize="small" />
      </Action>
      <Action title="Reset view" onClick={requestResetView}>
        <RestartAltIcon fontSize="small" />
      </Action>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      <Tooltip title="Grid">
        <ToggleButton
          size="small"
          value="grid"
          selected={settings.gridVisible}
          onChange={() => updateSettings({ gridVisible: !settings.gridVisible })}
          aria-label="Toggle grid"
          sx={{ px: 1, py: 0.5 }}
        >
          <Grid4x4Icon fontSize="small" />
        </ToggleButton>
      </Tooltip>
      <Tooltip title={`Snap (${settings.snapStep} m, 15°)`}>
        <ToggleButton
          size="small"
          value="snap"
          selected={settings.snapEnabled}
          onChange={() => updateSettings({ snapEnabled: !settings.snapEnabled })}
          aria-label="Toggle snapping"
          sx={{ px: 1, py: 0.5 }}
        >
          <StraightenIcon fontSize="small" />
        </ToggleButton>
      </Tooltip>
      <Tooltip title="Shadows">
        <ToggleButton
          size="small"
          value="shadows"
          selected={settings.shadowsEnabled}
          onChange={() => updateSettings({ shadowsEnabled: !settings.shadowsEnabled })}
          aria-label="Toggle shadows"
          sx={{ px: 1, py: 0.5 }}
        >
          <LightModeOutlinedIcon fontSize="small" />
        </ToggleButton>
      </Tooltip>
      <Box sx={{ flex: 1 }} />
      <Action title="Clear scene" onClick={() => setConfirmClear(true)} disabled={!hasObjects}>
        <DeleteSweepOutlinedIcon fontSize="small" />
      </Action>
      <ConfirmDialog
        open={confirmClear}
        title="Clear the scene?"
        confirmLabel="Clear scene"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          clearScene();
        }}
      >
        All unlocked objects will be removed. Locked objects are kept. You can undo this.
      </ConfirmDialog>
    </Box>
  );
}
