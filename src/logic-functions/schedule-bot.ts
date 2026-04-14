import axios from 'axios';
import { MeetingBaasApiClient } from '../meeting-baas-api-client';
import { resolveCalendarEventOwner, checkIfRecordingExistsForEvent, upsertRecording } from '../twenty-sync-service';
import { detectPlatform } from '../twenty-sync-service';
import { createLogger } from '../logger';
import { getRestApiUrl, restHeaders } from '../utils';

const logger = createLogger('schedule-bot');

type RecordingPreference = 'RECORD_ALL' | 'RECORD_ORGANIZED' | 'RECORD_NONE';

const TWENTY_API_KEY = process.env.TWENTY_API_KEY ?? '';

const fetchWorkspaceMemberPreference = async (
  workspaceMemberId: string,
): Promise<RecordingPreference> => {
  try {
    const response = await axios({
      method: 'GET',
      headers: restHeaders(),
      url: `${getRestApiUrl()}/workspaceMembers/${workspaceMemberId}`,
    });
    const memberData = response.data?.data ?? response.data;
    return (memberData?.recordingPreference as RecordingPreference) ?? 'RECORD_NONE';
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to fetch workspace member preference: ${msg}`);
    return 'RECORD_NONE';
  }
};

const isOrganizer = async (
  calendarEventId: string,
  workspaceMemberId: string,
): Promise<boolean> => {
  try {
    const response = await axios({
      method: 'GET',
      headers: { Authorization: `Bearer ${TWENTY_API_KEY}` },
      url: `${getRestApiUrl()}/calendarEventParticipants?filter=calendarEventId%5Beq%5D%3A%22${encodeURIComponent(calendarEventId)}%22&limit=50`,
    });
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

  // Check recording preference
  const preference = await fetchWorkspaceMemberPreference(ownership.workspaceMemberId);
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

  // Schedule the bot
  const client = new MeetingBaasApiClient(apiKey);
  const serverUrl = process.env.TWENTY_API_URL ?? '';
  const botId = await client.createScheduledBot({
    meetingUrl: conferenceUrl,
    joinAt: startsAt,
    extra: {
      calendarEventId,
      workspaceMemberId: ownership.workspaceMemberId,
      meeting_url: conferenceUrl,
    },
    callbackUrl: serverUrl ? `${serverUrl}/s/webhook/meeting-baas` : undefined,
    callbackSecret: apiKey,
  });

  logger.debug(`Scheduled bot ${botId} for calendar event ${calendarEventId} (${conferenceUrl})`);

  // Create placeholder recording so subsequent triggers detect the dedup
  try {
    await upsertRecording({
      botId,
      name: `Scheduled: ${conferenceUrl}`,
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
