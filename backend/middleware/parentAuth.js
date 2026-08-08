import jwt from "jsonwebtoken";

export const protectParent = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Not authorized. No token provided.",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.parent = {
      id: decoded.id,
      phone: decoded.phone,
    };

    next();
  } catch (error) {
    console.error("Parent authentication error:", error);

    return res.status(401).json({
      message: "Not authorized. Invalid or expired token.",
    });
  }
};