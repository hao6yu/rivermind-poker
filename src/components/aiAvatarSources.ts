import type { ImageSourcePropType } from 'react-native';

import { type AiAvatarAssetKey, AI_AVATAR_ASSET_KEYS } from './aiAvatarIdentity';

/**
 * The authored AI persona assets, keyed by the canonical key list in
 * `aiAvatarIdentity.ts` (Record enforcement: a key without a file — or a file
 * without a key — fails typecheck). Kept in its own module so the PNG
 * `require`s never load in tests that mock this map.
 */
export const aiAvatarSources: Record<AiAvatarAssetKey, ImageSourcePropType> = {
  'mara-balanced': require('../../assets/ai-players/mara-balanced.png'),
  'theo-patient': require('../../assets/ai-players/theo-patient.png'),
  'nova-pressure': require('../../assets/ai-players/nova-pressure.png'),
  'june-sticky': require('../../assets/ai-players/june-sticky.png'),
  'sol-deceptive': require('../../assets/ai-players/sol-deceptive.png'),
  'kai-balanced': require('../../assets/ai-players/kai-balanced.png'),
  'iris-patient': require('../../assets/ai-players/iris-patient.png'),
  'dex-pressure': require('../../assets/ai-players/dex-pressure.png'),
  'lena-sticky': require('../../assets/ai-players/lena-sticky.png'),
  'amir-deceptive': require('../../assets/ai-players/amir-deceptive.png'),
  'rowan-balanced': require('../../assets/ai-players/rowan-balanced.png'),
  'priya-patient': require('../../assets/ai-players/priya-patient.png'),
  'zane-pressure': require('../../assets/ai-players/zane-pressure.png'),
  'aya-sticky': require('../../assets/ai-players/aya-sticky.png'),
  'victor-deceptive': require('../../assets/ai-players/victor-deceptive.png'),
  'vivian-sticky': require('../../assets/ai-players/vivian-sticky.png'),
  'mary-patient': require('../../assets/ai-players/mary-patient.png'),
  'bruce-pressure': require('../../assets/ai-players/bruce-pressure.png'),
  'lulu-patient': require('../../assets/ai-players/lulu-patient.png'),
  'steve-patient': require('../../assets/ai-players/steve-patient.png'),
  'yoyo-patient': require('../../assets/ai-players/yoyo-patient.png'),
  'hao-patient': require('../../assets/ai-players/hao-patient.png'),
  'uncle-tu-patient': require('../../assets/ai-players/uncle-tu-patient.png'),
  'gary-pressure': require('../../assets/ai-players/gary-pressure.png'),
  'mr-chi-sticky': require('../../assets/ai-players/mr-chi-sticky.png'),
  'auntie-chi-sticky': require('../../assets/ai-players/auntie-chi-sticky.png'),
  'zhou-pressure': require('../../assets/ai-players/zhou-pressure.png'),
};

export const AI_AVATAR_SOURCE_KEYS: readonly string[] = AI_AVATAR_ASSET_KEYS;
