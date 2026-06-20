const { expect } = require('chai');
const httpMocks = require('node-mocks-http');
const mongoose = require('mongoose');
const { createConnection } = require('@app-core/mongoose');
const { CreatorCard } = require('@app/models');

const HELPERS = { http_statuses: { HTTP_200_OK: 200 } };
const createHandler = require('../endpoints/creator-cards/create').handler;
const getHandler = require('../endpoints/creator-cards/get-by-slug').handler;
const deleteHandler = require('../endpoints/creator-cards/delete').handler;

function post(body) {
  return createHandler(httpMocks.createRequest({ method: 'POST', body }), HELPERS);
}
function get(slug, accessCode) {
  return getHandler(
    httpMocks.createRequest({
      method: 'GET',
      params: { slug },
      query: accessCode === undefined ? {} : { access_code: accessCode },
    }),
    HELPERS
  );
}
function del(slug, body) {
  return deleteHandler(
    httpMocks.createRequest({ method: 'DELETE', params: { slug }, body }),
    HELPERS
  );
}
async function code(promise) {
  try {
    await promise;
    return null;
  } catch (e) {
    return e.errorCode;
  }
}
const ref = (s) => `crt_${s}`.padEnd(20, '0').slice(0, 20);

describe('Creator Card — endpoints', function endpoints() {
  this.timeout(20000);
  let connected = false;

  before(async function connect() {
    if (!process.env.MONGODB_URI) this.skip();
    try {
      await createConnection({ uri: process.env.MONGODB_URI });
      await CreatorCard.init();
      connected = true;
    } catch (e) {
      this.skip();
    }
  });

  beforeEach(async () => {
    if (connected) await CreatorCard.deleteMany({});
  });

  after(async () => {
    if (connected) {
      await CreatorCard.deleteMany({});
      await mongoose.disconnect();
    }
  });

  it('public card lifecycle: create → retrieve → delete → gone', async () => {
    const created = await post({
      title: 'George Cooks',
      creator_reference: ref('george'),
      status: 'published',
    });
    expect(created.status).to.equal(200);
    expect(created.message).to.equal('Creator Card Created Successfully.');
    expect(created.data.id).to.be.a('string');
    expect(created.data).to.not.have.property('_id');
    expect(created.data.slug).to.equal('george-cooks');
    expect(created.data.access_type).to.equal('public');
    expect(created.data.access_code).to.equal(null);
    expect(created.data.created).to.equal(created.data.updated);
    expect(created.data.deleted).to.equal(null);

    const got = await get('george-cooks');
    expect(got.status).to.equal(200);
    expect(got).to.have.nested.property('data.id');
    expect(got.data).to.not.have.property('access_code');

    const deleted = await del('george-cooks', { creator_reference: ref('george') });
    expect(deleted.message).to.equal('Creator Card Deleted Successfully.');
    expect(deleted.data.deleted).to.be.a('number');
    expect(deleted.data).to.have.property('access_code');
    expect(deleted.data.updated).to.equal(created.data.updated);

    expect(await code(get('george-cooks'))).to.equal('NF01');
  });

  it('private card: create echoes access_code, retrieval with pin omits it', async () => {
    const created = await post({
      title: 'VIP Rate Card',
      creator_reference: ref('vip'),
      status: 'published',
      access_type: 'private',
      access_code: 'A1B2C3',
    });
    expect(created.data.access_code).to.equal('A1B2C3');

    const got = await get('vip-rate-card', 'A1B2C3');
    expect(got.status).to.equal(200);
    expect(got.data).to.not.have.property('access_code');
  });

  it('duplicate provided slug → SL02', async () => {
    await post({
      title: 'George',
      slug: 'george-cooks',
      creator_reference: ref('a'),
      status: 'published',
    });
    expect(
      await code(
        post({
          title: 'Other',
          slug: 'george-cooks',
          creator_reference: ref('b'),
          status: 'published',
        })
      )
    ).to.equal('SL02');
  });

  it('private without access_code → AC01', async () => {
    expect(
      await code(
        post({
          title: 'Secret',
          creator_reference: ref('s'),
          status: 'published',
          access_type: 'private',
        })
      )
    ).to.equal('AC01');
  });

  it('public with access_code → AC05', async () => {
    expect(
      await code(
        post({
          title: 'Public',
          creator_reference: ref('p'),
          status: 'published',
          access_code: 'A1B2C3',
        })
      )
    ).to.equal('AC05');
  });

  it('retrieval order: missing → NF01, draft → NF02, private no/wrong pin → AC03/AC04', async () => {
    expect(await code(get('missing'))).to.equal('NF01');

    await post({
      title: 'My Draft',
      slug: 'my-draft',
      creator_reference: ref('d'),
      status: 'draft',
    });
    expect(await code(get('my-draft'))).to.equal('NF02');

    await post({
      title: 'Priv',
      slug: 'priv-card',
      creator_reference: ref('pr'),
      status: 'published',
      access_type: 'private',
      access_code: 'A1B2C3',
    });
    expect(await code(get('priv-card'))).to.equal('AC03');
    expect(await code(get('priv-card', 'WRONG1'))).to.equal('AC04');
  });

  it('delete non-existent → NF01', async () => {
    expect(await code(del('missing', { creator_reference: ref('x') }))).to.equal('NF01');
  });

  it('delete with a mismatched creator_reference → NF01, card survives', async () => {
    await post({
      title: 'Owned',
      slug: 'owned-card',
      creator_reference: ref('owner'),
      status: 'published',
    });
    expect(await code(del('owned-card', { creator_reference: ref('attacker') }))).to.equal('NF01');
    expect((await get('owned-card')).status).to.equal(200);
  });

  it('invalid input → 400 (framework enum and custom amount check)', async () => {
    expect(
      await code(post({ title: 'Bad', creator_reference: ref('q'), status: 'archived' }))
    ).to.equal('SPCL_VALIDATION');
    expect(
      await code(
        post({
          title: 'Bad Amount',
          creator_reference: ref('q'),
          status: 'published',
          service_rates: {
            currency: 'NGN',
            rates: [{ name: 'svc', description: 'd', amount: 1.5 }],
          },
        })
      )
    ).to.equal('VALIDATION_ERROR');
  });

  it('null service_rates → clean VALIDATION_ERROR, not a crash', async () => {
    expect(
      await code(
        post({
          title: 'Null Rates',
          creator_reference: ref('n'),
          status: 'published',
          service_rates: null,
        })
      )
    ).to.equal('VALIDATION_ERROR');
  });

  it('ignores injected _id / created / deleted', async () => {
    const r = await post({
      _id: 'EVIL',
      created: 1,
      deleted: 999,
      title: 'Inject',
      creator_reference: ref('i'),
      status: 'published',
    });
    expect(r.data.id).to.not.equal('EVIL');
    expect(r.data.id).to.have.length(26);
    expect(r.data.created).to.not.equal(1);
    expect(r.data.deleted).to.equal(null);
  });

  it('concurrent same-title creates → all succeed with distinct slugs', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        post({ title: 'Race', creator_reference: ref('race'), status: 'published' })
      )
    );
    expect(results.every((r) => r.status === 200)).to.equal(true);
    expect(new Set(results.map((r) => r.data.slug)).size).to.equal(6);
  });

  it('concurrent deletes of one card → exactly one 200', async () => {
    await post({
      title: 'Del Race',
      slug: 'del-race',
      creator_reference: ref('delrace'),
      status: 'published',
    });
    const statuses = await Promise.all(
      Array.from({ length: 8 }, () =>
        del('del-race', { creator_reference: ref('delrace') })
          .then((r) => r.status)
          .catch((e) => e.errorCode)
      )
    );
    expect(statuses.filter((s) => s === 200)).to.have.length(1);
    expect(statuses.filter((s) => s === 'NF01')).to.have.length(7);
  });
});
