import jwt from 'jsonwebtoken';

export const protectAdmin = async (req, res, next) => {
  let token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.adminId = decoded.id;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token failed, invalid authorization' });
  }
};

export const protectParent = async (req, res, next) => {
  let token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
   req.parent = {
  id: decoded.id,
  phone: decoded.phone
};
    // req.parentPhone = decoded.phone;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token failed, invalid authorization' });
  }
};