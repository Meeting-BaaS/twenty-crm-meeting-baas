import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk';
import { RECORDING_UNIVERSAL_IDENTIFIER } from '../objects/recording';
import {
  CALENDAR_EVENT_ON_RECORDING_ID,
  RECORDINGS_ON_CALENDAR_EVENT_ID,
} from './calendar-event-on-recording.field';

export default defineField({
  universalIdentifier: RECORDINGS_ON_CALENDAR_EVENT_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.calendarEvent.universalIdentifier,
  type: FieldType.RELATION,
  name: 'recordings',
  label: 'Recordings',
  icon: 'IconVideo',
  relationTargetObjectMetadataUniversalIdentifier: RECORDING_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: CALENDAR_EVENT_ON_RECORDING_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
