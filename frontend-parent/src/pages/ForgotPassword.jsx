// // // // import { useState } from 'react';
// // // // import API from '../services/api';
// // // // import { useNavigate } from 'react-router-dom';

// // // // export default function ForgotPassword() {
// // // //   const [formData, setFormData] = useState({
// // // //     parentPhoneNumber: '',
// // // //     newPassword: ''
// // // //   });

// // // //   const [message, setMessage] = useState('');
// // // //   const [error, setError] = useState('');
// // // //   const navigate = useNavigate();

// // // //   const handleSubmit = async (e) => {
// // // //     e.preventDefault();
// // // //     setError('');
// // // //     setMessage('');

// // // //     try {
// // // //       const res = await API.post('/parent/forgot-password', formData);
// // // //       setMessage(res.data.message);

// // // //       setTimeout(() => {
// // // //         navigate('/login');
// // // //       }, 2000);

// // // //     } catch (err) {
// // // //       setError(err.response?.data?.message || 'Failed to reset password');
// // // //     }
// // // //   };

// // // //   return (
// // // //     <div style={styles.container}>
// // // //       <div style={styles.card}>

// // // //         <h2 style={styles.title}>Reset Password</h2>
// // // //         <p style={styles.subtitle}>Enter your registered phone number</p>

// // // //         {error && <div style={styles.error}>{error}</div>}
// // // //         {message && <div style={styles.success}>{message}</div>}

// // // //         <form onSubmit={handleSubmit}>

// // // //           <input
// // // //             style={styles.input}
// // // //             type="text"
// // // //             placeholder="Phone Number"
// // // //             value={formData.parentPhoneNumber}
// // // //             onChange={(e) =>
// // // //               setFormData({ ...formData, parentPhoneNumber: e.target.value })
// // // //             }
// // // //           />

// // // //           <input
// // // //             style={styles.input}
// // // //             type="password"
// // // //             placeholder="New Password"
// // // //             value={formData.newPassword}
// // // //             onChange={(e) =>
// // // //               setFormData({ ...formData, newPassword: e.target.value })
// // // //             }
// // // //           />

// // // //           <button style={styles.button} type="submit">
// // // //             Reset Password
// // // //           </button>
// // // //         </form>
// // // //       </div>
// // // //     </div>
// // // //   );
// // // // }

// // // // const styles = {
// // // //   container: {
// // // //     height: '100vh',
// // // //     display: 'flex',
// // // //     justifyContent: 'center',
// // // //     alignItems: 'center',
// // // //     background: '#ffffff'
// // // //   },
// // // //   card: {
// // // //     width: '350px',
// // // //     padding: '30px',
// // // //     borderRadius: '12px',
// // // //     boxShadow: '0 0 15px rgba(0,0,0,0.1)',
// // // //     background: '#fff',
// // // //     textAlign: 'center'
// // // //   },
// // // //   title: {
// // // //     marginBottom: '10px'
// // // //   },
// // // //   subtitle: {
// // // //     fontSize: '13px',
// // // //     color: '#666',
// // // //     marginBottom: '20px'
// // // //   },
// // // //   input: {
// // // //     width: '100%',
// // // //     padding: '12px',
// // // //     marginBottom: '12px',
// // // //     borderRadius: '8px',
// // // //     border: '1px solid #ddd'
// // // //   },
// // // //   button: {
// // // //     width: '100%',
// // // //     padding: '12px',
// // // //     background: '#111827',
// // // //     color: 'white',
// // // //     border: 'none',
// // // //     borderRadius: '8px',
// // // //     cursor: 'pointer'
// // // //   },
// // // //   error: {
// // // //     background: '#ffe5e5',
// // // //     color: '#c00',
// // // //     padding: '8px',
// // // //     marginBottom: '10px',
// // // //     borderRadius: '6px'
// // // //   },
// // // //   success: {
// // // //     background: '#e6ffed',
// // // //     color: '#067d32',
// // // //     padding: '8px',
// // // //     marginBottom: '10px',
// // // //     borderRadius: '6px'
// // // //   }
// // // // };










// // // import { useState } from 'react';
// // // import API from '../services/api';
// // // import { useNavigate, Link } from 'react-router-dom';

// // // export default function ForgotPassword() {
// // // //   const [email, setEmail] = useState('');
// // // //   const [newPassword, setNewPassword] = useState('');

// // // //   const [message, setMessage] = useState('');
// // // //   const [error, setError] = useState('');
// // // const [step, setStep] = useState(1);

