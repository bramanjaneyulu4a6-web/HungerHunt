import Student from "../models/Student.js";

/* While a parent has let the room caretaker accept orders, the caretaker is
   the one who answers them. The parent can still see every request but not
   act on it — two people editing and paying for the same basket from two apps
   is how an order gets charged for something neither of them agreed to. To
   take it back, the parent turns the switch off. */
export const CARETAKER_HOLDS_MESSAGE =
  "The room caretaker is reviewing this order. Contact them for any changes, " +
  "or turn off “Let the caretaker accept orders” to review and edit it yourself.";

export const caretakerHoldsApproval = (studentId) =>
  Student.exists({
    _id: studentId,
    requiresParentApproval: true,
    caretakerMayApprove: true,
  });
