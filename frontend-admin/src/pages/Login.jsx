import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post('/admin/login', { email, password });
      localStorage.setItem('adminToken', response.data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid Credentials');
    }
  };

  // Custom Crisp White & Corporate Blue Palette Styling
  const styles = {
    container: {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',   // use full screen height
  padding: '20px',
   width: '100vw', 
  backgroundColor: '#ffffff', // pure white
},
    card: {
      width: '100%',
      maxWidth: '400px',
      background: '#ffffff', // Pure white card
      border: '1px solid #e2e8f0', // Clean soft border
      borderRadius: '12px',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
      padding: '40px 32px',
      textAlign: 'left',
    },
    header: {
      textAlign: 'center',
      marginBottom: '28px',
    },
    title: {
      fontSize: '28px',
      margin: '0 0 6px 0',
      fontWeight: '700',
      color: '#1e293b', // Deep slate for text
    },
    subtitle: {
      fontSize: '14px',
      color: '#64748b', // Medium gray-blue text
      margin: 0,
    },
    errorBox: {
      backgroundColor: '#fef2f2',
      border: '1px solid #fee2e2',
      color: '#ef4444',
      padding: '12px',
      borderRadius: '6px',
      marginBottom: '20px',
      fontSize: '14px',
      textAlign: 'center',
    },
    formGroup: {
      marginBottom: '20px',
    },
    label: {
      display: 'block',
      fontSize: '13px',
      fontWeight: '600',
      marginBottom: '6px',
      color: '#475569',
    },
    input: {
      width: '100%',
      padding: '12px',
      fontSize: '15px',
      background: '#ffffff',
      border: '1px solid #cbd5e1',
      borderRadius: '8px',
      color: '#0f172a',
      boxSizing: 'border-box',
      outline: 'none',
      transition: 'border-color 0.2s',
    },
    linksContainer: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: '13px',
      marginBottom: '24px',
    },
    linkLeft: {
      color: '#64748b',
      textDecoration: 'none',
    },
    linkRight: {
      color: '#2563eb', // Vibrant Blue Link
      textDecoration: 'none',
      fontWeight: '600',
    },
    button: {
      width: '100%',
      padding: '13px',
      fontSize: '16px',
      fontWeight: '600',
      background: '#2563eb', // Classic Blue Button
      color: '#ffffff',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
      transition: 'background-color 0.2s',
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Admin Portal</h2>
          <p style={styles.subtitle}>Sign in to access your dashboard</p>
        </div>

        {/* Error Handling */}
        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Input Form */}
        <form onSubmit={handleLogin}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Email Address</label>
            <input 
              type="email" 
              required 
              style={styles.input} 
              placeholder="admin@email.com"
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input 
              type="password" 
              required 
              style={styles.input} 
              placeholder="••••••••"
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
            />
          </div>

          {/* Nav Links */}
          <div style={styles.linksContainer}>
            <Link to="/register" style={styles.linkLeft} className="hover-link-blue">
              Register Admin
            </Link>
            <Link to="/forgot-password" style={styles.linkRight} className="hover-link-blue">
              Forgot Password?
            </Link>
          </div>

          {/* Action Trigger */}
          <button type="submit" style={styles.button}>
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;