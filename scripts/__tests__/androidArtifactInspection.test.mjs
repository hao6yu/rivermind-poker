import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import {
  elfMaxPageAlignment,
  inspectArtifact,
  parseAndroidManifestXml,
} from '../androidArtifactInspection.mjs';

/**
 * These fixtures are written by hand rather than borrowed from a build, so the
 * gate is proven against the formats instead of against one lucky artifact.
 * Every artifact used here is synthetic: a real APK is gitignored.
 */

const REQUIRED_TARGET_API = 36;
const SIXTEEN_KB = 16384;

// ---------------------------------------------------------------------------
// Synthetic ZIP writer
// ---------------------------------------------------------------------------

/**
 * `alignBytes` pads a stored entry's local extra field so its payload begins on
 * that boundary, which is exactly what the archive-alignment check measures.
 */
function buildZip(entries) {
  const blocks = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const method = entry.compress ? 8 : 0;
    const payload = entry.compress ? deflateRawSync(entry.data) : entry.data;
    const padTo = entry.alignBytes ?? 1;
    const extraLength = padTo > 1 ? (padTo - ((offset + 30 + name.length) % padTo)) % padTo : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    // This gate never asserts checksums, so they stay zero.
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(extraLength, 28);

    blocks.push(local, name, Buffer.alloc(extraLength), payload);
    centrals.push({ name, method, compressed: payload.length, uncompressed: entry.data.length, offset });
    offset += local.length + name.length + extraLength + payload.length;
  }

  const centralStart = offset;
  for (const central of centrals) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(central.method, 10);
    header.writeUInt32LE(central.compressed, 20);
    header.writeUInt32LE(central.uncompressed, 24);
    header.writeUInt16LE(central.name.length, 28);
    header.writeUInt32LE(central.offset, 42);
    blocks.push(header, central.name);
    offset += header.length + central.name.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length, 8);
  end.writeUInt16LE(centrals.length, 10);
  end.writeUInt32LE(offset - centralStart, 12);
  end.writeUInt32LE(centralStart, 16);
  blocks.push(end);

  return Buffer.concat(blocks);
}

// ---------------------------------------------------------------------------
// Synthetic ELF writer
// ---------------------------------------------------------------------------

function buildElf({ pageAlign }) {
  const header = Buffer.alloc(64);
  header.writeUInt8(0x7f, 0);
  header.write('ELF', 1, 'ascii');
  header.writeUInt8(2, 4); // ELFCLASS64
  header.writeUInt8(1, 5); // little endian
  header.writeBigUInt64LE(64n, 0x20); // e_phoff
  header.writeUInt16LE(56, 0x36); // e_phentsize
  header.writeUInt16LE(1, 0x38); // e_phnum

  const programHeader = Buffer.alloc(56);
  programHeader.writeUInt32LE(1, 0); // PT_LOAD
  programHeader.writeBigUInt64LE(BigInt(pageAlign), 48); // p_align

  return Buffer.concat([header, programHeader]);
}

// ---------------------------------------------------------------------------
// Synthetic binary-AXML writer
// ---------------------------------------------------------------------------

const ATTR_MIN_SDK = 0x0101020c;
const ATTR_TARGET_SDK = 0x01010270;
const ATTR_COMPILE_SDK = 0x01010572;

/**
 * Writes the same shape aapt2 emits: identity on <manifest> with
 * compileSdkVersion, and the min/target levels on <uses-sdk>, with attribute
 * names resolved through the resource-map chunk.
 */
