import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import { useNavigate, Link } from 'react-router-dom';
import { requestNotificationPermission } from "../utils/notification";

export default function Login() {
    
  const [formData, setFormData] = useState({
    parentPhoneNumber: '',
    password: ''
  });
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await API.post("/parent/login", formData);

// Save token first
login(res.data.token, res.data.parent);

// Wait a moment so localStorage is updated
setTimeout(async () => {
  try {
    await requestNotificationPermission();
  } catch (err) {
    console.error(err);
  }
}, 500);

navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials');
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

        .error-icon {
          width: 18px;
          height: 18px;
          color: #f43f5e;
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

        .form-label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
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

        .forgot-link, .register-link {
          font-size: 13px;
          font-weight: 600;
          color: #2563eb;
          text-decoration: none;
          transition: color 0.15s ease;
        }

        .forgot-link:hover, .register-link:hover {
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
          <h2 className="login-title">Parent Login</h2>
          <p className="login-subtitle">Enter your phone number and password to access your account</p>
        </div>
        
        {/* Error Notification Banner */}
        {error && (
          <div className="error-banner">
            <svg className="error-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}
        
        {/* Input Form */}
        <form onSubmit={handleSubmit} className="login-form">
          
          {/* Phone Input Field */}
          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input 
              type="text" 
              required 
              placeholder="e.g. 9876543210"
              className="form-input"
              value={formData.parentPhoneNumber}
              onChange={e => setFormData({ ...formData, parentPhoneNumber: e.target.value })}
            />
          </div>

          {/* Password Input Field */}
          <div className="form-group">
            <div className="form-label-row">
              <span style={{ width: '20px' }}></span> {/* Balancing Spacer for visual layout alignment */}
              <label className="form-label">Password</label>
              <Link to="/forgot-password" className="forgot-link">
                Forgot Password?
              </Link>
            </div>
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
            Sign In
          </button>
        </form>

        {/* Footer Link Navigation */}
        <p className="login-footer">
          New here?{' '}
          <Link to="/register" className="register-link">
            Register account
          </Link>
        </p>
      </div>
    </div>
  );
}