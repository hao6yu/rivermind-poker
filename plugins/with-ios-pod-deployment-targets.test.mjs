import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  MARKER,
  MINIMUM_TARGET,
  raisePodDeploymentTargets,
} = require('./with-ios-pod-deployment-targets.js');

const GENERATED_POST_INSTALL = [
  '  post_install do |installer|',
  '    react_native_post_install(',
  '      installer,',
  '      config[:reactNativePath],',
  '      :mac_catalyst_enabled => false,',
  '      :ccache_enabled => ccache_enabled?(podfile_properties),',
  '    )',
  '  end',
  'end',
  '',
].join('\n');

describe('with-ios-pod-deployment-targets', () => {
  it('raises pre-15.0 pod targets inside the generated post_install block', () => {
    const next = raisePodDeploymentTargets(GENERATED_POST_INSTALL);

    expect(next).toContain(MARKER);
    expect(next).toContain(`IPHONEOS_DEPLOYMENT_TARGET'] = '${MINIMUM_TARGET}'`);
    // The raise lands inside post_install, before the block closes.
    const markerIndex = next.indexOf(MARKER);
    const blockEndIndex = next.indexOf('  end\nend\n');
    expect(markerIndex).toBeGreaterThan(next.indexOf('post_install do |installer|'));
    expect(markerIndex).toBeLessThan(blockEndIndex);
    // The untouched template lines survive.
    expect(next).toContain('react_native_post_install(');
  });

  it('is idempotent', () => {
    const once = raisePodDeploymentTargets(GENERATED_POST_INSTALL);
    expect(raisePodDeploymentTargets(once)).toBe(once);
  });

  it('leaves a Podfile without a post_install block unchanged', () => {
    const podfile = "platform :ios, '15.1'\n";
    expect(raisePodDeploymentTargets(podfile)).toBe(podfile);
  });
});