// // // const [email, setEmail] = useState('');
// // // const [otp, setOtp] = useState('');
// // // const [newPassword, setNewPassword] = useState('');

// // // const [message, setMessage] = useState('');
// // // const [error, setError] = useState('');  
// // // const navigate = useNavigate();

// // //   const handleSubmit = async (e) => {
// // //     e.preventDefault();
// // //     setError('');
// // //     setMessage('');

// // //     try {
// // //       const res = await API.post('/parent/forgot-password', { email });
// // //       setMessage(res.data.message || 'Password updated successfully!');

// // //       setTimeout(() => {
// // //         navigate('/login');
// // //       }, 2000);

// // //     } catch (err) {
// // //       setError(err.response?.data?.message || 'Failed to reset password');
// // //     }
// // //   };
// // //   const sendOtp = async (e) => {
// // //   e.preventDefault();

// // //   try {
// // //     const res = await API.post('/parent/forgot-password', { email });

// // //     setMessage(res.data.message);
// // //     setStep(2);
// // //   } catch (err) {
// // //     setError(err.response?.data?.message);
// // //   }
// // // };
// // // const resetPassword = async (e) => {
// // //   e.preventDefault();
// // //   setError('');
// // //   setMessage('');

// // //   try {
// // //     const res = await API.post('/parent/reset-password', {
// // //       email,
// // //       otp,
// // //       newPassword
// // //     });

// // //     setMessage(res.data.message || 'Password updated successfully');

// // //     setTimeout(() => {
// // //       navigate('/login');
// // //     }, 2000);

// // //   } catch (err) {
// // //     setError(err.response?.data?.message || 'Reset failed');
// // //   }
// // // };

// // //   return (
// // //     <div className="login-page-container">
// // //       {/* Inline Scoped CSS Stylesheet */}
// // //       <style>{`
// // //         html, body, #root {
// // //           background-color: #ffffff !important;
// // //           margin: 0;
// // //           padding: 0;
// // //           height: 100%;
// // //           width: 100%;
// // //           overflow-x: hidden;
// // //         }

// // //         .login-page-container {
// // //           min-height: 100vh;
// // //           width: 100%;
// // //           display: flex;
// // //           align-items: center;
// // //           justify-content: center;
// // //           background: #ffffff !important;
// // //           font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
// // //           box-sizing: border-box;
// // //           padding: 24px;
// // //           position: relative;
// // //         }

// // //         .login-card {
// // //           width: 100%;
// // //           max-width: 400px;
// // //           background-color: #ffffff;
// // //           padding: 12px 0px;
// // //           box-sizing: border-box;
// // //           border: none !important;
// // //           outline: none !important;
// // //           box-shadow: none !important;
// // //         }

// // //         .login-header {
// // //           text-align: center;
// // //           margin-bottom: 36px;
// // //         }

// // //         .login-title {
// // //           font-size: 32px;
// // //           font-weight: 800;
// // //           color: #0f172a;
// // //           margin: 0;
// // //           letter-spacing: -0.75px;
// // //         }

// // //         .login-subtitle {
// // //           font-size: 14px;
// // //           color: #64748b;
// // //           margin-top: 10px;
// // //           margin-bottom: 0;
// // //           line-height: 1.5;
// // //         }

// // //         .error-banner {
// // //           display: flex;
// // //           align-items: center;
// // //           gap: 10px;
// // //           background-color: #fff1f2;
// // //           border: 1px solid #ffe4e6;
// // //           color: #be123c;
// // //           padding: 14px 16px;
// // //           border-radius: 12px;
// // //           margin-bottom: 28px;
// // //           font-size: 14px;
// // //         }

// // //         .success-banner {
// // //           display: flex;
// // //           align-items: center;
// // //           gap: 10px;
// // //           background-color: #f0fdf4;
// // //           border: 1px solid #bbf7d0;
// // //           color: #15803d;
// // //           padding: 14px 16px;
// // //           border-radius: 12px;
// // //           margin-bottom: 28px;
// // //           font-size: 14px;
// // //         }

// // //         .status-icon {
// // //           width: 18px;
// // //           height: 18px;
// // //           flex-shrink: 0;
// // //         }

// // //         .login-form {
// // //           display: flex;
// // //           flex-direction: column;
// // //           gap: 24px;
// // //         }

// // //         .form-group {
// // //           display: flex;
// // //           flex-direction: column;
// // //           gap: 8px;
// // //         }

// // //         .form-label {
// // //           font-size: 12px;
// // //           font-weight: 600;
// // //           text-transform: uppercase;
// // //           letter-spacing: 0.75px;
// // //           color: #475569;
// // //         }

