import { beforeEach, describe, expect, it } from 'vitest';
import { useLabStore } from '@/lab/store';
import type { PartInfo } from '@/lab/types';

const part = (id: string, group: string | null): PartInfo => ({
  id,
  label: id,
  material: 'm',
  color: '#808080',
  has_texture: false,
  triangles: 12,
  center: [0, 0, 0],
  size: [1, 1, 1],
  visible: true,
  group_id: group,
  group,
});

beforeEach(() => {
  useLabStore.setState({
    parts: [part('top', 'desk'), part('leg1', 'desk'), part('leg2', 'desk'), part('crate', 'glb_1'), part('loose', null)],
    selected: [],
  });
});

const selected = () => [...useLabStore.getState().selected].sort();

describe('viewport picking', () => {
  it('selects the whole object first, then drills into parts of it', () => {
    const { pick } = useLabStore.getState();
    pick('top');
    expect(selected()).toEqual(['leg1', 'leg2', 'top']);
    pick('top');
    expect(selected()).toEqual(['top']);
    pick('leg1');
    expect(selected()).toEqual(['leg1']);
    pick('crate');
    expect(selected()).toEqual(['crate']);
  });

  it('adds and removes whole objects with Shift', () => {
    const { pick } = useLabStore.getState();
    pick('top');
    pick('crate', true);
    expect(selected()).toEqual(['crate', 'leg1', 'leg2', 'top']);
    pick('leg2', true);
    expect(selected()).toEqual(['crate']);
  });

  it('toggles a part that has no object', () => {
    const { pick } = useLabStore.getState();
    pick('loose');
    expect(selected()).toEqual(['loose']);
    pick('loose');
    expect(selected()).toEqual([]);
  });
});
