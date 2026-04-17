import styled from '@emotion/styled';
import { useEffect, useState } from 'react';
import { defineFrontComponent } from 'twenty-sdk';

type RecordingPreference = 'RECORD_ALL' | 'RECORD_ORGANIZED' | 'RECORD_NONE';

type WorkspaceMember = {
  id: string;
  recordingPreference?: RecordingPreference;
};

type CalendarChannel = {
  id: string;
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
  color: #333;
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px 0;
`;

const StyledSectionSubtitle = styled.p`
  color: #818181;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 400;
  margin: 0 0 12px 0;
`;

const StyledCard = styled.div`
  align-items: center;
  background: #fff;
  border: 1px solid #ebebeb;
  border-radius: 8px;
  display: flex;
  gap: 12px;
  padding: 16px;
`;

const StyledIconContainer = styled.div`
  align-items: center;
  background: #f5f5f5;
  border-radius: 8px;
  color: #666;
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
  color: #333;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
`;

const StyledDescription = styled.span`
  color: #818181;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
`;

const StyledStatusBadge = styled.span<{ connected: boolean }>`
  align-items: center;
  background: ${({ connected }) => (connected ? '#10b981' : '#ef4444')};
  border-radius: 4px;
  color: #fff;
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
  background: ${({ selected }) => (selected ? '#f0f0ff' : '#fff')};
  border: 1px solid ${({ selected }) => (selected ? '#5e5adb' : '#ebebeb')};
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  transition: all 0.15s ease;

  &:hover {
    border-color: #5e5adb;
  }
`;

const StyledRadioInput = styled.input`
  accent-color: #5e5adb;
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
  color: #333;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
`;

const StyledRadioDescription = styled.span`
  color: #818181;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
`;

const StyledBanner = styled.div<{ variant: 'info' | 'warning' }>`
  align-items: center;
  background: ${({ variant }) => (variant === 'warning' ? '#fef3c7' : '#eff6ff')};
  border: 1px solid ${({ variant }) => (variant === 'warning' ? '#f59e0b' : '#3b82f6')};
  border-radius: 8px;
  color: ${({ variant }) => (variant === 'warning' ? '#92400e' : '#1e40af')};
  display: flex;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  gap: 8px;
  padding: 12px 16px;
`;

const StyledButton = styled.button<{ variant?: 'primary' | 'secondary' }>`
  align-items: center;
  background: ${({ variant }) => (variant === 'secondary' ? '#fff' : '#5e5adb')};
  border: 1px solid ${({ variant }) => (variant === 'secondary' ? '#ebebeb' : '#5e5adb')};
  border-radius: 8px;
  color: ${({ variant }) => (variant === 'secondary' ? '#333' : '#fff')};
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
  background: ${({ variant }) => (variant === 'success' ? '#ecfdf5' : '#fef2f2')};
  border: 1px solid ${({ variant }) => (variant === 'success' ? '#10b981' : '#ef4444')};
  border-radius: 8px;
  color: ${({ variant }) => (variant === 'success' ? '#065f46' : '#991b1b')};
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

const PREFERENCE_OPTIONS: Array<{
  value: RecordingPreference;
  title: string;
  description: string;
}> = [
  {
    value: 'RECORD_ALL',
    title: 'Record all meetings',
    description: 'Automatically record every meeting with a conference link',
  },
  {
    value: 'RECORD_ORGANIZED',
    title: 'Organizer only',
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

const updateWorkspaceMember = async (
  memberId: string,
  recordingPreference: RecordingPreference,
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

const SECRET_VARIABLE_MASK = '********';

const checkApiKeyConfigured = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${getApiUrl()}/metadata`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `{ findManyApplications { name applicationVariables { key value isSecret } } }`,
      }),
    });
    const data = await response.json();
    const apps = data?.data?.findManyApplications ?? [];
    for (const app of apps) {
      const vars = app.applicationVariables ?? [];
      const apiKeyVar = vars.find(
        (v: { key: string }) => v.key === 'MEETING_BAAS_API_KEY',
      );
      if (apiKeyVar) {
        // An empty secret returns exactly '********', a real value returns
        // a prefix + mask (e.g. '5z********'). So !== mask means configured.
        return apiKeyVar.value !== SECRET_VARIABLE_MASK;
      }
    }
    return false;
  } catch {
    return false;
  }
};

const MeetingBaasSettings = () => {
  const [member, setMember] = useState<WorkspaceMember | null>(null);
  const [preference, setPreference] = useState<RecordingPreference>('RECORD_NONE');
  const [hasCalendar, setHasCalendar] = useState<boolean | null>(null);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isBatchScheduling, setIsBatchScheduling] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchScheduleResult | null>(null);

  useEffect(() => {
    Promise.all([
      fetchCurrentWorkspaceMember(),
      checkApiKeyConfigured(),
    ])
      .then(async ([memberData, hasApiKey]) => {
        setMember(memberData);
        setPreference(memberData.recordingPreference ?? 'RECORD_NONE');
        setApiKeyConfigured(hasApiKey);
        const channels = await fetchUserCalendarChannels(memberData.id);
        setHasCalendar(channels.length > 0);
      })
      .catch(() => {
        // Non-fatal: show defaults
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handlePreferenceChange = async (newPreference: RecordingPreference) => {
    if (!member || isSaving) return;
    setIsSaving(true);
    setPreference(newPreference);
    try {
      await updateWorkspaceMember(member.id, newPreference);
    } catch {
      setPreference(member.recordingPreference ?? 'RECORD_NONE');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBatchSchedule = async () => {
    if (isBatchScheduling) return;
    setIsBatchScheduling(true);
    setBatchResult(null);
    try {
      const response = await fetch(`${getApiUrl()}/s/batch-schedule-bots`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
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

  const showBatchButton = preference !== 'RECORD_NONE' && apiKeyConfigured && hasCalendar;

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
          Choose which meetings are automatically recorded when they have a conference link
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

      {preference !== 'RECORD_NONE' && !apiKeyConfigured && (
        <StyledBanner variant="info">
          Recording is enabled but no API key is set. Set MEETING_BAAS_API_KEY in the Variables tab
          to start recording.
        </StyledBanner>
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
