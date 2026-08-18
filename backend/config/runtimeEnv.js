const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const isLocalHostname = (hostname) => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  return (
    ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(normalized) ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local')
  );
};

const productionOrigin = (name, suppliedValue) => {
  const value = suppliedValue ?? required(name);
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS in production.`);
  }
  if (isLocalHostname(url.hostname)) {
    throw new Error(`${name} must not point to a local development host.`);
  }
  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials.`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an origin with no path, query string or fragment.`);
  }

  return url.origin;
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

    required('BUSINESS_TIME_ZONE');
    required('EMAIL_USER');
    required('EMAIL_PASS');
    required('CLOUDINARY_CLOUD_NAME');
    required('CLOUDINARY_API_KEY');
    required('CLOUDINARY_API_SECRET');
    required('FIREBASE_PROJECT_ID');
    required('FIREBASE_CLIENT_EMAIL');
    required('FIREBASE_PRIVATE_KEY');

    for (const name of [
      'PARENT_CLIENT_URL',
      'ADMIN_CLIENT_URL',
      'WAREHOUSE_CLIENT_URL',
      'KIOSK_CLIENT_URL',
    ]) {
      productionOrigin(name);
    }

    for (const value of (process.env.CORS_ORIGINS || '').split(',').filter(Boolean)) {
      productionOrigin('CORS_ORIGINS entry', value.trim());
    }

    const trustProxy = process.env.TRUST_PROXY?.trim();
    if (trustProxy) {
      const hops = Number(trustProxy);
      if (!Number.isInteger(hops) || hops < 1 || hops > 10) {
        throw new Error('TRUST_PROXY must be an integer from 1 to 10 when set.');
      }
    }
  }

  return { port };
};
