import type { ExpoConfig, ConfigContext } from 'expo/config';

const VARIANT = process.env.APP_VARIANT; // 'development' | 'preview' | undefined (production)
const IS_DEV = VARIANT === 'development';
const IS_PREVIEW = VARIANT === 'preview';
const BUNDLE_ID = IS_DEV
  ? 'com.toddly.runningintervals.dev'
  : IS_PREVIEW
    ? 'com.toddly.runningintervals.preview'
    : 'com.toddly.runningintervals';
// Production Android package must match the Google Play Console listing
const ANDROID_PACKAGE = IS_DEV || IS_PREVIEW ? BUNDLE_ID : 'com.surmount.pacecue';
// Dev/preview are signed by the Toddly team and production by the Surmount team; App Groups are
// team-owned, so preview keeps Toddly's group (a preview-specific one can't be created in Apple)
const APP_GROUP = IS_DEV
  ? 'group.com.toddly.runningintervals.dev'
  : IS_PREVIEW
    ? 'group.com.toddly.runningintervals'
    : 'group.com.surmount.pacecue';
// Toddly still owns the production `.widgets` App ID, so the Surmount-signed production widget uses `.widget`
const WIDGET_BUNDLE_ID = IS_DEV || IS_PREVIEW ? `${BUNDLE_ID}.widgets` : `${BUNDLE_ID}.widget`;

const APP_NAME = IS_DEV
  ? 'SplitCue Dev Build'
  : IS_PREVIEW
    ? 'SplitCue Preview Build'
    : 'SplitCue';

const GOOGLE_SERVICES_FILE = IS_DEV
  ? './google-services.development.json'
  : IS_PREVIEW
    ? './google-services.preview.json'
    : './google-services.production.json';

export default ({ config }: ConfigContext): ExpoConfig => ({
  name: APP_NAME,
  slug: 'pace-cue',
  version: '1.9.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0A0A0F',
  scheme: IS_DEV ? 'pacecue-dev' : IS_PREVIEW ? 'pacecue-preview' : 'pacecue',
  ios: {
    supportsTablet: false,
    bundleIdentifier: BUNDLE_ID,
    usesAppleSignIn: true,
    entitlements: {
      'com.apple.security.application-groups': [APP_GROUP],
      'com.apple.developer.associated-domains': ['applinks:splitcue.app'],
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1', '0A2A.1', '3B52.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'],
        },
      ],
    },
    infoPlist: {
      UIBackgroundModes: ['audio', 'location'],
      NSMicrophoneUsageDescription: 'SplitCue uses the microphone for voice commands to your AI coach.',
      NSLocationWhenInUseUsageDescription:
        'SplitCue uses your location to calculate your running pace in real time.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'SplitCue uses your location in the background to track pace while your screen is locked.',
      NSSupportsLiveActivities: true,
      NSSupportsLiveActivitiesFrequentUpdates: true,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#050505',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    package: ANDROID_PACKAGE,
    googleServicesFile: GOOGLE_SERVICES_FILE,
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'splitcue.app', pathPrefix: '/w/' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Allow SplitCue to track your running pace in the background.',
        locationWhenInUsePermission:
          'Allow SplitCue to track your running pace.',
        isIosBackgroundLocationEnabled: true,
        // The workout session foreground service tracks with the screen locked
        // under "While using the app", so Android never needs background location.
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        backgroundColor: '#000000',
        dark: {
          image: './assets/splash-icon.png',
          backgroundColor: '#000000',
        },
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission: 'SplitCue uses the microphone for voice commands to your AI coach.',
        enableBackgroundPlayback: true,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#4ADE80',
        defaultChannel: 'announcements',
      },
    ],
    [
      'react-native-maps',
      {
        ...(process.env.GOOGLE_MAPS_API_KEY
          ? { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY }
          : {}),
      },
    ],
    [
      'expo-widgets',
      {
        bundleIdentifier: WIDGET_BUNDLE_ID,
        groupIdentifier: APP_GROUP,
      },
    ],
    '@react-native-community/datetimepicker',
    'expo-localization',
  ],
  updates: {
    url: 'https://u.expo.dev/15ab975c-acf7-482d-8059-edfe8218ef58',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appVariant: VARIANT ?? 'production',
    router: {},
    eas: {
      build: {
        experimental: {
          ios: {
            appExtensions: [
              {
                targetName: 'ExpoWidgetsTarget',
                bundleIdentifier: WIDGET_BUNDLE_ID,
                entitlements: {
                  'com.apple.security.application-groups': [APP_GROUP],
                },
              },
            ],
          },
        },
      },
      projectId: '15ab975c-acf7-482d-8059-edfe8218ef58',
    },
  },
});
