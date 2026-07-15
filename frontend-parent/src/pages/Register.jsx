// // import { useState } from 'react';
// // import API from '../services/api';
// // import { useNavigate, Link } from 'react-router-dom';

// // export default function Register() {
// // //   const [formData, setFormData] = useState({ fatherName: '', phoneNumber: '', password: '' });
// // const [formData, setFormData] = useState({
// //   fatherName: '',
// //   parentPhoneNumber: '',
// //   password: ''
// // });  
// // const [error, setError] = useState('');
// //   const [success, setSuccess] = useState('');
// //   const navigate = useNavigate();

// //   const handleSubmit = async (e) => {
// //     e.preventDefault();
// //     setError('');
// //     setSuccess('');
// //     try {
// //       // Sends verification details matching the Admin's setup records
// //     //   await API.post('/parents/register', formData);
// //     await API.post('/parent/register', formData);  
// //     setSuccess('Account created successfully! Redirecting to login...');
// //       setTimeout(() => navigate('/login'), 2500);
// //     } catch (err) {
// //       setError(err.response?.data?.message || 'Verification failed. Ensure credentials match school records.');
// //     }
// //   };

// //   return (
// //     <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
// //       <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg">
// //         <h2 className="text-3xl font-bold text-center text-gray-800 mb-2">Create Parent Account</h2>
// //         <p className="text-sm text-center text-gray-500 mb-6">Use the Father Name & Phone Number registered with the school office.</p>
        
// //         {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}
// //         {success && <div className="bg-green-100 text-green-700 p-3 rounded mb-4 text-sm">{success}</div>}

// //         <form onSubmit={handleSubmit} className="space-y-4">
// //           <div>
// //             <label className="block text-sm font-medium text-gray-700">Father's Name (e.g., Stephen)</label>
// //             <input type="text" required className="w-full mt-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
// //               value={formData.fatherName} onChange={e => setFormData({...formData, fatherName: e.target.value})} />
// //           </div>
// //           <div>
// //             <label className="block text-sm font-medium text-gray-700">Registered Phone Number</label>
// //             <input type="text" required className="w-full mt-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
// //             //   value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} 
// //               value={formData.parentPhoneNumber}
// // onChange={e =>
// //   setFormData({
// //     ...formData,
// //     parentPhoneNumber: e.target.value
// //   })
// // }
// //               />
// //           </div>
// //           <div>
// //             <label className="block text-sm font-medium text-gray-700">Set App Password</label>
// //             <input type="password" required className="w-full mt-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
// //               value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
// //           </div>
// //           <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition">
// //             Verify & Register
// //           </button>
// //         </form>
// //         <p className="mt-4 text-center text-sm text-gray-600">Already registered? <Link to="/login" className="text-blue-600 underline">Login here</Link></p>
// //       </div>
// //     </div>
// //   );
// // }













// import { useState } from 'react';
// import API from '../services/api';
// import { useNavigate, Link } from 'react-router-dom';

// export default function Register() {
//   const [formData, setFormData] = useState({
//     fatherName: '',
//     parentPhoneNumber: '',
//     password: ''
//   });  
//   const [error, setError] = useState('');
//   const [success, setSuccess] = useState('');
//   const navigate = useNavigate();

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setError('');
//     setSuccess('');
//     try {
//       await API.post('/parent/register', formData);  
//       setSuccess('Account created successfully! Redirecting to login...');
//       setTimeout(() => navigate('/login'), 2500);
//     } catch (err) {
//       setError(err.response?.data?.message || 'Verification failed. Ensure credentials match school records.');
//     }
//   };

//   return (
//     <div className="login-page-container">
//       {/* Inline Scoped CSS Stylesheet */}
//       <style>{`
//         html, body, #root {
//           background-color: #ffffff !important;
//           margin: 0;
//           padding: 0;
//           height: 100%;
//           width: 100%;
//           overflow-x: hidden;
//         }

//         .login-page-container {
//           min-height: 100vh;
//           width: 100%;
//           display: flex;
//           align-items: center;
//           justify-content: center;
//           background: #ffffff !important;
//           font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
//           box-sizing: border-box;
//           padding: 24px;
//           position: relative;
//         }

