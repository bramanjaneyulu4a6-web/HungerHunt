import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// Local testing should never lock a developer out. Keep this tied to the exact
// development environment so an unset, misspelled, staging, or production
// NODE_ENV continues to receive the normal brute-force protection.
export const skipAuthLimitsInDevelopment = () =>
  process.env.NODE_ENV === "development";

/* Sign-in traffic, throttled by IP because it runs before any token exists —
   there is no account to key on yet. That makes it the one limiter where a
   school's worth of parents share a single bucket, which is fine for staff on
   site and wrong for ~200 families let in on the same day: on school WiFi, or
   behind a mobile carrier's NAT, they arrive as one address.

   Sized in parents rather than requests, because signing in costs TWO of them
   — /login-step to find out how the account is reached, then /login — so the
   ceiling is always halved before it reaches anybody. Thirty is fifteen
   parents; the old ten was five, and a sixth got told to come back in a
   quarter of an hour.

   The window shrank as the ceiling rose, which matters more than the ceiling:
   whoever does hit it is trying again in five minutes instead of fifteen, and
   is still trying rather than deciding the site is broken.

   Still nowhere near enough to guess a password. Thirty attempts per five
   minutes against a bcrypt hash is not an attack, it is a rounding error —
   the control survives the widening intact. */
export const AUTH_WINDOW_MS = 5 * 60 * 1000;
export const AUTH_MAX = 30;

/* Published so the arithmetic above is checkable rather than asserted. Raising
   AUTH_MAX without halving it would overstate how many families actually fit. */
export const PARENTS_PER_SHARED_ADDRESS = Math.floor(AUTH_MAX / 2);

export const authLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: AUTH_MAX,
  skip: skipAuthLimitsInDevelopment,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});

/* Asking for a reset link is NOT sign-in traffic and must not ride the ceiling
   above. Every call that finds a real account sends an email on the project's
   Gmail credentials, and that account has a daily cap measured in hundreds.
   At thirty per five minutes one address could spend the whole day's quota in
   an afternoon — at which point nobody can reset a password, which is a worse
   failure than the one the widening above fixes.

   So this keeps the old, deliberately stingy budget. Nothing about a launch
   makes a parent need more than a few reset emails, and the cost of being
   wrong here is borne by every other parent. */
export const passwordResetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: skipAuthLimitsInDevelopment,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});

/* The kiosk's front door. It takes an admission number and no secret, which
   makes it the one route the roll could be walked from outside — and what it
   returns is a name and a wallet balance. The money stays behind the purchase
   code at checkout; this is what keeps enumeration slow enough to show up in
   the logs before it finishes.

   Thirty a minute: several kiosks sharing one school NAT at break time, each
   with a queue, and a student mistyping a digit or two. */
export const kioskSessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  skip: skipAuthLimitsInDevelopment,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please wait a moment and try again." },
});

// Student lookup from the kiosk: generous enough for a busy counter,
// tight enough to make bulk scraping impractical.
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many searches. Please slow down." },
});

/* The limiters below key by parent account, not IP: they are mounted after
   protectParent, so a parent id is always present, and a school's worth of
   parents behind one NAT must never share a bucket on the routes their money
   moves through, or the one that ends their account. The IP fallback exists
   only for safety if a limiter is ever mounted before the auth gate. */
const parentKeyGenerator = (req) =>
  (req.parent?.id ? `parent:${req.parent.id}` : ipKeyGenerator(req.ip));

/* Creating a payment intent writes a DB row AND registers an order with
   PhonePe, on the merchant's credentials. Unlimited, a buggy or hostile
   client could hammer PhonePe until it throttles the account — at which
   point settlement itself (poll, webhook-settle, sweep all use that same
   API) breaks for every parent, not just the noisy one.

   Twenty per fifteen minutes: a real parent starts a handful of payments in
   a sitting — an order, a top-up or three across children, a retry after a
   fumbled UPI PIN. Twenty is several times that; a client that exceeds it
   is misbehaving, and cutting it off protects everyone else's settlement. */
export const paymentCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: parentKeyGenerator,
  skip: skipAuthLimitsInDevelopment,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many payment attempts. Please wait a few minutes and try again." },
});

/* Every read of an unfinished intent makes the backend call PhonePe's status
   API server-to-server — polling IS the recovery path, so this must never
   throttle a legitimate parent mid-payment. The app polls every 3 seconds
   for up to 5 minutes: 20 a minute from one surface, 40 if the in-app card
   and the return page ever poll the same payment at once. 120 a minute is
   triple that worst case — only a loop gone wrong can reach it. */
export const paymentStatusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: parentKeyGenerator,
  skip: skipAuthLimitsInDevelopment,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many status checks. Please wait a moment and try again." },
});

/* Deleting an account asks for the account password, which makes the route
   guessable the way the login route is: a stolen phone left unlocked must not
   be a cheap way to try passwords. authLimiter is the wrong tool for it even
   so. That one keys by IP, and this route sits behind protectParent — ten
   fumbled attempts by one parent would spend the bucket every other parent on
   the school's NAT signs in through, and a deletion nobody completed would
   lock the whole school out of the app for fifteen minutes.

   The account is what is being guessed at, so the account is the bucket. Same
   ceiling as authLimiter's, and generous for what it guards: a parent deleting
   their own account types one password, twice if they fumble it. */
export const accountDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: parentKeyGenerator,
  skip: skipAuthLimitsInDevelopment,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});

/* The public return-page read has no account to key on, and IP is the wrong
   bucket here: this route is reached from whatever browser a UPI app handed
   control to, so a school's parents on one mobile carrier NAT would share a
   bucket and throttle each other mid-payment. The intent id is the natural
   bucket instead — one payment's poll cannot starve another's — and it is
   safe to key on because the request still has to present that intent's
   token before anything happens. A caller varying the id to spread load is
   also varying the thing they must hold a 256-bit secret for.

   The IP fallback catches a malformed id, so a flood of junk paths shares
   one bucket rather than minting a store entry each.

   Same 120/minute as the authenticated poll, sized the same way: the page
   polls every 3 seconds, so only a loop gone wrong reaches it. */
const returnKeyGenerator = (req) =>
  (/^[a-f\d]{24}$/i.test(req.params.id || "") ? `intent:${req.params.id}` : ipKeyGenerator(req.ip));

export const paymentReturnLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: returnKeyGenerator,
  skip: skipAuthLimitsInDevelopment,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many status checks. Please wait a moment and try again." },
});
