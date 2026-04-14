import { defineRole, PermissionFlag } from 'twenty-sdk';
import { RECORDING_UNIVERSAL_IDENTIFIER } from '../objects/recording';

export const DEFAULT_ROLE_ID = '3231cf40-5b90-4c2b-ae41-fcb5606299b4';

export default defineRole({
  universalIdentifier: DEFAULT_ROLE_ID,
  label: 'Meeting BaaS Recorder role',
  description: 'Default role for the Meeting BaaS Recorder app',
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canUpdateAllSettings: false,
  canBeAssignedToAgents: false,
  canBeAssignedToUsers: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: [
    {
      objectUniversalIdentifier: RECORDING_UNIVERSAL_IDENTIFIER,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: true,
      canDestroyObjectRecords: false,
    },
  ],
  permissionFlags: [PermissionFlag.APPLICATIONS, PermissionFlag.AI],
});
