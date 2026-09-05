import { Capacitor } from '@capacitor/core';

import { firebaseConfig, firebaseConfigured, getFirebaseApp } from '../firebase';

let webConfirmation;
let webVerifier;
let nativeVerificationId;
let nativeRequestStarted = false;

const internationalPhone = (phone) => `+91${phone}`;

const requireWebFirebase = () => {
  if (!firebaseConfigured || !firebaseConfig.authDomain) {
    throw new Error('Phone verification is not configured for this app.');
  }
};

const removeHandles = async (handles) => {
  await Promise.all(handles.map((handle) => handle?.remove?.()));
};

const startNativeVerification = async (phone) => {
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

  return new Promise((resolve, reject) => {
    const handles = [];
    let settled = false;

    const finish = async (callback, value) => {
      if (settled) return;
      settled = true;
      await removeHandles(handles);
      callback(value);
    };

    (async () => {
      try {
        handles.push(await FirebaseAuthentication.addListener('phoneCodeSent', (event) => {
          nativeVerificationId = event.verificationId;
          finish(resolve, { automaticallyVerified: false });
        }));
        handles.push(await FirebaseAuthentication.addListener('phoneVerificationCompleted', async () => {
          try {
            const { token } = await FirebaseAuthentication.getIdToken({ forceRefresh: true });
            await finish(resolve, { automaticallyVerified: true, idToken: token });
          } catch (error) {
            await finish(reject, error);
          }
        }));
        handles.push(await FirebaseAuthentication.addListener('phoneVerificationFailed', (event) => {
          finish(reject, new Error(event.message || 'Could not send the verification code.'));
        }));

        const resendCode = nativeRequestStarted;
        nativeRequestStarted = true;
        await FirebaseAuthentication.signInWithPhoneNumber({
          phoneNumber: internationalPhone(phone),
          resendCode,
        });
      } catch (error) {
        await finish(reject, error);
      }
    })();
  });
};

const startWebVerification = async (phone, recaptchaButtonId) => {
  requireWebFirebase();
  const [{ getAuth, RecaptchaVerifier, signInWithPhoneNumber }, app] = await Promise.all([
    import('firebase/auth'),
    getFirebaseApp(),
  ]);
  const auth = getAuth(app);

  try {
    // On a resend the previous verifier is bound to a button that has since
    // unmounted (the send screen's), and clear() can throw over the missing
    // element. A fresh verifier is being made either way.
    webVerifier?.clear();
  } catch {
    // Nothing left to clear.
  }
  webVerifier = new RecaptchaVerifier(auth, recaptchaButtonId, { size: 'invisible' });
  webConfirmation = await signInWithPhoneNumber(auth, internationalPhone(phone), webVerifier);
  return { automaticallyVerified: false };
};

export const startPhoneVerification = (phone, recaptchaButtonId) => (
  Capacitor.isNativePlatform()
    ? startNativeVerification(phone)
    : startWebVerification(phone, recaptchaButtonId)
);

export const confirmPhoneVerification = async (verificationCode) => {
  if (Capacitor.isNativePlatform()) {
    if (!nativeVerificationId) throw new Error('Request a new verification code and try again.');
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    await FirebaseAuthentication.confirmVerificationCode({
      verificationId: nativeVerificationId,
      verificationCode,
    });
    const { token } = await FirebaseAuthentication.getIdToken({ forceRefresh: true });
    return token;
  }

  if (!webConfirmation) throw new Error('Request a new verification code and try again.');
  const result = await webConfirmation.confirm(verificationCode);
  return result.user.getIdToken(true);
};

/* Never throws. It runs after outcomes it must not be able to overturn — a
   password already created, a component already unmounting — so a cleanup
   hiccup here (clear() can throw once the button the verifier rendered into
   has unmounted) must never read as the flow failing. */
export const clearPhoneVerification = async () => {
  try {
    webVerifier?.clear();
  } catch {
    // The verifier's host element is gone; there is nothing left to clear.
  }
  webVerifier = undefined;
  webConfirmation = undefined;
  nativeVerificationId = undefined;
  nativeRequestStarted = false;

  try {
    if (Capacitor.isNativePlatform()) {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      await FirebaseAuthentication.signOut();
      return;
    }

    if (firebaseConfigured) {
      const [{ getAuth }, app] = await Promise.all([import('firebase/auth'), getFirebaseApp()]);
      await getAuth(app).signOut();
    }
  } catch {
    // The Hunger Hunt session is issued by our API. Firebase cleanup is best-effort.
  }
};
