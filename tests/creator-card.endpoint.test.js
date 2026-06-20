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
async function errCode(promise) {
  try {
    await promise;
    return null;
  } catch (e) {
    return e.errorCode;
  }
}

describe('Creator Card — endpoints (integration)', function integration() {
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

  it('TC1 — full create: 200, id not _id, defaults to public', async () => {
    const r = await post({
      title: 'George Cooks',
      description: 'Weekly cooking podcast',
      slug: 'george-cooks',
      creator_reference: 'crt_8f2k1m9x4p7w3q5z',
      links: [{ title: 'YouTube', url: 'https://youtube.com/@georgecooks' }],
      service_rates: {
        currency: 'NGN',
        rates: [{ name: 'IG Story Post', description: 'One story mention', amount: 5000000 }],
      },
      status: 'published',
    });
    expect(r.status).to.equal(200);
    expect(r.message).to.equal('Creator Card Created Successfully.');
    expect(r.data.id).to.be.a('string');
    expect(r.data).to.not.have.property('_id');
    expect(r.data.access_type).to.equal('public');
    expect(r.data.access_code).to.equal(null);
    expect(r.data.deleted).to.equal(null);
    expect(r.data.created).to.equal(r.data.updated);
  });

  it('TC2 — slug auto-generation', async () => {
    const r = await post({
      title: 'Ada Designs Things',
      creator_reference: 'crt_a1b2c3d4e5f6g7h8',
      status: 'published',
    });
    expect(r.data.slug).to.equal('ada-designs-things');
  });

  it('TC3 — private create echoes access_code', async () => {
    const r = await post({
      title: 'VIP Rate Card',
      creator_reference: 'crt_x9y8z7w6v5u4t3s2',
      status: 'published',
      access_type: 'private',
      access_code: 'A1B2C3',
    });
    expect(r.data.access_code).to.equal('A1B2C3');
    expect(r.data.slug).to.equal('vip-rate-card');
  });

  it('TC4 — retrieve public omits access_code', async () => {
    await post({
      title: 'George Cooks',
      slug: 'george-cooks',
      creator_reference: 'crt_8f2k1m9x4p7w3q5z',
      status: 'published',
    });
    const r = await get('george-cooks');
    expect(r.status).to.equal(200);
    expect(r.message).to.equal('Creator Card Retrieved Successfully.');
    expect(r.data).to.not.have.property('access_code');
    expect(r.data).to.not.have.property('_id');
  });

  it('TC5 — retrieve private with correct pin omits access_code', async () => {
    await post({
      title: 'VIP Rate Card',
      creator_reference: 'crt_x9y8z7w6v5u4t3s2',
      status: 'published',
      access_type: 'private',
      access_code: 'A1B2C3',
    });
    const r = await get('vip-rate-card', 'A1B2C3');
    expect(r.status).to.equal(200);
    expect(r.data).to.not.have.property('access_code');
  });

  it('TC6 — delete returns creation format, deleted set, updated unchanged', async () => {
    const created = await post({
      title: 'Ada Designs Things',
      creator_reference: 'crt_a1b2c3d4e5f6g7h8',
      status: 'published',
    });
    const r = await del('ada-designs-things', { creator_reference: 'crt_a1b2c3d4e5f6g7h8' });
    expect(r.status).to.equal(200);
    expect(r.message).to.equal('Creator Card Deleted Successfully.');
    expect(r.data.deleted).to.be.a('number');
    expect(r.data).to.have.property('access_code');
    expect(r.data.updated).to.equal(created.data.updated);
  });

  it('TC7 — duplicate provided slug -> SL02', async () => {
    await post({
      title: 'George Cooks',
      slug: 'george-cooks',
      creator_reference: 'crt_8f2k1m9x4p7w3q5z',
      status: 'published',
    });
    expect(
      await errCode(
        post({
          title: 'Another George',
          slug: 'george-cooks',
          creator_reference: 'crt_m1n2b3v4c5x6z7l8',
          status: 'published',
        })
      )
    ).to.equal('SL02');
  });

  it('TC8 — private without access_code -> AC01', async () => {
    expect(
      await errCode(
        post({
          title: 'Secret Card',
          creator_reference: 'crt_q1w2e3r4t5y6u7i8',
          status: 'published',
          access_type: 'private',
        })
      )
    ).to.equal('AC01');
  });

  it('TC9 — public with access_code -> AC05', async () => {
    expect(
      await errCode(
        post({
          title: 'Public Card',
          creator_reference: 'crt_q1w2e3r4t5y6u7i8',
          status: 'published',
          access_type: 'public',
          access_code: 'A1B2C3',
        })
      )
    ).to.equal('AC05');
  });

  it('TC10 — framework validation (archived) -> 400', async () => {
    expect(
      await errCode(
        post({ title: 'Bad Status', creator_reference: 'crt_q1w2e3r4t5y6u7i8', status: 'archived' })
      )
    ).to.equal('SPCL_VALIDATION');
  });

  it('TC11 — retrieve non-existent -> NF01', async () => {
    expect(await errCode(get('does-not-exist-123'))).to.equal('NF01');
  });

  it('TC12 — retrieve draft -> NF02', async () => {
    await post({
      title: 'My Draft Card',
      slug: 'my-draft-card',
      creator_reference: 'crt_draftcard0000001',
      status: 'draft',
    });
    expect(await errCode(get('my-draft-card'))).to.equal('NF02');
  });

  it('TC13 — retrieve private without pin -> AC03', async () => {
    await post({
      title: 'VIP Rate Card',
      creator_reference: 'crt_x9y8z7w6v5u4t3s2',
      status: 'published',
      access_type: 'private',
      access_code: 'A1B2C3',
    });
    expect(await errCode(get('vip-rate-card'))).to.equal('AC03');
  });

  it('TC14 — retrieve private with wrong pin -> AC04', async () => {
    await post({
      title: 'VIP Rate Card',
      creator_reference: 'crt_x9y8z7w6v5u4t3s2',
      status: 'published',
      access_type: 'private',
      access_code: 'A1B2C3',
    });
    expect(await errCode(get('vip-rate-card', 'WRONG1'))).to.equal('AC04');
  });

  it('TC15 — delete non-existent -> NF01', async () => {
    expect(
      await errCode(del('does-not-exist-123', { creator_reference: 'crt_q1w2e3r4t5y6u7i8' }))
    ).to.equal('NF01');
  });

  it('TC16 — retrieve a deleted card -> NF01', async () => {
    await post({
      title: 'Ada Designs Things',
      creator_reference: 'crt_a1b2c3d4e5f6g7h8',
      status: 'published',
    });
    await del('ada-designs-things', { creator_reference: 'crt_a1b2c3d4e5f6g7h8' });
    expect(await errCode(get('ada-designs-things'))).to.equal('NF01');
  });

  it('strips injected server-controlled fields', async () => {
    const r = await post({
      _id: 'EVIL',
      id: 'EVIL',
      created: 1,
      deleted: 999,
      title: 'Inject Test',
      creator_reference: 'crt_q1w2e3r4t5y6u7i8',
      status: 'published',
    });
    expect(r.data.id).to.not.equal('EVIL');
    expect(r.data.id).to.have.length(26);
    expect(r.data.created).to.not.equal(1);
    expect(r.data.deleted).to.equal(null);
  });

  it('rejects a null nested container with a clean code', async () => {
    expect(
      await errCode(
        post({
          title: 'Null Rates',
          creator_reference: 'crt_q1w2e3r4t5y6u7i8',
          status: 'published',
          service_rates: null,
        })
      )
    ).to.equal('VALIDATION_ERROR');
  });

  it('concurrent same-title creates -> all succeed with distinct slugs', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        post({
          title: 'Race Title',
          creator_reference: 'crt_race00000000001x',
          status: 'published',
        })
      )
    );
    const slugs = new Set(results.map((r) => r.data.slug));
    expect(results.every((r) => r.status === 200)).to.equal(true);
    expect(slugs.size).to.equal(6);
  });

  it('concurrent delete -> exactly one success', async () => {
    await post({
      title: 'Delete Race',
      slug: 'delete-race',
      creator_reference: 'crt_deleterace00001x',
      status: 'published',
    });
    const codes = await Promise.all(
      Array.from({ length: 8 }, () =>
        del('delete-race', { creator_reference: 'crt_deleterace00001x' })
          .then((r) => r.status)
          .catch((e) => e.errorCode)
      )
    );
    expect(codes.filter((c) => c === 200)).to.have.length(1);
    expect(codes.filter((c) => c === 'NF01')).to.have.length(7);
  });
});
