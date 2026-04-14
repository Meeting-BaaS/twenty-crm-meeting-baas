import axios from 'axios';
import type {
  CalendarEventOwnership,
  MeetingPlatform,
  RecordingUpsertInput,
  SyncResult,
} from './types';
import { buildRestUrl, getRestApiUrl, restHeaders } from './utils';

const TWENTY_API_KEY: string = process.env.TWENTY_API_KEY ?? '';

const authHeaders = () => ({ Authorization: `Bearer ${TWENTY_API_KEY}` });

// --- REST API response types ---

type TwentyListResponse<T extends string> = {
  data?: Record<T, Record<string, unknown>[]>;
};

type TwentyDetailResponse = {
  data?: Record<string, unknown>;
  id?: string;
};

// --- Platform Detection ---

export const detectPlatform = (meetingUrl: string): MeetingPlatform => {
  if (!meetingUrl) return 'UNKNOWN';
  const url = meetingUrl.toLowerCase();
  if (url.includes('meet.google.com')) return 'GOOGLE_MEET';
  if (url.includes('zoom.us') || url.includes('zoom.com')) return 'ZOOM';
  if (url.includes('teams.microsoft.com') || url.includes('teams.live.com'))
    return 'MICROSOFT_TEAMS';
  return 'UNKNOWN';
};

// --- Calendar event ownership resolution ---
// Walk CalendarEvent -> CalendarChannelEventAssociation -> CalendarChannel -> ConnectedAccount -> WorkspaceMember

const ownershipCache = new Map<string, CalendarEventOwnership>();

export const resolveCalendarEventOwner = async (
  calendarEventId: string,
): Promise<CalendarEventOwnership> => {
  const cached = ownershipCache.get(calendarEventId);
  if (cached) return cached;

  const result: CalendarEventOwnership = {};

  try {
    // 1. CalendarEvent -> CalendarChannelEventAssociation -> calendarChannelId
    const assocUrl = buildRestUrl('calendarChannelEventAssociations', {
      filter: { calendarEventId: { eq: calendarEventId } },
      limit: 1,
    });
    const assocResponse = await axios.get<TwentyListResponse<'calendarChannelEventAssociations'>>(
      assocUrl,
      { headers: authHeaders() },
    );

    const associations = assocResponse.data?.data?.calendarChannelEventAssociations ?? [];
    if (associations.length === 0) {
      ownershipCache.set(calendarEventId, result);
      return result;
    }

    const calendarChannelId = associations[0].calendarChannelId as string | undefined;
    if (!calendarChannelId) {
      ownershipCache.set(calendarEventId, result);
      return result;
    }

    // 2. CalendarChannel -> connectedAccountId
    const channelResponse = await axios.get<TwentyDetailResponse>(
      `${getRestApiUrl()}/calendarChannels/${calendarChannelId}`,
      { headers: authHeaders() },
    );

    const channelData = channelResponse.data?.data ?? channelResponse.data;
    const connectedAccountId = (channelData as Record<string, unknown>)?.connectedAccountId as string | undefined;
    if (!connectedAccountId) {
      ownershipCache.set(calendarEventId, result);
      return result;
    }

    // 3. ConnectedAccount -> accountOwnerId (= workspaceMemberId)
    const accountResponse = await axios.get<TwentyDetailResponse>(
      `${getRestApiUrl()}/connectedAccounts/${connectedAccountId}`,
      { headers: authHeaders() },
    );

    const accountData = accountResponse.data?.data ?? accountResponse.data;
    const workspaceMemberId = (accountData as Record<string, unknown>)?.accountOwnerId as string | undefined;
    if (!workspaceMemberId) {
      ownershipCache.set(calendarEventId, result);
      return result;
    }
    result.workspaceMemberId = workspaceMemberId;

    // 4. WorkspaceMember -> display name
    try {
      const memberResponse = await axios.get<TwentyDetailResponse>(
        `${getRestApiUrl()}/workspaceMembers/${workspaceMemberId}`,
        { headers: authHeaders() },
      );

      const memberData = memberResponse.data?.data ?? memberResponse.data;
      const name = (memberData as Record<string, unknown>)?.name as { firstName?: string; lastName?: string } | undefined;
      const fullName = [name?.firstName, name?.lastName].filter(Boolean).join(' ');
      if (fullName) result.workspaceMemberName = fullName;
    } catch {
      // Non-fatal: we still have the workspaceMemberId
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`Ownership resolution failed for calendarEvent ${calendarEventId}: ${msg}`);
  }

  ownershipCache.set(calendarEventId, result);
  return result;
};

