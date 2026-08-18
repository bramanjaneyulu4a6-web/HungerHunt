import Parent from '../models/Parent.js';
import { readWallet } from '../utils/walletAccount.js';

const noStore = (res) => res.set('Cache-Control', 'no-store');

/* All three clients receive the same live wallet shape. Authentication stays
 * role-specific at the route; this controller only resolves which student
 * that authenticated identity is allowed to request. */
export const getWalletBalance = async (req, res) => {
  try {
    const studentId = req.student?.id || req.params.id;

    if (req.parent) {
      const ownsStudent = await Parent.exists({ _id: req.parent.id, studentIds: studentId });
      if (!ownsStudent) {
        return res.status(404).json({ message: 'Student not found' });
      }
    }

    const wallet = await readWallet(studentId);
    if (!wallet) return res.status(404).json({ message: 'Student not found' });

    noStore(res).json({ wallet });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
