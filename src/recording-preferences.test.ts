import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKSPACE_RECORDING_PREFERENCE,
  parseRecordingPreference,
  resolveEffectiveRecordingPreference,
} from './recording-preferences';

describe('parseRecordingPreference', () => {
  it('accepts supported values', () => {
    expect(parseRecordingPreference('RECORD_ALL')).toBe('RECORD_ALL');
    expect(parseRecordingPreference('RECORD_ORGANIZED')).toBe(
      'RECORD_ORGANIZED',
    );
    expect(parseRecordingPreference('RECORD_NONE')).toBe('RECORD_NONE');
  });

  it('rejects unsupported values', () => {
    expect(parseRecordingPreference(undefined)).toBeNull();
    expect(parseRecordingPreference('WORKSPACE_DEFAULT')).toBeNull();
    expect(parseRecordingPreference('')).toBeNull();
  });
});

describe('resolveEffectiveRecordingPreference', () => {
  it('prefers the member override', () => {
    expect(
      resolveEffectiveRecordingPreference('RECORD_NONE', 'RECORD_ALL'),
    ).toBe('RECORD_NONE');
  });

  it('falls back to the workspace default', () => {
    expect(resolveEffectiveRecordingPreference(null, 'RECORD_ORGANIZED')).toBe(
      'RECORD_ORGANIZED',
    );
  });

  it('uses the app default when nothing is configured', () => {
    expect(resolveEffectiveRecordingPreference(null, null)).toBe(
      DEFAULT_WORKSPACE_RECORDING_PREFERENCE,
    );
  });
});
