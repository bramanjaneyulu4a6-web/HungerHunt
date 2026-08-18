import Parent from "../models/Parent.js";

// A logged-in parent may only act on students linked to their own account.
// Returns the studentId when allowed; sends the response and returns null when not.
export const assertOwnsStudent = async (req, res, studentId) => {
  if (!studentId) {
    res.status(400).json({ message: "studentId is required" });
    return null;
  }

  const parent = await Parent.findById(req.parent.id).select("studentIds");

  if (!parent) {
    res.status(401).json({ message: "Parent account not found" });
    return null;
  }

  const owns = parent.studentIds.some((id) => id.toString() === studentId.toString());

  if (!owns) {
    res.status(403).json({ message: "Not authorized for this student" });
    return null;
  }

  return studentId;
};
