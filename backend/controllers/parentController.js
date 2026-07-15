// // import Student from '../models/Student.js';
// // import Transaction from '../models/Transaction.js';
// // import bcrypt from 'bcryptjs';
// // import jwt from 'jsonwebtoken';
// // import Parent from '../models/Parent.js';
// // import crypto from "crypto";
// // import nodemailer from "nodemailer";




// // export const registerParent = async (req, res) => {
// //   // const { fatherName, parentPhoneNumber, password } = req.body;
// // const { fatherName, parentPhoneNumber, password, email } = req.body;
// //   try {
// //     const kids = await Student.find({ fatherName, parentPhoneNumber });

// //     if (kids.length === 0) {
// //       return res.status(400).json({ message: "No matching student found" });
// //     }

// //     const hashedPwd = await bcrypt.hash(password, 10);

// //     // CREATE PARENT (THIS WAS MISSING — MAIN BUG)
// //     const parent = await Parent.create({
// //       fatherName,
// //       phone: parentPhoneNumber,
// //       email,  
// //       password: hashedPwd,
// //       studentIds: kids.map(k => k._id)
// //     });

// //     // update students
// //     await Student.updateMany(
// //       { fatherName, parentPhoneNumber },
// //       { isParentRegistered: true, parentPassword: hashedPwd }
// //     );

// //     res.status(200).json({
// //       message: "Parent registered successfully",
// //       parent
// //     });

// //   } catch (error) {
// //     res.status(500).json({ error: error.message });
// //   }
// // };
// // // export const registerParent = async (req, res) => {
// // //   const { fatherName, parentPhoneNumber, password } = req.body;
// // //   try {
// // //     // Look up any kids that possess these exact records provided by the administrator
// // //     const kids = await Student.find({ fatherName, parentPhoneNumber });
// // //     if (kids.length === 0) {
// // //       return res.status(400).json({ message: 'Credentials do not match student information recorded by the school office.' });
// // //     }

// // //     const hashedPwd = await bcrypt.hash(password, 10);
    
// // //     // Set parent details across all match records (handles siblings automatically)
// // //     await Student.updateMany(
// // //       { fatherName, parentPhoneNumber },
// // //       { isParentRegistered: true, parentPassword: hashedPwd }
// // //     );

// // //     res.status(200).json({ message: 'Parent dashboard successfully established!' });
// // //   } catch (error) {
// // //     res.status(500).json({ error: error.message });
// // //   }
// // // };

// // export const loginParent = async (req, res) => {
// //   try {
// //     const { parentPhoneNumber, password } = req.body;

// //     // IMPORTANT: schema uses "phone"
// //     const parent = await Parent.findOne({ phone: parentPhoneNumber });

// //     if (!parent) {
// //       return res.status(401).json({ message: "Parent not found" });
// //     }

// //     const isMatch = await bcrypt.compare(password, parent.password);

// //     if (!isMatch) {
// //       return res.status(401).json({ message: "Invalid password" });
// //     }

// //     const token = jwt.sign(
// //       { id: parent._id, phone: parent.phone },
// //       process.env.JWT_SECRET,
// //       { expiresIn: "7d" }
// //     );

// //     res.json({ token, parent });

// //   } catch (error) {
// //     console.log("LOGIN ERROR:", error);
// //     res.status(500).json({ message: error.message });
// //   }
// // };
// // // export const loginParent = async (req, res) => {
// // //   const { parentPhoneNumber, password } = req.body;
// // //   try {
// // //     const studentCheck = await Student.findOne({ parentPhoneNumber });
// // //     if (!studentCheck || !studentCheck.isParentRegistered) {
// // //       return res.status(401).json({ message: 'No registered profile matching this number.' });
// // //     }

// // //     const correctPass = await bcrypt.compare(password, studentCheck.parentPassword);
// // //     if (!correctPass) return res.status(401).json({ message: 'Incorrect credentials.' });

