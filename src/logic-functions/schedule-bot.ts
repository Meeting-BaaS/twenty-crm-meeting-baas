import axios from 'axios';
import { MeetingBaasApiClient } from '../meeting-baas-api-client';
import { checkIfRecordingExistsForEvent, upsertRecording } from '../twenty-sync-service';
import { detectPlatform } from '../twenty-sync-service';
import { createLogger } from '../logger';
import {
  type RecordingPreference,
  resolveEffectiveRecordingPreference,
} from '../recording-preferences';
import { buildRestUrl, restHeaders } from '../utils';
import { getMeetingBaasCallbackUrl } from '../workspace-webhook-url';

const logger = createLogger('schedule-bot');

type BotSettings = {
  preferenceOverride: RecordingPreference | null;
  botName: string;
  botEntryMessage: string;
  isAvailable: boolean;
};

type ParticipantInfo = {
  workspaceMemberId: string;
  isOrganizer: boolean;
};

const fetchWorkspaceMemberBotSettings = async (
  workspaceMemberId: string,
): Promise<BotSettings> => {
  try {
    const response = await axios({
      method: 'GET',
      headers: restHeaders(),
      url: buildRestUrl(`workspaceMembers/${workspaceMemberId}`),
    });
    const body = response.data?.data ?? response.data;
    const memberData = body?.workspaceMember ?? body;
    return {
      preferenceOverride:
        (memberData?.recordingPreference as RecordingPreference | null) ?? null,
      botName: (memberData?.botName as string) || 'Twenty CRM Recorder',
      botEntryMessage: (memberData?.botEntryMessage as string) || '',
      isAvailable: true,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to fetch workspace member bot settings: ${msg}`);
    return {
      preferenceOverride: null,
      botName: 'Twenty CRM Recorder',
      botEntryMessage: '',
      isAvailable: false,
    };
  }
};

const fetchCalendarEventTitle = async (
  calendarEventId: string,
): Promise<string> => {
  try {
    const response = await axios({
      method: 'GET',
      headers: restHeaders(),
      url: buildRestUrl(`calendarEvents/${calendarEventId}`),
    });
    const body = response.data?.data ?? response.data;
    const eventData = body?.calendarEvent ?? body;
    return (eventData?.title as string) || '';
  } catch {
    return '';
  }
};

// Get all workspace members and their organizer status from event participants.
// Returns empty array for solo events (no participant records).
const getEventParticipants = async (
  calendarEventId: string,
): Promise<ParticipantInfo[]> => {
  try {
    const url = buildRestUrl('calendarEventParticipants', {
      filter: { calendarEventId: { eq: calendarEventId } },
      limit: 50,
    });
    const response = await axios.get(url, { headers: restHeaders() });
    const participants: Record<string, unknown>[] =
      response.data?.data?.calendarEventParticipants ?? [];

    const result: ParticipantInfo[] = [];
    for (const p of participants) {
      const wmId = p.workspaceMemberId as string | undefined;
      if (wmId) {
        result.push({
          workspaceMemberId: wmId,
          isOrganizer: p.isOrganizer === true,
        });
      }
    }
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[schedule-bot] failed to get participants: ${msg}`);
    return [];
  }
};

