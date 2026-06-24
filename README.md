# Creator Card API

A small microservice for **Creator Cards** — shareable "link-in-bio" profiles with service rate cards attached. Node.js + Express on the R17 scaffold, persisted to MongoDB.

**Live:** https://creator-card-api-4anp.onrender.com

> The scaffold's internals (validator, error utilities, repository factory) are covered in [documentation.md](./documentation.md). This README focuses on the solution and how to run it.

## Endpoints

Three endpoints, all at the **root** of the base URL — no versioning, no auth.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/creator-cards` | Create a card |
| `GET` | `/creator-cards/:slug` | Public retrieval by slug |
| `DELETE` | `/creator-cards/:slug` | Soft-delete by slug |

Every success is **HTTP 200** with `{ status: "success", message, data }`. The identifier is always serialized as `id`, never `_id`. `access_code` is returned on create and delete (`null` for public cards) but **never** on retrieval.

### `POST /creator-cards`

```jsonc
{
  "title": "George Cooks",                     // required, 3–100 chars
  "description": "Weekly cooking podcast",      // optional, ≤ 500
  "slug": "george-cooks",                       // optional, 5–50, [A-Za-z0-9_-]; auto-generated from the title if omitted
  "creator_reference": "crt_8f2k1m9x4p7w3q5z",  // required, exactly 20 chars
  "links": [{ "title": "YouTube", "url": "https://youtube.com/@georgecooks" }],
  "service_rates": {
    "currency": "NGN",                          // NGN | USD | GBP | GHS
    "rates": [{ "name": "IG Story Post", "description": "One story mention", "amount": 5000000 }]
  },
  "status": "published",                        // required, draft | published
  "access_type": "public",                      // optional, public | private (defaults to public)
  "access_code": "A1B2C3"                       // required iff private; exactly 6 alphanumeric chars
}
```

### `GET /creator-cards/:slug`

Private cards take the pin as a query parameter: `…/vip-rate-card?access_code=A1B2C3`. The access rules are applied in a strict order:

`NF01` (missing/deleted) → `NF02` (draft) → `AC03` (private, no pin) → `AC04` (private, wrong pin) → `200`.

### `DELETE /creator-cards/:slug`

Body: `{ "creator_reference": "<exactly 20 chars>" }`. The reference must match the card's — a missing card and a mismatched reference both return `NF01`, so the endpoint never reveals whether a slug exists to someone who doesn't own it. On success it returns the deleted card in the creation shape with `deleted` set; the card is no longer retrievable afterwards.

## Error codes

Field-level validation (types, lengths, enums) is handled by the template validator and returns **HTTP 400**. Business rules carry their own codes:

| Code | HTTP | Meaning |
|------|------|---------|
| `SL02` | 400 | Slug already taken |
| `AC01` | 400 | `access_code` required when `access_type` is private |
| `AC05` | 400 | `access_code` set on a public card |
| `NF01` | 404 | Card not found (or deleted) |
| `NF02` | 404 | Card exists but is a draft |
| `AC03` | 403 | Private card, no access code supplied |
| `AC04` | 403 | Private card, wrong access code |

Every error response uses one shape: `{ "status": "error", "message": "...", "code": "..." }`.

## How validation works

Two layers, each failure landing on **HTTP 400**:

- **VSL** (`@app-core/validator`) handles the declarative rules — types, required/optional, lengths, and enums.
- A thin in-service layer covers what a schema DSL can't express: slug character set, URL scheme, `access_code` format, **integer** amounts (so `10.5` is rejected even though it's ≥ 1), and guards against `null` where an object/array is expected.

Business rules that need data access — slug uniqueness, the conditional `access_code` logic, and the retrieval access-control ordering — live in the services and carry the custom codes above.

## Idempotency

`POST /creator-cards` accepts an optional `Idempotency-Key` header — the canonical safeguard against double-submits when a client retries on a flaky network.

- Same key + same body → the **identical original response** (one card created).
- Same key + a **different** body → **409** `IK01`.
- Concurrent retries with the same key are **reserve-first**, so they can never double-create; an in-flight duplicate gets **409** `IK02`.
- Keys are stored with a request fingerprint (`sha256`) and **expire after 24h** (Mongo TTL index).
- No header → standard behaviour; the three required contracts are untouched.

## Core template edits

The scaffold was touched in exactly **two files**, both minimal and additive, to meet the brief's requirement that *all* errors return proper JSON with proper status codes:

- `core/errors/constants.js` — registers the seven business codes and their HTTP statuses.
- `core/express/server.js` — surfaces the top-level `code` on the error envelope, and brings the malformed-JSON and global-404 responses into the same `{ status, message, code }` shape.

Nothing else in `core/` was changed.

## Running locally

```bash
npm install
cp .env.example .env     # set MONGODB_URI and PORT
npm start                # node app.js   (the Procfile uses: node bootstrap.js)
```

| Variable | Required | Notes |
|----------|----------|-------|
| `PORT` | yes | Port to listen on (the host sets this in production) |
| `MONGODB_URI` | yes | MongoDB connection string (Atlas or local) |
| `NODE_ENV` | no | `production` in deployment |

A local MongoDB via Docker is enough for development:

```bash
docker run -d --name cc-mongo -p 27017:27017 mongo:7
# .env -> MONGODB_URI=mongodb://localhost:27017/creator_cards
```

## Tests

```bash
npm test
```

The suite focuses on logic written here and the edge cases worth guarding, rather than re-testing the framework:

- **Unit** — slug generation and the serializer's `id`/`access_code` rules (no DB).
- **Integration** — the full request/response contract (create, retrieve, delete, every business code, and the retrieval ordering) plus the cases we hardened against: ownership mismatch, server-field injection, `null` containers, and create/delete concurrency. These self-skip if `MONGODB_URI` isn't set.

## Deployment

Deployed on **Render** (web service) backed by **MongoDB Atlas**. The `Procfile` runs `node bootstrap.js`; endpoints sit at the root of the base URL.

### 1. MongoDB Atlas

1. Create a free **M0** cluster.
2. Add a database user with least privilege — `readWrite` on the app database only — and a strong password.
3. **Network access:** allowlist your host's outbound IPs. For Render, use its regional egress ranges (dashboard → service → *Connect → Outbound*) rather than `0.0.0.0/0`, so the database is reachable only from the app.
4. Connection string: `mongodb+srv://<user>:<password>@<cluster>/creator_cards?retryWrites=true&w=majority`.

