/**
 * Read-only inspection of a signed Android APK or AAB.
 *
 * Google Play enforces two things a React Native export cannot influence from
 * `app.json`: the target API level of the binary it accepts, and 16 KB memory
 * page compatibility for native code. Both are properties of the artifact, not
 * of the build configuration, so they have to be asserted against the file
 * that is actually uploaded.
 *
 * This module parses those properties directly — ZIP, binary AndroidManifest
 * (AXML), and ELF program headers — so the gate runs on any machine with Node,
 * without an Android SDK, aapt2, or a emulator. Every parser fails loudly: an
 * unreadable artifact must never be reported as compliant.
 */

import { inflateRawSync } from 'node:zlib';

/**
 * Attribute ids verified against this project's own signed build rather than
 * guessed from documentation: the same APK reports minSdk 24, targetSdk 36,
 * and compileSdk 36 through `aapt2 dump badging`. An id that does not match
 * leaves its field null, and a null target is a failure, never a pass.
 */
export const ATTR_MIN_SDK_VERSION = 0x0101020c;
export const ATTR_TARGET_SDK_VERSION = 0x01010270;
export const ATTR_COMPILE_SDK_VERSION = 0x01010572;

const TYPE_INT_DEC = 0x10;
const CHUNK_STRING_POOL = 0x0001;
const CHUNK_XML = 0x0003;
const CHUNK_RESOURCE_MAP = 0x0180;
const CHUNK_XML_START_ELEMENT = 0x0102;
const UTF8_FLAG = 0x100;

const PAGE_SIZE_16KB = 16384;
const PT_LOAD = 1;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/**
 * Minimal ZIP reader: central directory plus per-entry byte extraction.
 * Only the entries this gate needs are inflated.
 */
export function readZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) throw new Error('Not a ZIP container: no end-of-central-directory record.');

  const entries = [];
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (buffer.readUInt16LE(eocd + 10) === 0xffff || cdOffset + cdSize > buffer.length) {
    throw new Error('ZIP uses ZIP64 or is truncated; this gate cannot read it. Split the artifact or use the APK Play generates.');
  }
  let cursor = cdOffset;
  const cdEnd = cdOffset + cdSize;

  while (cursor < cdEnd) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) break;
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + fileNameLength);
    entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    cursor += 46 + fileNameLength + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
  }

  return {
    entries,
    /** Offset of the entry's first payload byte, used for zip page alignment. */
    dataOffsetOf(entry) {
      const local = entry.localHeaderOffset;
      if (buffer.readUInt32LE(local) !== LOCAL_SIGNATURE) {
        throw new Error(`ZIP local header missing for "${entry.name}".`);
      }
      return local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    },
  };
}