// For solo events with 0 participants, resolve members via channel associations
// using the sibling-tally strategy.
const resolveChannelOwners = async (
  calendarEventId: string,
): Promise<ParticipantInfo[]> => {
  try {
    const assocUrl = buildRestUrl('calendarChannelEventAssociations', {
      filter: { calendarEventId: { eq: calendarEventId } },
      limit: 10,
    });
    const assocResponse = await axios.get(assocUrl, { headers: restHeaders() });
    const associations: Record<string, unknown>[] =
      assocResponse.data?.data?.calendarChannelEventAssociations ?? [];

    // Get unique channel IDs
    const channelIds = [...new Set(
      associations
        .map((a) => a.calendarChannelId as string | undefined)
        .filter((id): id is string => !!id),
    )];

    if (channelIds.length === 0) return [];

    // For each channel, find the owner via sibling event participants
    const resolved: ParticipantInfo[] = [];
    const seenMembers = new Set<string>();

    for (const channelId of channelIds) {
      const owner = await resolveChannelOwnerViaSiblings(channelId);
      if (owner && !seenMembers.has(owner)) {
        seenMembers.add(owner);
        // Solo event: the channel owner is the organizer (they created it)
        resolved.push({ workspaceMemberId: owner, isOrganizer: true });
      }
    }

    return resolved;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[schedule-bot] failed to resolve channel owners: ${msg}`);
    return [];
  }
};

// calendarChannelId -> workspaceMemberId (cache survives within process lifetime)
const channelOwnerCache = new Map<string, string>();

const resolveChannelOwnerViaSiblings = async (
  calendarChannelId: string,
): Promise<string | null> => {
  const cached = channelOwnerCache.get(calendarChannelId);
  if (cached) return cached;

  const siblingsUrl = buildRestUrl('calendarChannelEventAssociations', {
    filter: { calendarChannelId: { eq: calendarChannelId } },
    limit: 50,
  });
  const siblingsResponse = await axios.get(siblingsUrl, { headers: restHeaders() });
  const siblings: Record<string, unknown>[] =
    siblingsResponse.data?.data?.calendarChannelEventAssociations ?? [];

  // Tally: workspaceMemberId -> { organizer: count, total: count }
  const tally = new Map<string, { organizer: number; total: number }>();

  for (const sibling of siblings) {
    const siblingEventId = sibling.calendarEventId as string | undefined;
    if (!siblingEventId) continue;

    const participantsUrl = buildRestUrl('calendarEventParticipants', {
      filter: { calendarEventId: { eq: siblingEventId } },
      limit: 10,
    });
    const participantsResponse = await axios.get(participantsUrl, { headers: restHeaders() });
    const participants: Record<string, unknown>[] =
      participantsResponse.data?.data?.calendarEventParticipants ?? [];
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
  return best[0];
};

// Resolve ALL workspace members associated with this calendar event.
// Multi-participant events: returns all participants with workspaceMemberId.
// Solo events (0 participants): resolves via channel associations.
const resolveAllEventMembers = async (
  calendarEventId: string,
): Promise<ParticipantInfo[]> => {
  const participants = await getEventParticipants(calendarEventId);
  if (participants.length > 0) return participants;

  // Solo event fallback
  return resolveChannelOwners(calendarEventId);
};

// Schedule a bot for a single workspace member. Returns botId or null.
const scheduleBotForMember = async (
  calendarEventId: string,
  conferenceUrl: string,
  startsAt: string,
  member: ParticipantInfo,
  meetingTitle: string,
  apiKey: string,
  workspacePreference: string | undefined,
): Promise<string | null> => {
  const { workspaceMemberId, isOrganizer: memberIsOrganizer } = member;

  const {
    preferenceOverride,
    botName,
    botEntryMessage,
    isAvailable,
  } = await fetchWorkspaceMemberBotSettings(workspaceMemberId);
  console.error(`[schedule-bot] member=${workspaceMemberId} preferenceOverride=${preferenceOverride} isAvailable=${isAvailable}`);

  const preference = isAvailable
    ? resolveEffectiveRecordingPreference(
        preferenceOverride,
        workspacePreference as RecordingPreference | null | undefined,
      )
    : 'RECORD_NONE';
  console.error(`[schedule-bot] member=${workspaceMemberId} effective preference=${preference} isOrganizer=${memberIsOrganizer}`);

  if (preference === 'RECORD_NONE') {
    console.error(`[schedule-bot] member=${workspaceMemberId} SKIP: recording disabled`);
    return null;
  }

  if (preference === 'RECORD_ORGANIZED' && !memberIsOrganizer) {
    console.error(`[schedule-bot] member=${workspaceMemberId} SKIP: not organizer`);
    return null;
  }

  // Schedule the bot
  const client = new MeetingBaasApiClient(apiKey);
  const callbackUrl = getMeetingBaasCallbackUrl();
  if (!callbackUrl) {
    logger.error('Workspace webhook base URL is not configured; skipping bot scheduling');
    return null;
  }

  const botId = await client.createScheduledBot({
    meetingUrl: conferenceUrl,
    joinAt: startsAt,
    botName,
    ...(botEntryMessage && { entryMessage: botEntryMessage }),
    extra: {
      calendarEventId,
      workspaceMemberId,
      meeting_url: conferenceUrl,
      meeting_title: meetingTitle,
    },
    callbackUrl,
    callbackSecret: apiKey,
  });

  console.error(`[schedule-bot] member=${workspaceMemberId} SUCCESS: botId=${botId}`);

  // Create placeholder recording for dedup
  try {
    await upsertRecording({
      botId,
      name: meetingTitle ? `Scheduled: ${meetingTitle}` : `Scheduled: ${conferenceUrl}`,
      date: startsAt,
      duration: 0,
      platform: detectPlatform(conferenceUrl),
      status: 'IN_PROGRESS',
      meetingUrl: { primaryLinkLabel: 'Join Meeting', primaryLinkUrl: conferenceUrl, secondaryLinks: null },
      mp4Url: null,
      transcript: '',
      calendarEventId,
      workspaceMemberId,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to create placeholder recording: ${msg}`);
  }

  return botId;
};

