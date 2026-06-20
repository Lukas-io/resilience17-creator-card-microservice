# Creator Card API

A Creator Card microservice — link-in-bio cards with attached service rate cards. Built on the R17 Node.js/Express scaffold, persisted to MongoDB.

> Scaffold internals (services, endpoints, validator, error utilities) are documented in [documentation.md](./documentation.md). This file documents the solution.

## Endpoints

All endpoints live at the **root** of the base URL — no versioning, no auth.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/creator-cards` | Create a card |
| `GET` | `/creator-cards/:slug` | Public retrieval by slug |
| `DELETE` | `/creator-cards/:slug` | Soft-delete by slug |

All three return **HTTP 200** on success with `{ status: "success", message, data }`. The identifier is always serialized as `id` (never `_id`). `access_code` is returned on create/delete (`null` when public) and **omitted entirely** on retrieval.

### `POST /creator-cards`

```jsonc
// request
{
  "title": "George Cooks",                 // required, 3–100 chars
  "description": "Weekly cooking podcast",  // optional, ≤500
  "slug": "george-cooks",                   // optional, 5–50, [A-Za-z0-9_-]; auto-generated from title if omitted
  "creator_reference": "crt_8f2k1m9x4p7w3q5z", // required, exactly 20 chars
  "links": [{ "title": "YouTube", "url": "https://youtube.com/@georgecooks" }],
  "service_rates": {
    "currency": "NGN",                       // NGN | USD | GBP | GHS
    "rates": [{ "name": "IG Story Post", "description": "One story mention", "amount": 5000000 }]
  },
  "status": "published",                     // required, draft | published
  "access_type": "public",                   // optional, public | private (default public)
  "access_code": "A1B2C3"                     // required iff private; exactly 6 alphanumeric
}
```

### `GET /creator-cards/:slug`

Private cards take the pin as a query param: `GET /creator-cards/vip-rate-card?access_code=A1B2C3`. Access rules apply in order: `NF01` (missing/deleted) → `NF02` (draft) → `AC03` (private, no pin) → `AC04` (private, wrong pin) → `200`.

### `DELETE /creator-cards/:slug`

Body: `{ "creator_reference": "<exactly 20 chars>" }`. The `creator_reference` must match the card's — a missing card *or* a mismatched reference both return `NF01` (so the endpoint never reveals whether a slug exists to a non-owner). Returns the deleted card in creation format with `deleted` set; the card is then no longer retrievable (`NF01`).

## Error codes

Field-level validation (types, lengths, enums) is handled by the template validator (VSL) and returns **HTTP 400**. Business rules carry these codes:

| Code | HTTP | Meaning |
|------|------|---------|
| `SL02` | 400 | Slug already taken |
| `AC01` | 400 | `access_code` required when `access_type` is private |
| `AC05` | 400 | `access_code` set on a public card |
| `NF01` | 404 | Card not found (or deleted) |
| `NF02` | 404 | Card exists but is a draft |
| `AC03` | 403 | Private card, no access code supplied |
| `AC04` | 403 | Private card, wrong access code |

Every error response is uniform: `{ "status": "error", "message": "...", "code": "..." }`.

## Validation

- **VSL** (`@app-core/validator`) handles types, required/optional, lengths, and enums.
- A thin in-service layer covers what VSL can't express (regex/integer): slug charset, URL scheme, `access_code` format, integer amounts, and null-container guards. All return 400.
- Business rules (slug uniqueness, conditional `access_code`, retrieval access control) are implemented in the services and carry the custom codes above.

## Core template edits

The scaffold was changed in exactly **two files**, both minimal and additive, to satisfy the assessment's "all errors must return appropriate JSON responses with proper HTTP status codes":

- `core/errors/constants.js` — registers the seven business codes and their HTTP statuses.
- `core/express/server.js` — surfaces the top-level `code` on the error envelope, and makes the malformed-JSON and global-404 responses use the same `{ status, message, code }` shape.

No other core behavior was modified.

## Setup

```bash
npm install
cp .env.example .env   # set MONGODB_URI and PORT
npm start              # node app.js  (Procfile: node bootstrap.js)
```

Required env: `PORT`, `MONGODB_URI` (MongoDB Atlas or local).

## Tests

```bash
npm test
```

- **Unit** tests (no DB) cover validation, access-code rules, slug generation, and serialization.
- **Integration** tests drive the real endpoint handlers against MongoDB (all 16 acceptance cases plus field injection, null containers, and create/delete concurrency). They self-skip if `MONGODB_URI` is not set.

## Deployment

Deploy to Heroku/Render with `MONGODB_URI` set. The `Procfile` runs `node bootstrap.js`. Submit the **base URL only** — no versioning, no endpoint paths.

## Structure

```
endpoints/creator-cards/   create.js, get-by-slug.js, delete.js
services/creator-cards/    create.js, get-by-slug.js, delete.js, validation.js, slug.js, serializer.js
models/creator-card.js     ULID _id, unique slug index, soft-delete field
repository/creator-card/    repositoryFactory('CreatorCard')
messages/creator-card.js    messages
tests/                      unit + integration
```
