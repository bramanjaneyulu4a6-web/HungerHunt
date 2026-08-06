import jwt from 'jsonwebtoken';

import { authBypassEnabled, resolveBypassAdmin, resolveBypassParent } from './devBypass.js';

const readToken = (req) => req.headers.authorization?.split(' ')[1];

export const protectAdmin = async (req, res, next) => {
  if (authBypassEnabled) {
    const adminId = await resolveBypassAdmin();
    if (!adminId) {
      return res.status(503).json({
        message: 'AUTH_BYPASS is on but there is no admin account to impersonate'
      });
    }

    req.adminId = adminId;
    return next();
  }

  const token = readToken(req);
  if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.adminId = decoded.id;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token failed, invalid authorization' });
  }
};

// Records who is calling when a token is present, without demanding one.
// Used by admin registration, which is open only while no admin exists yet.
export const identifyAdmin = async (req, res, next) => {
  const token = readToken(req);
  if (!token) return next();

  try {
    req.adminId = jwt.verify(token, process.env.JWT_SECRET).id;
  } catch {
    // An unusable token is treated the same as none at all.
  }

  next();
};

export const protectParent = async (req, res, next) => {
  if (authBypassEnabled) {
    const parent = await resolveBypassParent();
    if (!parent) {
      return res.status(503).json({
        message: 'AUTH_BYPASS is on but there is no parent account to impersonate'
      });
    }

    req.parent = parent;
    return next();
  }

  const token = readToken(req);
  if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.parent = {
      id: decoded.id,
      phone: decoded.phone
    };
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token failed, invalid authorization' });
  }
};
