import { defineView } from 'twenty-sdk';
import { ViewKey, ViewType } from 'twenty-shared/types';
import {
  RECORDING_UNIVERSAL_IDENTIFIER,
  NAME_FIELD_ID,
  DATE_FIELD_ID,
  DURATION_FIELD_ID,
  PLATFORM_FIELD_ID,
  STATUS_FIELD_ID,
  MEETING_URL_FIELD_ID,
  MP4_URL_FIELD_ID,
} from '../objects/recording';

export const ALL_RECORDINGS_VIEW_ID = 'bd6347b3-3b8a-4095-a0bb-24220b5040bd';

export default defineView({
  universalIdentifier: ALL_RECORDINGS_VIEW_ID,
  name: 'All Recordings',
  objectUniversalIdentifier: RECORDING_UNIVERSAL_IDENTIFIER,
  type: ViewType.TABLE,
  key: ViewKey.INDEX,
  icon: 'IconVideo',
  position: 0,
  fields: [
    { universalIdentifier: 'e75cd4e3-e42e-43c7-bd94-532f2766ea11', fieldMetadataUniversalIdentifier: NAME_FIELD_ID, position: 0, isVisible: true, size: 200 },
    { universalIdentifier: '30411458-e7bc-463f-8308-a9c0c947122c', fieldMetadataUniversalIdentifier: DATE_FIELD_ID, position: 1, isVisible: true, size: 150 },
    { universalIdentifier: '74be7ee1-10f5-49a1-9af8-86174a2d037f', fieldMetadataUniversalIdentifier: DURATION_FIELD_ID, position: 2, isVisible: true, size: 100 },
    { universalIdentifier: '83fc4647-d08a-400e-840e-01f3b9cbe51e', fieldMetadataUniversalIdentifier: PLATFORM_FIELD_ID, position: 3, isVisible: true, size: 130 },
    { universalIdentifier: '59f601ca-c442-4feb-a803-476eff07d534', fieldMetadataUniversalIdentifier: STATUS_FIELD_ID, position: 4, isVisible: true, size: 110 },
    { universalIdentifier: '3becc98e-ee5f-479a-a947-9e7db0412e8b', fieldMetadataUniversalIdentifier: MEETING_URL_FIELD_ID, position: 5, isVisible: true, size: 140 },
    { universalIdentifier: 'f72a4775-4443-467f-ad0b-8e31323bc322', fieldMetadataUniversalIdentifier: MP4_URL_FIELD_ID, position: 6, isVisible: true, size: 140 },
  ],
});
