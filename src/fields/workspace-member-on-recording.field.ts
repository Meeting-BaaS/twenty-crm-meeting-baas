import {
  defineField,
  FieldType,
  RelationType,
  OnDeleteAction,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk';
import { RECORDING_UNIVERSAL_IDENTIFIER } from '../objects/recording';

export const WORKSPACE_MEMBER_ON_RECORDING_ID = '3bb83966-51d6-41e1-9a33-5b53bc6313d9';
export const RECORDINGS_ON_WORKSPACE_MEMBER_ID = '0fb0eaac-4e8d-4632-a6ad-f76df4fb93ad';

export default defineField({
  universalIdentifier: WORKSPACE_MEMBER_ON_RECORDING_ID,
  objectUniversalIdentifier: RECORDING_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'workspaceMember',
  label: 'Owner',
  icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: RECORDINGS_ON_WORKSPACE_MEMBER_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'workspaceMemberId',
  },
});
