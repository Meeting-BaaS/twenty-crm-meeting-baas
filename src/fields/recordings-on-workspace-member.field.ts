import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';
import { RECORDING_UNIVERSAL_IDENTIFIER } from '../objects/recording';
import {
  WORKSPACE_MEMBER_ON_RECORDING_ID,
  RECORDINGS_ON_WORKSPACE_MEMBER_ID,
} from './workspace-member-on-recording.field';

export default defineField({
  universalIdentifier: RECORDINGS_ON_WORKSPACE_MEMBER_ID,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'recordings',
  label: 'Recordings',
  icon: 'IconVideo',
  relationTargetObjectMetadataUniversalIdentifier: RECORDING_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: WORKSPACE_MEMBER_ON_RECORDING_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
