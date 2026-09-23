/* The shop window: what the demonstration accounts are shown at the kiosk.
 *
 * A visitor driving the kiosk at an open day, a parent being walked through
 * the app, and a payment reviewer working through a checkout are all looking
 * at the till to judge it rather than to buy lunch. What serves them is a
 * small, photographed, tidy catalogue — not the whole shelf. So these accounts
 * get one category, Essentials, and only the products in it that have a
 * picture to show.
 *
 * Two rules, deliberately separate:
 *
 *   showroomStudent  whose screen this applies to
 *   showroomProduct  what survives on it
 *
 * Both are pure and synchronous. The account rule reads a student document the
 * caller has already loaded, and the two phone lists it consults are read from
 * the environment at call time — so switching a demo off needs no deploy and
 * no cache to expire.
 *
 * An allowlist, never a denylist. "Everything except Snacks and Drinks" would
 * silently admit any category added to the catalogue seed later; "Essentials
 * only" cannot.
 */
import { isTestAccountPhone } from '../config/paymentAccess.js';
import { isDemoParentPhone } from '../config/demoAccess.js';

// Matched by name because that is how categories are identified everywhere
// else that has to name one — frontend-admin/src/constants/units.js maps the
// same three names to their permitted units. Categories are sealed against the
// API (routes/stockGroupRoutes.js) and defined in scripts/data/catalogue.json,
// so the name is as stable a handle as an id and survives a re-seed.
export const SHOWROOM_CATEGORY = 'Essentials';

const named = (value) => String(value ?? '').trim().toLowerCase();

/* The three kinds of account that get the shop window, asked of a student
 * document rather than an id so the caller pays for one read and not three.
 * The document must have `demoAccount` and `parentPhoneNumber` selected; a
 * projection missing either reads as an ordinary student, which is the safe
 * way round — a real child seeing the whole shelf is the status quo, while a
 * real child losing it mid-purchase is a broken till.
 *
 *   demoAccount          the showroom student (DEMO01), records nothing
 *   DEMO_PARENT_PHONES   the showroom family, whose orders delete themselves
 *   PHONEPE_TEST_...     the payment reviewer's children, who really do buy
 *
 * The third is included on purpose: a reviewer judging the checkout is better
 * served by four photographed items than by the whole shelf. They keep every
 * other exemption they have — see utils/testAccount.js. */
export const showroomStudent = (student) => {
  if (!student) return false;

  return (
    student.demoAccount === true ||
    isDemoParentPhone(student.parentPhoneNumber) ||
    isTestAccountPhone(student.parentPhoneNumber)
  );
};

/* Essentials, and it must have a picture.
 *
 * The picture is the whole point rather than a nicety: the kiosk falls back to
 * a "No Image" placeholder tile (KioskBilling.jsx), and a wall of those is
 * exactly what a room full of visitors should not be looking at. An image is a
 * Cloudinary URL in a single string field that defaults to empty, so having
 * one is simply the string being non-blank. */
export const showroomProduct = (product) =>
  Boolean(product) &&
  named(product.stockGroup?.name) === named(SHOWROOM_CATEGORY) &&
  String(product.image ?? '').trim() !== '';
