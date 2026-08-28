BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(20);

-- The reviewed owner predicate bounds the object path SHAPE, not just the
-- owner folder: exactly one folder segment plus a bounded avatar-id filename,
-- so an authenticated owner can never write `owner/nested/file` paths that
-- neither deletion workflow models as a removable object.

SELECT is(
  private.avatar_object_owned('11111111-1111-4111-8111-111111111111/abcdef0123456789', '11111111-1111-4111-8111-111111111111'),
  true,
  'the flat owner/avatarId shape is the owned object form'
);
SELECT is(
  private.avatar_object_owned('11111111-1111-4111-8111-111111111111/nested/file', '11111111-1111-4111-8111-111111111111'),
  false,
  'a nested owner/nested/file path is refused (array_length of foldername is 2)'
);
SELECT is(
  private.avatar_object_owned('abcdef0123456789', '11111111-1111-4111-8111-111111111111'),
  false,
  'a root-level object with no owner folder is refused'
);
SELECT is(
  private.avatar_object_owned('11111111-1111-4111-8111-111111111111/UPPERCASE0123456789', '11111111-1111-4111-8111-111111111111'),
  false,
  'an out-of-format (uppercase) avatar filename is refused'
);
SELECT is(
  private.avatar_object_owned('11111111-1111-4111-8111-111111111111/ab', '11111111-1111-4111-8111-111111111111'),
  false,
  'an under-length avatar filename is refused'
);
SELECT is(
  private.avatar_object_owned('11111111-1111-4111-8111-111111111111/' || repeat('a', 97), '11111111-1111-4111-8111-111111111111'),
  false,
  'an over-length avatar filename is refused'
);
SELECT is(
  private.avatar_object_owned('22222222-2222-4222-8222-222222222222/abcdef0123456789', '11111111-1111-4111-8111-111111111111'),
  false,
  'another owners folder is never owned by the caller'
);

-- Every policy must gate on the reviewed predicate. The DELETE policy cannot be
-- exercised behaviorally (storage.protect_delete() blocks ALL direct deletes),
-- so its shape is asserted here via pg_policies alongside the other three.
SELECT is(
  (
    SELECT count(*)
    FROM pg_policies AS p
    WHERE p.schemaname = 'storage'
      AND p.tablename = 'objects'
      AND p.policyname IN (
        'avatars::upload::owner',
        'avatars::replace::owner',
        'avatars::delete::owner',
        'avatars::read::owner'
      )
      AND p.roles::text LIKE '%authenticated%'
      AND (p.qual IS NULL OR p.qual::text LIKE '%private.avatar_object_owned%')
      AND (p.with_check IS NULL OR p.with_check::text LIKE '%private.avatar_object_owned%')
  ),
  4::bigint,
  'all four avatar bucket policies exist for authenticated and gate on the bounded owner predicate'
);

-- Seed rows that RLS must hide or refuse: a nested historical path and another
-- owner's object. Seeded as the table owner (postgres), which bypasses RLS.
INSERT INTO storage.objects (bucket_id, name, owner)
VALUES
  ('avatars', '11111111-1111-4111-8111-111111111111/nested/file', '11111111-1111-4111-8111-111111111111'::uuid),
  ('avatars', '22222222-2222-4222-8222-222222222222/abcdef0123456789', '22222222-2222-4222-8222-222222222222'::uuid);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

SELECT lives_ok(
  $$
    INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('avatars', '11111111-1111-4111-8111-111111111111/abcdef0123456789', '11111111-1111-4111-8111-111111111111'::uuid)
  $$,
  'an owner can upload their own flat bounded-shape avatar'
);
-- an owner cannot upload a nested owner/nested/file path
SELECT throws_ok($$
INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('avatars', '11111111-1111-4111-8111-111111111111/nested/file', '11111111-1111-4111-8111-111111111111'::uuid)
$$);
-- an owner cannot upload into another owners folder
SELECT throws_ok($$
INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('avatars', '22222222-2222-4222-8222-222222222222/abcdef0123456789', '11111111-1111-4111-8111-111111111111'::uuid)
$$);
-- an owner cannot upload an out-of-format avatar filename
SELECT throws_ok($$
INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('avatars', '11111111-1111-4111-8111-111111111111/UPPERCASE0123456789', '11111111-1111-4111-8111-111111111111'::uuid)
$$);
-- an owner cannot upload a root-level object outside their owner folder
SELECT throws_ok($$
INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('avatars', 'abcdef0123456789', '11111111-1111-4111-8111-111111111111'::uuid)
$$);

SELECT lives_ok(
  $$
    UPDATE storage.objects
    SET version = '2'
    WHERE bucket_id = 'avatars' AND name = '11111111-1111-4111-8111-111111111111/abcdef0123456789'
  $$,
  'an owner can replace their own flat bounded-shape avatar'
);
-- a replacement cannot rename an avatar into a nested path (WITH CHECK)
SELECT throws_ok($$
UPDATE storage.objects
    SET name = '11111111-1111-4111-8111-111111111111/nested/file'
    WHERE bucket_id = 'avatars' AND name = '11111111-1111-4111-8111-111111111111/abcdef0123456789'
$$);
-- a nested historical row cannot be updated: RLS USING acts as a filter, so
-- the attempted update silently affects zero rows instead of raising — the
-- row must be left byte-for-byte untouched.
SELECT lives_ok(
  $$
    UPDATE storage.objects
    SET version = '2'
    WHERE bucket_id = 'avatars' AND name = '11111111-1111-4111-8111-111111111111/nested/file'
  $$,
  'an attempted update of a nested historical row is filtered, not an error'
);
SELECT is(
  (
    SELECT version
    FROM storage.objects
    WHERE bucket_id = 'avatars' AND name = '11111111-1111-4111-8111-111111111111/nested/file'
  ),
  NULL::text,
  'the nested historical row is left untouched by the filtered update'
);

SELECT is(
  (
    SELECT count(*)
    FROM storage.objects
    WHERE bucket_id = 'avatars' AND name = '11111111-1111-4111-8111-111111111111/abcdef0123456789'
  ),
  1::bigint,
  'an owner can read their own flat bounded-shape avatar'
);
SELECT is(
  (
    SELECT count(*)
    FROM storage.objects
    WHERE bucket_id = 'avatars' AND name = '11111111-1111-4111-8111-111111111111/nested/file'
  ),
  0::bigint,
  'a nested historical row is not readable (owner-scoped read excludes it)'
);
SELECT is(
  (
    SELECT count(*)
    FROM storage.objects
    WHERE bucket_id = 'avatars' AND name = '22222222-2222-4222-8222-222222222222/abcdef0123456789'
  ),
  0::bigint,
  'another owners object is not readable'
);

ROLLBACK;
