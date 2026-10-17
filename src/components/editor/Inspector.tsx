'use client';

import CenterFocusStrongOutlinedIcon from '@mui/icons-material/CenterFocusStrongOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sceneMaster } from '@/core/geometry/ThreeSceneMaster';
import { KIND_DEFS } from '@/core/schema/kinds';
import { MATERIAL_PRESETS, MATERIAL_PRESET_NAMES, type MaterialInput, type MaterialSpec } from '@/core/schema/material';
import type { SceneOperation } from '@/core/schema/plan';
import type { SceneObject, Vec3 } from '@/core/schema/scene';
import { selectSelectedObject, useSceneStore } from '@/state/scene-store';
import { notify } from '@/state/ui-store';
import { CommitNumberField } from './CommitNumberField';

const RAD2DEG = 180 / Math.PI;
const AXES = ['X', 'Y', 'Z'] as const;

function useRun() {
  const runOperations = useSceneStore((s) => s.runOperations);
  return (ops: SceneOperation[]): string | null => {
    const r = runOperations(ops);
    if (!r.ok) {
      notify(r.error, 'error');
      return r.error;
    }
    return null;
  };
}

function Section({ title, children, defaultExpanded = true }: { title: string; children: React.ReactNode; defaultExpanded?: boolean }) {
  return (
    <Accordion defaultExpanded={defaultExpanded} disableGutters square sx={{ '&:before': { display: 'none' }, borderTop: 1, borderColor: 'divider' }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.75 } }}>
        <Typography variant="subtitle2">{title}</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>{children}</AccordionDetails>
    </Accordion>
  );
}

function NameField({ obj }: { obj: SceneObject }) {
  const rename = useSceneStore((s) => s.rename);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    if (draft === null || draft === obj.name) return setDraft(null);
    const problem = rename(obj.id, draft);
    setError(problem);
    if (!problem) setDraft(null);
  };
  return (
    <TextField
      label="Name"
      value={draft ?? obj.name}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      error={Boolean(error)}
      helperText={error ?? undefined}
      disabled={obj.locked}
      fullWidth
      slotProps={{ htmlInput: { maxLength: 100 } }}
    />
  );
}

