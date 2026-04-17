export type RecordingPreference =
  | 'RECORD_ALL'
  | 'RECORD_ORGANIZED'
  | 'RECORD_NONE';

export const RECORDING_PREFERENCE_VARIABLE_KEY = 'RECORDING_PREFERENCE';
export const DEFAULT_WORKSPACE_RECORDING_PREFERENCE: RecordingPreference =
  'RECORD_ORGANIZED';

export const parseRecordingPreference = (
  value: unknown,
): RecordingPreference | null => {
  if (
    value === 'RECORD_ALL' ||
    value === 'RECORD_ORGANIZED' ||
    value === 'RECORD_NONE'
  ) {
    return value;
  }

  return null;
};

export const resolveEffectiveRecordingPreference = (
  memberPreference: RecordingPreference | null | undefined,
  workspacePreference: RecordingPreference | null | undefined,
): RecordingPreference =>
  parseRecordingPreference(memberPreference) ??
  parseRecordingPreference(workspacePreference) ??
  DEFAULT_WORKSPACE_RECORDING_PREFERENCE;
