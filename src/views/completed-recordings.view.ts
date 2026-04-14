import { defineView } from 'twenty-sdk';
import { ViewType, ViewFilterOperand } from 'twenty-shared/types';
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

export default defineView({
  universalIdentifier: 'd6325047-8ba7-4976-a732-4e280db36dfa',
  name: 'Completed Recordings',
  objectUniversalIdentifier: RECORDING_UNIVERSAL_IDENTIFIER,
  type: ViewType.TABLE,
  icon: 'IconCheck',
  position: 1,
  fields: [
    { universalIdentifier: 'b953f475-0eb7-4864-b3e8-d2c4e8b02a3b', fieldMetadataUniversalIdentifier: NAME_FIELD_ID, position: 0, isVisible: true, size: 200 },
    { universalIdentifier: 'b3bd42e6-05cd-4c3a-bfad-726ef75a0c15', fieldMetadataUniversalIdentifier: DATE_FIELD_ID, position: 1, isVisible: true, size: 150 },
    { universalIdentifier: 'e15d29e8-468a-4b8f-93cb-a71d89f01d45', fieldMetadataUniversalIdentifier: DURATION_FIELD_ID, position: 2, isVisible: true, size: 100 },
    { universalIdentifier: 'c2b37ddf-f16f-4b5f-b443-c6b5214eb4b4', fieldMetadataUniversalIdentifier: PLATFORM_FIELD_ID, position: 3, isVisible: true, size: 130 },
    { universalIdentifier: '489703b0-1cd1-4422-98d8-6d8d32063821', fieldMetadataUniversalIdentifier: STATUS_FIELD_ID, position: 4, isVisible: true, size: 110 },
    { universalIdentifier: '76d8a2c2-259f-49cc-8921-6ebad06ac276', fieldMetadataUniversalIdentifier: MEETING_URL_FIELD_ID, position: 5, isVisible: true, size: 140 },
    { universalIdentifier: '4d31d04c-f90e-413a-9c67-38cb6a3594a3', fieldMetadataUniversalIdentifier: MP4_URL_FIELD_ID, position: 6, isVisible: true, size: 140 },
  ],
  filters: [
    {
      universalIdentifier: 'ee754547-ed53-4d9e-8155-fbf58d8ed016',
      fieldMetadataUniversalIdentifier: STATUS_FIELD_ID,
      operand: ViewFilterOperand.IS,
      value: 'COMPLETED',
    },
  ],
});