// Main entry point: resolve all workspace members for the event,
// find the first qualifying member (organizers first), and schedule one bot.
// Only one bot per meeting — the recording is shared.
export const scheduleBot = async (
  calendarEventId: string,
  conferenceUrl: string,
  startsAt: string,
): Promise<string | null> => {
  const apiKey = process.env.MEETING_BAAS_API_KEY;
  const workspacePreference = process.env.RECORDING_PREFERENCE;
  console.error(`[schedule-bot] START calendarEventId=${calendarEventId} conferenceUrl=${conferenceUrl} startsAt=${startsAt}`);
  console.error(`[schedule-bot] MEETING_BAAS_API_KEY set=${!!apiKey} (${apiKey ? apiKey.length + ' chars' : 'empty'}), RECORDING_PREFERENCE=${workspacePreference}`);

  if (!apiKey) {
    console.error('[schedule-bot] EXIT: MEETING_BAAS_API_KEY not set');
    return null;
  }

  // Dedup: check if a recording already exists for this calendar event
  const alreadyExists = await checkIfRecordingExistsForEvent(calendarEventId);
  if (alreadyExists) {
    console.error(`[schedule-bot] EXIT: recording already exists for ${calendarEventId}`);
    return null;
  }

  // Resolve all workspace members for this event
  const members = await resolveAllEventMembers(calendarEventId);
  console.error(`[schedule-bot] resolved ${members.length} members: ${JSON.stringify(members)}`);

  if (members.length === 0) {
    console.error(`[schedule-bot] EXIT: no workspace members found for ${calendarEventId}`);
    return null;
  }

  // Fetch title once (shared across all members)
  const meetingTitle = await fetchCalendarEventTitle(calendarEventId);
  console.error(`[schedule-bot] meetingTitle="${meetingTitle}"`);

  // Sort: organizers first, so the bot is owned by the organizer when possible
  const sorted = [...members].sort((a, b) => Number(b.isOrganizer) - Number(a.isOrganizer));

  // Schedule one bot for the first qualifying member
  for (const member of sorted) {
    try {
      const botId = await scheduleBotForMember(
        calendarEventId, conferenceUrl, startsAt,
        member, meetingTitle, apiKey, workspacePreference,
      );
      if (botId) return botId;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[schedule-bot] ERROR for member=${member.workspaceMemberId}: ${msg}`);
    }
  }

  console.error(`[schedule-bot] EXIT: no qualifying members`);
  return null;
};