// // //         .form-input {
// // //           width: 100%;
// // //           padding: 14px 16px;
// // //           background-color: #f8fafc;
// // //           border: 1px solid #e2e8f0;
// // //           border-radius: 12px;
// // //           font-size: 15px;
// // //           color: #0f172a;
// // //           outline: none;
// // //           transition: all 0.15s ease-in-out;
// // //           box-sizing: border-box;
// // //         }

// // //         .form-input::placeholder {
// // //           color: #94a3b8;
// // //         }

// // //         .form-input:focus {
// // //           background-color: #ffffff;
// // //           border-color: #2563eb;
// // //           box-shadow: 0 0 0 4px #dbeafe;
// // //         }

// // //         .register-link {
// // //           font-size: 13px;
// // //           font-weight: 600;
// // //           color: #2563eb;
// // //           text-decoration: none;
// // //           transition: color 0.15s ease;
// // //         }

// // //         .register-link:hover {
// // //           color: #1d4ed8;
// // //         }

// // //         .register-link {
// // //           text-decoration: underline;
// // //           text-underline-offset: 4px;
// // //         }

// // //         .submit-btn {
// // //           width: 100%;
// // //           background-color: #0f172a;
// // //           color: #ffffff;
// // //           padding: 15px 16px;
// // //           border: none;
// // //           border-radius: 12px;
// // //           font-size: 15px;
// // //           font-weight: 600;
// // //           cursor: pointer;
// // //           transition: all 0.15s ease;
// // //           margin-top: 12px;
// // //         }

// // //         .submit-btn:hover {
// // //           background-color: #1e293b;
// // //         }

// // //         .submit-btn:active {
// // //           transform: scale(0.995);
// // //         }

// // //         .login-footer {
// // //           margin-top: 36px;
// // //           text-align: center;
// // //           font-size: 14px;
// // //           color: #64748b;
// // //         }
// // //       `}</style>

// // //       <div className="login-card">
// // //         {/* Header Section */}
// // //         <div className="login-header">
// // //           <h2 className="login-title">Reset Password</h2>
// // //           <p className="login-subtitle">Enter your registered mobile records to authenticate and set up your new credentials</p>
// // //         </div>

// // //         {/* Error Notification Banner */}
// // //         {error && (
// // //           <div className="error-banner">
// // //             <svg className="status-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
// // //               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
// // //             </svg>
// // //             <span>{error}</span>
// // //           </div>
// // //         )}

// // //         {/* Success Notification Banner */}
// // //         {message && (
// // //           <div className="success-banner">
// // //             <svg className="status-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
// // //               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
// // //             </svg>
// // //             <span>{message}</span>
// // //           </div>
// // //         )}

// // //         {step === 1 && (
// // //   <form onSubmit={sendOtp} className="login-form">

// // //     <div className="form-group">
// // //       <label>Email</label>
// // //       <input
// // //         type="email"
// // //         value={email}
// // //         onChange={(e) => setEmail(e.target.value)}
// // //         placeholder="Enter email"
// // //         className="form-input"
// // //         required
// // //       />
// // //     </div>

// // //     <button type="submit" className="submit-btn">
// // //       Send OTP
// // //     </button>

// // //   </form>
// // // )}
// // // {step === 2 && (
// // //   <form onSubmit={resetPassword} className="login-form">

// // //     <div className="form-group">
// // //       <label>OTP</label>
// // //       <input
// // //         type="text"
// // //         value={otp}
// // //         onChange={(e) => setOtp(e.target.value)}
// // //         placeholder="Enter OTP"
// // //         className="form-input"
// // //         required
// // //       />
// // //     </div>

// // //     <div className="form-group">
// // //       <label>New Password</label>
// // //       <input
// // //         type="password"
// // //         value={newPassword}
// // //         onChange={(e) => setNewPassword(e.target.value)}
// // //         placeholder="New password"
// // //         className="form-input"
// // //         required
// // //       />
// // //     </div>

// // //     <button type="submit" className="submit-btn">
// // //       Reset Password
// // //     </button>

// // //   </form>
// // // )}

// // //         {/* Footer Navigation Backtrack Links */}
// // //         <p className="login-footer">
// // //           Remember your password?{' '}
// // //           <Link to="/login" className="register-link">
// // //             Back to login
// // //           </Link>
// // //         </p>
// // //       </div>
// // //     </div>
// // //   );
// // // }



// // // gemini



// // import { useState } from 'react';
// // import API from '../services/api';
// // import { useNavigate, Link } from 'react-router-dom';

