import mongoose from 'mongoose';

import Parent from '../models/Parent.js';
import Student from '../models/Student.js';

const validId = (value) => mongoose.Types.ObjectId.isValid(value);

/* `isParentRegistered` means "some active parent still lists me". It is a
   cached answer, so every transition that changes which parents are active has
   to put it back — the office archiving a parent, the office restoring one,
   and now a parent deleting their own account. Left stale, the roster claims a
   family the till can no longer reach.

   Lived in adminUserController until the parent app grew a route that needed
   it too. */
export const syncStudentRegistration = async (ids) => {
  for (const id of [...new Set(ids.map(String))].filter(validId)) {
    const linked = await Parent.exists({ active: { $ne: false }, studentIds: id });
    await Student.updateOne({ _id: id }, { $set: { isParentRegistered: Boolean(linked) } });
  }
};
