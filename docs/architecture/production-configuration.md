# Production configuration

Use this checklist when promoting HungerHunt from local development to a hosted environment. Do not store credentials in the repository.

## Backend

Set `NODE_ENV=production` and provide all of the following:

- `MONGO_URI`
- `JWT_SECRET`, `PARENT_JWT_SECRET`, and `STUDENT_JWT_SECRET` (distinct, at least 32 characters each)
- `BUSINESS_TIME_ZONE`
- `EMAIL_USER` and `EMAIL_PASS`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`
- `PARENT_CLIENT_URL`, `ADMIN_CLIENT_URL`, `WAREHOUSE_CLIENT_URL`, and `KIOSK_CLIENT_URL`

Each client URL must be its public HTTPS origin only, without a path, query, fragment, or embedded credentials. Localhost and loopback addresses are rejected in production.

`CORS_ORIGINS` is optional and may contain additional comma-separated HTTPS origins. Every entry is validated using the same rules.

Set `TRUST_PROXY` only when the hosting topology requires it. The value must be the number of trusted proxy hops from `1` through `10`; determine the correct value from the hosting provider rather than guessing.

The backend validates this configuration during startup and exits before serving traffic if a production requirement is missing or unsafe.

## Frontends

For each web application, set:

- `VITE_API_BASE_URL=https://<public-api-host>/api`
- `VITE_AUTH_BYPASS=false`

Build a release with `npm run build:release` from each frontend directory. This command rejects HTTP, localhost, embedded credentials, query strings, fragments, and API paths other than `/api` before invoking Vite.

The four frontend directories are:

- `frontend-parent`
- `frontend-admin`
- `hungerhunt-kiosk`
- `hungerhunt-warehouse`

## Deployment verification

1. Deploy the backend with its production environment variables.
2. Confirm `GET /health/ready` succeeds through the public HTTPS endpoint.
3. Build and deploy each frontend using its release build command.
4. Confirm sign-in, role authorization, password reset, uploads, email, and push notifications against the hosted services.
5. Run the acceptance scenarios in `docs/architecture/acceptance-testing.md` before enabling real users.
