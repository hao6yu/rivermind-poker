export const CONSENT_VERSION = 'reminders-1';
export interface NotificationDevice {
  installationId: string;
  token: string;
  platform: 'ios' | 'android';
  locale: 'en' | 'zh-Hans' | 'zh-Hant' | 'es-419' | 'pt-BR' | 'ja';
  timezone: string;
  appVersion: string;
  tips: boolean;
  quickPlay: boolean;
  releases: boolean;
  permissionGranted: boolean;
  consentVersion: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseDevice(value: unknown): NotificationDevice | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.installationId !== 'string' ||
    !uuid.test(v.installationId) ||
    typeof v.token !== 'string' ||
    v.token.length > 256 ||
    !/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(v.token) ||
    !['ios', 'android'].includes(String(v.platform)) ||
    !['en', 'zh-Hans', 'zh-Hant', 'es-419', 'pt-BR', 'ja'].includes(String(v.locale)) ||
    typeof v.appVersion !== 'string' ||
    !/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(v.appVersion) ||
    typeof v.timezone !== 'string' ||
    v.timezone.length > 100 ||
    v.consentVersion !== CONSENT_VERSION ||
    ['tips', 'quickPlay', 'releases', 'permissionGranted'].some(
      (k) => typeof v[k] !== 'boolean',
    )
  )
    return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: v.timezone }).format();
  } catch {
    return null;
  }
  return {
    installationId: v.installationId,
    token: v.token,
    platform: v.platform as NotificationDevice['platform'],
    locale: v.locale as NotificationDevice['locale'],
    timezone: v.timezone,
    appVersion: v.appVersion,
    tips: v.tips as boolean,
    quickPlay: v.quickPlay as boolean,
    releases: v.releases as boolean,
    permissionGranted: v.permissionGranted as boolean,
    consentVersion: CONSENT_VERSION,
  };
}
export async function handleRegistration(
  request: Request,
  userId: string | null,
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: unknown }>,
) {
  const reply = (status: number, body: unknown) =>
    Response.json(body, { status });
  if (request.method !== 'POST')
    return reply(405, { error: 'method_not_allowed' });
  if (!userId || !uuid.test(userId))
    return reply(401, { error: 'unauthorized' });
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 4096) return reply(413, { error: 'request_too_large' });
    body = JSON.parse(text);
    if (!body || typeof body !== 'object')
      return reply(400, { error: 'invalid_request' });
  } catch {
    return reply(400, { error: 'invalid_request' });
  }
  if (
    body.action === 'disable' &&
    typeof body.installationId === 'string' &&
    uuid.test(body.installationId)
  ) {
    const { error } = await rpc('disable_notification_device', {
      p_user_id: userId,
      p_installation_id: body.installationId,
    });
    return error
      ? reply(503, { error: 'registration_unavailable' })
      : reply(200, { saved: true });
  }
  const device = parseDevice(body);
  if (!device) return reply(400, { error: 'invalid_device' });
  const { error } = await rpc('register_notification_device', {
    p_user_id: userId,
    p_device: device,
  });
  return error
    ? reply(503, { error: 'registration_unavailable' })
    : reply(200, { saved: true });
}