function buildAxml({ package: packageName, versionName, versionCode, minSdk, targetSdk, compileSdk }) {
  // Attribute and element names carry resource ids; plain values are zero.
  const pool = [
    { value: 'versionCode', resId: 0 },
    { value: 'versionName', resId: 0 },
    { value: 'package', resId: 0 },
    { value: 'compileSdkVersion', resId: ATTR_COMPILE_SDK },
    { value: 'minSdkVersion', resId: ATTR_MIN_SDK },
    { value: 'targetSdkVersion', resId: ATTR_TARGET_SDK },
    { value: 'manifest', resId: 0 },
    { value: 'uses-sdk', resId: 0 },
  ];
  const index = (value) => {
    const found = pool.findIndex((entry) => entry.value === value);
    if (found >= 0) return found;
    pool.push({ value, resId: 0 });
    return pool.length - 1;
  };

  // Every pool position is resolved BEFORE encoding: appending a string after
  // the offsets were written would silently corrupt the pool.
  const name = {
    versionCode: index('versionCode'),
    versionName: index('versionName'),
    package: index('package'),
    compileSdkVersion: index('compileSdkVersion'),
    minSdkVersion: index('minSdkVersion'),
    targetSdkVersion: index('targetSdkVersion'),
    manifest: index('manifest'),
    usesSdk: index('uses-sdk'),
    packageValue: packageName === undefined ? -1 : index(packageName),
    versionNameValue: versionName === undefined ? -1 : index(versionName),
  };

  const strings = pool.map((entry) => entry.value);
  const resourceIds = pool.map((entry) => entry.resId);

  const encodedStrings = strings.map((value) => {
    const body = Buffer.from(`${value}\0`, 'utf16le');
    const length = Buffer.alloc(2);
    length.writeUInt16LE(value.length, 0);
    return Buffer.concat([length, body]);
  });
  const offsets = encodedStrings.map((_, position) =>
    encodedStrings.slice(0, position).reduce((total, item) => total + item.length, 0));

  const stringPool = chunk(0x0001, Buffer.concat([
    uint32(strings.length), uint32(0), uint32(0),
    uint32(28 + strings.length * 4), uint32(0),
    ...offsets.map(uint32),
    ...encodedStrings,
  ]));

  const resourceMap = chunk(0x0180, Buffer.concat(resourceIds.map(uint32)));

  // An omitted level is omitted from the manifest entirely — the way a build
  // that forgot `targetSdkVersion` in its Gradle configuration really looks.
  const manifestAttributes = [
    versionCode === undefined ? null : intAttribute(name.versionCode, versionCode),
    versionName === undefined ? null : stringAttribute(name.versionName, name.versionNameValue),
    compileSdk === undefined ? null : intAttribute(name.compileSdkVersion, compileSdk),
    packageName === undefined ? null : stringAttribute(name.package, name.packageValue),
  ].filter(Boolean);
  const usesSdkAttributes = [
    minSdk === undefined ? null : intAttribute(name.minSdkVersion, minSdk),
    targetSdk === undefined ? null : intAttribute(name.targetSdkVersion, targetSdk),
  ].filter(Boolean);

  const manifest = startElement(name.manifest, manifestAttributes);
  const usesSdk = startElement(name.usesSdk, usesSdkAttributes);

  const body = Buffer.concat([stringPool, resourceMap, manifest, usesSdk]);
  const header = Buffer.alloc(8);
  header.writeUInt16LE(0x0003, 0);
  header.writeUInt16LE(8, 2);
  header.writeUInt32LE(8 + body.length, 4);
  return Buffer.concat([header, body]);
}

function chunk(type, body) {
  const header = Buffer.alloc(8);
  header.writeUInt16LE(type, 0);
  header.writeUInt16LE(type === 0x0001 ? 28 : 8, 2);
  header.writeUInt32LE(header.length + body.length, 4);
  return Buffer.concat([header, body]);
}

function startElement(name, attributes) {
  // 16 bytes of node header + 20 bytes of attribute description = the 36 bytes
  // `attributeStart: 20` points the reader at.
  const header = Buffer.alloc(36);
  header.writeUInt16LE(0x0102, 0);
  header.writeUInt16LE(16, 2);
  header.writeUInt32LE(36 + attributes.length * 20, 4);
  header.writeUInt32LE(1, 8); // line number
  header.writeUInt32LE(0xffffffff, 12); // no comment
  header.writeUInt32LE(0xffffffff, 16); // no namespace
  header.writeUInt32LE(name, 20); // element name: a string index
  header.writeUInt16LE(20, 24); // attributeStart
  header.writeUInt16LE(20, 26); // attributeSize
  header.writeUInt16LE(attributes.length, 28); // attributeCount
  return Buffer.concat([header, ...attributes]);
}

function intAttribute(nameIndex, value) {
  const attribute = Buffer.alloc(20);
  attribute.writeUInt32LE(0xffffffff, 0);
  attribute.writeUInt32LE(nameIndex, 4);
  attribute.writeInt32LE(-1, 8); // no raw string value
  attribute.writeUInt16LE(8, 12); // ResValue size
  attribute.writeUInt8(0x10, 15); // TYPE_INT_DEC
  attribute.writeUInt32LE(value, 16);
  return attribute;
}

