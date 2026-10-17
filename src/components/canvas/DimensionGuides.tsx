'use client';

import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import * as THREE from 'three';
import { formatCentimetres } from '@/core/units';

type V3 = [number, number, number];
type Extent = { min: V3; max: V3 };

const COLOR = '#3D5AFE';
const OFFSET = 0.12;
const TICK = 0.05;
const noRaycast = () => null;
const scratch = new THREE.Box3();
const mm = (v: number) => Math.round(v * 1000) / 1000;

function Label({ position, text }: { position: V3; text: string }) {
  return (
    <Html position={position} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          background: 'rgba(255,255,255,0.92)',
          border: `1px solid ${COLOR}`,
          borderRadius: 10,
          color: COLOR,
          font: '600 11px/1.4 system-ui, sans-serif',
          padding: '1px 6px',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        {text}
      </div>
    </Html>
  );
}

function Dimension({ points, label, labelAt }: { points: V3[]; label: string; labelAt: V3 }) {
  return (
    <>
      <Line points={points} segments color={COLOR} lineWidth={1.5} raycast={noRaycast} />
      <Label position={labelAt} text={label} />
    </>
  );
}

/** Width (x), depth (z) and height (y) of an object's world-space bounds, labelled in centimetres. */
export function DimensionGuides({ object }: { object: THREE.Object3D }) {
  const [extent, setExtent] = useState<Extent | null>(null);
  const lastKey = useRef('');

  useFrame(() => {
    scratch.setFromObject(object);
    if (scratch.isEmpty()) return;
    const next: Extent = {
      min: [mm(scratch.min.x), mm(scratch.min.y), mm(scratch.min.z)],
      max: [mm(scratch.max.x), mm(scratch.max.y), mm(scratch.max.z)],
    };
    const key = [...next.min, ...next.max].join(',');
    if (key === lastKey.current) return;
    lastKey.current = key;
    setExtent(next);
  });

  if (!extent) return null;
  const [x0, y0, z0] = extent.min;
  const [x1, y1, z1] = extent.max;
  const front = z1 + OFFSET;
  const right = x1 + OFFSET;
  const base = y0 + 0.002;

  return (
    <group name="dimension-guides">
      <Dimension
        label={formatCentimetres(x1 - x0)}
        labelAt={[(x0 + x1) / 2, base, front]}
        points={[
          [x0, base, front], [x1, base, front],
          [x0, base, front - TICK], [x0, base, front + TICK],
          [x1, base, front - TICK], [x1, base, front + TICK],
        ]}
      />
      <Dimension
        label={formatCentimetres(z1 - z0)}
        labelAt={[right, base, (z0 + z1) / 2]}
        points={[
          [right, base, z0], [right, base, z1],
          [right - TICK, base, z0], [right + TICK, base, z0],
          [right - TICK, base, z1], [right + TICK, base, z1],
        ]}
      />
      <Dimension
        label={formatCentimetres(y1 - y0)}
        labelAt={[right, (y0 + y1) / 2, front]}
        points={[
          [right, y0, front], [right, y1, front],
          [right - TICK, y0, front], [right + TICK, y0, front],
          [right - TICK, y1, front], [right + TICK, y1, front],
        ]}
      />
    </group>
  );
}
