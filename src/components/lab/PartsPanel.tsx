'use client';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useLabAiEnabled } from '@/lab/ai-token';
import type { PartInfo } from '@/lab/types';
import { useLabStore } from '@/lab/store';

function PartRow({ part, selected, targeted }: { part: PartInfo; selected: boolean; targeted: boolean }) {
  const select = useLabStore((s) => s.select);
  const setVisible = useLabStore((s) => s.setVisible);
  const renameParts = useLabStore((s) => s.renameParts);
  const [editing, setEditing] = useState<string | null>(null);

  const commit = () => {
    if (editing !== null && editing.trim() && editing !== part.label) renameParts({ [part.id]: editing });
    setEditing(null);
  };

  return (
    <Box
      role="option"
      aria-selected={selected}
      onClick={(e) => select(part.id, e.shiftKey || e.ctrlKey || e.metaKey)}
      onDoubleClick={() => setEditing(part.label)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 0.5,
        borderRadius: 1,
        cursor: 'pointer',
        bgcolor: selected ? 'action.selected' : targeted ? 'rgba(255,145,0,0.12)' : 'transparent',
        '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
        opacity: part.visible ? 1 : 0.5,
      }}
    >
      <Box
        sx={{
          width: 14,
          height: 14,
          borderRadius: 0.5,
          flexShrink: 0,
          bgcolor: part.color,
          border: 1,
          borderColor: 'divider',
          backgroundImage: part.has_texture ? 'repeating-linear-gradient(45deg, rgba(255,255,255,.55) 0 2px, transparent 2px 5px)' : 'none',
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {editing !== null ? (
          <InputBase
            autoFocus
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(null);
            }}
            onClick={(e) => e.stopPropagation()}
            inputProps={{ maxLength: 80, 'aria-label': 'Part name' }}
            sx={{ fontSize: 13, width: '100%' }}
          />
        ) : (
          <Typography variant="body2" noWrap title={`${part.label} — double-click to rename`}>
            {part.label}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {part.id} · {part.triangles.toLocaleString()} tris{part.decal_of ? ' · overlay' : ''}
        </Typography>
      </Box>
      {part.marker ? <Chip size="small" label={`#${part.marker}`} sx={{ height: 18, fontSize: 11, bgcolor: '#ffd400', color: '#111' }} /> : null}
      <IconButton
        size="small"
        aria-label={part.visible ? `Hide ${part.label}` : `Show ${part.label}`}
        onClick={(e) => {
          e.stopPropagation();
          setVisible(part.id, !part.visible);
        }}
      >
        {part.visible ? <VisibilityIcon fontSize="inherit" /> : <VisibilityOffIcon fontSize="inherit" />}
      </IconButton>
    </Box>
  );
}

type Group = { id: string; label: string; parts: PartInfo[] };

/** Groups parts by their object, keeping the scene order of first appearance. */
function groupParts(parts: PartInfo[]): Group[] {
  const groups = new Map<string, Group>();
  for (const p of parts) {
    const id = p.group_id ?? `part:${p.id}`;
    let g = groups.get(id);
    if (!g) {
      g = { id, label: p.group ?? p.label, parts: [] };
      groups.set(id, g);
    }
    g.parts.push(p);
  }
  return [...groups.values()];
}

function GroupHeader({ group, open, onToggle, selected }: { group: Group; open: boolean; onToggle: () => void; selected: 'all' | 'some' | 'none' }) {
  const selectGroup = useLabStore((s) => s.selectGroup);
  return (
    <Box
      onClick={(e) => selectGroup(group.id, e.shiftKey || e.ctrlKey || e.metaKey)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.5,
        py: 0.25,
        mt: 0.5,
        borderRadius: 1,
        cursor: 'pointer',
        bgcolor: selected === 'all' ? 'action.selected' : 'transparent',
        '&:hover': { bgcolor: selected === 'all' ? 'action.selected' : 'action.hover' },
      }}
      title="Click to select the whole object, Shift+click to add it"
    >
      <IconButton
        size="small"
        aria-label={open ? `Collapse ${group.label}` : `Expand ${group.label}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        sx={{ p: 0.25 }}
      >
        {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
      </IconButton>
      <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: 650 }}>
        {group.label}
      </Typography>
      <Typography variant="caption" color={selected === 'some' ? 'primary' : 'text.secondary'}>
        {group.parts.length} part{group.parts.length === 1 ? '' : 's'}
      </Typography>
    </Box>
  );
}

export function PartsPanel() {
  const parts = useLabStore((s) => s.parts);
  const selected = useLabStore((s) => s.selected);
  const preview = useLabStore((s) => s.preview);
  const busy = useLabStore((s) => s.busy);
  const aiEnabled = useLabAiEnabled();
  const textureSegments = useLabStore((s) => s.textureSegments);
  const store = useLabStore.getState;
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const shown = filter.trim() ? parts.filter((p) => p.label.toLowerCase().includes(filter.trim().toLowerCase()) || p.id.includes(filter.trim())) : parts;
  const selectedSet = new Set(selected);
  const previewSet = new Set(preview);
  const segmentScope = selected.length ? `the ${selected.length} selected part${selected.length === 1 ? '' : 's'}` : 'the whole visible model';

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Box sx={{ p: 1.5, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" sx={{ alignItems: 'baseline', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            Parts ({parts.length})
          </Typography>
          <Button size="small" onClick={() => store().setSelected(parts.filter((p) => p.visible).map((p) => p.id))} disabled={!parts.length}>
            All
          </Button>
          <Button size="small" onClick={() => store().setSelected([])} disabled={!selected.length}>
            None
          </Button>
        </Stack>
        <TextField size="small" placeholder="Search parts" value={filter} onChange={(e) => setFilter(e.target.value)} fullWidth sx={{ mb: 1 }} />
        <Stack spacing={1}>
          <Tooltip title={aiEnabled ? 'Ask the vision model to name every part from a marked snapshot' : 'Needs your Hugging Face token (top bar)'}>
            <span>
              <Button
                fullWidth
                size="small"
                variant="outlined"
                startIcon={<AutoAwesomeIcon />}
                onClick={() => void store().autoLabel()}
                disabled={!aiEnabled || Boolean(busy) || !parts.length}
              >
                AI names
              </Button>
            </span>
          </Tooltip>
          <Stack direction="row" spacing={1}>
            <Tooltip title={`Split ${segmentScope} into regions of similar surface color. Runs locally, no AI.`}>
              <span style={{ flex: 1 }}>
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  startIcon={<PaletteOutlinedIcon />}
                  onClick={() => void store().segmentByTexture()}
                  disabled={Boolean(busy) || !parts.length}
                >
                  Segment by texture
                </Button>
              </span>
            </Tooltip>
            <TextField
              size="small"
              type="number"
              placeholder="auto"
              value={textureSegments ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Math.round(Number(e.target.value));
                store().set({ textureSegments: v === null || Number.isNaN(v) ? null : Math.min(32, Math.max(1, v)) });
              }}
              slotProps={{ htmlInput: { min: 1, max: 32, 'aria-label': 'Number of color regions (empty = auto)' } }}
              sx={{ width: 76 }}
            />
          </Stack>
        </Stack>
      </Box>
      <Box role="listbox" aria-multiselectable aria-label="Parts" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 0.75 }}>
        {groupParts(shown).map((g) => {
          // Parts without an object (older scenes) are listed on their own.
          if (g.id.startsWith('part:')) {
            const p = g.parts[0];
            return <PartRow key={p.id} part={p} selected={selectedSet.has(p.id)} targeted={previewSet.has(p.id)} />;
          }
          const count = g.parts.filter((p) => selectedSet.has(p.id)).length;
          const open = Boolean(filter.trim()) || !collapsed.has(g.id);
          return (
            <Box key={g.id}>
              <GroupHeader
                group={g}
                open={open}
                selected={count === 0 ? 'none' : count === g.parts.length ? 'all' : 'some'}
                onToggle={() =>
                  setCollapsed((c) => {
                    const next = new Set(c);
                    if (next.has(g.id)) next.delete(g.id);
                    else next.add(g.id);
                    return next;
                  })
                }
              />
              {open && (
                <Box sx={{ pl: 1.5 }}>
                  {g.parts.map((p) => (
                    <PartRow key={p.id} part={p} selected={selectedSet.has(p.id)} targeted={previewSet.has(p.id)} />
                  ))}
                </Box>
              )}
            </Box>
          );
        })}
        {parts.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>
            Load the Shape Studio scene or open a .glb file to list its parts.
          </Typography>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
        Click an object heading (or the object in the view) to select it whole; click a part for just that part. Shift adds;
        double-click renames.
      </Typography>
    </Stack>
  );
}
