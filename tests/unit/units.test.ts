import { describe, expect, it } from 'vitest';
import { formatCentimetres } from '@/core/units';

describe('formatCentimetres', () => {
  it('shows whole centimetres for normal sizes', () => {
    expect(formatCentimetres(1.6)).toBe('160 cm');
    expect(formatCentimetres(0.754)).toBe('75 cm');
    expect(formatCentimetres(4)).toBe('400 cm');
  });

  it('keeps one decimal for small sizes', () => {
    expect(formatCentimetres(0.045)).toBe('4.5 cm');
    expect(formatCentimetres(0.01)).toBe('1.0 cm');
  });

  it('ignores the sign', () => {
    expect(formatCentimetres(-0.3)).toBe('30 cm');
  });
});
