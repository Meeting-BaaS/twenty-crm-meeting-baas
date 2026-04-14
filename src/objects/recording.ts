import { defineObject, FieldType } from 'twenty-sdk';

export const RECORDING_UNIVERSAL_IDENTIFIER =
  'cf2647b6-ce44-44ca-a866-5db0071899da';

// Field UUIDs — exported for use in views, relations, and page layouts
export const NAME_FIELD_ID = 'b6209c31-8f6a-453e-8291-41191c0394ae';
export const BOT_ID_FIELD_ID = '68967b34-482f-47c2-8d81-7fa1c824bd82';
export const DATE_FIELD_ID = '74bd2089-d5e2-4488-97fb-017ea8e0d14a';
export const DURATION_FIELD_ID = '2ee873e5-60eb-40b1-9a0f-b10d7d48f297';
export const TRANSCRIPT_FIELD_ID = '06e9adf7-392d-44a0-abc9-ef5c1e81bdd7';
export const SUMMARY_FIELD_ID = 'c4a7e2f1-9b3d-4e8a-b5c6-d7f0a1e2b3c4';
export const MEETING_URL_FIELD_ID = 'ad56795c-49ac-4075-b099-42e938d9e36e';
export const MP4_URL_FIELD_ID = '00ecab81-954c-47c4-a263-96fd5ccbc39d';
export const PLATFORM_FIELD_ID = 'eaa24930-508b-4e63-80c3-cc607d8e2845';
export const STATUS_FIELD_ID = '6fce2fe2-169e-4780-9fc4-d330d3cd39bc';

export default defineObject({
  universalIdentifier: RECORDING_UNIVERSAL_IDENTIFIER,
  nameSingular: 'recording',
  namePlural: 'recordings',
  labelSingular: 'Recording',
  labelPlural: 'Recordings',
  description: 'Meeting recordings from Meeting BaaS with transcripts and media.',
  icon: 'IconVideo',
  labelIdentifierFieldMetadataUniversalIdentifier: NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: NAME_FIELD_ID,
      type: FieldType.TEXT,
      label: 'Name',
      name: 'name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: BOT_ID_FIELD_ID,
      type: FieldType.TEXT,
      label: 'Bot ID',
      name: 'botId',
      icon: 'IconKey',
    },
    {
      universalIdentifier: DATE_FIELD_ID,
      type: FieldType.DATE_TIME,
      label: 'Date',
      name: 'date',
      icon: 'IconCalendar',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier: DURATION_FIELD_ID,
      type: FieldType.NUMBER,
      label: 'Duration (min)',
      name: 'duration',
      icon: 'IconClock',
    },
    {
      universalIdentifier: TRANSCRIPT_FIELD_ID,
      type: FieldType.TEXT,
      label: 'Transcript',
      name: 'transcript',
      icon: 'IconFileText',
    },
    {
      universalIdentifier: SUMMARY_FIELD_ID,
      type: FieldType.TEXT,
      label: 'Summary',
      name: 'summary',
      icon: 'IconNotes',
    },
    {
      universalIdentifier: MEETING_URL_FIELD_ID,
      type: FieldType.LINKS,
      label: 'Meeting URL',
      name: 'meetingUrl',
      icon: 'IconLink',
    },
    {
      universalIdentifier: MP4_URL_FIELD_ID,
      type: FieldType.LINKS,
      label: 'Video Recording',
      name: 'mp4Url',
      icon: 'IconVideo',
    },
    {
      universalIdentifier: PLATFORM_FIELD_ID,
      type: FieldType.SELECT,
      label: 'Platform',
      name: 'platform',
      icon: 'IconDevices',
      options: [
        { id: 'b3521d94-c929-45b0-8573-26567e6dfc85', value: 'GOOGLE_MEET', label: 'Google Meet', position: 0, color: 'blue' },
        { id: 'd517462f-8737-4a71-b1bd-bca56a82a1fa', value: 'ZOOM', label: 'Zoom', position: 1, color: 'sky' },
        { id: '3e8c1061-6b12-4f2d-8e52-3bf4667dae01', value: 'MICROSOFT_TEAMS', label: 'Microsoft Teams', position: 2, color: 'purple' },
        { id: 'd0d8114f-811c-4d14-8c6d-fea5283e2b61', value: 'UNKNOWN', label: 'Unknown', position: 3, color: 'gray' },
      ],
    },
    {
      universalIdentifier: STATUS_FIELD_ID,
      type: FieldType.SELECT,
      label: 'Status',
      name: 'status',
      icon: 'IconStatusChange',
      options: [
        { id: 'e127d867-4931-4e15-a5be-971caa8678a3', value: 'COMPLETED', label: 'Completed', position: 0, color: 'green' },
        { id: '776885a7-8a42-415c-92fe-e08f5a1274ea', value: 'FAILED', label: 'Failed', position: 1, color: 'red' },
        { id: '12374b43-a6fe-48d6-8a71-437242e59df2', value: 'IN_PROGRESS', label: 'In Progress', position: 2, color: 'orange' },
      ],
    },
  ],
});
