import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  axiosGet: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    get: mocks.axiosGet,
  },
}));

describe('resolveCalendarEventOwner', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.axiosGet.mockReset();
    process.env.TWENTY_API_KEY = 'test-api-key';
    process.env.TWENTY_API_URL = 'https://twenty.example.com';
  });

  it('falls back to a participant workspace member when the channel chain is unavailable', async () => {
    mocks.axiosGet.mockImplementation(async (url: string) => {
      if (url.includes('/calendarChannelEventAssociations')) {
        throw new Error('404 Not Found');
      }
      if (url.includes('/calendarEventParticipants')) {
        return {
          data: {
            data: {
              calendarEventParticipants: [
                { workspaceMemberId: 'wm-123' },
              ],
            },
          },
        };
      }
      if (url.endsWith('/workspaceMembers/wm-123')) {
        return {
          data: {
            data: {
              name: { firstName: 'Ada', lastName: 'Lovelace' },
            },
          },
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { resolveCalendarEventOwner } = await import('./twenty-sync-service');

    await expect(resolveCalendarEventOwner('event-participant-fallback')).resolves.toEqual({
      workspaceMemberId: 'wm-123',
      workspaceMemberName: 'Ada Lovelace',
    });
  });

  it('returns no owner instead of guessing from the workspace when ownership cannot be resolved', async () => {
    mocks.axiosGet.mockImplementation(async (url: string) => {
      if (url.includes('/calendarChannelEventAssociations')) {
        return {
          data: {
            data: {
              calendarChannelEventAssociations: [],
            },
          },
        };
      }
      if (url.includes('/calendarEventParticipants')) {
        return {
          data: {
            data: {
              calendarEventParticipants: [],
            },
          },
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { resolveCalendarEventOwner } = await import('./twenty-sync-service');

    await expect(resolveCalendarEventOwner('event-no-owner')).resolves.toEqual({});
    expect(
      mocks.axiosGet.mock.calls.some(([url]) =>
        String(url).includes('/workspaceMembers?'),
      ),
    ).toBe(false);
  });
});
