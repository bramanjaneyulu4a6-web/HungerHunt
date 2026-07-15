import { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [parent, setParent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  const token = localStorage.getItem('parentToken');
  const savedParent = localStorage.getItem('parentData');

  if (token) {
    try {
      const parsed = savedParent ? JSON.parse(savedParent) : null;
      setParent(parsed);
    } catch (e) {
      console.log("Invalid parentData in localStorage");
      localStorage.removeItem('parentData');
    }
  }

  setLoading(false);
}, []);
//   useEffect(() => {
//     const token = localStorage.getItem('parentToken');
//     const savedParent = localStorage.getItem('parentData');
//     if (token && savedParent) {
//       setParent(JSON.parse(savedParent));
//     }
//     setLoading(false);
//   }, []);

  const login = (token, parentData) => {
    localStorage.setItem('parentToken', token);
    localStorage.setItem('parentData', JSON.stringify(parentData));
    setParent(parentData);
  };

  const logout = () => {
    localStorage.removeItem('parentToken');
    localStorage.removeItem('parentData');
    setParent(null);
  };

  return (
    <AuthContext.Provider value={{ parent, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);