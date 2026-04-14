import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk';

export const RECORDING_PREFERENCE_FIELD_ID = '95ec702a-e4b4-4028-b563-900216d92b01';

export default defineField({
  universalIdentifier: RECORDING_PREFERENCE_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.SELECT,
  name: 'recordingPreference',
  label: 'Recording Preference',
  icon: 'IconVideo',
  description: 'Controls automatic meeting recording behavior for this workspace member',
  defaultValue: "'RECORD_NONE'",
  options: [
    {
      id: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
      color: 'green',
      label: 'Record All',
      value: 'RECORD_ALL',
      position: 1,
    },
    {
      id: 'f2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b6c',
      color: 'yellow',
      label: 'Organizer Only',
      value: 'RECORD_ORGANIZED',
      position: 2,
    },
    {
      id: '243e25fd-4bae-4b50-8844-971f89d6e679',
      color: 'gray',
      label: 'None',
      value: 'RECORD_NONE',
      position: 3,
    },
  ],
});
