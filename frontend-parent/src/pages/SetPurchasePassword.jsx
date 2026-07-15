import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API from "../services/api";

export default function SetPurchasePassword() {
  const { id } = useParams();
  const navigate = useNavigate();

const [student, setStudent] = useState(null);
const [loading, setLoading] = useState(true);

const [password, setPassword] = useState("");
const [confirmPassword, setConfirmPassword] = useState("");

const [currentPassword, setCurrentPassword] = useState("");
const [newPassword, setNewPassword] = useState("");
const [confirmNewPassword, setConfirmNewPassword] = useState("");

const [hasPassword, setHasPassword] = useState(false);
const [showChange, setShowChange] = useState(false);
const [showReset, setShowReset] = useState(false);

// const [resetPasswordValue, setResetPasswordValue] = useState("");
// const [confirmResetPassword, setConfirmResetPassword] = useState("");
const [resetPasswordValue, setResetPasswordValue] = useState("");
const [confirmResetPassword, setConfirmResetPassword] = useState("");

  useEffect(() => {
    API.get(`/parent/child/${id}`)
      .then((res) => {
       setStudent(res.data.student);
setHasPassword(res.data.hasPurchasePassword);
      })
      .catch((err) => {
        console.error(err);
        alert("Unable to load student.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  const savePassword = async () => {
    if (!password) {
      return alert("Please enter a password.");
    }

    if (password.length < 4) {
      return alert("Password must be at least 4 characters.");
    }

    if (password !== confirmPassword) {
      return alert("Passwords do not match.");
    }

    try {
      await API.post("/parent/set-purchase-password", {
        studentId: id,
        password,
      });

      alert("Purchase Password Saved Successfully.");

      navigate(`/child/${id}`);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to save password.");
    }
  };

  if (loading) {
    return <h2 style={{ textAlign: "center", marginTop: 50 }}>Loading...</h2>;
  }

  if (!student) {
    return <h2 style={{ textAlign: "center", marginTop: 50 }}>Student not found.</h2>;
  }

const changePassword = async () => {
  if (newPassword !== confirmNewPassword) {
    return alert("Passwords do not match.");
  }

  try {
    await API.post("/parent/change-purchase-password", {
      studentId: id,
      currentPassword,
      newPassword,
    });

   alert("Purchase password changed successfully.");

navigate(`/child/${id}`);
  } catch (err) {
    alert(err.response?.data?.message || "Failed");
  }
};



const resetPassword = async () => {
  if (!window.confirm("Reset purchase password?")) return;

  if (resetPasswordValue !== confirmResetPassword) {
    return alert("Passwords do not match.");
  }

  if (resetPasswordValue.length < 4) {
    return alert("Password must be at least 4 characters.");
  }

  try {
    await API.post("/parent/reset-purchase-password", {
      studentId: id,
      newPassword: resetPasswordValue,
    });

    alert("Purchase password reset successfully.");

navigate(`/child/${id}`);

  } catch (err) {
    alert(err.response?.data?.message || "Failed");
  }
};


  return (
    <div
      style={{
        maxWidth: 500,
        margin: "40px auto",
        padding: 30,
        borderRadius: 15,
        background: "#fff",
        boxShadow: "0 5px 20px rgba(0,0,0,.1)",
      }}
    >
      <h2>Set Purchase Password</h2>
      <button
  onClick={() => navigate(`/child/${id}`)}
  style={{
    marginBottom: 20,
    padding: "8px 18px",
    background: "#6B7280",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  }}
>
  ← Back
</button>

      <h3>{student.name}</h3>

      <p>
        Grade: {student.grade} | Room: {student.hostelNumber}
      </p>

      {!hasPassword ? (
  <>
    <input
      type="password"
      placeholder="Purchase Password"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      style={{
        width: "100%",
        padding: 15,
        marginTop: 20,
        boxSizing: "border-box",
      }}
    />

    <input
      type="password"
      placeholder="Confirm Password"
      value={confirmPassword}
      onChange={(e) => setConfirmPassword(e.target.value)}
      style={{
        width: "100%",
        padding: 15,
        marginTop: 15,
        boxSizing: "border-box",
      }}
    />

    <button
      onClick={savePassword}
      style={{
        width: "100%",
        marginTop: 25,
        padding: 15,
        background: "#2563EB",
        color: "#fff",
        border: "none",
        borderRadius: 10,
        fontWeight: 700,
      }}
    >
      Save Password
    </button>
  </>
) : (
  <>
  <button
  onClick={() => {
    setShowChange(!showChange);
    setShowReset(false);
  }}
  style={{
    width: "100%",
    padding: 15,
    background: "#16A34A",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontWeight: 700,
    marginTop: 20,
  }}
>
  Change Password
</button>
{showChange && (
  <>
    <input
      type="password"
      placeholder="Current Password"
      value={currentPassword}
      onChange={(e) => setCurrentPassword(e.target.value)}
      style={{
        width: "100%",
        padding: 15,
        marginTop: 20,
        boxSizing: "border-box",
      }}
    />

    <input
      type="password"
      placeholder="New Password"
      value={newPassword}
      onChange={(e) => setNewPassword(e.target.value)}
      style={{
        width: "100%",
        padding: 15,
        marginTop: 15,
        boxSizing: "border-box",
      }}
    />

    <input
      type="password"
      placeholder="Confirm New Password"
      value={confirmNewPassword}
      onChange={(e) => setConfirmNewPassword(e.target.value)}
      style={{
        width: "100%",
        padding: 15,
        marginTop: 15,
        boxSizing: "border-box",
      }}
    />

    <button
      onClick={changePassword}
      style={{
        width: "100%",
        padding: 15,
        marginTop: 20,
        background: "#16A34A",
        color: "#fff",
        border: "none",
        borderRadius: 10,
      }}
    >
      Save Changes
    </button>
  </>
)}
<button
  onClick={() => {
    setShowReset(!showReset);
    setShowChange(false);
  }}
  style={{
    width: "100%",
    padding: 15,
    marginTop: 15,
    background: "#DC2626",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontWeight: 700,
  }}
>
  Forgot Password / Reset
</button>
{showReset && (
  <>
    <input
      type="password"
      placeholder="New Password"
      value={resetPasswordValue}
      onChange={(e) => setResetPasswordValue(e.target.value)}
      style={{
        width: "100%",
        padding: 15,
        marginTop: 20,
        boxSizing: "border-box",
      }}
    />

    <input
      type="password"
      placeholder="Confirm New Password"
      value={confirmResetPassword}
      onChange={(e) => setConfirmResetPassword(e.target.value)}
      style={{
        width: "100%",
        padding: 15,
        marginTop: 15,
        boxSizing: "border-box",
      }}
    />

    <button
      onClick={resetPassword}
      style={{
        width: "100%",
        padding: 15,
        marginTop: 20,
        background: "#DC2626",
        color: "#fff",
        border: "none",
        borderRadius: 10,
      }}
    >
      Reset Password
    </button>
  </>
)}
  </>
)}

      
    </div>
  );
}