// import React, { useState } from "react";
// import { Link, useNavigate } from "react-router-dom";
// import api from "../utils/api";

// const Register = () => {
//   const navigate = useNavigate();

//   const [formData, setFormData] = useState({
//     email: "",
//     password: ""
//   });

//   const [error, setError] = useState("");
//   const [success, setSuccess] = useState("");

//   const handleChange = (e) => {
//     setFormData({
//       ...formData,
//       [e.target.name]: e.target.value
//     });
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();

//     try {
//       const res = await api.post("/admin/register", formData);

//       setSuccess(res.data.message);
//       setError("");

//       setTimeout(() => {
//         navigate("/");
//       }, 1500);
//     } catch (err) {
//       setError(err.response?.data?.message || "Registration failed");
//       setSuccess("");
//     }
//   };

//   return (
//     <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
//       <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
//         <h2 className="text-3xl font-bold text-center mb-6">
//           Register Admin
//         </h2>

//         {error && (
//           <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
//             {error}
//           </div>
//         )}

//         {success && (
//           <div className="bg-green-100 text-green-700 p-3 rounded mb-4">
//             {success}
//           </div>
//         )}

//         <form onSubmit={handleSubmit} className="space-y-4">

//           <input
//             type="email"
//             name="email"
//             placeholder="Email"
//             className="w-full p-3 border rounded"
//             value={formData.email}
//             onChange={handleChange}
//             required
//           />

//           <input
//             type="password"
//             name="password"
//             placeholder="Password"
//             className="w-full p-3 border rounded"
//             value={formData.password}
//             onChange={handleChange}
//             required
//           />

//           <button
//             type="submit"
//             className="w-full bg-green-600 text-white p-3 rounded"
//           >
//             Register
//           </button>
//         </form>

//         <div className="text-center mt-4">
//           <Link to="/" className="text-indigo-600 hover:underline">
//             Back to Login
//           </Link>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default Register;




import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../utils/api";

const Register = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await api.post("/admin/register", formData);

      setSuccess(res.data.message);
      setError("");

      setTimeout(() => {
        navigate("/login");
      }, 1200);
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
      setSuccess("");
    }
  };

  // SAME STYLE SYSTEM AS LOGIN
  const styles = {
    container: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "20px",
      width: "100%",
      backgroundColor: "#ffffff"
    },

    card: {
      width: "100%",
      maxWidth: "400px",
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "12px",
      boxShadow:
        "0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
      padding: "40px 32px",
      textAlign: "left"
    },

    header: {
      textAlign: "center",
      marginBottom: "28px"
    },

    title: {
      fontSize: "28px",
      margin: "0 0 6px 0",
      fontWeight: "700",
      color: "#1e293b"
    },

    subtitle: {
      fontSize: "14px",
      color: "#64748b",
      margin: 0
    },

    errorBox: {
      backgroundColor: "#fef2f2",
      border: "1px solid #fee2e2",
      color: "#ef4444",
      padding: "12px",
      borderRadius: "6px",
      marginBottom: "12px",
      fontSize: "14px",
      textAlign: "center"
    },

    successBox: {
      backgroundColor: "#f0fdf4",
      border: "1px solid #bbf7d0",
      color: "#16a34a",
      padding: "12px",
      borderRadius: "6px",
      marginBottom: "12px",
      fontSize: "14px",
      textAlign: "center"
    },

    formGroup: {
      marginBottom: "20px"
    },

    label: {
      display: "block",
      fontSize: "13px",
      fontWeight: "600",
      marginBottom: "6px",
      color: "#475569"
    },

    input: {
      width: "100%",
      padding: "12px",
      fontSize: "15px",
      background: "#ffffff",
      border: "1px solid #cbd5e1",
      borderRadius: "8px",
      color: "#0f172a",
      boxSizing: "border-box",
      outline: "none"
    },

    button: {
      width: "100%",
      padding: "13px",
      fontSize: "16px",
      fontWeight: "600",
      background: "#2563eb",
      color: "#ffffff",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      boxShadow: "0 4px 6px -1px rgba(37, 99, 235, 0.2)"
    },

    link: {
      color: "#2563eb",
      textDecoration: "none",
      fontWeight: "600"
    },

    footer: {
      textAlign: "center",
      marginTop: "16px",
      fontSize: "13px",
      color: "#64748b"
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Admin Registration</h2>
          <p style={styles.subtitle}>Create a new admin account</p>
        </div>

        {/* Messages */}
        {error && <div style={styles.errorBox}>{error}</div>}
        {success && <div style={styles.successBox}>{success}</div>}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              name="email"
              placeholder="admin@email.com"
              value={formData.email}
              onChange={handleChange}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              style={styles.input}
              required
            />
          </div>

          <button type="submit" style={styles.button}>
            Create Account
          </button>
        </form>

        {/* Footer */}
        <div style={styles.footer}>
          Already have an account?{" "}
          <Link to="/login" style={styles.link}>
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;