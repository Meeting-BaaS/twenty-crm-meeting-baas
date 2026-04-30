import { defineRole, PermissionFlag } from 'twenty-sdk/define';
import { RECORDING_UNIVERSAL_IDENTIFIER } from '../objects/recording';

export const DEFAULT_ROLE_ID = '3231cf40-5b90-4c2b-ae41-fcb5606299b4';

export default defineRole({
  universalIdentifier: DEFAULT_ROLE_ID,
  label: 'Meeting BaaS Recorder role',
  description: 'Default role for the Meeting BaaS Recorder app',
  // Needs read access to calendarEvent, calendarEventParticipant,
  // calendarChannelEventAssociation, calendarChannel, connectedAccount,
  // workspaceMember for ownership resolution and preference checks.
  // Per-object permissions on system objects are not supported, so we
  // grant broad read access here while keeping writes constrained.
  canReadAllObjectRecords: true,
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