### 2. Render web service

| Setting | Value |
|---------|-------|
| Environment | Node |
| Build command | `npm install` |
| Start command | `node bootstrap.js` |
| Plan | Free |
| Env vars | `MONGODB_URI`, `NODE_ENV=production` |

Create it from the dashboard (New → Web Service → connect the repo) or the CLI:

```bash
render services create \
  --name creator-card-api --type web_service \
  --repo https://github.com/<owner>/<repo> --branch main \
  --runtime node \
  --build-command "npm install" \
  --start-command "node bootstrap.js" \
  --plan free \
  --env-var "MONGODB_URI=<your-atlas-uri>" \
  --env-var "NODE_ENV=production" --confirm
```

> `package.json`'s `prepare` script is `husky || true`, so production installs (which skip dev dependencies) don't fail when husky isn't present.

### 3. Verify

```bash
curl -X POST https://<your-app>.onrender.com/creator-cards \
  -H 'Content-Type: application/json' \
  -d '{"title":"George Cooks","creator_reference":"crt_8f2k1m9x4p7w3q5z","status":"published"}'
```

## Project structure

```
endpoints/creator-cards/   create.js, get-by-slug.js, delete.js   (thin HTTP handlers)
services/creator-cards/    create.js, get-by-slug.js, delete.js,
                           validation.js, slug.js, serializer.js  (business logic)
models/creator-card.js     schema — ULID _id, unique slug index, soft-delete field
repository/creator-card/   repositoryFactory('CreatorCard')
messages/creator-card.js   user-facing strings
tests/                     unit + integration
```

## Notes

- **Idempotency (optional, not merged).** An `Idempotency-Key` header on create — safe client retries with no duplicate cards — is prototyped in [PR #2](https://github.com/Lukas-io/resilience17-creator-card-microservice/pull/2). It's intentionally kept off `main` so the graded surface stays the minimal three-endpoint contract; happy to walk through it.
