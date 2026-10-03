import Admin from '../models/Admin.js';

export const CARETAKER_APP_ROLES = Object.freeze(['caretaker', 'warden']);

export const isCaretakerAppRole = (role) => CARETAKER_APP_ROLES.includes(role);

export const uniqueObjectIds = (values) => [...new Set(
  (Array.isArray(values) ? values : []).filter(Boolean).map(String)
)];

export const loadAssignedCaretakers = async (caretakerIds) => {
  const ids = uniqueObjectIds(caretakerIds);
  if (!ids.length) return [];
  return Admin.find({
    _id: { $in: ids },
    role: 'caretaker',
    active: { $ne: false },
  })
    .select('name phone email roomIds active role')
    .lean();
};

/* Resolve room access from the current caretaker rows on every request. A
 * warden therefore follows room reassignments immediately and never keeps a
 * stale copied room list. `complete` is false when an assigned caretaker was
 * archived, deleted, or changed to another role; sign-in and request gates
 * refuse that broken assignment until a super admin repairs it. */
export const caretakerAppScope = async (account) => {
  const role = account?.role || 'admin';
  if (role === 'caretaker') {
    const roomIds = uniqueObjectIds(account.roomIds);
    return { role, roomIds, caretakers: [], complete: roomIds.length > 0 };
  }
  if (role !== 'warden') {
    return { role, roomIds: [], caretakers: [], complete: false };
  }

  const assignedIds = uniqueObjectIds(account.caretakerIds);
  const caretakers = await loadAssignedCaretakers(assignedIds);
  const roomIds = uniqueObjectIds(caretakers.flatMap((caretaker) => caretaker.roomIds || []));
  return {
    role,
    roomIds,
    caretakers,
    complete: assignedIds.length > 0 && caretakers.length === assignedIds.length && roomIds.length > 0,
  };
};