function TransformEditor({ obj }: { obj: SceneObject }) {
  const run = useRun();
  const t = obj.transform;
  const set = (key: 'position' | 'rotationDeg' | 'scale', axis: number, value: number) => {
    const base: Vec3 =
      key === 'position' ? [...t.position] : key === 'scale' ? [...t.scale] : (t.rotation.map((r) => r * RAD2DEG) as Vec3);
    base[axis] = value;
    return run([{ op: 'set_transform', target: obj.id, [key]: base } as SceneOperation]);
  };
  const rows: Array<{ key: 'position' | 'rotationDeg' | 'scale'; label: string; values: number[]; unit: string; step: number }> = [
    { key: 'position', label: 'Position', values: t.position, unit: 'm', step: 0.05 },
    { key: 'rotationDeg', label: 'Rotation', values: t.rotation.map((r) => r * RAD2DEG), unit: '°', step: 5 },
    { key: 'scale', label: 'Scale', values: t.scale, unit: '×', step: 0.1 },
  ];
  return (
    <Stack spacing={1.5}>
      {rows.map((row) => (
        <Box key={row.key}>
          <Typography variant="caption" color="text.secondary">
            {row.label} ({row.unit})
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
            {AXES.map((axis, i) => (
              <CommitNumberField
                key={axis}
                label={axis}
                value={row.values[i]}
                step={row.step}
                decimals={row.key === 'rotationDeg' ? 1 : 3}
                disabled={obj.locked}
                onCommit={(v) => set(row.key, i, v)}
              />
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function ParamsEditor({ obj }: { obj: SceneObject }) {
  const run = useRun();
  const def = KIND_DEFS[obj.kind];
  return (
    <Stack spacing={1.5}>
      {def.params.map((p) =>
        p.type === 'boolean' ? (
          <FormControlLabel
            key={p.key}
            control={
              <Switch
                checked={obj.params[p.key] === true}
                disabled={obj.locked}
                onChange={(e) => run([{ op: 'set_params', target: obj.id, changes: { [p.key]: e.target.checked } }])}
              />
            }
            label={p.label}
          />
        ) : (
          <CommitNumberField
            key={p.key}
            label={p.label}
            unit={p.unit === 'm' ? 'm' : undefined}
            value={obj.params[p.key] as number}
            step={p.step}
            disabled={obj.locked}
            decimals={p.integer ? 0 : 3}
            onCommit={(v) => run([{ op: 'set_params', target: obj.id, changes: { [p.key]: v } }])}
          />
        ),
      )}
    </Stack>
  );
}

/** Colour picker that commits once the user pauses or leaves the control, not on every drag frame. */
function ColorField({ label, value, disabled, onCommit }: { label: string; value: string; disabled?: boolean; onCommit: (c: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = (color: string | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (color && color.toLowerCase() !== value.toLowerCase()) onCommit(color);
    setDraft(null);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <Box
      component="input"
      type="color"
      aria-label={label}
      value={(draft ?? value).toLowerCase()}
      disabled={disabled}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        const color = e.target.value;
        setDraft(color);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => flush(color), 450);
      }}
      onBlur={() => flush(draft)}
      sx={{ width: 36, height: 28, p: 0, border: 0, bgcolor: 'transparent', cursor: 'pointer' }}
    />
  );
}

function MaterialEditor({ obj, part, label, highlighted }: { obj: SceneObject; part: string; label: string; highlighted: boolean }) {
  const run = useRun();
  const m: MaterialSpec = obj.materials[part];
  const apply = (changes: MaterialInput) => run([{ op: 'set_material', target: obj.id, part, changes }]);
  const [roughness, setRoughness] = useState<number | null>(null);
  const [metalness, setMetalness] = useState<number | null>(null);
  const [opacity, setOpacity] = useState<number | null>(null);

  return (
    <Box
      sx={{
        p: 1.25,
        borderRadius: 1,
        border: 1,
        borderColor: highlighted ? 'primary.main' : 'divider',
        bgcolor: highlighted ? 'action.hover' : 'transparent',
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <ColorField label={`${label} colour`} value={m.color} disabled={obj.locked} onCommit={(color) => apply({ color })} />
        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
          {label}
        </Typography>
        <TextField
          select
          value=""
          label="Preset"
          disabled={obj.locked}
          onChange={(e) => apply({ preset: e.target.value as MaterialInput['preset'], color: m.color })}
          sx={{ width: 130 }}
        >
          {MATERIAL_PRESET_NAMES.map((name) => (
            <MenuItem key={name} value={name}>
              {MATERIAL_PRESETS[name].label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {(
        [
          ['Roughness', roughness, setRoughness, m.roughness, 'roughness', 0, 1],
          ['Metalness', metalness, setMetalness, m.metalness, 'metalness', 0, 1],
          ['Opacity', opacity, setOpacity, m.opacity ?? 1, 'opacity', 0.2, 1],
        ] as const
      ).map(([name, local, setLocal, stored, key, min, max]) => (
        <Stack key={key} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Typography variant="caption" sx={{ width: 64 }} color="text.secondary">
            {name}
          </Typography>
          <Slider
            size="small"
            min={min}
            max={max}
            step={0.01}
            value={local ?? stored}
            disabled={obj.locked}
            onChange={(_, v) => setLocal(v as number)}
            onChangeCommitted={(_, v) => {
              setLocal(null);
              apply({ [key]: v as number });
            }}
            aria-label={`${label} ${name}`}
          />
        </Stack>
      ))}
    </Box>
  );
}

export function Inspector() {
  const obj = useSceneStore(selectSelectedObject);
  const selectedPart = useSceneStore((s) => s.selectedPart);
  const requestFocus = useSceneStore((s) => s.requestFocus);
  const run = useRun();

  const bounds = useMemo(() => (obj ? sceneMaster.getBounds(obj) : null), [obj]);

  if (!obj) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Select an object in the canvas or the list above to edit its position, dimensions and materials.
        </Typography>
      </Box>
    );
  }

  const def = KIND_DEFS[obj.kind];
  const size = bounds ? bounds.max.map((v, i) => (v - bounds.min[i]).toFixed(2)) : null;

  return (
    <Box key={obj.id}>
      <Stack spacing={1.5} sx={{ p: 2 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2">Inspector</Typography>
          <Typography variant="caption" color="text.secondary">
            {def.label}
          </Typography>
        </Stack>
        {obj.locked && (
          <Alert severity="info" icon={<LockOutlinedIcon fontSize="small" />} sx={{ py: 0 }}>
            Locked: unlock it in the object list to edit.
          </Alert>
        )}
        <NameField obj={obj} />
        {size && (
          <Typography variant="caption" color="text.secondary">
            World size (W × H × D): {size[0]} × {size[1]} × {size[2]} m
          </Typography>
        )}
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<CenterFocusStrongOutlinedIcon />} onClick={requestFocus}>
            Focus
          </Button>
          <Button size="small" startIcon={<ContentCopyOutlinedIcon />} onClick={() => run([{ op: 'duplicate', target: obj.id }])}>
            Duplicate
          </Button>
          <Button
            size="small"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            disabled={obj.locked}
            onClick={() => run([{ op: 'delete', target: obj.id }])}
          >
            Delete
          </Button>
        </Stack>
      </Stack>
      <Section title="Transform">
        <TransformEditor obj={obj} />
      </Section>
      <Section title="Dimensions">
        <ParamsEditor obj={obj} />
      </Section>
      <Section title="Materials">
        <Stack spacing={1}>
          {def.parts.map((p) => (
            <MaterialEditor key={p.key} obj={obj} part={p.key} label={p.label} highlighted={selectedPart === p.key} />
          ))}
          <Typography variant="caption" color="text.secondary">
            Materials are approximate colour and surface presets, not scanned textures.
          </Typography>
        </Stack>
      </Section>
    </Box>
  );
}
