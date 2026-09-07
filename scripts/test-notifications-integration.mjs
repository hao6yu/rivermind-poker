import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Local database only. Never send a push, and never read/print live credentials.
const workdir = path.resolve(process.env.NOTIFICATION_TEST_WORKDIR || '.');
const config = fs.readFileSync(
  path.join(workdir, 'supabase/config.toml'),
  'utf8',
);
const project = /^project_id\s*=\s*"([\w-]+)"/m.exec(config)?.[1];
assert(project, 'Missing local Supabase project ID');
const container = `supabase_db_${project}`;
const args = [
  'exec',
  '-i',
  container,
  'psql',
  '-U',
  'postgres',
  '-d',
  'postgres',
  '-v',
  'ON_ERROR_STOP=1',
  '-Atq',
];
function sql(query, allowedFailure = false) {
  const result = spawnSync('docker', args, { input: query, encoding: 'utf8' });
  if (allowedFailure) return result;
  assert.equal(result.status, 0, `Local SQL failed: ${result.stderr}`);
  return result.stdout.trim();
}
function sqlAsync(query) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args);
    let output = '',
      error = '';
    child.stdout.on('data', (value) => {
      output += value;
    });
    child.stderr.on('data', (value) => {
      error += value;
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(output.trim()) : reject(new Error(error)),
    );
    child.stdin.end(query);
  });
}
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const users = [];
const contentIds = [];
const timezone = sql(
  'select name from pg_timezone_names where extract(hour from now() at time zone name)=18 limit 1;',
);
assert(timezone, 'No local 6 pm timezone found');
const rollout = sql(
  'select row_to_json(r) from public.notification_rollout r;',
);
const enabled = sql(
  "select coalesce(json_agg(id),'[]') from public.notification_content where enabled;",
);
const poolSize = JSON.parse(
  fs.readFileSync(
    new URL('../config/notification-content.json', import.meta.url),
    'utf8',
  ),
).length;
let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`PASS ${name}`);
};
function recipient(overrides = {}) {
  const id = randomUUID();
  users.push(id);
  const device = {
    installationId: randomUUID(),
    token: `ExpoPushToken[test_${id.replaceAll('-', '')}]`,
    platform: 'ios',
    locale: 'en',
    timezone,
    appVersion: '1.2.0',
    tips: true,
    quickPlay: true,
    releases: true,
    permissionGranted: true,
    consentVersion: 'reminders-1',
    ...overrides,
  };
  sql(`insert into auth.users(id) values (${quote(id)});
    select public.register_notification_device(${quote(id)},${quote(JSON.stringify(device))}::jsonb);
    update public.notification_recipients set last_active_at=now()-interval '4 days' where user_id=${quote(id)};`);
  return { id, device };
}
function audience(user) {
  sql(
    `update public.notification_rollout set enabled=true,production_enabled=false,test_user_ids=array[${quote(user.id)}::uuid];`,
  );
}
function claim() {
  return sql('select public.claim_notification_batch(100);')
    .split('\n')
    .filter(Boolean);
}
function begin(id) {
  return sql(`select public.begin_notification_send(${quote(id)});`);
}
function age(user, days = 8) {
  sql(`update public.notification_deliveries set created_at=now()-interval '${days} days' where user_id=${quote(user.id)};
    update public.notification_recipients set last_active_at=now()-interval '4 days' where user_id=${quote(user.id)};`);
}
try {
  assert.equal(
    sql('select count(*) from public.notification_content where enabled;'),
    String(poolSize),
  );
  sql(
    'update public.notification_rollout set enabled=false,production_enabled=false;',
  );
  const user = recipient();
  check('disabled rollout sends nothing', () => assert.deepEqual(claim(), []));
  audience(user);
  // Hold the recipient lock inside the first transaction while other workers
  // claim. Only one transaction may create a delivery for this user.
  const concurrent = await Promise.all(
    Array.from({ length: 8 }, () =>
      sqlAsync(
        'begin; select public.claim_notification_batch(100); select pg_sleep(0.2); commit;',
      ),
    ),
  );
  const claims = concurrent.flatMap((value) =>
    value.split('\n').filter(Boolean),
  );
  check('eight concurrent workers produce one claim', () =>
    assert.equal(claims.length, 1),
  );
  check('send is consumed before the request; replay returns null', () => {
    assert.equal(JSON.parse(begin(claims[0])).id, claims[0]);
    assert.equal(begin(claims[0]), '');
    assert.deepEqual(claim(), []);
  });
  check('rotated token is not disabled by an old receipt', () => {
    sql(`select public.register_notification_device(${quote(user.id)},${quote(JSON.stringify({ ...user.device, token: 'ExpoPushToken[rotated]' }))}::jsonb);
      select public.invalidate_notification_device(${quote(claims[0])});`);
    assert.equal(
      sql(
        `select permission_granted from public.notification_recipients where user_id=${quote(user.id)};`,
      ),
      't',
    );
  });
  age(user, 4);
  sql(
    `update public.notification_recipients set last_active_at=now()-interval '10 days' where user_id=${quote(user.id)};`,
  );
  const second = claim();
  check('second reminder changes category', () => {
    assert.equal(second.length, 1);
    assert.equal(
      sql(
        `select count(distinct c.kind) from public.notification_deliveries d join public.notification_content c on c.id=d.content_id where d.user_id=${quote(user.id)};`,
      ),
      '2',
    );
  });
  sql(
    `update public.notification_deliveries set created_at=now()-interval '4 days' where id=${quote(second[0])};`,
  );
  check('two reminders without a return pause within the week', () =>
    assert.deepEqual(claim(), []),
  );
  sql(
    `update public.notification_deliveries set created_at=now()-interval '8 days' where user_id=${quote(user.id)};`,
  );
  check('two reminders without a return pauses even beyond seven days', () =>
    assert.deepEqual(claim(), []),
  );
  age(user);
  const third = claim()[0];
  check('foreground activity between claim and send cancels delivery', () => {
    sql(
      `update public.notification_recipients set last_active_at=now() where user_id=${quote(user.id)};`,
    );
    assert.equal(begin(third), '');
    assert.equal(
      sql(
        `select status from public.notification_deliveries where id=${quote(third)};`,
      ),
      'skipped',
    );
  });
  age(user);
  const fourth = claim()[0];
  check('opt-out after claim cancels delivery', () => {
    sql(
      `select public.disable_notification_device(${quote(user.id)},${quote(user.device.installationId)});`,
    );
    assert.equal(begin(fourth), '');
  });
  const weekly = recipient();
  audience(weekly);
  sql(`insert into public.notification_deliveries(user_id,content_id,installation_id,token_fingerprint,created_at,status)
    select ${quote(weekly.id)}, id, ${quote(weekly.device.installationId)}, md5(${quote(weekly.device.token)}), now()-interval '4 days', 'failed'
    from public.notification_content where enabled and kind in ('tip','quick_play') order by id limit 2;
    update public.notification_recipients set last_active_at=now()-interval '84 hours' where user_id=${quote(weekly.id)};`);
  check('a third weekly claim is allowed after a return and cooldown', () => {
    assert.equal(claim().length, 1);
  });
  sql(`update public.notification_deliveries set created_at=now()-interval '4 days' where user_id=${quote(weekly.id)};`);
  check('three claims across categories cap a rolling week, including failed attempts', () => {
    assert.deepEqual(claim(), []);
  });
  sql(`update public.notification_deliveries set created_at=now()-interval '8 days'
    where id=(select id from public.notification_deliveries where user_id=${quote(weekly.id)} order by content_id limit 1);`);
  check('a claim leaving the rolling seven-day window frees one slot', () => {
    assert.equal(claim().length, 1);
  });
  const poolUser = recipient({ releases: false });
  audience(poolUser);
  const seen = new Set();
  for (let i = 0; i < poolSize; i++) {
    const ids = claim();
    assert.equal(ids.length, 1);
    const message = JSON.parse(begin(ids[0]));
    assert(!seen.has(message.messageId));
    seen.add(message.messageId);
    age(poolUser);
  }
  check(
    `all ${poolSize} messages occur once; exhausted pool stays paused`,
    () => {
      assert.equal(seen.size, poolSize);
      assert.deepEqual(claim(), []);
    },
  );
  const quiet = recipient({ timezone: 'UTC' });
  audience(quiet);
  const wrongTimezone = sql(
    'select name from pg_timezone_names where extract(hour from now() at time zone name)<>18 limit 1;',
  );
  sql(
    `update public.notification_recipients set timezone=${quote(wrongTimezone)} where user_id=${quote(quiet.id)};`,
  );
  check('quiet hours exclude recipients', () => assert.deepEqual(claim(), []));
  sql(
    `update public.notification_recipients set timezone=${quote(timezone)},last_active_at=now()-interval '71 hours' where user_id=${quote(quiet.id)};`,
  );
  check('active within 72 hours excludes recipients', () =>
    assert.deepEqual(claim(), []),
  );
  sql(
    `update public.notification_recipients set last_active_at=now()-interval '91 days' where user_id=${quote(quiet.id)};`,
  );
  check('stale recipients expire after 90 days', () =>
    assert.deepEqual(claim(), []),
  );
  const releaseUser = recipient({ tips: false, quickPlay: false });
  audience(releaseUser);
  for (const suffix of ['a', 'b']) {
    const id = `integration.release.${randomUUID()}`;
    contentIds.push(id);
    sql(`insert into public.notification_content(id,kind,copy,target,release_version,platforms,enabled)
      values(${quote(id)},'release','{"en":{"title":"Test","body":"Update"}}','whats_new','1.3.0',array['android'],true);`);
  }
  check('release targets only platforms where it is available', () =>
    assert.deepEqual(claim(), []),
  );
  sql(
    `update public.notification_content set platforms=array['ios'] where id in (${contentIds.map(quote).join(',')});`,
  );
  const release = claim();
  check('new version produces one announcement', () =>
    assert.equal(release.length, 1),
  );
  age(releaseUser);
  check('a second campaign for the same version cannot repeat', () =>
    assert.deepEqual(claim(), []),
  );
  const updated = recipient({
    tips: false,
    quickPlay: false,
    appVersion: '1.3.0',
  });
  audience(updated);
  check('already updated users receive no update invitation', () =>
    assert.deepEqual(claim(), []),
  );
  const deviceUser = recipient();
  audience(deviceUser);
  const staleClaim = claim()[0];
  const newer = { ...deviceUser.device, installationId: randomUUID() };
  sql(`select public.register_notification_device(${quote(deviceUser.id)},${quote(JSON.stringify(newer))}::jsonb);
    select public.disable_notification_device(${quote(deviceUser.id)},${quote(deviceUser.device.installationId)});`);
  check('old installation cannot disable or receive for a new one', () => {
    assert.equal(
      sql(
        `select permission_granted from public.notification_recipients where user_id=${quote(deviceUser.id)};`,
      ),
      't',
    );
    assert.equal(begin(staleClaim), '');
  });
  const beforeReinstall = recipient();
  audience(beforeReinstall);
  const beforeId = claim()[0];
  const beforeMessage = JSON.parse(begin(beforeId)).messageId;
  const afterReinstall = recipient({
    token: beforeReinstall.device.token.replace(
      'ExpoPushToken[',
      'ExponentPushToken[',
    ),
  });
  audience(afterReinstall);
  check(
    'reinstall reassigns one canonical destination and keeps its cooldown',
    () => {
      assert.equal(
        sql(
          `select count(*) from public.notification_recipients where user_id=${quote(beforeReinstall.id)};`,
        ),
        '0',
      );
      assert.equal(
        sql(
          `select count(*) from public.notification_recipients where expo_token=${quote(afterReinstall.device.token)};`,
        ),
        '1',
      );
      assert.deepEqual(claim(), []);
      sql(
        `select public.disable_notification_device(${quote(beforeReinstall.id)},${quote(beforeReinstall.device.installationId)});`,
      );
      assert.equal(
        sql(
          `select permission_granted from public.notification_recipients where user_id=${quote(afterReinstall.id)};`,
        ),
        't',
      );
    },
  );
  age(beforeReinstall);
  check(
    'a new guest account with the same push address skips previously sent content',
    () => {
      const afterId = claim()[0];
      assert(afterId);
      const afterMessage = JSON.parse(begin(afterId));
      assert.notEqual(afterMessage.messageId, beforeMessage);
      assert.equal(afterMessage.to, afterReinstall.device.token, 'Provider-issued token must be sent verbatim');
    },
  );
  for (const role of ['anon', 'authenticated']) {
    check(`${role} cannot read tokens or claim deliveries`, () => {
      assert.notEqual(
        sql(
          `set role ${role}; select * from public.notification_recipients;`,
          true,
        ).status,
        0,
      );
      assert.notEqual(
        sql(
          `set role ${role}; select public.claim_notification_batch(1);`,
          true,
        ).status,
        0,
      );
      assert.notEqual(
        sql(
          `set role ${role}; select public.register_notification_device(${quote(user.id)},'{}');`,
          true,
        ).status,
        0,
      );
    });
  }
  check('account deletion removes recipient and delivery history', () => {
    sql(`delete from auth.users where id=${quote(poolUser.id)};`);
    assert.equal(
      sql(
        `select count(*) from public.notification_recipients where user_id=${quote(poolUser.id)};`,
      ),
      '0',
    );
    assert.equal(
      sql(
        `select count(*) from public.notification_deliveries where user_id=${quote(poolUser.id)};`,
      ),
      '0',
    );
  });
  console.log(`${checks} notification database integration checks passed.`);
} finally {
  if (users.length)
    sql(`delete from auth.users where id in (${users.map(quote).join(',')});`);
  if (contentIds.length)
    sql(
      `delete from public.notification_content where id in (${contentIds.map(quote).join(',')});`,
    );
  const previous = JSON.parse(rollout);
  sql(`update public.notification_rollout set enabled=${previous.enabled},production_enabled=${previous.production_enabled},
    test_user_ids=array[${previous.test_user_ids.map((value) => `${quote(value)}::uuid`).join(',')}]::uuid[];
    update public.notification_content set enabled=false;
    update public.notification_content set enabled=true where id in (${JSON.parse(enabled).map(quote).join(',')});`);
}
