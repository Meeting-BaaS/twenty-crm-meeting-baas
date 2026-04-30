import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export const BOT_NAME_FIELD_ID = '6a37564a-25e6-5bdb-a119-1522e3817ae6';

export default defineField({
  universalIdentifier: BOT_NAME_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.TEXT,
  name: 'botName',
  label: 'Bot Name',
  icon: 'IconRobot',
  description: 'Name displayed for the recording bot when it joins meetings',
  defaultValue: "'Twenty CRM Recorder'",
});
