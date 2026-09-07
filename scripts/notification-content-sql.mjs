import fs from 'node:fs';
const content = JSON.parse(
  fs.readFileSync(
    new URL('../config/notification-content.json', import.meta.url),
    'utf8',
  ),
);
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const ids = new Set();
for (const row of content) {
  if (!/^(tip|quick_play)\.[a-z0-9-]+$/.test(row.id) || ids.has(row.id))
    throw new Error('Invalid or repeated notification ID');
  ids.add(row.id);
  if (
    !['tip', 'quick_play'].includes(row.kind) ||
    !row.id.startsWith(`${row.kind}.`)
  )
    throw new Error('Invalid notification kind');
  if (row.target !== (row.kind === 'tip' ? 'learn' : 'play'))
    throw new Error('Invalid notification target');
  for (const locale of ['en', 'zh-Hans', 'zh-Hant', 'es-419', 'pt-BR', 'ja']) {
    if (
      typeof row.copy[locale]?.title !== 'string' ||
      !row.copy[locale].title ||
      typeof row.copy[locale]?.body !== 'string' ||
      !row.copy[locale].body ||
      row.copy[locale].body.length > 190
    )
      throw new Error('Incomplete notification copy');
  }
  // Updating translations does not change the semantic ID or clear history.
  console.log(
    `insert into public.notification_content(id,kind,target,copy,enabled) values (${literal(row.id)},${literal(row.kind)},${literal(row.target)},${literal(JSON.stringify(row.copy))}::jsonb,true) on conflict(id) do update set copy=excluded.copy;`,
  );
}
