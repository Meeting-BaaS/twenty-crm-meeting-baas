import styled from '@emotion/styled';
import { useEffect, useState } from 'react';
import { defineFrontComponent } from 'twenty-sdk/define';
import { APPLICATION_UNIVERSAL_IDENTIFIER } from '../constants/universal-identifiers';
import {
  DEFAULT_WORKSPACE_RECORDING_PREFERENCE,
  RECORDING_PREFERENCE_VARIABLE_KEY,
  type RecordingPreference,
  resolveEffectiveRecordingPreference,
} from '../recording-preferences';
import {
  selectWorkspaceBaseUrl,
  WORKSPACE_WEBHOOK_BASE_URL_VARIABLE_KEY,
} from '../workspace-webhook-url';
import { STORE_RECORDINGS_LOCALLY_VARIABLE_KEY } from '../application-config';

type PreferenceSelection = RecordingPreference | 'WORKSPACE_DEFAULT';

type WorkspaceMember = {
  id: string;
  recordingPreference?: RecordingPreference | null;
};

type CalendarChannel = {
  id: string;
};

type BatchScheduleEvent = {
  id: string;
  conferenceUrl: string;
  startsAt?: string;
  title?: string;
};

const getApiUrl = () => process.env.TWENTY_API_URL ?? '';
const getToken = () => process.env.TWENTY_APP_ACCESS_TOKEN ?? '';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
`;

const StyledSectionTitle = styled.h3`
  color: var(--t-font-color-primary);
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px 0;
`;

const StyledSectionSubtitle = styled.p`
  color: var(--t-font-color-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 400;
  margin: 0 0 12px 0;
`;

const StyledCard = styled.div`
  align-items: center;
  background: var(--t-background-primary);
  border: 1px solid var(--t-border-color-medium);
  border-radius: var(--t-border-radius-md);
  display: flex;
  gap: 12px;
  padding: 16px;
`;

const StyledIconContainer = styled.div`
  align-items: center;
  background: var(--t-background-secondary);
  border-radius: var(--t-border-radius-md);
  color: var(--t-font-color-tertiary);
  display: flex;
  flex-shrink: 0;
  height: 40px;
  justify-content: center;
  width: 40px;
`;

const StyledTextContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const StyledTitle = styled.span`
  color: var(--t-font-color-primary);
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
`;

const StyledDescription = styled.span`
  color: var(--t-font-color-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
`;

const StyledStatusBadge = styled.span<{ connected: boolean }>`
  align-items: center;
  background: ${({ connected }) =>
    connected
      ? 'var(--t-snack-bar-success-background-color)'
      : 'var(--t-snack-bar-error-background-color)'};
  border-radius: var(--t-border-radius-xs);
  color: ${({ connected }) =>
    connected
      ? 'var(--t-snack-bar-success-color)'
      : 'var(--t-snack-bar-error-color)'};
  display: inline-flex;
  flex-shrink: 0;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  height: 32px;
  padding: 0 12px;
  white-space: nowrap;
`;

const StyledRadioGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const StyledRadioLabel = styled.label<{ selected: boolean }>`
  align-items: center;
  background: ${({ selected }) =>
    selected ? 'var(--t-accent-quaternary)' : 'var(--t-background-primary)'};
  border: 1px solid ${({ selected }) =>
    selected ? 'var(--t-accent-primary)' : 'var(--t-border-color-medium)'};
  border-radius: var(--t-border-radius-md);
  cursor: pointer;
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--t-accent-primary);
  }
`;

const StyledRadioInput = styled.input`
  accent-color: var(--t-accent-primary);
  cursor: pointer;
  height: 16px;
  margin: 0;
  width: 16px;
