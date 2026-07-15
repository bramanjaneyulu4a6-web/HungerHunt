// // // import { useState } from "react";
// // // import { useParams, useNavigate } from "react-router-dom";
// // // import API from "../services/api";

// // // export default function ResetPassword() {
// // //   const { token } = useParams();
// // //   const navigate = useNavigate();

// // //   const [newPassword, setNewPassword] = useState("");
// // //   const [message, setMessage] = useState("");
// // //   const [error, setError] = useState("");

// // //   const handleSubmit = async (e) => {
// // //     e.preventDefault();
// // //     setError("");
// // //     setMessage("");

// // //     try {
// // //       const res = await API.post(
// // //         `/parent/reset-password/${token}`,
// // //         { newPassword }
// // //       );

// // //       setMessage(res.data.message || "Password updated!");

// // //       setTimeout(() => {
// // //         navigate("/login");
// // //       }, 2000);

// // //     } catch (err) {
// // //       setError(err.response?.data?.message || "Reset failed");
// // //     }
// // //   };

// // //   return (
// // //     <div style={styles.container}>
// // //       <div style={styles.card}>
// // //         <h2>Reset Password</h2>

// // //         {error && <p style={styles.error}>{error}</p>}
// // //         {message && <p style={styles.success}>{message}</p>}

// // //         <form onSubmit={handleSubmit}>
// // //           <input
// // //             type="password"
// // //             placeholder="Enter new password"
// // //             value={newPassword}
// // //             onChange={(e) => setNewPassword(e.target.value)}
// // //             style={styles.input}
// // //             required
// // //           />

// // //           <button type="submit" style={styles.button}>
// // //             Update Password
// // //           </button>
// // //         </form>
// // //       </div>
// // //     </div>
// // //   );
// // // }

// // // const styles = {
// // //   container: {
// // //     height: "100vh",
// // //     display: "flex",
// // //     justifyContent: "center",
// // //     alignItems: "center",
// // //     background: "#f5f5f5"
// // //   },
// // //   card: {
// // //     padding: 30,
// // //     background: "white",
// // //     borderRadius: 10,
// // //     width: 350,
// // //     boxShadow: "0 0 10px rgba(0,0,0,0.1)"
// // //   },
// // //   input: {
// // //     width: "100%",
// // //     padding: 10,
// // //     marginBottom: 15,
// // //     border: "1px solid #ccc",
// // //     borderRadius: 5
// // //   },
// // //   button: {
// // //     width: "100%",
// // //     padding: 10,
// // //     background: "black",
// // //     color: "white",
// // //     border: "none",
// // //     cursor: "pointer"
// // //   },
// // //   error: {
// // //     color: "red"
// // //   },
// // //   success: {
// // //     color: "green"
// // //   }
// // // };









// // import { useState } from "react";
// // import { useParams, useNavigate } from "react-router-dom";
// // import API from "../services/api";

// // export default function ResetPassword() {
// //   const { token } = useParams();
// //   const navigate = useNavigate();

// //   const [password, setPassword] = useState("");
// //   const [msg, setMsg] = useState("");
// //   const [error, setError] = useState("");

// //   const handleSubmit = async (e) => {
// //     e.preventDefault();
// //     setMsg("");
// //     setError("");

// //     try {
// //       const res = await API.post(`/parent/reset-password/${token}`, {
// //         password
// //       });

// //       setMsg(res.data.message);

// //       setTimeout(() => navigate("/login"), 2000);
// //     } catch (err) {
// //       setError(err.response?.data?.message || "Reset failed");
// //     }
// //   };

// //   return (
// //     <div style={{ padding: 30 }}>
// //       <h2>Reset Password</h2>

// //       <form onSubmit={handleSubmit}>
// //         <input
// //           type="password"
// //           placeholder="New password"
// //           value={password}
// //           onChange={(e) => setPassword(e.target.value)}
// //         />
// //         <button>Reset Password</button>
// //       </form>

// //       {msg && <p style={{ color: "green" }}>{msg}</p>}
// //       {error && <p style={{ color: "red" }}>{error}</p>}
// //     </div>
// //   );
// // }





// import { useState } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import API from "../services/api";

// export default function ResetPassword() {
//   const { token } = useParams();
//   const navigate = useNavigate();

//   const [password, setPassword] = useState("");
//   const [msg, setMsg] = useState("");
//   const [error, setError] = useState("");

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setMsg("");
//     setError("");

//     try {
//       const res = await API.post(`/parent/reset-password/${token}`, {
//         password
//       });

//       setMsg(res.data.message);

//       setTimeout(() => navigate("/login"), 2000);
//     } catch (err) {
//       setError(err.response?.data?.message || "Reset failed");
//     }
//   };

