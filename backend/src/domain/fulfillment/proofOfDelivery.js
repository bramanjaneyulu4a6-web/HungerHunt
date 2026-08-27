/* What HungerHunt keeps as proof that a package left the warehouse and reached
 * the hostel — that is, who the storeroom handed it to at the door.
 *
 * The policy records the receiver's name and callback number, plus the staff
 * account that recorded the handoff and when.
 * The authenticated actor and the timestamp are the parts that carry weight —
 * they come from the session and the clock, not from whoever is typing — and
 * the note is only there to say which caretaker at the hostel it was.
 *
 * This is no longer the end of the package's life. The student taking it from
 * the caretaker is a separate step, proved by the student's own purchase code
 * rather than by anything typed here, and recorded on the order as COLLECTED.
 * Which is why this note is now written by the warehouse: the person handing a
 * package over names who they handed it to, and the person receiving it does
 * not get to name themselves.
 *
 * Photographs, signatures, identity-document images or numbers, addresses and
 * free-form contact details are not collected. The phone number has its own
 * validated field so it cannot be hidden inside the receiver name. */

export const RECEIVER_MIN_LENGTH = 2;
export const RECEIVER_MAX_LENGTH = 60;
export const RECEIVER_PHONE_LENGTH = 10;

/* Six or more digits in a row is how an admission number, an ID card, an Aadhaar
   fragment or a phone number arrives in a box meant for a name. Room and floor
   numbers are shorter than that, so "Asha, room 214" still passes. */
const IDENTIFIER_RUN = /\d{6,}/;

// An address or a contact handle, for the same reason.
const CONTACT_MARKER = /[@]|https?:\/\//i;

export const proofOfDeliveryProblem = (receivedBy) => {
  const value = String(receivedBy ?? '').trim();

  if (value.length < RECEIVER_MIN_LENGTH) {
    return 'Record who at the hostel took the package — the caretaker who signed for it.';
  }

  if (value.length > RECEIVER_MAX_LENGTH) {
    return `Keep the receiver note to ${RECEIVER_MAX_LENGTH} characters.`;
  }

  if (IDENTIFIER_RUN.test(value)) {
    return 'Enter the receiver name only here. Use the separate phone number field for contact details.';
  }

  if (CONTACT_MARKER.test(value)) {
    return 'Record a name only. Do not enter contact details.';
  }

  return null;
};

export const normalizeReceiverPhone = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};

export const receiverPhoneProblem = (value) => {
  const input = String(value ?? '').trim();
  const phone = normalizeReceiverPhone(input);

  if (!input) return 'Enter the receiver phone number.';
  if (/[^\d+\s()-]/.test(input) || phone.length !== RECEIVER_PHONE_LENGTH) {
    return `Enter a valid ${RECEIVER_PHONE_LENGTH}-digit phone number.`;
  }

  return null;
};

export const buildProofOfDelivery = ({ receivedBy, receiverPhone, recordedBy, recordedAt }) => ({
  receivedBy: String(receivedBy).trim(),
  receiverPhone: normalizeReceiverPhone(receiverPhone),
  recordedBy,
  recordedAt,
});
