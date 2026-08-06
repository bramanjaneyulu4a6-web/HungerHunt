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

const [resetPasswordValue, setResetPasswordValue] = useState("");
const [confirmResetPassword, setConfirmResetPassword] = useState("");
const [resetParentPassword, setResetParentPassword] = useState("");

const [error, setError] = useState("");
const [success, setSuccess] = useState("");

  useEffect(() => {
    API.get(`/parent/child/${id}`)
      .then((res) => {
       setStudent(res.data.student);
setHasPassword(res.data.hasPurchasePassword);
      })
      .catch((err) => {
        console.error(err);
        setError("Unable to load student.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  const savePassword = async () => {
    setError("");
    setSuccess("");

    if (!password) {
      return setError("Please enter a password.");
    }

    if (password.length < 4) {
      return setError("Password must be at least 4 characters.");
    }

    if (password !== confirmPassword) {
      return setError("Passwords do not match.");
    }

    try {
      await API.post("/parent/set-purchase-password", {
        studentId: id,
        password,
      });

      setSuccess("Purchase password saved successfully.");
      setTimeout(() => navigate(`/child/${id}`), 1200);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save password.");
    }
  };

  if (loading) {
    return <h2 style={{ textAlign: "center", marginTop: 50 }}>Loading...</h2>;
  }

  if (!student) {
    return <h2 style={{ textAlign: "center", marginTop: 50 }}>Student not found.</h2>;
  }

const changePassword = async () => {
  setError("");
  setSuccess("");

  if (newPassword !== confirmNewPassword) {
    return setError("Passwords do not match.");
  }

  try {
    await API.post("/parent/change-purchase-password", {
      studentId: id,
      currentPassword,
      newPassword,
    });

   setSuccess("Purchase password changed successfully.");

setTimeout(() => navigate(`/child/${id}`), 1200);
  } catch (err) {
    setError(err.response?.data?.message || "Failed");
  }
};



const resetPassword = async () => {
  setError("");
  setSuccess("");

  if (!resetParentPassword) {
    return setError("Please enter your account password.");
  }

  if (resetPasswordValue !== confirmResetPassword) {
    return setError("Passwords do not match.");
  }

  if (resetPasswordValue.length < 4) {
    return setError("Password must be at least 4 characters.");
  }

  if (!window.confirm("Reset purchase password?")) return;

  try {
    await API.post("/parent/reset-purchase-password", {
      studentId: id,
      parentPassword: resetParentPassword,
      newPassword: resetPasswordValue,
    });

    setSuccess("Purchase password reset successfully.");

setTimeout(() => navigate(`/child/${id}`), 1200);

  } catch (err) {
    setError(err.response?.data?.message || "Failed");
  }
};

  const bannerStyle = (type) => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    backgroundColor: type === "error" ? "#fff1f2" : "#f0fdf4",
    border: type === "error" ? "1px solid #ffe4e6" : "1px solid #bbf7d0",
    color: type === "error" ? "#be123c" : "#15803d",
    padding: "14px 16px",
    borderRadius: "12px",
    marginTop: 20,
    fontSize: "14px",
    fontWeight: 500,
  });

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

      {error && <div style={bannerStyle("error")}>⚠️ {error}</div>}
      {success && <div style={bannerStyle("success")}>✅ {success}</div>}

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
    setError("");
    setSuccess("");
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
    setError("");
    setSuccess("");
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
      placeholder="Your Account Password"
      value={resetParentPassword}
      onChange={(e) => setResetParentPassword(e.target.value)}
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
      value={resetPasswordValue}
      onChange={(e) => setResetPasswordValue(e.target.value)}
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
