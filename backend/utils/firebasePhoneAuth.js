import { getAuth } from 'firebase-admin/auth';

/* Firebase owns the OTP challenge. The parent app sends only the signed ID
 * token it receives after the SMS code is proved; this adapter keeps the
 * Admin SDK behind a mockable boundary for the parent route tests. */
const verifyPhoneIdToken = (idToken) => getAuth().verifyIdToken(idToken, true);

export default { verifyPhoneIdToken };