//   return (
//     <div style={{ padding: 20 }}>
//       <h2>Reset Password</h2>

//       <form onSubmit={handleSubmit}>
//         <input
//           type="password"
//           placeholder="New password"
//           value={password}
//           onChange={(e) => setPassword(e.target.value)}
//         />
//         <button type="submit">Reset Password</button>
//       </form>

//       {msg && <p style={{ color: "green" }}>{msg}</p>}
//       {error && <p style={{ color: "red" }}>{error}</p>}
//     </div>
//   );
// }



// the above is good



import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import API from "../services/api";

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setError("");

    try {
      const res = await API.post(`/parent/reset-password/${token}`, {
        password,
      });

      setMsg(res.data.message || "Password reset successfully!");

      // Gracefully redirect to login after 2 seconds
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.response?.data?.message || "Reset failed");
    }
  };

  return (
    <div className="login-page-container">
      {/* Inline Scoped CSS Stylesheet inheriting the Login look and feel */}
      <style>{`
        html, body, #root {
          background-color: #ffffff !important;
          margin: 0 !important;
          padding: 0 !important;
          height: 100vh !important;
          width: 100vw !important;
          overflow-x: hidden !important;
        }

        .login-page-container {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff !important;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-sizing: border-box;
          padding: 24px;
        }

        .login-card {
          width: 100%;
          max-width: 400px;
          background-color: #ffffff;
          padding: 12px 0px;
          box-sizing: border-box;
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .login-header {
          text-align: center;
          margin-bottom: 36px;
        }

        .login-title {
          font-size: 32px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
          letter-spacing: -0.75px;
        }

        .login-subtitle {
          font-size: 14px;
          color: #64748b;
          margin-top: 10px;
          margin-bottom: 0;
          line-height: 1.5;
        }

        .error-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          background-color: #fff1f2;
          border: 1px solid #ffe4e6;
          color: #be123c;
          padding: 14px 16px;
          border-radius: 12px;
          margin-bottom: 28px;
          font-size: 14px;
        }

        .success-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          background-color: #f0fdf4;
          border: 1px solid #dcfce7;
          color: #15803d;
          padding: 14px 16px;
          border-radius: 12px;
          margin-bottom: 28px;
          font-size: 14px;
        }

        .status-icon {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }

        .error-icon {
          color: #f43f5e;
        }

        .success-icon {
          color: #22c55e;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.75px;
          color: #475569;
          text-align: center;
        }

        .form-input {
          width: 100%;
          padding: 14px 16px;
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          font-size: 15px;
          color: #0f172a;
          outline: none;
          transition: all 0.15s ease-in-out;
          box-sizing: border-box;
          text-align: center;
        }

        .form-input::placeholder {
          color: #94a3b8;
        }

        .form-input:focus {
          background-color: #ffffff;
          border-color: #2563eb;
          box-shadow: 0 0 0 4px #dbeafe;
        }

        .register-link {
          font-size: 13px;
          font-weight: 600;
          color: #2563eb;
          text-decoration: none;
          transition: color 0.15s ease;
        }

        .register-link:hover {
          color: #1d4ed8;
        }

        .register-link {
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        .submit-btn {
          width: 100%;
          background-color: #0f172a;
          color: #ffffff;
          padding: 15px 16px;
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          margin-top: 12px;
        }

        .submit-btn:hover {
          background-color: #1e293b;
        }

        .submit-btn:active {
          transform: scale(0.995);
        }

        .login-footer {
          margin-top: 36px;
          text-align: center;
          font-size: 14px;
          color: #64748b;
        }
      `}</style>

      <div className="login-card">
        {/* Header Section */}
        <div className="login-header">
          <h2 className="login-title">Reset Password</h2>
          <p className="login-subtitle">Choose a secure, strong password to regain access to your account</p>
        </div>

        {/* Success Notification Banner */}
        {msg && (
          <div className="success-banner">
            <svg className="status-icon success-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{msg} Redirecting to login...</span>
          </div>
        )}
        
        {/* Error Notification Banner */}
        {error && (
          <div className="error-banner">
            <svg className="status-icon error-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}
        
        {/* Input Form */}
        <form onSubmit={handleSubmit} className="login-form">
          
          {/* New Password Input Field */}
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input 
              type="password" 
              required 
              placeholder="••••••••"
              className="form-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {/* Action Button */}
          <button type="submit" className="submit-btn">
            Reset Password
          </button>
        </form>

        {/* Footer Link Navigation */}
        <p className="login-footer">
          Cancel and return to{' '}
          <Link to="/login" className="register-link">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}