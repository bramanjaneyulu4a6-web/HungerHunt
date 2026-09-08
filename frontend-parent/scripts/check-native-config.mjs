import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(resolve(root, relative), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const capacitor = JSON.parse(read('capacitor.config.json'));
const android = read('android/app/build.gradle');
const androidRoot = read('android/build.gradle');
const variables = read('android/variables.gradle');
const xcode = read('ios/App/App.xcodeproj/project.pbxproj');
const infoPlist = read('ios/App/App/Info.plist');
const paymentService = read('src/services/payments.js');
const phonePePackage = read('plugins/phonepe-payment/Package.swift');
const phonePeAndroid = read(
  'plugins/phonepe-payment/android/src/main/java/com/hungerhunt/phonepe/PhonePePaymentPlugin.java'
);
const phonePeAndroidGradle = read('plugins/phonepe-payment/android/build.gradle');
const phonePeIos = read(
  'plugins/phonepe-payment/ios/Sources/PhonePePaymentPlugin/PhonePePaymentPlugin.swift'
);
const requireCredentials = process.argv.includes('--credentials');
const errors = [];

const match = (value, expression, description) => {
  const result = value.match(expression)?.[1];
  if (!result) errors.push(`Could not read ${description}.`);
  return result;
};

const androidVersionCode = Number(match(android, /versionCode\s+(\d+)/, 'Android versionCode'));
const androidVersion = match(android, /versionName\s+"([^"]+)"/, 'Android versionName');
const iosBuild = Number(match(xcode, /CURRENT_PROJECT_VERSION = (\d+);/, 'iOS build number'));
const iosVersion = match(xcode, /MARKETING_VERSION = ([^;]+);/, 'iOS marketing version');
const androidId = match(android, /applicationId\s+"([^"]+)"/, 'Android application id');
const iosId = match(xcode, /PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/, 'iOS bundle id');
const targetSdk = Number(match(variables, /targetSdkVersion\s*=\s*(\d+)/, 'Android target SDK'));

if (capacitor.appId !== androidId || capacitor.appId !== iosId) {
  errors.push(`Native ids differ: Capacitor=${capacitor.appId}, Android=${androidId}, iOS=${iosId}.`);
}
if (packageJson.version !== androidVersion || packageJson.version !== iosVersion) {
  errors.push(`Versions differ: package=${packageJson.version}, Android=${androidVersion}, iOS=${iosVersion}.`);
}
if (!Number.isInteger(androidVersionCode) || androidVersionCode < 1) {
  errors.push('Android versionCode must be a positive integer.');
}
if (!Number.isInteger(iosBuild) || iosBuild < 1) {
  errors.push('iOS CURRENT_PROJECT_VERSION must be a positive integer.');
}
if (targetSdk < 36) errors.push(`Android target SDK ${targetSdk} is below the 2026 Play requirement (36).`);

for (const relative of ['ios/App/App/PrivacyInfo.xcprivacy', 'ios/App/App/App.entitlements']) {
  if (!existsSync(resolve(root, relative))) errors.push(`Missing ${relative}.`);
}
if (!xcode.includes('PrivacyInfo.xcprivacy in Resources')) {
  errors.push('PrivacyInfo.xcprivacy is not included in the iOS target resources.');
}
if (!xcode.includes('FirebaseMessaging in Frameworks')) {
  errors.push('FirebaseMessaging is not linked to the iOS app target.');
}

if (capacitor.android?.allowMixedContent === true) {
  errors.push('android.allowMixedContent must not be enabled in a release WebView.');
}

if (packageJson.dependencies?.['@hungerhunt/phonepe-payment'] !== 'file:plugins/phonepe-payment') {
  errors.push('The local PhonePe Capacitor plugin dependency is missing.');
}
if (!androidRoot.includes('phonepe-intentsdk-android')) {
  errors.push('The official PhonePe Android Maven repository is missing.');
}
if (!phonePeAndroidGradle.includes('IntentSDK:5.3.2') || !phonePeAndroid.includes('SDKType.IONIC')) {
  errors.push('The Android bridge must use PhonePe IntentSDK 5.3.2 and identify itself as Ionic.');
}
if (!phonePeAndroid.includes('openUpiIntent') || !phonePeIos.includes('openUpiIntent')) {
  errors.push('The native bridge must expose the custom UPI intent launcher on Android and iOS.');
}
if (!phonePePackage.includes('PhonePe/PhonePePayment.git') || !phonePePackage.includes('exact: "5.4.0"')) {
  errors.push('The iOS bridge must pin the official PhonePePayment 5.4.0 package.');
}
if (!/\{\s*_,\s*state\s+in/.test(phonePeIos)) {
  errors.push('The iOS PhonePe completion must accept both SDK callback arguments.');
}
if (!phonePeIos.includes('appId: appId') || !paymentService.includes('appId: sdk.appId')) {
  errors.push('The PhonePe-issued iOS app id is not passed through to the native SDK.');
}
for (const scheme of ['hungerhuntpay', 'ppemerchantsdkv1', 'ppemerchantsdkv5', 'gpay', 'paytmmp']) {
  if (!infoPlist.includes(`<string>${scheme}</string>`)) {
    errors.push(`The iOS PhonePe scheme ${scheme} is missing from Info.plist.`);
  }
}

if (requireCredentials) {
  for (const relative of ['android/app/google-services.json', 'ios/App/App/GoogleService-Info.plist']) {
    if (!existsSync(resolve(root, relative))) errors.push(`Missing release credential file: ${relative}.`);
  }

  const hasKeystoreFile = existsSync(resolve(root, 'android/keystore.properties'));
  const signingEnvironment = [
    'ANDROID_KEYSTORE_PATH',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ];
  if (!hasKeystoreFile && signingEnvironment.some((name) => !process.env[name]?.trim())) {
    errors.push('Android release signing is not configured (android/keystore.properties or all ANDROID_KEY_* variables).');
  }
}

if (errors.length) {
  console.error(`Native release configuration has ${errors.length} problem${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Native configuration ready: ${capacitor.appId} ${packageJson.version} ` +
    `(Android ${androidVersionCode}, iOS ${iosBuild}, target API ${targetSdk}).`
  );
}
