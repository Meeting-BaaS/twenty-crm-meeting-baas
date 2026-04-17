import { defineApplication } from 'twenty-sdk';

import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APPLICATION_UNIVERSAL_IDENTIFIER,
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
} from './constants/universal-identifiers';
import {
  DEFAULT_WORKSPACE_RECORDING_PREFERENCE,
  RECORDING_PREFERENCE_VARIABLE_KEY,
} from './recording-preferences';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  icon: 'IconVideo',
  defaultRoleUniversalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  settingsCustomTabFrontComponentUniversalIdentifier: '4ea804f4-6c22-457b-b8a2-66673bb6fc76',
  applicationVariables: {
    MEETING_BAAS_API_KEY: {
      universalIdentifier: 'c1d2e3f4-5a6b-7c8d-9e0f-a1b2c3d4e5f6',
      description: 'Meeting BaaS API key for authenticating requests and verifying webhooks',
      isSecret: true,
      value: '',
    },
    [RECORDING_PREFERENCE_VARIABLE_KEY]: {
      universalIdentifier: '9d5ed4a0-4624-4f55-8e3b-349b7714c64c',
      description:
        'Workspace default for automatic recording when a member has no explicit override',
      value: DEFAULT_WORKSPACE_RECORDING_PREFERENCE,
    },
    AUTO_CREATE_CONTACTS: {
      universalIdentifier: '9637bafd-5888-4f34-bf8f-a4c82dbc4942',
      description: 'Whether to auto-create contacts for unknown participants (true/false)',
      value: 'true',
    },
  },
});
