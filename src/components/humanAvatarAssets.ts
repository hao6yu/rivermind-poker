import type { ImageSourcePropType } from 'react-native';

import type { HumanAvatarId } from '../domain/playerProfile';

/**
 * Product-authored human avatars, keyed by the bounded avatar id.
 *
 * Kept in its own module so the PNG asset `require`s do not force every test
 * that renders human identity through `HumanAvatar` to load binary images. A
 * rendered-avatar test mocks this map; `HumanAvatar` consumes it unchanged.
 */
export const humanAvatarSources: Record<HumanAvatarId, ImageSourcePropType> = {
  'human-ash': require('../../assets/human-avatars/human-ash.png'),
  'human-bay': require('../../assets/human-avatars/human-bay.png'),
  'human-cove': require('../../assets/human-avatars/human-cove.png'),
  'human-dawn': require('../../assets/human-avatars/human-dawn.png'),
  'human-ember': require('../../assets/human-avatars/human-ember.png'),
  'human-fern': require('../../assets/human-avatars/human-fern.png'),
};
