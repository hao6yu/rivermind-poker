import * as Application from 'expo-application';
import Constants from 'expo-constants';

import { createReleaseMetadata } from './releaseMetadataModel';

export const releaseMetadata = createReleaseMetadata(Constants.expoConfig, {
  applicationId: Application.applicationId,
  nativeApplicationVersion: Application.nativeApplicationVersion,
  nativeBuildVersion: Application.nativeBuildVersion,
});
