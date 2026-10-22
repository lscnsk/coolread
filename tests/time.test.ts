import { describe, it, expect } from 'vitest';
import { formatTime } from '../utils/time';

describe('formatTime', () => {
  it('formats minutes and hours', () => {
    expect(formatTime(0)).toMatch(/^0?0:00$/);
    expect(formatTime(65)).toMatch(/1:05$/);
    expect(formatTime(3725)).toMatch(/1:02:05$/);
  });
});