// // export default function ForgotPassword() {
// //   const [formData, setFormData] = useState({
// //     email: ''
// //   });

// //   const [message, setMessage] = useState('');
// //   const [error, setError] = useState('');
// //   const navigate = useNavigate();

// //   const handleSubmit = async (e) => {
// //     e.preventDefault();
// //     setError('');
// //     setMessage('');

// //     try {
// //       // Adjusted payload to match the Email routing structure seen in DevTools
// //       const res = await API.post('/parent/forgot-password', formData);
// //       setMessage(res.data.message || 'Verification token sent! Check your inbox.');

// //       setTimeout(() => {
// //         navigate('/login');
// //       }, 3000);

// //     } catch (err) {
// //       setError(err.response?.data?.message || 'Email not found');
// //     }
// //   };

// //   return (
// //     <div className="login-page-container">
// //       {/* Inline Scoped CSS Stylesheet */}
// //       <style>{`
// //         html, body, #root {
// //           background-color: #ffffff !important;
// //           margin: 0 !important;
// //           padding: 0 !important;
// //           height: 100vh !important;
// //           width: 100vw !important;
// //           overflow-x: hidden !important;
// //         }

// //         .login-page-container {
// //           min-height: 100vh;
// //           width: 100%;
// //           display: flex;
// //           align-items: center;
// //           justify-content: center;
// //           background: #ffffff !important;
// //           font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
// //           box-sizing: border-box;
// //           padding: 24px;
// //         }

// //         .login-card {
// //           width: 100%;
// //           max-width: 400px;
// //           background-color: #ffffff;
// //           padding: 12px 0px;
// //           box-sizing: border-box;
// //           border: none !important;
// //           outline: none !important;
// //           box-shadow: none !important;
// //           display: flex;
// //           flex-direction: column;
// //           justify-content: center;
// //         }

// //         .login-header {
// //           text-align: center;
// //           margin-bottom: 36px;
// //         }

// //         .login-title {
// //           font-size: 32px;
// //           font-weight: 800;
// //           color: #0f172a;
// //           margin: 0;
// //           letter-spacing: -0.75px;
// //         }

// //         .login-subtitle {
// //           font-size: 14px;
// //           color: #64748b;
// //           margin-top: 10px;
// //           margin-bottom: 0;
// //           line-height: 1.5;
// //         }

// //         .error-banner {
// //           display: flex;
// //           align-items: center;
// //           gap: 10px;
// //           background-color: #fff1f2;
// //           border: 1px solid #ffe4e6;
// //           color: #be123c;
// //           padding: 14px 16px;
// //           border-radius: 12px;
// //           margin-bottom: 28px;
// //           font-size: 14px;
// //         }

// //         .success-banner {
// //           display: flex;
// //           align-items: center;
// //           gap: 10px;
// //           background-color: #f0fdf4;
// //           border: 1px solid #bbf7d0;
// //           color: #15803d;
// //           padding: 14px 16px;
// //           border-radius: 12px;
// //           margin-bottom: 28px;
// //           font-size: 14px;
// //         }

// //         .status-icon {
// //           width: 18px;
// //           height: 18px;
// //           flex-shrink: 0;
// //         }

// //         .login-form {
// //           display: flex;
// //           flex-direction: column;
// //           gap: 24px;
// //         }

// //         .form-group {
// //           display: flex;
// //           flex-direction: column;
// //           gap: 8px;
// //         }

// //         .form-label {
// //           font-size: 12px;
// //           font-weight: 600;
// //           text-transform: uppercase;
// //           letter-spacing: 0.75px;
// //           color: #475569;
// //           text-align: center;
// //         }

// //         .form-input {
// //           width: 100%;
// //           padding: 14px 16px;
// //           background-color: #f8fafc;
// //           border: 1px solid #e2e8f0;
// //           border-radius: 12px;
// //           font-size: 15px;
// //           color: #0f172a;
// //           outline: none;
// //           transition: all 0.15s ease-in-out;
// //           box-sizing: border-box;
// //           text-align: center;
// //         }

// //         .form-input::placeholder {
// //           color: #94a3b8;
// //         }

// //         .form-input:focus {
// //           background-color: #ffffff;
// //           border-color: #2563eb;
// //           box-shadow: 0 0 0 4px #dbeafe;
// //         }

// //         .register-link {
// //           font-size: 13px;
// //           font-weight: 600;
// //           color: #2563eb;
// //           text-decoration: none;
// //           transition: color 0.15s ease;
// //         }

