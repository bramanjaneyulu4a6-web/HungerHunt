/* What HungerHunt keeps as proof that a package left the warehouse and reached
 * the hostel — that is, who the storeroom handed it to at the door.
 *
 * The policy is deliberately the smallest thing that answers "who took it?":
 * a short receiver note, plus the staff account that recorded it and when.
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
 * Explicitly not collected: photographs, signatures, identity-document images
 * or numbers, phone numbers, addresses, or anything else about the receiver.
 * A delivery is an operational fact, and none of that is needed to record it.
 * The validations below are what keeps the free-text box from quietly becoming
 * the place such data is stored anyway. */

export const RECEIVER_MIN_LENGTH = 2;
export const RECEIVER_MAX_LENGTH = 60;

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
    return 'Record a name only. Do not enter ID, admission, or phone numbers.';
  }

  if (CONTACT_MARKER.test(value)) {
    return 'Record a name only. Do not enter contact details.';
  }

  return null;
};

export const buildProofOfDelivery = ({ receivedBy, recordedBy, recordedAt }) => ({
  receivedBy: String(receivedBy).trim(),
  recordedBy,
  recordedAt,
});
