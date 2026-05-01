import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export const BOT_ENTRY_MESSAGE_FIELD_ID = '5d9be02b-138b-5437-9184-d72276f51f3d';

export default defineField({
  universalIdentifier: BOT_ENTRY_MESSAGE_FIELD_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.TEXT,
  name: 'botEntryMessage',
  label: 'Bot Entry Message',
  icon: 'IconMessage',
  description: 'Message the bot posts in the meeting chat when it joins (max 500 characters)',
  defaultValue: "''",
});
