const crypto = require('crypto');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { CreatorCardMessages } = require('@app/messages');
const idempotencyRepo = require('@app/repository/idempotency-key');

const TTL_MS = 24 * 60 * 60 * 1000;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function fingerprint(body) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalize(body)))
    .digest('hex');
}

async function withIdempotency(key, body, produce) {
  const requestHash = fingerprint(body);

  let reserved = false;
  try {
    await idempotencyRepo.create({
      key,
      request_hash: requestHash,
      status: 'pending',
      response: null,
      expires_at: new Date(Date.now() + TTL_MS),
    });
    reserved = true;
  } catch (e) {
    if (e.errorCode !== ERROR_CODE.DUPLRCRD) throw e;
  }

  if (!reserved) {
    const existing = await idempotencyRepo.findOne({ query: { key } });
    if (!existing || existing.request_hash !== requestHash) {
      throwAppError(CreatorCardMessages.IDEMPOTENCY_CONFLICT, ERROR_CODE.IK01);
    }
    if (existing.status !== 'completed') {
      throwAppError(CreatorCardMessages.IDEMPOTENCY_IN_PROGRESS, ERROR_CODE.IK02);
    }
    return existing.response;
  }

  let response;
  try {
    response = await produce();
  } catch (e) {
    await idempotencyRepo.deleteOne({ query: { key } });
    throw e;
  }

  await idempotencyRepo.updateOne({
    query: { key },
    updateValues: { status: 'completed', response },
  });

  return response;
}

module.exports = { withIdempotency, fingerprint };
