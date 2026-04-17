import axios from 'axios';
import { MeetingBaasApiClient } from '../meeting-baas-api-client';
import { resolveCalendarEventOwner, checkIfRecordingExistsForEvent, upsertRecording } from '../twenty-sync-service';
import { detectPlatform } from '../twenty-sync-service';
import { createLogger } from '../logger';
import { buildRestUrl, restHeaders } from '../utils';

const logger = createLogger('schedule-bot');

type RecordingPreference = 'RECORD_ALL' | 'RECORD_ORGANIZED' | 'RECORD_NONE';

type BotSettings = {
  preference: RecordingPreference;
  botName: string;
  botEntryMessage: string;
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
      preference: (memberData?.recordingPreference as RecordingPreference) ?? 'RECORD_NONE',
      botName: (memberData?.botName as string) || 'Twenty CRM Recorder',
      botEntryMessage: (memberData?.botEntryMessage as string) || '',
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to fetch workspace member bot settings: ${msg}`);
    return { preference: 'RECORD_NONE', botName: 'Twenty CRM Recorder', botEntryMessage: '' };
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

// The recording preference is fetched per-call rather than from the event payload
// because Twenty's database event payloads only contain the triggering object's fields
// (calendarEvent), not joined data from other objects (workspaceMember).
const isOrganizer = async (
  calendarEventId: string,
  workspaceMemberId: string,
): Promise<boolean> => {
  try {
    const url = buildRestUrl('calendarEventParticipants', {
      filter: { calendarEventId: { eq: calendarEventId } },
      limit: 50,
    });
    const response = await axios.get(url, { headers: restHeaders() });
    const participants: Record<string, unknown>[] =
      response.data?.data?.calendarEventParticipants ?? [];

    return participants.some(
      (p) =>
        p.isOrganizer === true &&
        p.workspaceMemberId === workspaceMemberId,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to check organizer status: ${msg}`);
    return false;
  }
};

// Shared handler: resolve owner -> check preference -> check organizer -> schedule bot
export const scheduleBot = async (
  calendarEventId: string,
  conferenceUrl: string,
  startsAt: string,
): Promise<string | null> => {
  const apiKey = process.env.MEETING_BAAS_API_KEY;
  if (!apiKey) {
    logger.debug('MEETING_BAAS_API_KEY not set, skipping bot scheduling');
    return null;
  }

  // Dedup: check if a recording already exists for this calendar event
  const alreadyExists = await checkIfRecordingExistsForEvent(calendarEventId);
  if (alreadyExists) {
    logger.debug(`Recording already exists for calendar event ${calendarEventId}, skipping`);
    return null;
  }

  // Resolve calendar event owner
  const ownership = await resolveCalendarEventOwner(calendarEventId);
  if (!ownership.workspaceMemberId) {
    logger.debug(`No workspace member found for calendar event ${calendarEventId}`);
    return null;
  }

  // Check recording preference and bot settings
  const { preference, botName, botEntryMessage } = await fetchWorkspaceMemberBotSettings(ownership.workspaceMemberId);
  if (preference === 'RECORD_NONE') {
    logger.debug(`Workspace member ${ownership.workspaceMemberName ?? ownership.workspaceMemberId} has recording disabled`);
    return null;
  }

  // If organizer-only, check if the member is the organizer
  if (preference === 'RECORD_ORGANIZED') {
    const memberIsOrganizer = await isOrganizer(calendarEventId, ownership.workspaceMemberId);
    if (!memberIsOrganizer) {
      logger.debug(`Workspace member ${ownership.workspaceMemberName ?? ownership.workspaceMemberId} is not the organizer, skipping`);
      return null;
    }
  }

  // Fetch calendar event title for recording metadata
  const meetingTitle = await fetchCalendarEventTitle(calendarEventId);

  // Schedule the bot
  const client = new MeetingBaasApiClient(apiKey);
  const serverUrl = process.env.TWENTY_API_URL ?? '';
  const botId = await client.createScheduledBot({
    meetingUrl: conferenceUrl,
    joinAt: startsAt,
    botName,
    ...(botEntryMessage && { entryMessage: botEntryMessage }),
    extra: {
      calendarEventId,
      workspaceMemberId: ownership.workspaceMemberId,
      meeting_url: conferenceUrl,
      meeting_title: meetingTitle,
    },
    callbackUrl: serverUrl ? `${serverUrl}/s/webhook/meeting-baas` : undefined,
    callbackSecret: apiKey,
  });

  logger.debug(`Scheduled bot ${botId} for calendar event ${calendarEventId} (${conferenceUrl})`);

  // Create placeholder recording so subsequent triggers detect the dedup
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
      workspaceMemberId: ownership.workspaceMemberId,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to create placeholder recording: ${msg}`);
  }

  return botId;
};
