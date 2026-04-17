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
// Primary: CalendarEvent -> CalendarChannelEventAssociation -> CalendarChannel -> ConnectedAccount -> WorkspaceMember
// Channel-sibling: same calendarChannelId -> sibling event participants with resolved workspaceMemberId
//   (workaround for Twenty 1.21+ where calendarChannel/connectedAccount moved to core schema
//    and are no longer queryable via workspace REST API)
// Fallback: CalendarEventParticipant with workspaceMemberId on the event itself

const ownershipCache = new Map<string, CalendarEventOwnership>();
// calendarChannelId -> workspaceMemberId (survives across events in the same channel)
const channelOwnerCache = new Map<string, string>();

const getCalendarChannelId = async (
  calendarEventId: string,
): Promise<string | null> => {
  const assocUrl = buildRestUrl('calendarChannelEventAssociations', {
    filter: { calendarEventId: { eq: calendarEventId } },
    limit: 1,
  });
  const assocResponse = await axios.get<TwentyListResponse<'calendarChannelEventAssociations'>>(
    assocUrl,
    { headers: authHeaders() },
  );
  const associations = assocResponse.data?.data?.calendarChannelEventAssociations ?? [];
  return (associations[0]?.calendarChannelId as string) ?? null;
};

const resolveViaChannelChain = async (
  calendarChannelId: string,
): Promise<CalendarEventOwnership | null> => {
  // CalendarChannel -> connectedAccountId
  const channelResponse = await axios.get<TwentyDetailResponse>(
    `${getRestApiUrl()}/calendarChannels/${calendarChannelId}`,
    { headers: authHeaders() },
  );

  const channelBody = channelResponse.data?.data ?? channelResponse.data;
  const channelData = (channelBody as Record<string, unknown>)?.calendarChannel ?? channelBody;
  const connectedAccountId = (channelData as Record<string, unknown>)?.connectedAccountId as string | undefined;
  if (!connectedAccountId) return null;

  // ConnectedAccount -> accountOwnerId (= workspaceMemberId)
  const accountResponse = await axios.get<TwentyDetailResponse>(
    `${getRestApiUrl()}/connectedAccounts/${connectedAccountId}`,
    { headers: authHeaders() },
  );

  const accountBody = accountResponse.data?.data ?? accountResponse.data;
  const accountData = (accountBody as Record<string, unknown>)?.connectedAccount ?? accountBody;
  const workspaceMemberId = (accountData as Record<string, unknown>)?.accountOwnerId as string | undefined;
  if (!workspaceMemberId) return null;

  return { workspaceMemberId };
};

// Resolve owner by finding sibling events in the same calendar channel
// and identifying the workspace member who is the channel owner.
// All events in the same channel belong to the same connected account.
// Strategy: collect (workspaceMemberId, isOrganizer) pairs across sibling
// participants, then pick the member who appears as organizer most often.
// Ties broken by total appearance count (the channel owner is a participant
// in the most events since it's their calendar).
const resolveViaChannelSiblings = async (
  calendarChannelId: string,
): Promise<CalendarEventOwnership | null> => {
  const cached = channelOwnerCache.get(calendarChannelId);
  if (cached) return { workspaceMemberId: cached };

  const siblingsUrl = buildRestUrl('calendarChannelEventAssociations', {
    filter: { calendarChannelId: { eq: calendarChannelId } },
    limit: 50,
  });
  const siblingsResponse = await axios.get<TwentyListResponse<'calendarChannelEventAssociations'>>(
    siblingsUrl,
    { headers: authHeaders() },
  );
  const siblings = siblingsResponse.data?.data?.calendarChannelEventAssociations ?? [];

  // Tally: workspaceMemberId -> { organizer: count, total: count }
  const tally = new Map<string, { organizer: number; total: number }>();

  for (const sibling of siblings) {
    const siblingEventId = sibling.calendarEventId as string | undefined;
    if (!siblingEventId) continue;

    const participantsUrl = buildRestUrl('calendarEventParticipants', {
      filter: { calendarEventId: { eq: siblingEventId } },
      limit: 10,
    });
    const participantsResponse = await axios.get<TwentyListResponse<'calendarEventParticipants'>>(
      participantsUrl,
      { headers: authHeaders() },
    );
    const participants = participantsResponse.data?.data?.calendarEventParticipants ?? [];
    for (const p of participants) {
      const wmId = p.workspaceMemberId as string | undefined;
      if (!wmId) continue;
      const entry = tally.get(wmId) ?? { organizer: 0, total: 0 };
      entry.total++;
      if (p.isOrganizer === true) entry.organizer++;
      tally.set(wmId, entry);
    }
  }

  if (tally.size === 0) return null;

  // Pick the member with the most organizer appearances, then by total
  const best = [...tally.entries()].sort((a, b) => {
    const orgDiff = b[1].organizer - a[1].organizer;
    return orgDiff !== 0 ? orgDiff : b[1].total - a[1].total;
  })[0];

  channelOwnerCache.set(calendarChannelId, best[0]);
  return { workspaceMemberId: best[0] };
};

