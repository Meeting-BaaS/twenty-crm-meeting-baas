import routeDefinition from './receive-recording-webhook';

import { describe, expect, it } from 'vitest';

describe('receive-recording-webhook route', () => {
  it('forwards the Meeting BaaS auth headers required by the handler', () => {
    expect(routeDefinition.config.httpRouteTriggerSettings).toMatchObject({
      path: '/webhook/meeting-baas',
      httpMethod: 'POST',
      isAuthRequired: false,
      forwardedRequestHeaders: [
        'x-mb-secret',
        'content-type',
      ],
    });
  });
});
