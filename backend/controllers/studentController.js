import Student from '../models/Student.js';
// import admin from "../config/firebase.js";
import Parent from "../models/Parent.js";
import { sendNotification } from "../utils/sendNotification.js";

export const addStudent = async (req, res) => {
  try {
    const student = await Student.create(req.body);
    res.status(201).json(student);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const getStudents = async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateStudent = async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(student);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const deleteStudent = async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    res.json({ message: 'Student removed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Bulk Import using JSON data from Frontend (Parsed from XLSX on client-side)
export const bulkImportStudents = async (req, res) => {
  try {
    const { students } = req.body; // Array of student objects
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ message: 'Invalid or empty dataset received.' });
    }
    
    await Student.insertMany(students, { ordered: false }); 
    res.status(201).json({ message: 'Bulk entry successful!' });
  } catch (error) {
    res.status(400).json({ message: 'Some records might be duplicate entries.', error: error.message });
  }
};


export const searchStudents = async (req, res) => {
  try {
    const q = req.query.q;

    const students = await Student.find({
      $or: [
        { name: { $regex: q, $options: "i" } },
        { hostelNumber: { $regex: q, $options: "i" } },
        { parentPhoneNumber: { $regex: q, $options: "i" } }
      ]
    });

    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



export const getStudentCount = async (req, res) => {
  try {
    const count = await Student.countDocuments();
    res.json({ totalStudents: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



export const getActiveStudentCount = async (req, res) => {
  try {
    const count = await Student.countDocuments({ pocketMoney: { $gt: 0 } });
    res.json({ activeStudents: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const topUpWallet = async (req, res) => {
  console.log("🔥 topUpWallet called");

  try {
    const { amount } = req.body;
    const studentId = req.params.id;

    console.log("Student ID:", studentId);
    console.log("Recharge Amount:", amount);

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const student = await Student.findById(studentId);

    console.log("Student Found:", student?.name);

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const previousBalance = student.pocketMoney || 0;
    const newBalance = previousBalance + Number(amount);

    student.pocketMoney = newBalance;

    if (!student.rechargeHistory) {
      student.rechargeHistory = [];
    }

    student.rechargeHistory.push({
      amount: Number(amount),
      previousBalance,
      newBalance,
      date: new Date(),
    });

    await student.save();

    console.log("✅ Student balance updated");

    const parent = await Parent.findOne({
      studentIds: studentId,
    });

    console.log("Parent Found:", parent);
    console.log("FCM Token:", parent?.fcmToken);

    if (parent?.fcmToken) {
      console.log("📲 Sending notification...");

      await sendNotification(
        parent.fcmToken,
        "💰 Wallet Recharge",
        `₹${amount} added. New balance ₹${newBalance}`,
        {
          studentId: studentId.toString(),
          type: "RECHARGE",
        }
      );

      console.log("✅ sendNotification() finished");
    } else {
      console.log("❌ Parent has no FCM token");
    }

    return res.json({
      message: "Wallet recharged successfully",
      newBalance,
      rechargeHistory: student.rechargeHistory,
    });
  } catch (error) {
    console.error("❌ topUpWallet Error:", error);
    return res.status(500).json({ error: error.message });
  }
};


export const publicSearchStudents = async (req, res) => {
  try {
    const q = req.query.q || "";

    const students = await Student.find({
      $or: [
        { name: { $regex: q, $options: "i" } },
        { hostelNumber: { $regex: q, $options: "i" } },
        { parentPhoneNumber: { $regex: q, $options: "i" } }
      ]
    }).select(
      "_id name fatherName hostelNumber parentPhoneNumber pocketMoney photo class section"
    );

    res.json(students);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};




// const handleTopUp = async () => {
//   if (!topupAmount || topupAmount <= 0) {
//     return alert("Enter valid amount");
//   }

//   try {
//     const res = await api.put(`/students/${topupStudent}/topup`, {
//       amount: Number(topupAmount),
//     });

//     alert(res.data.message || "Wallet recharged successfully");

//     setTopupAmount("");
//     setTopupStudent(null);

//     fetchStudents(); // refresh updated wallet
//   } catch (error) {
//     console.error(error);
//     alert(error.response?.data?.message || "Wallet recharge failed");
//   }
// };