// //         .register-link:hover {
// //           color: #1d4ed8;
// //         }

// //         .register-link {
// //           text-decoration: underline;
// //           text-underline-offset: 4px;
// //         }

// //         .submit-btn {
// //           width: 100%;
// //           background-color: #0f172a;
// //           color: #ffffff;
// //           padding: 15px 16px;
// //           border: none;
// //           border-radius: 12px;
// //           font-size: 15px;
// //           font-weight: 600;
// //           cursor: pointer;
// //           transition: all 0.15s ease;
// //           margin-top: 12px;
// //         }

// //         .submit-btn:hover {
// //           background-color: #1e293b;
// //         }

// //         .submit-btn:active {
// //           transform: scale(0.995);
// //         }

// //         .login-footer {
// //           margin-top: 36px;
// //           text-align: center;
// //           font-size: 14px;
// //           color: #64748b;
// //         }
// //       `}</style>

// //       <div className="login-card">
// //         {/* Header Section */}
// //         <div className="login-header">
// //           <h2 className="login-title">Reset Password</h2>
// //           <p className="login-subtitle">Enter your registered mobile records to authenticate and set up your new credentials</p>
// //         </div>

// //         {/* Error Notification Banner */}
// //         {error && (
// //           <div className="error-banner">
// //             <svg className="status-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
// //               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
// //             </svg>
// //             <span>{error}</span>
// //           </div>
// //         )}

// //         {/* Success Notification Banner */}
// //         {message && (
// //           <div className="success-banner">
// //             <svg className="status-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
// //               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
// //             </svg>
// //             <span>{message}</span>
// //           </div>
// //         )}

// //         {/* Action Form */}
// //         <form onSubmit={handleSubmit} className="login-form">
          
// //           {/* Email Input Field */}
// //           <div className="form-group">
// //             <label className="form-label">Email</label>
// //             <input
// //               type="email"
// //               required
// //               placeholder="bramanjaneyulu4a6@gmail.com"
// //               className="form-input"
// //               value={formData.email}
// //               onChange={(e) =>
// //                 setFormData({ ...formData, email: e.target.value })
// //               }
// //             />
// //           </div>

// //           {/* Form Processing Trigger Button */}
// //           <button type="submit" className="submit-btn">
// //             Send OTP
// //           </button>
// //         </form>

// //         {/* Footer Navigation Backtrack Links */}
// //         <p className="login-footer">
// //           Remember your password?{' '}
// //           <Link to="/login" className="register-link">
// //             Back to login
// //           </Link>
// //         </p>
// //       </div>
// //     </div>
// //   );
// // }













// import { useState } from "react";
// import API from "../services/api";

// export default function ForgotPassword() {
//   const [email, setEmail] = useState("");
//   const [msg, setMsg] = useState("");
//   const [error, setError] = useState("");

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setMsg("");
//     setError("");

//     try {
//       const res = await API.post("/parent/forgot-password", { email });
//       setMsg(res.data.message);
//     } catch (err) {
//       setError(err.response?.data?.message || "Error sending link");
//     }
//   };

//   return (
//     <div style={{ padding: 30 }}>
//       <h2>Forgot Password</h2>

//       <form onSubmit={handleSubmit}>
//         <input
//           type="email"
//           placeholder="Enter email"
//           value={email}
//           onChange={(e) => setEmail(e.target.value)}
//         />
//         <button>Send Reset Link</button>
//       </form>

//       {msg && <p style={{ color: "green" }}>{msg}</p>}
//       {error && <p style={{ color: "red" }}>{error}</p>}
//     </div>
//   );
// }



// the above is good



import { useState } from 'react';
import API from '../services/api';
import { Link } from 'react-router-dom';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    setError('');

    try {
      const res = await API.post('/parent/forgot-password', { email });
      setMsg(res.data.message || 'Reset link sent successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Error sending link');
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
          <h2 className="login-title">Forgot Password</h2>
          <p className="login-subtitle">Enter your email address to receive a secure password reset link</p>
        </div>

        {/* Success Notification Banner */}
        {msg && (
          <div className="success-banner">
            <svg className="status-icon success-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{msg}</span>
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
          
          {/* Email Input Field */}
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              type="email" 
              required 
              placeholder="e.g. parent@example.com"
              className="form-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          {/* Action Button */}
          <button type="submit" className="submit-btn">
            Send Reset Link
          </button>
        </form>

        {/* Footer Link Navigation */}
        <p className="login-footer">
          Remembered your credentials?{' '}
          <Link to="/login" className="register-link">
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}