// // //     const token = jwt.sign({ phone: parentPhoneNumber }, process.env.JWT_SECRET, { expiresIn: '30d' });
// // //     res.json({ token, parentPhoneNumber });
// // //   } catch (error) {
// // //     res.status(500).json({ error: error.message });
// // //   }
// // // };

// // export const getParentDashboardDetails = async (req, res) => {
// //   try {
// //     const children = await Student.find({ parentPhoneNumber: req.parentPhone }).select('-parentPassword');
// //     const childrenIds = children.map(child => child._id);
    
// //     const history = await Transaction.find({ studentId: { $in: childrenIds } })
// //       .populate('studentId', 'name')
// //       .sort({ createdAt: -1 });

// //     res.json({ children, history });
// //   } catch (error) {
// //     res.status(500).json({ error: error.message });
// //   }
// // };



// // // export const forgotPasswordParent = async (req, res) => {
// // //   try {
// // //     const { email } = req.body;

// // //     const parent = await Parent.findOne({ email });

// // //     if (!parent) {
// // //       return res.status(404).json({ message: "Email not found" });
// // //     }

// // //     const resetToken = crypto.randomBytes(32).toString("hex");

// // //     parent.resetPasswordToken = crypto
// // //       .createHash("sha256")
// // //       .update(resetToken)
// // //       .digest("hex");

// // //     parent.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

// // //     await parent.save();

// // //     const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

// // //     const transporter = nodemailer.createTransport({
// // //       service: "gmail",
// // //       auth: {
// // //         user: process.env.EMAIL_USER,
// // //         pass: process.env.EMAIL_PASS
// // //       }
// // //     });

// // //     await transporter.sendMail({
// // //       to: parent.email,
// // //       subject: "Password Reset",
// // //       html: `
// // //         <h2>Password Reset Request</h2>
// // //         <p>Click below link (valid for 15 minutes):</p>
// // //         <a href="${resetUrl}">${resetUrl}</a>
// // //       `
// // //     });

// // //     res.json({ message: "Reset link sent to email" });

// // //   } catch (error) {
// // //     res.status(500).json({ message: error.message });
// // //   }
// // // };

// // // ✅ STEP 1: SEND RESET LINK
// // export const forgotPassword = async (req, res) => {
// //   try {
// //     const { email } = req.body;

// //     const parent = await Parent.findOne({ email });
// //     if (!parent) {
// //       return res.status(404).json({ message: "No account with this email" });
// //     }

// //     // Create token
// //     const resetToken = crypto.randomBytes(32).toString("hex");

// //     parent.resetPasswordToken = crypto
// //       .createHash("sha256")
// //       .update(resetToken)
// //       .digest("hex");

// //     parent.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 min

// //     await parent.save();

// //     const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

// //     // Email setup
// //     const transporter = nodemailer.createTransport({
// //       service: "gmail",
// //       auth: {
// //         user: process.env.EMAIL_USER,
// //         pass: process.env.EMAIL_PASS
// //       }
// //     });

// //     await transporter.sendMail({
// //       to: parent.email,
// //       subject: "Password Reset Link",
// //       html: `
// //         <h3>Password Reset Request</h3>
// //         <p>Click below link to reset password (valid for 10 min)</p>
// //         <a href="${resetUrl}">${resetUrl}</a>
// //       `
// //     });

// //     res.json({ message: "Reset link sent to email" });
// //   } catch (err) {
// //     res.status(500).json({ message: err.message });
// //   }
// // };



// // // ✅ STEP 2: RESET PASSWORD
// // export const resetPassword = async (req, res) => {
// //   try {
// //     const { token } = req.params;
// //     const { password } = req.body;

// //     const hashedToken = crypto
// //       .createHash("sha256")
// //       .update(token)
// //       .digest("hex");

// //     const parent = await Parent.findOne({
// //       resetPasswordToken: hashedToken,
// //       resetPasswordExpire: { $gt: Date.now() }
// //     });