function findEndOfCentralDirectory(buffer) {
  // EOCD is the last 22..65557 bytes; the comment is at most 65535 bytes long.
  const start = Math.max(0, buffer.length - 66_000);
  for (let i = buffer.length - 22; i >= start; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

/** ZIP reader that also inflates deflated entries (an APK's manifest and .so files usually are). */
export function readArtifactSync(buffer) {
  const zip = readZipEntries(buffer);
  zip.readEntry = (entry) => {
    const local = entry.localHeaderOffset;
    if (buffer.readUInt32LE(local) !== LOCAL_SIGNATURE) {
      throw new Error(`ZIP local header missing for "${entry.name}".`);
    }
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(dataStart, dataStart + entry.compressedSize);
    if (entry.compressionMethod === 0) return raw;
    if (entry.compressionMethod === 8) return inflateRawSync(raw);
    throw new Error(`ZIP entry "${entry.name}" uses unsupported compression ${entry.compressionMethod}.`);
  };
  return zip;
}

/**
 * Parse the binary AndroidManifest.xml of an APK.
 * Returns the SDK levels and identity Play reads from the manifest.
 */
export function parseAndroidManifestXml(buffer) {
  if (buffer.readUInt16LE(0) !== CHUNK_XML) {
    throw new Error('AndroidManifest.xml is not binary AXML (expectedResXML type 0x0003).');
  }

  const strings = [];
  let resourceMap = [];
  let cursor = 8; // past the ResXMLHeader

  const readString = (index) => strings[index];

  const result = {
    minSdkVersion: null,
    targetSdkVersion: null,
    compileSdkVersion: null,
    package: null,
    versionName: null,
    versionCode: null,
  };

  while (cursor + 8 <= buffer.length) {
    const type = buffer.readUInt16LE(cursor);
    const size = buffer.readUInt32LE(cursor + 4);
    if (size < 8 || cursor + size > buffer.length) {
      throw new Error(`AXML chunk 0x${type.toString(16)} has an implausible size.`);
    }

    if (type === CHUNK_STRING_POOL) {
      const count = buffer.readUInt32LE(cursor + 8);
      const flags = buffer.readUInt32LE(cursor + 16);
      const stringsStart = cursor + buffer.readUInt32LE(cursor + 20);
      for (let i = 0; i < count; i += 1) {
        // String offsets are relative to stringsStart, not to the chunk header.
        const offset = stringsStart + buffer.readUInt32LE(cursor + 28 + i * 4);
        strings.push(decodeStringPoolString(buffer, offset, (flags & UTF8_FLAG) !== 0));
      }
    } else if (type === CHUNK_RESOURCE_MAP) {
      const count = (size - 8) / 4;
      resourceMap = Array.from({ length: count }, (_, i) => buffer.readUInt32LE(cursor + 8 + i * 4));
    } else if (type === CHUNK_XML_START_ELEMENT) {
      // ResXMLNode is 16 bytes; ResXMLTree_attrExt then declares where its
      // 20-byte attributes begin (`attributeStart` is relative to that struct).
      const attributeStart = buffer.readUInt16LE(cursor + 24);
      const attrCount = buffer.readUInt16LE(cursor + 28);
      const attrStart = cursor + 16 + attributeStart;
      const elementName = readString(buffer.readUInt32LE(cursor + 20));
      // aapt2 puts the identity on <manifest> and the SDK levels on <uses-sdk>,
      // with compileSdkVersion back on <manifest>; scan both the same way.
      if (elementName === 'manifest' || elementName === 'uses-sdk') {
        for (let i = 0; i < attrCount; i += 1) {
          const at = attrStart + i * 20;
          const nameIdx = buffer.readUInt32LE(at + 4);
          const rawValue = buffer.readInt32LE(at + 8);
          const dataType = buffer.readUInt8(at + 15);
          const typedValue = buffer.readUInt32LE(at + 16);
          const key = readString(nameIdx);
          if (dataType === TYPE_INT_DEC) {
            const resId = resourceMap[nameIdx] >>> 0;
            if (resId === ATTR_MIN_SDK_VERSION) result.minSdkVersion = typedValue;
            else if (resId === ATTR_TARGET_SDK_VERSION) result.targetSdkVersion = typedValue;
            else if (resId === ATTR_COMPILE_SDK_VERSION) result.compileSdkVersion = typedValue;
            else if (key === 'versionCode') result.versionCode = typedValue;
          } else if (rawValue >= 0) {
            if (key === 'package') result.package = readString(rawValue);
            else if (key === 'versionName') result.versionName = readString(rawValue);
          }
        }
      }
    }

    cursor += size;
  }

  return result;
}

function decodeStringPoolString(buffer, offset, isUtf8) {
  if (isUtf8) {
    // UTF-8 pool: char-length (1-2 bytes), then byte-length (1-2 bytes), then bytes.
    let cursor = offset;
    cursor += buffer.readUInt8(cursor) & 0x80 ? 2 : 1;
    const byteLenHigh = buffer.readUInt8(cursor);
    const byteLen = byteLenHigh & 0x80
      ? ((byteLenHigh & 0x7f) << 8) | buffer.readUInt8(cursor + 1)
      : byteLenHigh;
    cursor += byteLenHigh & 0x80 ? 2 : 1;
    return buffer.toString('utf8', cursor, cursor + byteLen);
  }
  // UTF-16 pool: one uint16 length (extended into two uint16s when high bit set), then units.
  const charHigh = buffer.readUInt16LE(offset);
  const extended = (charHigh & 0x8000) !== 0;
  const charLen = extended
    ? ((charHigh & 0x7fff) << 16) | buffer.readUInt16LE(offset + 2)
    : charHigh;
  const start = offset + (extended ? 4 : 2);
  return buffer.toString('utf16le', start, start + charLen * 2);
}

/**
 * Largest PT_LOAD alignment declared by a native library. Android requires
 * 16 KB page alignment; a library built for 4 KB pages reports 4096 and is the
 * failure mode Play rejects.
 */
export function elfMaxPageAlignment(buffer) {
  if (buffer.length < 64 || buffer.readUInt8(0) !== 0x7f || buffer.toString('ascii', 1, 4) !== 'ELF') {
    throw new Error('Not an ELF object.');
  }
  const is64 = buffer.readUInt8(4) === 2;
  const littleEndian = buffer.readUInt8(5) === 1;
  if (!littleEndian) throw new Error('Big-endian ELF is not supported by this gate.');

  const phoff = is64 ? Number(buffer.readBigUInt64LE(0x20)) : buffer.readUInt32LE(0x1c);
  const phentsize = buffer.readUInt16LE(is64 ? 0x36 : 0x2a);
  const phnum = buffer.readUInt16LE(is64 ? 0x38 : 0x2c);
  if (phentsize < (is64 ? 56 : 32) || phnum === 0 || phoff + phentsize * phnum > buffer.length) {
    throw new Error('ELF program header table is unreadable.');
  }

  let maxAlign = 0;
  for (let i = 0; i < phnum; i += 1) {
    const at = phoff + i * phentsize;
    if (buffer.readUInt32LE(at) !== PT_LOAD) continue;
    const align = is64
      ? Number(buffer.readBigUInt64LE(at + 48))
      : buffer.readUInt32LE(at + 28);
    if (align > maxAlign) maxAlign = align;
  }
  if (maxAlign === 0) throw new Error('ELF declares no PT_LOAD segment.');
  return maxAlign;
}

/**
 * Full gate for one artifact. `expectedTargetApi` is the Google Play minimum
 * for new apps and updates; `requiredPageBytes` is the 16 KB page requirement.
 */
export function inspectArtifact(buffer, {
  fileName = 'artifact',
  expectedTargetApi,
  requiredPageBytes = PAGE_SIZE_16KB,
} = {}) {
  const isAab = fileName.endsWith('.aab');
  const zip = readArtifactSync(buffer);
  const nativeEntries = zip.entries.filter((entry) => abiOf(entry.name) !== null);
  const findings = [];

  const libs = nativeEntries.map((entry) => {
    let pageBytes = null;
    let zipAligned = null;
    try {
      pageBytes = elfMaxPageAlignment(zip.readEntry(entry));
    } catch (error) {
      findings.push(`${entry.name}: ${error.message}`);
    }
    if (entry.compressionMethod === 0) {
      zipAligned = zip.dataOffsetOf(entry) % requiredPageBytes === 0;
    }
    return { name: entry.name, abi: abiOf(entry.name), pageBytes, zipAligned };
  });

  // 16 KB devices are arm64; a 32-bit library is never loaded on one, so a
  // 4 KB 32-bit ABI is informational while a 4 KB 64-bit ABI is a rejection.
  const byAbi = new Map();
  for (const lib of libs) {
    const group = byAbi.get(lib.abi) ?? { count: 0, minPageBytes: Infinity, zipMisaligned: 0 };
    group.count += 1;
    if (lib.pageBytes !== null) group.minPageBytes = Math.min(group.minPageBytes, lib.pageBytes);
    if (lib.zipAligned === false) group.zipMisaligned += 1;
    byAbi.set(lib.abi, group);
  }

  const requiredAbis = [...byAbi.keys()].filter((abi) => SIXTY_FOUR_BIT_ABIS.has(abi));
  const underAligned = libs.filter(
    (lib) => requiredAbis.includes(lib.abi) && lib.pageBytes !== null && lib.pageBytes < requiredPageBytes,
  );
  const misalignedInZip = libs.filter((lib) => requiredAbis.includes(lib.abi) && lib.zipAligned === false);
  const stored64Count = libs.filter((lib) => requiredAbis.includes(lib.abi) && lib.zipAligned !== null).length;
  const informational = [...byAbi.entries()]
    .filter(([abi]) => !SIXTY_FOUR_BIT_ABIS.has(abi))
    .map(([abi, group]) => `${abi} min page ${group.minPageBytes} (not loadable on a 16 KB device; informational)`);

  let manifest = null;
  if (!isAab) {
    const manifestEntry = zip.entries.find((entry) => entry.name === 'AndroidManifest.xml');
    if (!manifestEntry) throw new Error('APK contains no AndroidManifest.xml.');
    manifest = parseAndroidManifestXml(zip.readEntry(manifestEntry));
  }

  const targetSdkVersion = manifest?.targetSdkVersion ?? null;
  const checks = [
    {
      name: 'target API level',
      detail: targetSdkVersion === null
        ? `unreadable from an AAB: its manifest is an aapt2 protobuf. Prove targetSdk from an APK built from the same commit (the Android preview universal APK shares app.json's derived SDK levels), then run this gate on the AAB for page alignment.`
        : `targetSdk ${targetSdkVersion}, required >= ${expectedTargetApi}`,
      // An APK manifest is always readable, so failing to read it is a failure.
      // Only an AAB may leave this asserted elsewhere.
      passed: targetSdkVersion === null ? (isAab ? null : false) : targetSdkVersion >= expectedTargetApi,
    },
    {
      name: '64-bit native library page alignment',
      detail: requiredAbis.length === 0
        ? 'no arm64-v8a or x86_64 libraries found in this artifact'
        : requiredAbis
          .map((abi) => `${abi} min page ${formatPage(byAbi.get(abi).minPageBytes)} (${byAbi.get(abi).count} libs)`)
          .join(', ')
        + `, required >= ${requiredPageBytes}`,
      passed: requiredAbis.length === 0 ? null : underAligned.length === 0,
    },
    {
      name: 'uncompressed library zip alignment',
      detail: stored64Count === 0
        ? 'no uncompressed 64-bit libraries in this archive (Play aligns them when it generates APKs)'
        : misalignedInZip.length === 0
          ? `${stored64Count} uncompressed 64-bit libraries all start on a page boundary`
          : `${misalignedInZip.length} of ${stored64Count} uncompressed 64-bit libraries are not page-aligned`,
      passed: stored64Count === 0 ? null : misalignedInZip.length === 0,
    },
  ];

  return {
    fileName,
    kind: isAab ? 'aab' : 'apk',
    manifest,
    libraryCount: libs.length,
    byAbi: Object.fromEntries(byAbi),
    underAligned,
    misalignedInZip,
    informational,
    findings,
    checks,
    passed: checks.every((check) => check.passed !== false),
    blockedOn: checks.filter((check) => check.passed === null).map((check) => check.name),
  };
}

const SIXTY_FOUR_BIT_ABIS = new Set(['arm64-v8a', 'x86_64']);

function abiOf(entryName) {
  const match = /(?:^|\/)lib\/([^/]+)\/[^/]*\.so$/.exec(entryName);
  return match ? match[1] : null;
}

function formatPage(pageBytes) {
  return Number.isFinite(pageBytes) ? pageBytes : 'unreadable';
}