function stringAttribute(nameIndex, valueIndex) {
  const attribute = Buffer.alloc(20);
  attribute.writeUInt32LE(0xffffffff, 0);
  attribute.writeUInt32LE(nameIndex, 4);
  attribute.writeInt32LE(valueIndex, 8);
  attribute.writeUInt16LE(8, 12);
  attribute.writeUInt8(0x03, 15); // TYPE_STRING
  attribute.writeUInt32LE(valueIndex, 16);
  return attribute;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

function indexOf(values, value) {
  const index = values.indexOf(value);
  if (index < 0) throw new Error(`fixture string "${value}" was not declared`);
  return index;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HEALTHY_MANIFEST = {
  package: 'dev.isw.rivermindpoker',
  versionName: '1.1.0',
  versionCode: 5,
  minSdk: 24,
  targetSdk: 36,
  compileSdk: 36,
};

function healthyAxml() {
  return buildAxml(HEALTHY_MANIFEST);
}

function apkEntries({ arm64Page = SIXTEEN_KB, manifest = null, libAlign = SIXTEEN_KB } = {}) {
  return [
    { name: 'AndroidManifest.xml', data: manifest ?? healthyAxml(), compress: true },
    { name: 'lib/arm64-v8a/libappmodules.so', data: buildElf({ pageAlign: arm64Page }), alignBytes: libAlign },
    { name: 'lib/x86_64/libappmodules.so', data: buildElf({ pageAlign: SIXTEEN_KB }), alignBytes: libAlign },
    { name: 'lib/armeabi-v7a/libappmodules.so', data: buildElf({ pageAlign: 4096 }), alignBytes: 4096 },
  ];
}

function apkBuffer(options) {
  return buildZip(apkEntries(options));
}

function inspect(buffer, fileName) {
  return inspectArtifact(buffer, { fileName, expectedTargetApi: REQUIRED_TARGET_API });
}

function check(result, name) {
  return result.checks.find((candidate) => candidate.name === name);
}

describe('android artifact inspection', () => {
  it('reads identity and SDK levels the way aapt2 reports them', () => {
    const result = inspect(apkBuffer(), 'app.apk');

    expect(result.manifest).toEqual({
      package: 'dev.isw.rivermindpoker',
      versionName: '1.1.0',
      versionCode: 5,
      minSdkVersion: 24,
      targetSdkVersion: 36,
      compileSdkVersion: 36,
    });
    expect(check(result, 'target API level').passed).toBe(true);
  });

  it('fails before the fix: a 4 KB arm64 build is rejected', () => {
    // Fail-before pair for the test below: identical fixture, one page value.
    const before = inspect(apkBuffer({ arm64Page: 4096 }), 'app.apk');
    expect(check(before, '64-bit native library page alignment').passed).toBe(false);
    expect(before.passed).toBe(false);
    expect(before.underAligned.map((lib) => lib.name)).toEqual(['lib/arm64-v8a/libappmodules.so']);
  });

  it('passes after the fix: 64-bit ABIs declaring 16 KB pages are accepted', () => {
    const after = inspect(apkBuffer({ arm64Page: SIXTEEN_KB }), 'app.apk');
    expect(check(after, '64-bit native library page alignment').passed).toBe(true);
    expect(after.underAligned).toEqual([]);
  });

  it('treats a 32-bit ABI declaring 4 KB pages as informational, not a failure', () => {
    const result = inspect(apkBuffer(), 'app.apk');
    expect(result.byAbi['armeabi-v7a'].minPageBytes).toBe(4096);
    expect(result.informational.join(' ')).toContain('armeabi-v7a');
    expect(result.passed).toBe(true);
  });

  it('fails closed when an APK manifest omits the target API level', () => {
    const manifest = buildAxml({
      ...HEALTHY_MANIFEST,
      targetSdk: undefined,
    });
    const result = inspect(apkBuffer({ manifest }), 'app.apk');

    expect(result.manifest.targetSdkVersion).toBeNull();
    expect(check(result, 'target API level').passed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('leaves the target API blocked for an AAB but still rejects a 4 KB arm64 library', () => {
    const passing = inspect(apkBuffer(), 'app.aab');
    expect(check(passing, 'target API level').passed).toBeNull();
    expect(passing.blockedOn).toContain('target API level');

    const rejected = inspect(apkBuffer({ arm64Page: 4096 }), 'app.aab');
    expect(check(rejected, '64-bit native library page alignment').passed).toBe(false);
    expect(rejected.passed).toBe(false);
  });

  it('reports an uncompressed 64-bit library that does not start on a page boundary', () => {
    const result = inspect(apkBuffer({ libAlign: 512 }), 'app.apk');

    expect(check(result, 'uncompressed library zip alignment').passed).toBe(false);
    expect(result.misalignedInZip.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  it('rejects an artifact that is not a readable ZIP instead of reporting compliance', () => {
    expect(() => inspect(Buffer.from('not a zip at all'), 'app.apk')).toThrow(/ZIP/);
  });
});

describe('ELF page alignment', () => {
  it('reads the largest PT_LOAD alignment', () => {
    expect(elfMaxPageAlignment(buildElf({ pageAlign: SIXTEEN_KB }))).toBe(SIXTEEN_KB);
    expect(elfMaxPageAlignment(buildElf({ pageAlign: 4096 }))).toBe(4096);
  });

  it('refuses to guess about a non-ELF buffer', () => {
    expect(() => elfMaxPageAlignment(Buffer.alloc(64))).toThrow(/ELF/);
  });

  it('parses the manifest of a hand-written AXML buffer', () => {
    expect(parseAndroidManifestXml(healthyAxml()).targetSdkVersion).toBe(36);
  });
});
