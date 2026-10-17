'use client';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { KIND_DEFS } from '@/core/schema/kinds';
import type { SceneObject } from '@/core/schema/scene';
import { useSceneStore } from '@/state/scene-store';
import { notify } from '@/state/ui-store';

function Row({ obj, selected, selectedPart }: { obj: SceneObject; selected: boolean; selectedPart: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const select = useSceneStore((s) => s.select);
  const setVisible = useSceneStore((s) => s.setVisible);
  const setLocked = useSceneStore((s) => s.setLocked);
  const runOperations = useSceneStore((s) => s.runOperations);
  const def = KIND_DEFS[obj.kind];
  const multiPart = def.parts.length > 1;

  const run = (op: 'duplicate' | 'delete') => {
    setMenu(null);
    const r = runOperations([{ op, target: obj.id }]);
    if (!r.ok) notify(r.error, 'error');
  };

  return (
    <>
      <ListItemButton
        selected={selected && !selectedPart}
        onClick={() => select(obj.id)}
        sx={{ pl: 0.5, pr: 0.5, py: 0.25, opacity: obj.visible ? 1 : 0.55 }}
      >
        <IconButton
          size="small"
          aria-label={expanded ? 'Collapse parts' : 'Expand parts'}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          sx={{ visibility: multiPart ? 'visible' : 'hidden' }}
        >
          {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </IconButton>
        <ListItemText
          primary={obj.name}
          secondary={def.label}
          slotProps={{
            primary: { noWrap: true, variant: 'body2', sx: { fontWeight: selected ? 650 : 500 } },
            secondary: { variant: 'caption' },
          }}
        />
        <Tooltip title={obj.visible ? 'Hide' : 'Show'}>
          <IconButton
            size="small"
            aria-label={obj.visible ? `Hide ${obj.name}` : `Show ${obj.name}`}
            onClick={(e) => {
              e.stopPropagation();
              setVisible(obj.id, !obj.visible);
            }}
          >
            {obj.visible ? <VisibilityOutlinedIcon fontSize="small" /> : <VisibilityOffOutlinedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title={obj.locked ? 'Unlock' : 'Lock'}>
          <IconButton
            size="small"
            aria-label={obj.locked ? `Unlock ${obj.name}` : `Lock ${obj.name}`}
            onClick={(e) => {
              e.stopPropagation();
              setLocked(obj.id, !obj.locked);
            }}
          >
            {obj.locked ? <LockOutlinedIcon fontSize="small" /> : <LockOpenOutlinedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <IconButton
          size="small"
          aria-label={`More actions for ${obj.name}`}
          onClick={(e) => {
            e.stopPropagation();
            setMenu(e.currentTarget);
          }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </ListItemButton>
      <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => run('duplicate')}>Duplicate</MenuItem>
        <MenuItem onClick={() => run('delete')} disabled={obj.locked} sx={{ color: 'error.main' }}>
          Delete
        </MenuItem>
      </Menu>
      {expanded &&
        def.parts.map((part) => (
          <ListItemButton
            key={part.key}
            selected={selected && selectedPart === part.key}
            onClick={() => select(obj.id, part.key)}
            sx={{ pl: 5.5, py: 0.25 }}
          >
            <ListItemText primary={part.label} slotProps={{ primary: { variant: 'body2' } }} />
          </ListItemButton>
        ))}
    </>
  );
}

export function ObjectTree() {
  const objects = useSceneStore((s) => s.doc.objects);
  const selectedId = useSceneStore((s) => s.selectedId);
  const selectedPart = useSceneStore((s) => s.selectedPart);

  return (
    <Box>
      <Box sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2">Objects</Typography>
        <Typography variant="caption" color="text.secondary">
          {objects.length} / 40
        </Typography>
      </Box>
      {objects.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>
          No objects yet.
        </Typography>
      ) : (
        <List dense disablePadding aria-label="Scene objects">
          {objects.map((o) => (
            <Row key={o.id} obj={o} selected={o.id === selectedId} selectedPart={o.id === selectedId ? selectedPart : null} />
          ))}
        </List>
      )}
    </Box>
  );
}
