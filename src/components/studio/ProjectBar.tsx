'use client';

import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useRef, useState, type ReactNode } from 'react';
import { parseSceneDocumentText, projectFileName, serializeSceneDocument } from '@/core/scene/document-io';
import { exportSceneToGlb } from '@/core/scene/glb-export';
import { createSampleScene } from '@/core/scene/sample-scene';
import { LIMITS } from '@/core/schema/constants';
import { createEmptyDocument, type SceneDocument } from '@/core/schema/scene';
import { useSceneStore } from '@/state/scene-store';
import { notify } from '@/state/ui-store';
import { ConfirmDialog } from '../common/ConfirmDialog';

function download(data: BlobPart, type: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function BarButton({ compact, icon, label, onClick, disabled }: { compact: boolean; icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return compact ? (
    <Tooltip title={label}>
      <span>
        <IconButton size="small" aria-label={label} onClick={onClick} disabled={disabled}>
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  ) : (
    <Button size="small" startIcon={icon} onClick={onClick} disabled={disabled} color="inherit">
      {label}
    </Button>
  );
}

/** Hides its tooltip on click; otherwise the drawer it opens covers the button and the tooltip never receives mouseleave. */
function DrawerToggle({ title, label, icon, onClick }: { title: string; label: string; icon: ReactNode; onClick: () => void }) {
  const [tip, setTip] = useState(false);
  return (
    <Tooltip title={title} open={tip} onOpen={() => setTip(true)} onClose={() => setTip(false)}>
      <IconButton
        size="small"
        aria-label={label}
        onClick={() => {
          setTip(false);
          onClick();
        }}
      >
        {icon}
      </IconButton>
    </Tooltip>
  );
}

type Props = { compact: boolean; onOpenPrompt?: () => void; onOpenPanel?: () => void };

export function ProjectBar({ compact, onOpenPrompt, onOpenPanel }: Props) {
  const title = useSceneStore((s) => s.doc.title);
  const dirty = useSceneStore((s) => s.dirty);
  const hasObjects = useSceneStore((s) => s.doc.objects.length > 0);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [pendingReplace, setPendingReplace] = useState<{ doc: SceneDocument; label: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const replace = (doc: SceneDocument, label: string) => {
    if (useSceneStore.getState().dirty && useSceneStore.getState().doc.objects.length > 0) setPendingReplace({ doc, label });
    else {
      useSceneStore.getState().replaceDocument(doc, { undoable: true });
      notify(label, 'success');
    }
  };

  const save = () => {
    const doc = useSceneStore.getState().doc;
    download(serializeSceneDocument(doc), 'application/json', projectFileName(doc));
    useSceneStore.getState().markSaved();
  };

  const exportGlb = async () => {
    setExporting(true);
    try {
      const doc = useSceneStore.getState().doc;
      const glb = await exportSceneToGlb(doc);
      download(glb, 'model/gltf-binary', projectFileName(doc).replace('.3dtool.json', '.glb'));
      notify('Exported GLB (geometry and materials; parametric data stays in the JSON project).', 'success');
    } catch (e) {
      notify(`GLB export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > LIMITS.maxImportBytes) return notify('File is too large (max 2 MB).', 'error');
    const result = parseSceneDocumentText(await file.text());
    if (!result.ok) return notify(result.error, 'error');
    replace(result.doc, `Opened “${result.doc.title}”`);
  };

  const commitTitle = () => {
    if (titleDraft === null) return;
    const problem = titleDraft === title ? null : useSceneStore.getState().setTitle(titleDraft);
    if (problem) notify(problem, 'error');
    setTitleDraft(null);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      {compact && onOpenPrompt && (
        <DrawerToggle title="AI prompt" label="Open AI prompt panel" icon={<ChatOutlinedIcon fontSize="small" />} onClick={onOpenPrompt} />
      )}
      <InputBase
        value={titleDraft ?? title}
        onChange={(e) => setTitleDraft(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        inputProps={{ 'aria-label': 'Project title', maxLength: LIMITS.maxNameLength }}
        sx={{ fontWeight: 600, fontSize: 14, flex: compact ? 1 : '0 1 260px', minWidth: 80, px: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
      />
      {!compact && (
        <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto' }}>
          {dirty ? 'Unsaved changes · autosaved in this browser' : 'Saved'}
        </Typography>
      )}
      <BarButton compact={compact} icon={<NoteAddOutlinedIcon fontSize="small" />} label="New" onClick={() => replace(createEmptyDocument(), 'Started a new scene')} />
      <BarButton compact={compact} icon={<CategoryOutlinedIcon fontSize="small" />} label="Sample (preset)" onClick={() => replace(createSampleScene(), 'Loaded the sample preset scene')} />
      <BarButton compact={compact} icon={<FolderOpenOutlinedIcon fontSize="small" />} label="Open" onClick={() => fileInput.current?.click()} />
      <BarButton compact={compact} icon={<SaveOutlinedIcon fontSize="small" />} label="Save JSON" onClick={save} />
      <BarButton compact={compact} icon={exporting ? <ViewInArOutlinedIcon fontSize="small" /> : <FileDownloadOutlinedIcon fontSize="small" />} label="Export GLB" onClick={() => void exportGlb()} disabled={!hasObjects || exporting} />
      {compact && onOpenPanel && (
        <DrawerToggle title="Objects & inspector" label="Open objects and inspector panel" icon={<TuneIcon fontSize="small" />} onClick={onOpenPanel} />
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingReplace)}
        title="Replace the current scene?"
        confirmLabel="Replace"
        onCancel={() => setPendingReplace(null)}
        onConfirm={() => {
          if (pendingReplace) {
            useSceneStore.getState().replaceDocument(pendingReplace.doc, { undoable: true });
            notify(pendingReplace.label, 'success');
          }
          setPendingReplace(null);
        }}
      >
        The current scene has unsaved changes. Save it as JSON first if you want to keep it. You can also undo this.
      </ConfirmDialog>
    </Box>
  );
}
