import { describe, it, expect, vi } from 'vitest';
import { handleRegistration, parseDevice } from './handler';
const user = '11111111-1111-4111-8111-111111111111';
const device = {
  installationId: '22222222-2222-4222-8222-222222222222',
  token: 'ExpoPushToken[example_token]',
  platform: 'ios',
  locale: 'en',
  timezone: 'America/Chicago',
  appVersion: '1.2.0',
  tips: true,
  quickPlay: false,
  releases: false,
  permissionGranted: true,
  consentVersion: 'reminders-1',
};
describe('notification registration boundary', () => {
  it('accepts explicit consent and supported device metadata', () =>
    expect(parseDevice(device)).toEqual(device));
  it.each([
    { timezone: 'not-a-timezone' },
    { token: 'secret' },
    { locale: 'ja' },
    { consentVersion: 'old' },
    { tips: 'yes' },
    { appVersion: '1.2beta' },
    { installationId: 'bad' },
  ])('rejects invalid fields %j', (change) =>
    expect(parseDevice({ ...device, ...change })).toBeNull(),
  );
  it('binds registration to the authenticated identity, ignoring a supplied owner', async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const response = await handleRegistration(
      new Request('https://local', {
        method: 'POST',
        body: JSON.stringify({ ...device, userId: 'attacker' }),
      }),
      user,
      rpc,
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('register_notification_device', {
      p_user_id: user,
      p_device: device,
    });
  });
  it('never touches the database without an authenticated user', async () => {
    const rpc = vi.fn();
    expect(
      (
        await handleRegistration(
          new Request('https://local', {
            method: 'POST',
            body: JSON.stringify(device),
          }),
          null,
          rpc,
        )
      ).status,
    ).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('supports opt-out without a token or OS permission', async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    expect(
      (
        await handleRegistration(
          new Request('https://local', {
            method: 'POST',
            body: JSON.stringify({
              action: 'disable',
              installationId: device.installationId,
            }),
          }),
          user,
          rpc,
        )
      ).status,
    ).toBe(200);
    expect(rpc).toHaveBeenCalledWith('disable_notification_device', {
      p_user_id: user,
      p_installation_id: device.installationId,
    });
  });
  it('returns a generic failure without leaking database details', async () => {
    const response = await handleRegistration(
      new Request('https://local', {
        method: 'POST',
        body: JSON.stringify(device),
      }),
      user,
      async () => ({ error: { message: device.token } }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(device.token);
  });
});
