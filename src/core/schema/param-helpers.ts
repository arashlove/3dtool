import type { BooleanParamDef, ChoiceParamDef, NumberParamDef, Params } from './kinds';
import type { MaterialSpec } from './material';

/** Small constructors shared by the preset definition files. */

export const metres = (key: string, label: string, min: number, max: number, def: number, step = 0.01): NumberParamDef => ({
  key,
  label,
  type: 'number',
  min,
  max,
  default: def,
  step,
  unit: 'm',
});

export const count = (key: string, label: string, min: number, max: number, def: number): NumberParamDef => ({
  key,
  label,
  type: 'number',
  min,
  max,
  default: def,
  step: 1,
  unit: 'count',
  integer: true,
});

export const flag = (key: string, label: string, def: boolean): BooleanParamDef => ({ key, label, type: 'boolean', default: def });

export const choice = <const T extends readonly [string, ...string[]]>(
  key: string,
  label: string,
  options: T,
  def: T[number],
): ChoiceParamDef => ({ key, label, type: 'choice', options, default: def });

export const n = (p: Params, key: string) => p[key] as number;

export const mat = (color: string, metalness: number, roughness: number, opacity?: number): MaterialSpec =>
  opacity === undefined ? { color, metalness, roughness } : { color, metalness, roughness, opacity };