// --- Recording CRUD ---

export const checkIfRecordingExistsForEvent = async (
  calendarEventId: string,
): Promise<boolean> => {
  try {
    const url = buildRestUrl('recordings', {
      filter: { calendarEventId: { eq: calendarEventId } },
      limit: 1,
    });
    const response = await axios.get<TwentyListResponse<'recordings'>>(url, {
      headers: authHeaders(),
    });
    const recordings = response.data?.data?.recordings ?? [];
    return recordings.length > 0;
  } catch {
    return false;
  }
};

export const checkIfRecordingExists = async (
  botId: string,
): Promise<string | null> => {
  try {
    const url = buildRestUrl('recordings', {
      filter: { botId: { eq: botId } },
    });
    const response = await axios.get<TwentyListResponse<'recordings'>>(url, {
      headers: authHeaders(),
    });
    const recording = response.data?.data?.recordings?.[0];
    return (recording?.id as string) ?? null;
  } catch {
    return null;
  }
};

export const upsertRecording = async (
  opts: RecordingUpsertInput,
): Promise<string | null> => {
  const existingId = await checkIfRecordingExists(opts.botId);

  const data: Record<string, unknown> = {
    name: opts.name,
    botId: opts.botId,
    date: opts.date,
    duration: opts.duration,
    platform: opts.platform,
    status: opts.status,
    transcript: opts.transcript,
  };
  if (opts.summary) data.summary = opts.summary;
  if (opts.meetingUrl) data.meetingUrl = opts.meetingUrl;
  if (opts.mp4Url) data.mp4Url = opts.mp4Url;
  if (opts.calendarEventId) data.calendarEventId = opts.calendarEventId;
  if (opts.workspaceMemberId) data.workspaceMemberId = opts.workspaceMemberId;

  if (existingId) {
    await axios({
      method: 'PATCH',
      headers: restHeaders(),
      url: `${getRestApiUrl()}/recordings/${existingId}`,
      data,
    });
    return existingId;
  }

  const response = await axios({
    method: 'POST',
    headers: restHeaders(),
    url: `${getRestApiUrl()}/recordings`,
    data,
  });
  const id = response.data?.data?.id ?? response.data?.id;
  return id ? (id as string) : null;
};

// --- Sync orchestration ---
// calendarEventId and workspaceMemberId come from the bot's `extra` field,
// set by schedule-bot.ts when creating the scheduled bot.

export const syncBotRecording = async (
  recordingData: {
    botId: string;
    title: string;
    date: string;
    duration: number;
    transcript: string;
    summary?: string;
    mp4Url: string;
    meetingUrl: string;
    platform: MeetingPlatform;
    calendarEventId?: string;
    workspaceMemberId?: string;
  },
  result: SyncResult,
): Promise<string | null> => {
  try {
    const durationMinutes = Math.round(recordingData.duration / 60);

    const recordingId = await upsertRecording({
      botId: recordingData.botId,
      name: recordingData.title,
      date: recordingData.date,
      duration: durationMinutes,
      platform: recordingData.platform,
      status: 'COMPLETED',
      meetingUrl: recordingData.meetingUrl
        ? { primaryLinkLabel: 'Join Meeting', primaryLinkUrl: recordingData.meetingUrl, secondaryLinks: null }
        : null,
      mp4Url: recordingData.mp4Url
        ? { primaryLinkLabel: 'Watch Recording', primaryLinkUrl: recordingData.mp4Url, secondaryLinks: null }
        : null,
      transcript: recordingData.transcript,
      summary: recordingData.summary,
      calendarEventId: recordingData.calendarEventId,
      workspaceMemberId: recordingData.workspaceMemberId,
    });

    if (recordingId) {
      result.recordingsCreated++;
    }
    result.recordingsProcessed++;

    return recordingId;
  } catch (error) {
    let errorMessage: string;
    if (axios.isAxiosError(error) && error.response) {
      errorMessage = `${error.response.status}: ${JSON.stringify(error.response.data)}`;
    } else {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    result.errors.push({ botId: recordingData.botId, error: errorMessage });
    console.error(`Error syncing recording ${recordingData.botId}: ${errorMessage}`);
    return null;
  }
};