// //     if (!parent) {
// //       return res.status(400).json({ message: "Token invalid or expired" });
// //     }

// //     parent.password = await bcrypt.hash(password, 10);
// //     parent.resetPasswordToken = undefined;
// //     parent.resetPasswordExpire = undefined;

// //     await parent.save();

// //     res.json({ message: "Password reset successful" });
// //   } catch (err) {
// //     res.status(500).json({ message: err.message });
// //   }
// // };














// import Student from "../models/Student.js";
// import Transaction from "../models/Transaction.js";
// import Parent from "../models/Parent.js";

// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import crypto from "crypto";
// import nodemailer from "nodemailer";

// /* =========================================================
//    ✅ REGISTER PARENT
// ========================================================= */
// export const registerParent = async (req, res) => {
//   try {
//     const { fatherName, parentPhoneNumber, password, email } = req.body;

//     if (!email) {
//       return res.status(400).json({ message: "Email is required" });
//     }

//     // Find students linked to parent
//     const kids = await Student.find({
//       fatherName,
//       parentPhoneNumber,
//     });

//     if (kids.length === 0) {
//       return res.status(400).json({
//         message: "No matching student found",
//       });
//     }

//     // Check if parent already exists
//     const existingParent = await Parent.findOne({
//       phone: parentPhoneNumber,
//     });

//     if (existingParent) {
//       return res.status(400).json({
//         message: "Parent already registered",
//       });
//     }

//     const hashedPwd = await bcrypt.hash(password, 10);

//     const parent = await Parent.create({
//       fatherName,
//       phone: parentPhoneNumber,
//       email: email.toLowerCase().trim(),
//       password: hashedPwd,
//       studentIds: kids.map((k) => k._id),
//     });

//     // Only update flag (NO password stored in Student)
//     await Student.updateMany(
//       { fatherName, parentPhoneNumber },
//       { isParentRegistered: true }
//     );

//     res.status(201).json({
//       message: "Parent registered successfully",
//       parent: {
//         id: parent._id,
//         fatherName: parent.fatherName,
//         phone: parent.phone,
//         email: parent.email,
//       },
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

// /* =========================================================
//    ✅ LOGIN PARENT
// ========================================================= */
// export const loginParent = async (req, res) => {
//   try {
//     const { parentPhoneNumber, password } = req.body;

//     const parent = await Parent.findOne({ phone: parentPhoneNumber });

//     if (!parent) {
//       return res.status(401).json({ message: "Parent not found" });
//     }

//     const isMatch = await bcrypt.compare(password, parent.password);

//     if (!isMatch) {
//       return res.status(401).json({ message: "Invalid password" });
//     }

//     const token = jwt.sign(
//       { id: parent._id, phone: parent.phone },
//       process.env.JWT_SECRET,
//       { expiresIn: "7d" }
//     );

//     const safeParent = {
//       id: parent._id,
//       fatherName: parent.fatherName,
//       phone: parent.phone,
//       email: parent.email,
//       studentIds: parent.studentIds,
//     };

//     res.json({ token, parent: safeParent });
//   } catch (error) {
//     console.log("LOGIN ERROR:", error);
//     res.status(500).json({ message: error.message });
//   }
// };

// /* =========================================================
//    ✅ DASHBOARD
// ========================================================= */
// export const getParentDashboardDetails = async (req, res) => {
//   try {
//     const children = await Student.find({
//       parentPhoneNumber: req.parentPhone,
//     }).select("-parentPassword");

//     const childrenIds = children.map((c) => c._id);

//     const history = await Transaction.find({
//       studentId: { $in: childrenIds },
//     })
//       .populate("studentId", "name")
//       .sort({ createdAt: -1 });

//     res.json({ children, history });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

// /* =========================================================
//    ✅ FORGOT PASSWORD
// ========================================================= */
// export const forgotPassword = async (req, res) => {
//   try {
//     const { email } = req.body;