`;

const StyledRadioTextContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const StyledRadioTitle = styled.span`
  color: var(--t-font-color-primary);
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
`;

const StyledRadioDescription = styled.span`
  color: var(--t-font-color-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
`;

const StyledBanner = styled.div<{ variant: 'info' | 'warning' }>`
  align-items: center;
  background: ${({ variant }) =>
    variant === 'warning'
      ? 'var(--t-snack-bar-warning-background-color)'
      : 'var(--t-snack-bar-info-background-color)'};
  border: 1px solid ${({ variant }) =>
    variant === 'warning'
      ? 'var(--t-snack-bar-warning-color)'
      : 'var(--t-snack-bar-info-color)'};
  border-radius: var(--t-border-radius-md);
  color: ${({ variant }) =>
    variant === 'warning'
      ? 'var(--t-snack-bar-warning-color)'
      : 'var(--t-snack-bar-info-color)'};
  display: flex;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  gap: 8px;
  padding: 12px 16px;
`;

const StyledButton = styled.button<{ variant?: 'primary' | 'secondary' }>`
  align-items: center;
  background: ${({ variant }) =>
    variant === 'secondary'
      ? 'var(--t-background-primary)'
      : 'var(--t-accent-primary)'};
  border: 1px solid ${({ variant }) =>
    variant === 'secondary'
      ? 'var(--t-border-color-medium)'
      : 'var(--t-accent-primary)'};
  border-radius: var(--t-border-radius-md);
  color: ${({ variant }) =>
    variant === 'secondary'
      ? 'var(--t-font-color-primary)'
      : 'var(--t-font-color-inverted)'};
  cursor: pointer;
  display: inline-flex;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  gap: 8px;
  height: 40px;
  justify-content: center;
  padding: 0 20px;
  transition: all 0.15s ease;
  white-space: nowrap;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const StyledResultBanner = styled.div<{ variant: 'success' | 'error' }>`
  align-items: center;
  background: ${({ variant }) =>
    variant === 'success'
      ? 'var(--t-snack-bar-success-background-color)'
      : 'var(--t-snack-bar-error-background-color)'};
  border: 1px solid ${({ variant }) =>
    variant === 'success'
      ? 'var(--t-snack-bar-success-color)'
      : 'var(--t-snack-bar-error-color)'};
  border-radius: var(--t-border-radius-md);
  color: ${({ variant }) =>
    variant === 'success'
      ? 'var(--t-snack-bar-success-color)'
      : 'var(--t-snack-bar-error-color)'};
  display: flex;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  gap: 8px;
  padding: 12px 16px;
`;

type BatchScheduleResult = {
  scheduled: number;
  skipped: number;
  errors: string[];
  hasMore: boolean;
};

type BackfillResult = {
  processed: number;
  refreshed: number;
  stored: number;
  skipped: number;
  errors: string[];
};

const PREFERENCE_OPTIONS: Array<{
  value: PreferenceSelection;
  title: string;
  description: string;
}> = [
  {
    value: 'WORKSPACE_DEFAULT',
    title: 'Use workspace default',
    description: 'Follow the admin-configured default for this workspace',
  },
  {
    value: 'RECORD_ALL',
    title: 'Record all meetings',
    description: 'Automatically record every meeting with a conference link',
  },
  {
    value: 'RECORD_ORGANIZED',
    title: 'Record my meetings',
    description: 'Only record meetings you organized',
  },
  {
    value: 'RECORD_NONE',
    title: 'Do not record',
    description: 'No automatic recording — you can still record manually',
  },
];

const fetchCurrentWorkspaceMember = async (): Promise<WorkspaceMember> => {
  // Use metadata GraphQL to get the current user's workspace member
  const response = await fetch(`${getApiUrl()}/metadata`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `{ currentUser { id workspaceMember { id } } }`,
    }),
  });
  const data = await response.json();
  const memberId = data?.data?.currentUser?.workspaceMember?.id;
  if (!memberId) throw new Error('Could not find workspace member');

  // Fetch the full workspace member with recordingPreference via REST
  const memberResponse = await fetch(
    `${getApiUrl()}/rest/workspaceMembers/${memberId}`,
    { headers: { Authorization: `Bearer ${getToken()}` } },
  );
  const memberData = await memberResponse.json();
  const member = memberData?.data?.workspaceMember ?? memberData?.data;
  return { id: memberId, recordingPreference: member?.recordingPreference };
};

