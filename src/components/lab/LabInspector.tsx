'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useState, type ReactNode } from 'react';
import { normaliseOperation } from '@/lab/plan';
import { useLabStore } from '@/lab/store';
import { DECAL_DIRECTIONS, type Axis, type Operation, type Region } from '@/lab/types';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ px: 1.5, py: 1.25 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6, mb: 0.75 }}>
        {title}
      </Typography>
      <Stack spacing={1.25}>{children}</Stack>
    </Box>
  );
}

function NumberField({ label, value, onChange, step = 0.1, width = 84 }: { label: string; value: number; onChange: (v: number) => void; step?: number; width?: number }) {
  return (
    <TextField
      size="small"
      type="number"
      label={label}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(Number(e.target.value))}
      slotProps={{ htmlInput: { step } }}
      sx={{ width }}
    />
  );
}

function AxisSelect({ value, onChange }: { value: Axis; onChange: (a: Axis) => void }) {
  return (
    <ToggleButtonGroup size="small" exclusive value={value} onChange={(_, v) => v && onChange(v)} aria-label="Axis">
      {(['x', 'y', 'z'] as const).map((a) => (
        <ToggleButton key={a} value={a} sx={{ px: 1.25, py: 0.25 }}>
          {a.toUpperCase()}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export function LabInspector() {
  const selected = useLabStore((s) => s.selected);
  const parts = useLabStore((s) => s.parts);
  const busy = useLabStore((s) => s.busy);
  const runEdit = useLabStore((s) => s.runEdit);
  const first = parts.find((p) => p.id === selected[0]);

  const [color, setColor] = useState('#c62828');
  const [keepTexture, setKeepTexture] = useState(false);
  const [metalness, setMetalness] = useState(0);
  const [roughness, setRoughness] = useState(0.6);
  const [opacity, setOpacity] = useState(1);
  const [emissive, setEmissive] = useState('#000000');
  const [emissiveIntensity, setEmissiveIntensity] = useState(0);
  const [texturePrompt, setTexturePrompt] = useState('');
  const [tiling, setTiling] = useState(2);
  const [decalPrompt, setDecalPrompt] = useState('');
  const [direction, setDirection] = useState<(typeof DECAL_DIRECTIONS)[number]>('front');
  const [decalSize, setDecalSize] = useState(0.8);
  const [decalDegrees, setDecalDegrees] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [stretch, setStretch] = useState<[number, number, number]>([1, 1.3, 1]);
  const [anchor, setAnchor] = useState<'center' | 'bottom' | 'top'>('bottom');
  const [move, setMove] = useState<[number, number, number]>([0, 0.1, 0]);
  const [deformAxis, setDeformAxis] = useState<Axis>('y');
  const [degrees, setDegrees] = useState(30);
  const [taper, setTaper] = useState(0.5);
  const [inflate, setInflate] = useState(0.02);
  const [pivot, setPivot] = useState<'part' | 'group'>('part');
  const [useRegion, setUseRegion] = useState(false);
  const [region, setRegion] = useState<Region>({ axis: 'y', start: 0.5, end: 1 });

  if (selected.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Select one or more parts (in the viewport or the parts list) to edit their color, material, texture, decals and shape by
          hand.
        </Typography>
      </Box>
    );
  }

  const anchorVec = { center: [0.5, 0.5, 0.5], bottom: [0.5, 0, 0.5], top: [0.5, 1, 0.5] }[anchor] as [number, number, number];
  const apply = (raw: Operation, label: string) => {
    const op = normaliseOperation(raw);
    if (!op) {
      useLabStore.getState().notify('Those values are not valid.', 'warning');
      return;
    }
    void runEdit([{ targets: selected, operations: [op], pivot, region: useRegion ? region : undefined }], label);
  };
  const disabled = Boolean(busy);

  return (
    <Box sx={{ overflowY: 'auto', overflowX: 'hidden', height: '100%' }}>
      <Box sx={{ px: 1.5, pt: 1.5 }}>
        <Typography variant="subtitle2" noWrap>
          {selected.length === 1 ? first?.label : `${selected.length} parts selected`}
        </Typography>
        {selected.length === 1 && first && (
          <Typography variant="caption" color="text.secondary">
            {first.id} · {first.material} · size {first.size.join(' × ')}
          </Typography>
        )}
      </Box>

      <Section title="Scope">
        <ToggleButtonGroup size="small" exclusive value={pivot} onChange={(_, v) => v && setPivot(v)} fullWidth>
          <ToggleButton value="part">Each part</ToggleButton>
          <ToggleButton value="group">As a group</ToggleButton>
        </ToggleButtonGroup>
        <FormControlLabel
          control={<Checkbox size="small" checked={useRegion} onChange={(e) => setUseRegion(e.target.checked)} />}
          label={<Typography variant="body2">Only a slice of the part</Typography>}
        />
        {useRegion && (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', pl: 1 }}>
            <AxisSelect value={region.axis} onChange={(axis) => setRegion({ ...region, axis })} />
            <Slider
              size="small"
              value={[region.start, region.end]}
              min={0}
              max={1}
              step={0.05}
              onChange={(_, v) => {
                const [start, end] = v as number[];
                setRegion({ ...region, start, end });
              }}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
              aria-label="Slice range"
            />
          </Stack>
        )}
      </Section>
      <Divider />

      <Section title="Color">
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Color" style={{ width: 40, height: 32, border: 'none', background: 'none' }} />
          <FormControlLabel control={<Checkbox size="small" checked={keepTexture} onChange={(e) => setKeepTexture(e.target.checked)} />} label={<Typography variant="body2">Tint texture</Typography>} />
          <Box sx={{ flex: 1 }} />
          <Button size="small" variant="outlined" disabled={disabled} onClick={() => apply({ type: 'color', color, keep_texture: keepTexture }, 'Color')}>
            Apply
          </Button>
        </Stack>
      </Section>
      <Divider />

      <Section title="Material">
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {[
            ['Metal', { type: 'material', metalness: 1, roughness: 0.25 }],
            ['Brushed', { type: 'material', metalness: 1, roughness: 0.45 }],
            ['Glass', { type: 'material', metalness: 0, roughness: 0.05, opacity: 0.3 }],
            ['Matte', { type: 'material', metalness: 0, roughness: 0.9 }],
            ['Glossy', { type: 'material', roughness: 0.12 }],
          ].map(([label, op]) => (
            <Button key={label as string} size="small" variant="outlined" disabled={disabled} onClick={() => apply(op as Operation, label as string)}>
              {label as string}
            </Button>
          ))}
        </Stack>
        {(
          [
            ['Metalness', metalness, setMetalness],
            ['Roughness', roughness, setRoughness],
            ['Opacity', opacity, setOpacity],
          ] as const
        ).map(([label, value, setter]) => (
          <Stack key={label} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Typography variant="body2" sx={{ width: 76 }}>
              {label}
            </Typography>
            <Slider size="small" value={value} min={label === 'Opacity' ? 0.02 : 0} max={1} step={0.01} onChange={(_, v) => setter(v as number)} aria-label={label} />
          </Stack>
        ))}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ width: 76 }}>
            Glow
          </Typography>
          <input type="color" value={emissive} onChange={(e) => setEmissive(e.target.value)} aria-label="Glow color" style={{ width: 36, height: 28, border: 'none', background: 'none' }} />
          <Slider size="small" value={emissiveIntensity} min={0} max={5} step={0.1} onChange={(_, v) => setEmissiveIntensity(v as number)} aria-label="Glow intensity" />
        </Stack>
        <Button
          size="small"
          variant="outlined"
          disabled={disabled}
          onClick={() => apply({ type: 'material', metalness, roughness, opacity, emissive, emissive_intensity: emissiveIntensity }, 'Material')}
        >
          Apply material
        </Button>
      </Section>
      <Divider />

      <Section title="AI texture (repeating)">
        <TextField size="small" label="Texture" placeholder="weathered oak planks" value={texturePrompt} onChange={(e) => setTexturePrompt(e.target.value)} fullWidth />
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ width: 76 }}>
            Tiling ×{tiling}
          </Typography>
          <Slider size="small" value={tiling} min={0.25} max={16} step={0.25} onChange={(_, v) => setTiling(v as number)} aria-label="Tiling" />
        </Stack>
        <Button size="small" variant="outlined" disabled={disabled || !texturePrompt.trim()} onClick={() => apply({ type: 'texture', texture_prompt: texturePrompt, tiling }, 'Texture')}>
          Generate texture
        </Button>
      </Section>
      <Divider />

      <Section title="AI decal / wrap (one picture)">
        <TextField size="small" label="Picture" placeholder="a red dragon" value={decalPrompt} onChange={(e) => setDecalPrompt(e.target.value)} fullWidth />
        <Stack direction="row" spacing={1}>
          <TextField select size="small" label="Direction" value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} sx={{ minWidth: 130 }}>
            {DECAL_DIRECTIONS.map((d) => (
              <MenuItem key={d} value={d}>
                {d === 'around' ? 'around (360° wrap)' : d === 'view' ? 'from current view' : d}
              </MenuItem>
            ))}
          </TextField>
          <NumberField label="Turn °" value={decalDegrees} onChange={setDecalDegrees} step={15} />
        </Stack>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ width: 76 }}>
            Size {Math.round(decalSize * 100)}%
          </Typography>
          <Slider size="small" value={decalSize} min={0.05} max={1.5} step={0.05} onChange={(_, v) => setDecalSize(v as number)} aria-label="Decal size" />
        </Stack>
        <Button
          size="small"
          variant="outlined"
          disabled={disabled || !decalPrompt.trim()}
          onClick={() => apply({ type: 'decal', decal_prompt: decalPrompt, direction, decal_size: decalSize, degrees: decalDegrees }, direction === 'around' ? 'Wrap' : 'Decal')}
        >
          {direction === 'around' ? 'Generate wrap' : 'Generate decal'}
        </Button>
      </Section>
      <Divider />

      <Section title="Shape">
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ width: 56 }}>
            Anchor
          </Typography>
          <ToggleButtonGroup size="small" exclusive value={anchor} onChange={(_, v) => v && setAnchor(v)}>
            <ToggleButton value="bottom">Bottom</ToggleButton>
            <ToggleButton value="center">Center</ToggleButton>
            <ToggleButton value="top">Top</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <NumberField label="Scale ×" value={scale} onChange={setScale} />
          <Button size="small" disabled={disabled} onClick={() => apply({ type: 'scale', factor: scale, anchor: anchorVec }, 'Scale')}>
            Scale
          </Button>
        </Stack>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {(['X', 'Y', 'Z'] as const).map((a, i) => (
            <NumberField key={a} label={`${a} ×`} value={stretch[i]} width={64} onChange={(v) => setStretch(stretch.map((s, j) => (j === i ? v : s)) as [number, number, number])} />
          ))}
          <Button size="small" disabled={disabled} onClick={() => apply({ type: 'stretch', factors: stretch, anchor: anchorVec }, 'Stretch')}>
            Stretch
          </Button>
        </Stack>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {(['X', 'Y', 'Z'] as const).map((a, i) => (
            <NumberField key={a} label={`Move ${a}`} value={move[i]} width={64} step={0.05} onChange={(v) => setMove(move.map((s, j) => (j === i ? v : s)) as [number, number, number])} />
          ))}
          <Button size="small" disabled={disabled} onClick={() => apply({ type: 'translate', offset: move }, 'Move')}>
            Move
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mt: -0.75 }}>
          Moves are fractions of the whole model size.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <AxisSelect value={deformAxis} onChange={setDeformAxis} />
          <NumberField label="Degrees" value={degrees} onChange={setDegrees} step={5} />
        </Stack>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {(['rotate', 'twist', 'bend'] as const).map((type) => (
            <Button key={type} size="small" variant="outlined" disabled={disabled} onClick={() => apply({ type, axis: deformAxis, degrees }, type[0].toUpperCase() + type.slice(1))}>
              {type}
            </Button>
          ))}
        </Stack>
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <NumberField label="Taper" value={taper} onChange={setTaper} />
          <Button size="small" disabled={disabled} onClick={() => apply({ type: 'taper', axis: deformAxis, factor: taper }, 'Taper')}>
            Taper
          </Button>
          <NumberField label="Inflate" value={inflate} onChange={setInflate} step={0.01} />
          <Button size="small" disabled={disabled} onClick={() => apply({ type: 'inflate', factor: inflate }, 'Inflate')}>
            Inflate
          </Button>
        </Stack>
      </Section>
      <Divider />

      <Section title="Visibility">
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" disabled={disabled} onClick={() => apply({ type: 'hide' }, 'Hide')}>
            Hide
          </Button>
          <Button size="small" variant="outlined" disabled={disabled} onClick={() => apply({ type: 'show' }, 'Show')}>
            Show
          </Button>
        </Stack>
      </Section>
    </Box>
  );
}