const resolveViaParticipants = async (
  calendarEventId: string,
): Promise<CalendarEventOwnership | null> => {
  const url = buildRestUrl('calendarEventParticipants', {
    filter: { calendarEventId: { eq: calendarEventId } },
    limit: 10,
  });
  const response = await axios.get<TwentyListResponse<'calendarEventParticipants'>>(
    url,
    { headers: authHeaders() },
  );
  const participants = response.data?.data?.calendarEventParticipants ?? [];
  for (const p of participants) {
    const wmId = p.workspaceMemberId as string | undefined;
    if (wmId) return { workspaceMemberId: wmId };
  }
  return null;
};

export const resolveCalendarEventOwner = async (
  calendarEventId: string,
): Promise<CalendarEventOwnership> => {
  const cached = ownershipCache.get(calendarEventId);
  if (cached) return cached;

  let result: CalendarEventOwnership = {};
  let calendarChannelId: string | null = null;

  // Step 1: get the calendarChannelId from the association
  try {
    calendarChannelId = await getCalendarChannelId(calendarEventId);
  } catch {
    // No association found
  }

  // Step 2: try primary chain via workspace calendarChannel -> connectedAccount
  if (calendarChannelId) {
    try {
      const primary = await resolveViaChannelChain(calendarChannelId);
      if (primary?.workspaceMemberId) result = primary;
    } catch {
      // Chain broken (404 — calendarChannel/connectedAccount moved to core in Twenty 1.21+)
    }
  }

  // Fallback 1: participant with workspaceMemberId on this event
  if (!result.workspaceMemberId) {
    try {
      const participant = await resolveViaParticipants(calendarEventId);
      if (participant?.workspaceMemberId) result = participant;
    } catch {
      // fall through
    }
  }

  // Fallback 2: resolve via sibling events in the same calendar channel.
  // All events in the same channel belong to the same connected account,
  // so if any sibling has a resolved participant, the owner is the same.
  if (!result.workspaceMemberId && calendarChannelId) {
    try {
      const sibling = await resolveViaChannelSiblings(calendarChannelId);
      if (sibling?.workspaceMemberId) result = sibling;
    } catch {
      // fall through
    }
  }

  // Resolve display name if we have a workspaceMemberId but no name
  if (result.workspaceMemberId && !result.workspaceMemberName) {
    try {
      const memberResponse = await axios.get<TwentyDetailResponse>(
        `${getRestApiUrl()}/workspaceMembers/${result.workspaceMemberId}`,
        { headers: authHeaders() },
      );
      const memberBody = memberResponse.data?.data ?? memberResponse.data;
      const memberData = (memberBody as Record<string, unknown>)?.workspaceMember ?? memberBody;
      const name = (memberData as Record<string, unknown>)?.name as { firstName?: string; lastName?: string } | undefined;
      const fullName = [name?.firstName, name?.lastName].filter(Boolean).join(' ');
      if (fullName) result.workspaceMemberName = fullName;
    } catch {
      // Non-fatal
    }
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