const fetchWorkspaceAppSettings = async (): Promise<{
  apiKeyConfigured: boolean;
  workspacePreference: RecordingPreference;
  webhookBaseUrl: string | null;
  webhookBaseUrlVariableId: string | null;
  storeLocally: boolean;
  storeLocallyVariableId: string | null;
}> => {
  const response = await fetch(`${getApiUrl()}/metadata`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `{ findOneApplication(universalIdentifier: "${APPLICATION_UNIVERSAL_IDENTIFIER}") { applicationVariables { id key value isSecret } } }`,
    }),
  });
  const data = await response.json();
  const vars = data?.data?.findOneApplication?.applicationVariables ?? [];
  const apiKeyVar = vars.find(
    (v: { key: string }) => v.key === 'MEETING_BAAS_API_KEY',
  );
  const workspacePreferenceVar = vars.find(
    (v: { key: string }) => v.key === RECORDING_PREFERENCE_VARIABLE_KEY,
  );
  const webhookBaseUrlVar = vars.find(
    (v: { key: string }) => v.key === WORKSPACE_WEBHOOK_BASE_URL_VARIABLE_KEY,
  );
  const storeLocallyVar = vars.find(
    (v: { key: string }) => v.key === STORE_RECORDINGS_LOCALLY_VARIABLE_KEY,
  );

  // Secret variables are partially masked (e.g. "mb-rr********") when set;
  // empty or unset secrets return "" or null.
  const apiKeySet = !!apiKeyVar?.value && apiKeyVar.value.length > 0;

  return {
    apiKeyConfigured: apiKeySet,
    workspacePreference: resolveEffectiveRecordingPreference(
      null,
      workspacePreferenceVar?.value,
    ),
    webhookBaseUrl: webhookBaseUrlVar?.value ?? null,
    webhookBaseUrlVariableId: webhookBaseUrlVar?.id ?? null,
    storeLocally: storeLocallyVar?.value !== 'false',
    storeLocallyVariableId: storeLocallyVar?.id ?? null,
  };
};

const fetchCurrentWorkspaceBaseUrl = async (): Promise<string | null> => {
  const response = await fetch(`${getApiUrl()}/metadata`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query:
        '{ currentUser { currentWorkspace { workspaceUrls { customUrl subdomainUrl } } } }',
    }),
  });
  const data = await response.json();
  const workspaceUrls = data?.data?.currentUser?.currentWorkspace?.workspaceUrls;

  return selectWorkspaceBaseUrl(
    workspaceUrls?.customUrl,
    workspaceUrls?.subdomainUrl,
  );
};

const updateApplicationVariable = async (
  variableId: string,
  value: string,
): Promise<void> => {
  const response = await fetch(`${getApiUrl()}/metadata`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        mutation UpdateApplicationRegistrationVariable($input: UpdateApplicationRegistrationVariableInput!) {
          updateApplicationRegistrationVariable(input: $input) {
            id
          }
        }
      `,
      variables: {
        input: {
          id: variableId,
          update: { value },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update workspace webhook URL: ${response.status}`);
  }

  const data = await response.json();
  if (data?.errors?.length) {
    throw new Error(data.errors[0]?.message ?? 'Failed to update workspace webhook URL');
  }
};

const updateWorkspaceMember = async (
  memberId: string,
  recordingPreference: RecordingPreference | null,
): Promise<void> => {
  const response = await fetch(`${getApiUrl()}/rest/workspaceMembers/${memberId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recordingPreference }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update preference: ${response.status}`);
  }
};

const fetchUserCalendarChannels = async (_memberId: string): Promise<CalendarChannel[]> => {
  // Use the metadata GraphQL endpoint with the app access token (user-scoped)
  const response = await fetch(`${getApiUrl()}/metadata`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `{ myCalendarChannels { id } }`,
    }),
  });
  const data = await response.json();
  return data?.data?.myCalendarChannels ?? [];
};

