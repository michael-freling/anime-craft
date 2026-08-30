import { describe, it, expect } from 'vitest';
import { windowTargetFrom } from '../windowTarget';

describe('windowTargetFrom', () => {
  it('is the app by default', () => {
    expect(windowTargetFrom('')).toEqual({ kind: 'app' });
    expect(windowTargetFrom('?foo=bar')).toEqual({ kind: 'app' });
  });

  it('is a reference window when asked for one', () => {
    expect(windowTargetFrom('?window=reference&referenceId=ref-001')).toEqual({
      kind: 'reference',
      referenceId: 'ref-001',
    });
  });

  // A reference window with nothing to show is not one, and an empty window
  // with no way out of it would be worse than falling back.
  it('falls back to the app when no reference is named', () => {
    expect(windowTargetFrom('?window=reference')).toEqual({ kind: 'app' });
    expect(windowTargetFrom('?window=reference&referenceId=')).toEqual({ kind: 'app' });
  });

  it('reads ids that needed escaping', () => {
    const target = windowTargetFrom('?window=reference&referenceId=ref%2F001%20a');
    expect(target).toEqual({ kind: 'reference', referenceId: 'ref/001 a' });
  });
});
