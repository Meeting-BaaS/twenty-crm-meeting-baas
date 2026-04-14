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
  const response = await fetch(`${getApiUrl()}/rest/currentWorkspaceMember`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const data = await response.json();
  return data?.data ?? data;
};

const updateWorkspaceMember = async (
  memberId: string,
  recordingPreference: RecordingPreference,
): Promise<void> => {
  await fetch(`${getApiUrl()}/rest/workspaceMembers/${memberId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recordingPreference }),
  });
};

const fetchCalendarChannels = async (): Promise<CalendarChannel[]> => {
  const response = await fetch(`${getApiUrl()}/rest/calendarChannels?limit=1`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const data = await response.json();
  return data?.data?.calendarChannels ?? [];
};

const checkApiKeyConfigured = async (): Promise<boolean> => {
  try {
    const response = await fetch(
      `${getApiUrl()}/rest/applicationVariables?filter=key[eq]:MEETING_BAAS_API_KEY&limit=1`,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );
    const data = await response.json();
    const variables = data?.data?.applicationVariables ?? [];
    return variables.length > 0 && variables[0].value !== '';
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

  useEffect(() => {
    Promise.all([
      fetchCurrentWorkspaceMember(),
      fetchCalendarChannels(),
      checkApiKeyConfigured(),
    ])
      .then(([memberData, channels, hasApiKey]) => {
        setMember(memberData);
        setPreference(memberData.recordingPreference ?? 'RECORD_NONE');
        setHasCalendar(channels.length > 0);
        setApiKeyConfigured(hasApiKey);
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