//         .login-card {
//           width: 100%;
//           max-width: 400px;
//           background-color: #ffffff;
//           padding: 12px 0px;
//           box-sizing: border-box;
//           border: none !important;
//           outline: none !important;
//           box-shadow: none !important;
//         }

//         .login-header {
//           text-align: center;
//           margin-bottom: 36px;
//         }

//         .login-title {
//           font-size: 32px;
//           font-weight: 800;
//           color: #0f172a;
//           margin: 0;
//           letter-spacing: -0.75px;
//         }

//         .login-subtitle {
//           font-size: 14px;
//           color: #64748b;
//           margin-top: 10px;
//           margin-bottom: 0;
//           line-height: 1.5;
//         }

//         .error-banner {
//           display: flex;
//           align-items: center;
//           gap: 10px;
//           background-color: #fff1f2;
//           border: 1px solid #ffe4e6;
//           color: #be123c;
//           padding: 14px 16px;
//           border-radius: 12px;
//           margin-bottom: 28px;
//           font-size: 14px;
//         }

//         .success-banner {
//           display: flex;
//           align-items: center;
//           gap: 10px;
//           background-color: #f0fdf4;
//           border: 1px solid #bbf7d0;
//           color: #15803d;
//           padding: 14px 16px;
//           border-radius: 12px;
//           margin-bottom: 28px;
//           font-size: 14px;
//         }

//         .status-icon {
//           width: 18px;
//           height: 18px;
//           flex-shrink: 0;
//         }

//         .login-form {
//           display: flex;
//           flex-direction: column;
//           gap: 24px;
//         }

//         .form-group {
//           display: flex;
//           flex-direction: column;
//           gap: 8px;
//         }

//         .form-label {
//           font-size: 12px;
//           font-weight: 600;
//           text-transform: uppercase;
//           letter-spacing: 0.75px;
//           color: #475569;
//         }

//         .form-input {
//           width: 100%;
//           padding: 14px 16px;
//           background-color: #f8fafc;
//           border: 1px solid #e2e8f0;
//           border-radius: 12px;
//           font-size: 15px;
//           color: #0f172a;
//           outline: none;
//           transition: all 0.15s ease-in-out;
//           box-sizing: border-box;
//         }

//         .form-input::placeholder {
//           color: #94a3b8;
//         }

//         .form-input:focus {
//           background-color: #ffffff;
//           border-color: #2563eb;
//           box-shadow: 0 0 0 4px #dbeafe;
//         }

//         .register-link {
//           font-size: 13px;
//           font-weight: 600;
//           color: #2563eb;
//           text-decoration: none;
//           transition: color 0.15s ease;
//         }

//         .register-link:hover {
//           color: #1d4ed8;
//         }

//         .register-link {
//           text-decoration: underline;
//           text-underline-offset: 4px;
//         }

//         .submit-btn {
//           width: 100%;
//           background-color: #0f172a;
//           color: #ffffff;
//           padding: 15px 16px;
//           border: none;
//           border-radius: 12px;
//           font-size: 15px;
//           font-weight: 600;
//           cursor: pointer;
//           transition: all 0.15s ease;
//           margin-top: 12px;
//         }

//         .submit-btn:hover {
//           background-color: #1e293b;
//         }

//         .submit-btn:active {
//           transform: scale(0.995);
//         }

//         .login-footer {
//           margin-top: 36px;
//           text-align: center;
//           font-size: 14px;
//           color: #64748b;
//         }
//       `}</style>

//       <div className="login-card">
//         {/* Header Section */}
//         <div className="login-header">
//           <h2 className="login-title">Create Account</h2>
//           <p className="login-subtitle">Use the Father Name & Phone Number registered with the school office</p>
//         </div>
        
//         {/* Error Notification Banner */}
//         {error && (
//           <div className="error-banner">
//             <svg className="status-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
//             </svg>
//             <span>{error}</span>
//           </div>
//         )}

//         {/* Success Notification Banner */}
//         {success && (
//           <div className="success-banner">
//             <svg className="status-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
//             </svg>
//             <span>{success}</span>
//           </div>
//         )}
        
//         {/* Registration Form */}
//         <form onSubmit={handleSubmit} className="login-form">
          
