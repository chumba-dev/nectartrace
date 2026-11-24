# NectarTrace

NectarTrace is a fair-trade honey sourcing and traceability platform for Baringo County, Kenya. Farmers use USSD to opt in and submit harvest offers, verified cooperatives measure and aggregate accepted lots, buyers order listed batches, and public users verify batch provenance on Polygon.

This repository is a final-year Computer Science project by Collins Kiprop Chumba at Dedan Kimathi University of Technology.

## Architecture

- `frontend/`: React 19, Vite, React Router, TanStack Query, Tailwind CSS.
- `backend/`: Node.js 20, Express, Prisma/PostgreSQL, Africa's Talking, Google Identity, SMTP, and Daraja Sandbox.
- `blockchain/`: Solidity 0.8.19, Hardhat, OpenZeppelin AccessControl, and Polygon Amoy.

PostgreSQL is authoritative for users, cooperatives, offers/lots, payout ledgers, batches, listings, orders, USSD sessions, harvest logs, and SMS logs. The blockchain stores batch-level provenance plus a commitment hash of the contributing integer offer IDs. Farmer identity, phone, PIN, M-Pesa, offer, and payment data never go on-chain.

## Core Lifecycle

1. An unknown phone dials USSD and opts in with name, ward, explicit consent, and a hashed four-digit PIN.
2. A farmer submits an offer to a verified cooperative. Offers expire after 48 hours if not accepted.
3. The cooperative accepts or rejects. Direct purchases include an agreed price; consignments snapshot the cooperative commission.
4. On delivery, staff record actual weighed kilograms and moisture. Payment calculations use weighed kilograms, never offered kilograms.
5. Staff verify the measured lot. Verified lots can be aggregated into one batch.
6. The backend validates positive safe-integer offer IDs, sorts them numerically, converts them to canonical base-10 strings, joins them with a newline, and computes `keccak256` over the UTF-8 bytes. Only this lot commitment and batch details are recorded on-chain.
7. Direct purchases or sold consignments create one idempotent Daraja B2C Sandbox payout ledger entry.

## Prerequisites

- Node.js 20.19 or newer in the Node 20 release line.
- PostgreSQL 16.
- Africa's Talking Sandbox credentials for USSD/SMS testing.
- Daraja Sandbox B2C credentials for payout testing.
- Polygon Amoy RPC access and a funded test wallet.

## Install

```powershell
cd backend
npm ci

cd ..\blockchain
npm ci

cd ..\frontend
npm ci
```

Copy each `.env.example` to `.env` locally and use deployment-platform environment variables in production. Never commit credentials.

## Database Setup

Generate and validate the Prisma client:

```powershell
cd backend
npx prisma generate
npx prisma validate
```

For the existing deployed PostgreSQL database, apply pending migrations:

```powershell
npx prisma migrate deploy
```

The repository contains incremental migrations but no original baseline migration. The offer/payment migration reuses the existing `HarvestOffer` table, preserves its integer IDs and legacy columns, backfills required lifecycle values before adding constraints, changes the batch relation from one-to-one to many-to-one, and creates `Payment`. The retired payout table remains present only for compatibility. Review and back up an existing database before deployment. For a new disposable development database, use `npx prisma db push` until a production-safe baseline migration is established.

There is no offer data-import step from another datastore. Offer and payment records are managed only through Prisma after this migration.

Seed development identities and a verified cooperative:

```powershell
$env:SEED_ADMIN_EMAIL = 'admin@example.test'
$env:SEED_ADMIN_PHONE = '+254700000001'
$env:SEED_ADMIN_PASSWORD = 'replace-with-a-development-password'
npm run seed
```

Production defaults to `SEED_MODE=admin-only` and refuses to use development credentials. Set `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PHONE`, and `SEED_ADMIN_PASSWORD`, then run `npm run seed`. Use `SEED_MODE=full` only when intentionally creating all documented development roles and the example cooperative.

## Backend Environment

See `backend/.env.example` for the complete list. The major groups are:

- PostgreSQL: `DATABASE_URL`.
- Authentication: `JWT_SECRET`, Google Client ID, SMTP settings.
- Africa's Talking: API key, username, shortcode, optional approved sender ID.
- Blockchain: Amoy RPC URL, relayer private key, v2 contract address.
- Daraja Sandbox: consumer key/secret, B2C shortcode, initiator name, encrypted security credential, result URL, and timeout URL.

Daraja is intentionally restricted to `https://sandbox.safaricom.co.ke`. Live payouts, automatic ambiguous-payment retries, and payment reconciliation are future work. Do not place production B2C credentials in this project until those controls are implemented and reviewed.

## HoneyBatch v2 Deployment

HoneyBatch v2 adds gram-accurate weight and `lotIdsHash`. It is incompatible with the old deployed contract and requires a new address.

```powershell
cd blockchain
npm run compile
npm test
npm run deploy:amoy
```

Set the printed address as the backend `CONTRACT_ADDRESS`. The deployer receives the admin and cooperative relayer roles. New cooperative wallets receive their role only when an administrator verifies the cooperative.

## Run Locally

Start each application in a separate terminal:

```powershell
cd backend
npm run dev
```

```powershell
cd frontend
npm run dev
```

The default API URL is `http://localhost:5000/api`; the frontend defaults to `http://localhost:5173`.

## USSD Sandbox

Configure the Africa's Talking callback as:

```text
https://<public-backend>/api/ussd
```

The stateful menu supports four choices per page, `98` for More, and `0` for Back. Main options are:

```text
1 Log harvest
2 Check prices
3 My account
4 Offer harvest to cooperative
5 My offers
```

Use `backend/test-ussd.html` for manual callback simulation or the Africa's Talking Sandbox simulator for end-to-end USSD and SMS behavior.

## Daraja Sandbox Callbacks

Configure public HTTPS callback URLs:

```text
https://<public-backend>/api/payments/daraja/result
https://<public-backend>/api/payments/daraja/timeout
```

Payment references are unique idempotency keys. A retry with the same reference returns the existing ledger and cannot initiate a second payout. A different reference cannot create another payout for the same offer and purpose.

## Tests

Run backend regressions:

```powershell
cd backend
npm test -- --runInBand
```

Run smart-contract tests:

```powershell
cd blockchain
npm run compile
npm test
```

Validate the frontend:

```powershell
cd frontend
npm run lint -- --quiet
npm run build
```

The test suite covers opt-in, cooperative filtering, kilogram validation, USSD pagination/back navigation, offer expiry, farmer ownership, payout idempotency, public QR verification, lot-hash determinism, batch reservation rollback, and contract privacy.

## Deployment Order

1. Provision PostgreSQL.
2. Apply Prisma migrations and configure seed/manual admin credentials.
3. Deploy HoneyBatch v2 to Amoy and update `CONTRACT_ADDRESS`.
4. Configure backend environment variables and deploy the API.
5. Configure Africa's Talking, SMTP, Google, and Daraja Sandbox callbacks.
6. Configure `VITE_API_URL` and `VITE_GOOGLE_CLIENT_ID`, then rebuild the frontend.

## Security Notes

- Admin cannot be created through password registration, Google registration, or role-change APIs.
- USSD PINs are bcrypt hashes and are never returned or stored in session JSON.
- Farmer and payment data remain off-chain.
- Public QR verification requires no token and exposes batch provenance only.
- Secrets belong in local ignored `.env` files or deployment environment settings, never tracked examples.
