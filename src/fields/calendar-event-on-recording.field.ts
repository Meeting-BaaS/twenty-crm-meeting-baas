import {
  defineField,
  FieldType,
  RelationType,
  OnDeleteAction,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';
import { RECORDING_UNIVERSAL_IDENTIFIER } from '../objects/recording';

export const CALENDAR_EVENT_ON_RECORDING_ID = '29fe48d1-7e7d-4253-9fea-0a876c2c116d';
export const RECORDINGS_ON_CALENDAR_EVENT_ID = '131a78b1-f3c9-4b2e-9808-f9eb64bfb832';

export default defineField({
  universalIdentifier: CALENDAR_EVENT_ON_RECORDING_ID,
  objectUniversalIdentifier: RECORDING_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'calendarEvent',
  label: 'Calendar Event',
  icon: 'IconCalendarEvent',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.calendarEvent.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: RECORDINGS_ON_CALENDAR_EVENT_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'calendarEventId',
  },
});
