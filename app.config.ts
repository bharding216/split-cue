import type { ExpoConfig, ConfigContext } from 'expo/config';

const VARIANT = process.env.APP_VARIANT; // 'development' | 'preview' | undefined (production)
const IS_DEV = VARIANT === 'development';
const IS_PREVIEW = VARIANT === 'preview';
const BUNDLE_ID = IS_DEV
  ? 'com.toddly.runningintervals.dev'
  : IS_PREVIEW
    ? 'com.toddly.runningintervals.preview'
    : 'com.toddly.runningintervals';
// Preview reuses the production App Group (the preview-specific one can't be created in Apple)
const APP_GROUP = IS_DEV
  ? 'group.com.toddly.runningintervals.dev'
  : 'group.com.toddly.runningintervals';

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
  version: '1.8.0',
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
    package: BUNDLE_ID,
    googleServicesFile: GOOGLE_SERVICES_FILE,
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
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
        isAndroidBackgroundLocationEnabled: true,
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
          ? { googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY }
          : {}),
      },
    ],
    [
      'expo-widgets',
      {
        bundleIdentifier: `${BUNDLE_ID}.widgets`,
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
                bundleIdentifier: `${BUNDLE_ID}.widgets`,
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