//           {/* Father's Name Field */}
//           <div className="form-group">
//             <label className="form-label">Father's Name (e.g., Stephen)</label>
//             <input 
//               type="text" 
//               required 
//               placeholder="Enter registered father's name"
//               className="form-input"
//               value={formData.fatherName} 
//               onChange={e => setFormData({...formData, fatherName: e.target.value})} 
//             />
//           </div>

//           {/* Phone Input Field */}
//           <div className="form-group">
//             <label className="form-label">Registered Phone Number</label>
//             <input 
//               type="text" 
//               required 
//               placeholder="e.g. 9876543210"
//               className="form-input"
//               value={formData.parentPhoneNumber}
//               onChange={e => setFormData({ ...formData, parentPhoneNumber: e.target.value })}
//             />
//           </div>

//           {/* Password Input Field */}
//           <div className="form-group">
//             <label className="form-label">Set App Password</label>
//             <input 
//               type="password" 
//               required 
//               placeholder="••••••••"
//               className="form-input"
//               value={formData.password} 
//               onChange={e => setFormData({ ...formData, password: e.target.value })} 
//             />
//           </div>

//           {/* Action Button */}
//           <button type="submit" className="submit-btn">
//             Verify & Register
//           </button>
//         </form>

//         {/* Footer Link Navigation */}
//         <p className="login-footer">
//           Already registered?{' '}
//           <Link to="/login" className="register-link">
//             Login here
//           </Link>
//         </p>
//       </div>
//     </div>
//   );
// }



// gemini


import { useState } from 'react';
import API from '../services/api';
import { useNavigate, Link } from 'react-router-dom';

export default function Register() {
//   const [formData, setFormData] = useState({
//     fatherName: '',
//     parentPhoneNumber: '',
//     password: ''
//   }); 

const [formData, setFormData] = useState({
  fatherName: '',
  parentPhoneNumber: '',
  email: '',   // ✅ ADD THIS
  password: ''
});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await API.post('/parent/register', formData);  
      setSuccess('Account created successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed. Ensure credentials match school records.');
    }
  };

  return (
    <div className="login-page-container">
      {/* Inline Scoped CSS Stylesheet */}
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
          border: 1px solid #bbf7d0;
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
          <h2 className="login-title">Create Account</h2>
          <p className="login-subtitle">Use the Father Name & Phone Number registered with the school office</p>
        </div>
        
        {/* Error Notification Banner */}
        {error && (
          <div className="error-banner">
            <svg className="status-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Success Notification Banner */}
        {success && (
          <div className="success-banner">
            <svg className="status-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{success}</span>
          </div>
        )}
        
        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="login-form">
          
          {/* Father's Name Field */}
          <div className="form-group">
            <label className="form-label">Father's Name (e.g., Stephen)</label>
            <input 
              type="text" 
              required 
              placeholder="Enter registered father's name"
              className="form-input"
              value={formData.fatherName} 
              onChange={e => setFormData({...formData, fatherName: e.target.value})} 
            />
          </div>

          {/* Phone Input Field */}
          <div className="form-group">
            <label className="form-label">Registered Phone Number</label>
            <input 
              type="text" 
              required 
              placeholder="e.g. 9876543210"
              className="form-input"
              value={formData.parentPhoneNumber}
              onChange={e => setFormData({ ...formData, parentPhoneNumber: e.target.value })}
            />
          </div>
<div className="form-group">
  <label className="form-label">Email</label>
  <input
    type="email"
    required
    placeholder="Enter email (used for password reset)"
    className="form-input"
    value={formData.email}
    onChange={(e) =>
      setFormData({ ...formData, email: e.target.value })
    }
  />
</div>
          {/* Password Input Field */}
          <div className="form-group">
            <label className="form-label">Set App Password</label>
            <input 
              type="password" 
              required 
              placeholder="••••••••"
              className="form-input"
              value={formData.password} 
              onChange={e => setFormData({ ...formData, password: e.target.value })} 
            />
          </div>

          {/* Action Button */}
          <button type="submit" className="submit-btn">
            Verify & Register
          </button>
        </form>

        {/* Footer Link Navigation */}
        <p className="login-footer">
          Already registered?{' '}
          <Link to="/login" className="register-link">
            Login here
          </Link>
        </p>
      </div>
    </div>
  );
}