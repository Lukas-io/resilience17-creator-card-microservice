const { expect } = require('chai');
const httpMocks = require('node-mocks-http');
const mongoose = require('mongoose');
const { createConnection } = require('@app-core/mongoose');
const { CreatorCard, IdempotencyKey } = require('@app/models');

const HELPERS = { http_statuses: { HTTP_200_OK: 200 } };
const createHandler = require('../endpoints/creator-cards/create').handler;

function post(body, key) {
  return createHandler(
    httpMocks.createRequest({
      method: 'POST',
      body,
      headers: key ? { 'idempotency-key': key } : {},
    }),
    HELPERS
  );
}
async function errCode(promise) {
  try {
    await promise;
    return null;
  } catch (e) {
    return e.errorCode;
  }
}
const body = (title) => ({
  title,
  creator_reference: 'crt_idemtest00000001',
  status: 'published',
});

describe('Creator Card — idempotency (integration)', function idempotency() {
  this.timeout(20000);
  let connected = false;

  before(async function connect() {
    if (!process.env.MONGODB_URI) this.skip();
    try {
      await createConnection({ uri: process.env.MONGODB_URI });
      await CreatorCard.init();
      await IdempotencyKey.init();
      connected = true;
    } catch (e) {
      this.skip();
    }
  });

  beforeEach(async () => {
    if (connected) {
      await CreatorCard.deleteMany({});
      await IdempotencyKey.deleteMany({});
    }
  });

  after(async () => {
    if (connected) {
      await CreatorCard.deleteMany({});
      await IdempotencyKey.deleteMany({});
      await mongoose.disconnect();
    }
  });

  it('replays the same response and creates only one card', async () => {
    const r1 = await post(body('Idem One'), 'key-aaa');
    const r2 = await post(body('Idem One'), 'key-aaa');
    expect(r1.data.id).to.equal(r2.data.id);
    expect(await CreatorCard.countDocuments({})).to.equal(1);
  });

  it('returns IK01 when the key is reused with a different body', async () => {
    await post(body('Idem One'), 'key-bbb');
    expect(await errCode(post(body('Different Title'), 'key-bbb'))).to.equal('IK01');
    expect(await CreatorCard.countDocuments({})).to.equal(1);
  });

  it('creates exactly one card under concurrent same-key retries', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => post(body('Race Idem'), 'key-ccc'))
    );
    const fulfilledIds = new Set(
      results.filter((r) => r.status === 'fulfilled').map((r) => r.value.data.id)
    );
    const rejectedCodes = results
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason.errorCode);
    expect(fulfilledIds.size).to.equal(1);
    expect(rejectedCodes.every((c) => c === 'IK02')).to.equal(true);
    expect(await CreatorCard.countDocuments({})).to.equal(1);
  });

  it('does not record a key when no header is sent', async () => {
    await post(body('No Key'));
    expect(await IdempotencyKey.countDocuments({})).to.equal(0);
  });

  it('releases the reservation when creation fails, allowing a corrected retry', async () => {
    expect(
      await errCode(
        post(
          { title: 'ab', creator_reference: 'crt_idemtest00000001', status: 'published' },
          'key-ddd'
        )
      )
    ).to.equal('SPCL_VALIDATION');
    expect(await IdempotencyKey.countDocuments({})).to.equal(0);
    const r = await post(body('Recovered'), 'key-ddd');
    expect(r.status).to.equal(200);
  });
});
