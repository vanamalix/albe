import { describe, expect, it } from 'vitest';
import { loadPreset } from './actions';
import { addMark, chirpReading, getMarks } from './scopeMarks';

describe('loading a scene', () => {
  it('clears the wave cursor’s marks, so the last scene’s chirp reading does not linger', () => {
    loadPreset('chirp');
    addMark(100, [100, 200, 300]);
    addMark(300, [100, 200, 300]);
    expect(getMarks().marks.length).toBe(2);
    expect(chirpReading().f1).toBeGreaterThan(0);
    loadPreset('single');
    expect(getMarks().marks).toEqual([]);
    expect(getMarks().halves).toEqual([]);
    expect(chirpReading().f1).toBeUndefined();
  });
});