//     if (!email) {
//       return res.status(400).json({ message: "Email required" });
//     }

//     const cleanEmail = email.toLowerCase().trim();

//     const parent = await Parent.findOne({ email: cleanEmail });

//     if (!parent) {
//       return res.status(404).json({ message: "No account with this email" });
//     }

//     const resetToken = crypto.randomBytes(32).toString("hex");

//     parent.resetPasswordToken = crypto
//       .createHash("sha256")
//       .update(resetToken)
//       .digest("hex");

//     parent.resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000);

//     await parent.save();

//     const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

//     const transporter = nodemailer.createTransport({
//       service: "gmail",
//       auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS,
//       },
//     });

//     await transporter.sendMail({
//       to: parent.email,
//       subject: "Password Reset Link",
//       html: `
//         <h3>Password Reset Request</h3>
//         <p>This link is valid for 10 minutes:</p>
//         <a href="${resetUrl}">${resetUrl}</a>
//       `,
//     });

//     res.json({ message: "Reset link sent to email" });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };

// /* =========================================================
//    ✅ RESET PASSWORD
// ========================================================= */
// export const resetPassword = async (req, res) => {
//   try {
//     const { token } = req.params;
//     const { password } = req.body;

//     const hashedToken = crypto
//       .createHash("sha256")
//       .update(token)
//       .digest("hex");

//     const parent = await Parent.findOne({
//       resetPasswordToken: hashedToken,
//       resetPasswordExpire: { $gt: Date.now() },
//     });

//     if (!parent) {
//       return res.status(400).json({
//         message: "Token invalid or expired",
//       });
//     }

//     parent.password = await bcrypt.hash(password, 10);
//     parent.resetPasswordToken = undefined;
//     parent.resetPasswordExpire = undefined;

//     await parent.save();

//     res.json({ message: "Password reset successful" });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };



// export const getChildDetails = async (req, res) => {
//   try {
//     const student = await Student.findById(req.params.id);

//     if (!student) {
//       return res.status(404).json({
//         message: "Student not found"
//       });
//     }

//     const bills = await Transaction.find({
//       studentId: req.params.id
//     }).sort({ createdAt: -1 });

//     res.json({
//       student,
//       bills,
//       recharges: student.rechargeHistory || []
//     });

//   } catch (error) {
//     console.error(error);

//     res.status(500).json({
//       message: error.message
//     });
//   }
// };




import Student from "../models/Student.js";
import Transaction from "../models/Transaction.js";
import Parent from "../models/Parent.js";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";

