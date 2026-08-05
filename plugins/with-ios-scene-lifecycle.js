const fs = require("node:fs");
const path = require("node:path");

const {
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");

const SCENE_DELEGATE_FILENAME = "SceneDelegate.swift";
const APP_DELEGATE_MARKER =
  "    // React Native starts when the application scene connects in SceneDelegate.";

const APP_DELEGATE_STARTUP = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`;

const SCENE_DELEGATE_SOURCE = `import React
import UIKit

/// Owns RiverMind's single UIKit scene. iOS 27 requires apps built with the
/// latest SDK to use the scene-based lifecycle.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? {
    UIApplication.shared.delegate as? AppDelegate
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let appDelegate,
      let factory = appDelegate.reactNativeFactory
    else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions(from: connectionOptions)
    )
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let context = URLContexts.first, let appDelegate else {
      return
    }

    var options: [UIApplication.OpenURLOptionsKey: Any] = [
      .openInPlace: context.options.openInPlace,
    ]
    if let sourceApplication = context.options.sourceApplication {
      options[.sourceApplication] = sourceApplication
    }
    if let annotation = context.options.annotation {
      options[.annotation] = annotation
    }

    _ = appDelegate.application(
      UIApplication.shared,
      open: context.url,
      options: options
    )
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate else {
      return
    }

    _ = appDelegate.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in }
    )
  }

  private func launchOptions(
    from connectionOptions: UIScene.ConnectionOptions
  ) -> [UIApplication.LaunchOptionsKey: Any] {
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]

    if let context = connectionOptions.urlContexts.first {
      launchOptions[.url] = context.url
      if let sourceApplication = context.options.sourceApplication {
        launchOptions[.sourceApplication] = sourceApplication
      }
      if let annotation = context.options.annotation {
        launchOptions[.annotation] = annotation
      }
    }

    if let userActivity = connectionOptions.userActivities.first {
      launchOptions[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": userActivity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": userActivity,
      ]
    }

    if let shortcutItem = connectionOptions.shortcutItem {
      launchOptions[.shortcutItem] = shortcutItem
    }

    if let notificationResponse = connectionOptions.notificationResponse {
      launchOptions[.remoteNotification] =
        notificationResponse.notification.request.content.userInfo
    }

    return launchOptions
  }
}
`;

function withSceneInfoPlist(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return config;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== "swift") {
      throw new Error("RiverMind's iOS scene plugin requires a Swift AppDelegate.");
    }

    const contents = config.modResults.contents;
    if (contents.includes(APP_DELEGATE_MARKER)) {
      return config;
    }
    if (!contents.includes(APP_DELEGATE_STARTUP)) {
      throw new Error(
        "Could not find Expo's React Native startup block in AppDelegate.swift. " +
          "Review the scene lifecycle plugin after upgrading Expo."
      );
    }

    config.modResults.contents = contents.replace(
      APP_DELEGATE_STARTUP,
      APP_DELEGATE_MARKER
    );
    return config;
  });
}

function withSceneDelegateFile(config) {
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectName = IOSConfig.XcodeUtils.getProjectName(
        config.modRequest.projectRoot
      );
      const sceneDelegatePath = path.join(
        config.modRequest.platformProjectRoot,
        projectName,
        SCENE_DELEGATE_FILENAME
      );
      await fs.promises.writeFile(sceneDelegatePath, SCENE_DELEGATE_SOURCE);
      return config;
    },
  ]);

  return withXcodeProject(config, (config) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(
      config.modRequest.projectRoot
    );
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      // Expo's main Xcode group is virtual (it has no path), so source file
      // references are relative to ios/, just like RiverMind/AppDelegate.swift.
      filepath: path.join(projectName, SCENE_DELEGATE_FILENAME),
      groupName: projectName,
      project: config.modResults,
    });
    return config;
  });
}

module.exports = function withIosSceneLifecycle(config) {
  config = withSceneInfoPlist(config);
  config = withSceneAppDelegate(config);
  config = withSceneDelegateFile(config);
  return config;
};