const fetchFutureCalendarEventsForCurrentUser = async (): Promise<{
  events: BatchScheduleEvent[];
  hasMore: boolean;
}> => {
  const now = new Date().toISOString();
  const pageSize = 200;
  const response = await fetch(
    `${getApiUrl()}/rest/calendarEvents?filter=${encodeURIComponent(`startsAt[gte]:"${now}"`)}&limit=${pageSize}`,
    {
      credentials: 'include',
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch calendar events: ${response.status}`);
  }

  const data = await response.json();
  const page: Record<string, unknown>[] = data?.data?.calendarEvents ?? [];
  const events = page
    .map((entry) => {
      const conferenceLink = entry.conferenceLink as
        | { primaryLinkUrl?: string }
        | undefined;
      const conferenceUrl = conferenceLink?.primaryLinkUrl;
      if (!conferenceUrl) return null;

      return {
        id: entry.id as string,
        conferenceUrl,
        startsAt: entry.startsAt as string | undefined,
        title: entry.title as string | undefined,
      } satisfies BatchScheduleEvent;
    })
    .filter((entry): entry is BatchScheduleEvent => entry !== null);

  return {
    events,
    hasMore: page.length >= pageSize,
  };
};

const MeetingBaasSettings = () => {
  const [member, setMember] = useState<WorkspaceMember | null>(null);
  const [preference, setPreference] =
    useState<PreferenceSelection>('WORKSPACE_DEFAULT');
  const [workspacePreference, setWorkspacePreference] = useState<RecordingPreference>(
    DEFAULT_WORKSPACE_RECORDING_PREFERENCE,
  );
  const [workspaceWebhookBaseUrl, setWorkspaceWebhookBaseUrl] = useState<string | null>(null);
  const [hasCalendar, setHasCalendar] = useState<boolean | null>(null);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isBatchScheduling, setIsBatchScheduling] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchScheduleResult | null>(null);
  const [storeLocally, setStoreLocally] = useState(true);
  const [storeLocallyVariableId, setStoreLocallyVariableId] = useState<string | null>(null);
  const [isTogglingStorage, setIsTogglingStorage] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);

  useEffect(() => {
    Promise.all([
      fetchCurrentWorkspaceMember(),
      fetchWorkspaceAppSettings(),
      fetchCurrentWorkspaceBaseUrl(),
    ])
      .then(async ([memberData, appSettings, currentWorkspaceBaseUrl]) => {
        setMember(memberData);
        setPreference(memberData.recordingPreference ?? 'WORKSPACE_DEFAULT');
        setWorkspacePreference(appSettings.workspacePreference);
        setApiKeyConfigured(appSettings.apiKeyConfigured);
        setStoreLocally(appSettings.storeLocally);
        setStoreLocallyVariableId(appSettings.storeLocallyVariableId);
        setWorkspaceWebhookBaseUrl(
          selectWorkspaceBaseUrl(appSettings.webhookBaseUrl, null),
        );

        if (
          appSettings.webhookBaseUrlVariableId &&
          currentWorkspaceBaseUrl &&
          appSettings.webhookBaseUrl !== currentWorkspaceBaseUrl
        ) {
          try {
            await updateApplicationVariable(
              appSettings.webhookBaseUrlVariableId,
              currentWorkspaceBaseUrl,
            );
            setWorkspaceWebhookBaseUrl(currentWorkspaceBaseUrl);
          } catch {
            // Non-fatal: keep rendering with current value
          }
        }

        const channels = await fetchUserCalendarChannels(memberData.id);
        setHasCalendar(channels.length > 0);
      })
      .catch(() => {
        // Non-fatal: show defaults
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handlePreferenceChange = async (newPreference: PreferenceSelection) => {
    if (!member || isSaving) return;
    setIsSaving(true);
    setPreference(newPreference);
    try {
      const recordingPreference =
        newPreference === 'WORKSPACE_DEFAULT' ? null : newPreference;
      await updateWorkspaceMember(member.id, recordingPreference);
      setMember({ ...member, recordingPreference });
    } catch {
      setPreference(member.recordingPreference ?? 'WORKSPACE_DEFAULT');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBatchSchedule = async () => {
    if (isBatchScheduling) return;
    setIsBatchScheduling(true);
    setBatchResult(null);
    try {
      const { events, hasMore } = await fetchFutureCalendarEventsForCurrentUser();
      const response = await fetch(`${getApiUrl()}/s/batch-schedule-bots`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ events, hasMore }),
      });
      const data = await response.json();
      setBatchResult({
        scheduled: data.scheduled ?? 0,
        skipped: data.skipped ?? 0,
        errors: data.errors ?? [],
        hasMore: data.hasMore ?? false,
      });
    } catch {
      setBatchResult({ scheduled: 0, skipped: 0, errors: ['Request failed'], hasMore: false });
    } finally {
      setIsBatchScheduling(false);
    }
  };

  const handleToggleStorage = async () => {
    if (!storeLocallyVariableId || isTogglingStorage) return;
    setIsTogglingStorage(true);
    const newValue = !storeLocally;
    setStoreLocally(newValue);
    try {
      await updateApplicationVariable(storeLocallyVariableId, String(newValue));
    } catch {
      setStoreLocally(!newValue);
    } finally {
      setIsTogglingStorage(false);
    }
  };

  const handleBackfill = async () => {
    if (isBackfilling) return;
    setIsBackfilling(true);
    setBackfillResult(null);
    try {
      const response = await fetch(`${getApiUrl()}/s/backfill-recording-files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      setBackfillResult({
        processed: data.processed ?? 0,
        refreshed: data.refreshed ?? 0,
        stored: data.stored ?? 0,
        skipped: data.skipped ?? 0,
        errors: data.errors ?? [],
      });
    } catch {
      setBackfillResult({ processed: 0, refreshed: 0, stored: 0, skipped: 0, errors: ['Request failed'] });
    } finally {
      setIsBackfilling(false);
    }
  };

  const effectivePreference = resolveEffectiveRecordingPreference(
    member?.recordingPreference ?? null,
    workspacePreference,
  );
  const showBatchButton =
    effectivePreference !== 'RECORD_NONE' && apiKeyConfigured && hasCalendar;

  if (isLoading) {
    return (
      <StyledContainer>
        <StyledSectionTitle>Meeting Recording</StyledSectionTitle>
        <StyledSectionSubtitle>Loading settings...</StyledSectionSubtitle>
      </StyledContainer>
    );
  }

  return (
    <StyledContainer>
      {/* API Key Status */}
      <div>
        <StyledSectionTitle>Meeting BaaS Connection</StyledSectionTitle>
        <StyledSectionSubtitle>
          Meeting BaaS records your meetings and syncs transcripts into Twenty
        </StyledSectionSubtitle>
        <StyledCard>
          <StyledIconContainer>
            <span style={{ fontSize: 20 }}>V</span>
          </StyledIconContainer>
          <StyledTextContainer>
            <StyledTitle>API Key</StyledTitle>
            <StyledDescription>
              {apiKeyConfigured
                ? 'Your Meeting BaaS API key is configured'
                : 'No API key configured — set MEETING_BAAS_API_KEY in the Variables tab'}
            </StyledDescription>
          </StyledTextContainer>
          <StyledStatusBadge connected={apiKeyConfigured}>
            {apiKeyConfigured ? 'Connected' : 'Not Set'}
          </StyledStatusBadge>
        </StyledCard>
      </div>

      {workspaceWebhookBaseUrl && (
        <StyledBanner variant="info">
          Recording webhooks will be sent to {workspaceWebhookBaseUrl}/s/webhook/meeting-baas
        </StyledBanner>
      )}

      {/* Calendar Connection Banner */}
      {hasCalendar === false && (
        <StyledBanner variant="warning">
          No calendar connected. Connect your Google or Microsoft calendar in Settings &gt; Accounts
          to enable automatic meeting recording.
        </StyledBanner>
      )}

      {/* Recording Preference */}
      <div>
        <StyledSectionTitle>Recording Preference</StyledSectionTitle>
        <StyledSectionSubtitle>
          Admins set the workspace default in Variables. Your setting can override it when needed.
        </StyledSectionSubtitle>
        <StyledRadioGroup>
          {PREFERENCE_OPTIONS.map((option) => (
            <StyledRadioLabel key={option.value} selected={preference === option.value}>
              <StyledRadioInput
                type="radio"
                name="recordingPreference"
                value={option.value}
                checked={preference === option.value}
                onChange={() => handlePreferenceChange(option.value)}
                disabled={isSaving}
              />
              <StyledRadioTextContainer>
                <StyledRadioTitle>{option.title}</StyledRadioTitle>
                <StyledRadioDescription>{option.description}</StyledRadioDescription>
              </StyledRadioTextContainer>
            </StyledRadioLabel>
          ))}
        </StyledRadioGroup>
      </div>

      <StyledBanner variant="info">
        Effective recording mode:{' '}
        {effectivePreference === 'RECORD_ALL'
          ? 'Record all meetings'
          : effectivePreference === 'RECORD_ORGANIZED'
            ? 'Organizer only'
            : 'Do not record'}
        {preference === 'WORKSPACE_DEFAULT' && ' (from workspace default)'}
      </StyledBanner>

      {preference === 'WORKSPACE_DEFAULT' && (
        <StyledBanner variant="info">
          Workspace default:{' '}
          {workspacePreference === 'RECORD_ALL'
            ? 'Record all meetings'
            : workspacePreference === 'RECORD_ORGANIZED'
              ? 'Organizer only'
              : 'Do not record'}
        </StyledBanner>
      )}

      {effectivePreference !== 'RECORD_NONE' && !apiKeyConfigured && (
        <StyledBanner variant="info">
          Recording is enabled but no API key is set. Set MEETING_BAAS_API_KEY in the Variables tab
          to start recording.
        </StyledBanner>
      )}

      {/* Storage Settings */}
      {apiKeyConfigured && (
        <div>
          <StyledSectionTitle>Storage</StyledSectionTitle>
          <StyledSectionSubtitle>
            Control how recording video files are stored
          </StyledSectionSubtitle>
          <StyledCard>
            <StyledTextContainer>
              <StyledTitle>Store recordings in Twenty</StyledTitle>
              <StyledDescription>
                Download and store video files locally. When disabled, recordings link directly to
                Meeting BaaS (URLs refresh automatically).
              </StyledDescription>
            </StyledTextContainer>
            <StyledRadioInput
              type="checkbox"
              checked={storeLocally}
              onChange={handleToggleStorage}
              disabled={isTogglingStorage}
              style={{ width: 20, height: 20 }}
            />
          </StyledCard>

          <div style={{ marginTop: 12 }}>
            <StyledButton
              onClick={handleBackfill}
              disabled={isBackfilling}
              variant="secondary"
            >
              {isBackfilling ? 'Processing...' : 'Refresh recording URLs'}
            </StyledButton>
            <StyledDescription style={{ display: 'block', marginTop: 8 }}>
              {storeLocally
                ? 'Refreshes expired URLs and downloads video files for recordings that are not yet stored locally.'
                : 'Refreshes expired presigned URLs for all recordings without stored files.'}
            </StyledDescription>
          </div>

          {backfillResult && (backfillResult.errors?.length ?? 0) === 0 && (
            <StyledResultBanner variant="success" style={{ marginTop: 12 }}>
              {backfillResult.refreshed > 0 || backfillResult.stored > 0
                ? `Refreshed ${backfillResult.refreshed} URL${backfillResult.refreshed !== 1 ? 's' : ''}${backfillResult.stored > 0 ? `, stored ${backfillResult.stored} file${backfillResult.stored !== 1 ? 's' : ''}` : ''} (${backfillResult.skipped} skipped)`
                : 'No recordings to process'}
            </StyledResultBanner>
          )}

          {backfillResult && (backfillResult.errors?.length ?? 0) > 0 && (
            <StyledResultBanner variant="error" style={{ marginTop: 12 }}>
              {backfillResult.refreshed > 0
                ? `Refreshed ${backfillResult.refreshed}, but ${backfillResult.errors.length} error${backfillResult.errors.length !== 1 ? 's' : ''} occurred`
                : `Failed: ${backfillResult.errors[0]}`}
            </StyledResultBanner>
          )}
        </div>
      )}

      {/* Batch Schedule Existing Meetings */}
      {showBatchButton && (
        <div>
          <StyledSectionTitle>Existing Meetings</StyledSectionTitle>
          <StyledSectionSubtitle>
            Schedule bots for future calendar events that were synced before recording was enabled
          </StyledSectionSubtitle>
          <StyledButton
            onClick={handleBatchSchedule}
            disabled={isBatchScheduling}
            variant="secondary"
          >
            {isBatchScheduling ? 'Scheduling...' : 'Schedule existing meetings'}
          </StyledButton>

          {batchResult && (batchResult.errors?.length ?? 0) === 0 && (
            <StyledResultBanner variant="success" style={{ marginTop: 12 }}>
              {batchResult.scheduled > 0
                ? `Scheduled bots for ${batchResult.scheduled} meeting${batchResult.scheduled !== 1 ? 's' : ''} (${batchResult.skipped} skipped)`
                : 'No new meetings to schedule'}
              {batchResult.hasMore && ' — click again to process more'}
            </StyledResultBanner>
          )}

          {batchResult && (batchResult.errors?.length ?? 0) > 0 && (
            <StyledResultBanner variant="error" style={{ marginTop: 12 }}>
              {batchResult.scheduled > 0
                ? `Scheduled ${batchResult.scheduled}, but ${batchResult.errors.length} error${batchResult.errors.length !== 1 ? 's' : ''} occurred`
                : `Failed: ${batchResult.errors[0]}`}
            </StyledResultBanner>
          )}
        </div>
      )}
    </StyledContainer>
  );
};

export const SETTINGS_FRONT_COMPONENT_ID = '4ea804f4-6c22-457b-b8a2-66673bb6fc76';

export default defineFrontComponent({
  universalIdentifier: SETTINGS_FRONT_COMPONENT_ID,
  name: 'meeting-baas-settings',
  description: 'Settings panel for Meeting BaaS recording preferences and connection status',
  component: MeetingBaasSettings,
});
