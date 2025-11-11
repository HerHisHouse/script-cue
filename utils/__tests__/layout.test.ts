import { computeSafeTopPadding } from '../layout';

describe('computeSafeTopPadding', () => {
  it('applies minimum padding when inset is small', () => {
    expect(computeSafeTopPadding(0)).toBe(12);
    expect(computeSafeTopPadding(4)).toBe(12);
  });

  it('adds extra margin to typical iPhone notch insets', () => {
    expect(computeSafeTopPadding(20)).toBe(26);
    expect(computeSafeTopPadding(44)).toBe(50);
    expect(computeSafeTopPadding(59)).toBe(65);
  });
});