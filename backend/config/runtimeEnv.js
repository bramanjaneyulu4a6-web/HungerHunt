const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

export const validateRuntimeEnv = () => {
  required('MONGO_URI');
  const jwt = required('JWT_SECRET');
  const port = Number(process.env.PORT || 5001);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  try {
    new Intl.DateTimeFormat('en', {
      timeZone: process.env.BUSINESS_TIME_ZONE || 'Asia/Kolkata',
    }).format();
  } catch {
    throw new Error('BUSINESS_TIME_ZONE must be a valid IANA time zone.');
  }

  if (process.env.NODE_ENV === 'production') {
    const parentJwt = required('PARENT_JWT_SECRET');
    const studentJwt = required('STUDENT_JWT_SECRET');
    const secrets = [jwt, parentJwt, studentJwt];

    if (secrets.some((secret) => secret.length < 32)) {
      throw new Error('JWT secrets must each be at least 32 characters in production.');
    }
    if (new Set(secrets).size !== secrets.length) {
      throw new Error('JWT_SECRET, PARENT_JWT_SECRET and STUDENT_JWT_SECRET must be different.');
    }
  }

  return { port };
};