/* =========================================================
   ✅ REGISTER PARENT
========================================================= */
export const registerParent = async (req, res) => {
  try {
    const { fatherName, parentPhoneNumber, password, email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find students (initial linking step)
    const kids = await Student.find({
      fatherName,
      parentPhoneNumber,
    });

    if (kids.length === 0) {
      return res.status(400).json({
        message: "No matching student found",
      });
    }

    const existingParent = await Parent.findOne({
      phone: parentPhoneNumber,
    });

    if (existingParent) {
      return res.status(400).json({
        message: "Parent already registered",
      });
    }

    const hashedPwd = await bcrypt.hash(password, 10);

    await Parent.create({
      fatherName,
      phone: parentPhoneNumber,
      email: email.toLowerCase().trim(),
      password: hashedPwd,
      studentIds: kids.map((k) => k._id),
    });

    await Student.updateMany(
      { fatherName, parentPhoneNumber },
      { isParentRegistered: true }
    );

    res.status(201).json({
      message: "Parent registered successfully",
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/* =========================================================
   ✅ LOGIN PARENT
========================================================= */
export const loginParent = async (req, res) => {
  try {
    const { parentPhoneNumber, password } = req.body;

    const parent = await Parent.findOne({ phone: parentPhoneNumber });

    if (!parent) {
      return res.status(401).json({ message: "Parent not found" });
    }

    const isMatch = await bcrypt.compare(password, parent.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { id: parent._id, phone: parent.phone },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      parent: {
        id: parent._id,
        fatherName: parent.fatherName,
        phone: parent.phone,
        email: parent.email,
        studentIds: parent.studentIds,
      },
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================================================
   ✅ DASHBOARD (FIXED - IMPORTANT)
========================================================= */
export const getParentDashboardDetails = async (req, res) => {
  try {
    const parent = await Parent.findById(req.parent.id).populate("studentIds");

    if (!parent) {
      return res.status(404).json({ message: "Parent not found" });
    }

    const children = parent.studentIds; // ✅ ONLY LINKED STUDENTS

    const childrenIds = children.map((c) => c._id);

    const history = await Transaction.find({
      studentId: { $in: childrenIds },
    })
      .populate("studentId", "name")
      .sort({ createdAt: -1 });

    res.json({ children, history });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/* =========================================================
   ✅ FORGOT PASSWORD
========================================================= */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email required" });
    }

    const parent = await Parent.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!parent) {
      return res.status(404).json({ message: "No account with this email" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    parent.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    parent.resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000);

    await parent.save();

    const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      to: parent.email,
      subject: "Password Reset Link",
      html: `<a href="${resetUrl}">${resetUrl}</a>`,
    });

    res.json({ message: "Reset link sent to email" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   ✅ RESET PASSWORD
========================================================= */
export const resetPassword = async (req, res) => {
  try {
    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const parent = await Parent.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!parent) {
      return res.status(400).json({
        message: "Token invalid or expired",
      });
    }

    parent.password = await bcrypt.hash(req.body.password, 10);
    parent.resetPasswordToken = undefined;
    parent.resetPasswordExpire = undefined;

    await parent.save();

    res.json({ message: "Password reset successful" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   ✅ CHILD DETAILS
========================================================= */
export const getChildDetails = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const bills = await Transaction.find({
      studentId: req.params.id,
    }).sort({ createdAt: -1 });

    res.json({
  student,
  bills,
  recharges: student.rechargeHistory || [],
  hasPurchasePassword: !!student.purchasePassword,
});

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};






export const setPurchasePassword = async (req, res) => {
  try {
    const { studentId, password } = req.body;

    if (!password || password.length < 4) {
      return res.status(400).json({
        message: "Password must be at least 4 characters.",
      });
    }

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({
        message: "Student not found.",
      });
    }

    if (student.purchasePassword) {
      return res.status(400).json({
        message:
          "Purchase password already exists. Use Change Password.",
      });
    }

    student.purchasePassword = await bcrypt.hash(password, 10);

    await student.save();

    res.json({
      message: "Purchase password saved successfully.",
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};



/* =========================================================
   ✅ CHANGE PURCHASE PASSWORD
========================================================= */
export const changePurchasePassword = async (req, res) => {
  try {
    const { studentId, currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required.",
      });
    }

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({
        message: "Student not found.",
      });
    }

    if (!student.purchasePassword) {
      return res.status(400).json({
        message: "Purchase password has not been set yet.",
      });
    }

    const isMatch = await bcrypt.compare(
      currentPassword,
      student.purchasePassword
    );

    if (!isMatch) {
      return res.status(400).json({
        message: "Current password is incorrect.",
      });
    }

    student.purchasePassword = await bcrypt.hash(newPassword, 10);

    await student.save();

    res.json({
      message: "Purchase password changed successfully.",
    });

  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};


/* =========================================================
   ✅ RESET PURCHASE PASSWORD
========================================================= */
export const resetPurchasePassword = async (req, res) => {
  try {
    const { studentId, newPassword } = req.body;

    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({
        message: "Password must be at least 4 characters.",
      });
    }

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({
        message: "Student not found.",
      });
    }

    student.purchasePassword = await bcrypt.hash(newPassword, 10);

    await student.save();

    res.json({
      message: "Purchase password reset successfully.",
    });

  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};