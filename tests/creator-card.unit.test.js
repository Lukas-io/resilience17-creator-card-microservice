const { expect } = require('chai');
const validator = require('@app-core/validator');
const {
  parsedCreateSpec,
  assertNoNullContainers,
  runExtraFieldChecks,
  assertAccessCodeRules,
} = require('../services/creator-cards/validation');
const { serializeCard, serializePublicCard } = require('../services/creator-cards/serializer');
const {
  slugifyTitle,
  generateUniqueSlug,
  isValidSlugCharset,
} = require('../services/creator-cards/slug');

function codeOf(fn) {
  try {
    fn();
    return null;
  } catch (e) {
    return e.errorCode;
  }
}

describe('Creator Card — unit', () => {
  describe('VSL field validation', () => {
    it('accepts a valid payload', () => {
      const d = validator.validate(
        {
          title: 'George Cooks',
          slug: 'george-cooks',
          creator_reference: 'crt_8f2k1m9x4p7w3q5z',
          status: 'published',
        },
        parsedCreateSpec
      );
      expect(d.title).to.equal('George Cooks');
    });

    it('rejects an invalid status enum', () => {
      expect(
        codeOf(() =>
          validator.validate(
            { title: 'Bad Status', creator_reference: 'crt_8f2k1m9x4p7w3q5z', status: 'archived' },
            parsedCreateSpec
          )
        )
      ).to.equal('SPCL_VALIDATION');
    });

    it('rejects a short title', () => {
      expect(
        codeOf(() =>
          validator.validate(
            { title: 'ab', creator_reference: 'crt_8f2k1m9x4p7w3q5z', status: 'published' },
            parsedCreateSpec
          )
        )
      ).to.equal('SPCL_VALIDATION');
    });

    it('rejects creator_reference that is not exactly 20 chars', () => {
      expect(
        codeOf(() =>
          validator.validate(
            { title: 'Valid Title', creator_reference: 'too-short', status: 'published' },
            parsedCreateSpec
          )
        )
      ).to.equal('SPCL_VALIDATION');
    });

    it('drops unknown/server-controlled fields', () => {
      const d = validator.validate(
        {
          _id: 'EVIL',
          created: 0,
          deleted: 1,
          title: 'Valid Title',
          creator_reference: 'crt_8f2k1m9x4p7w3q5z',
          status: 'published',
        },
        parsedCreateSpec
      );
      expect(d).to.not.have.property('_id');
      expect(d).to.not.have.property('created');
      expect(d).to.not.have.property('deleted');
    });
  });

  describe('extra field checks', () => {
    it('rejects a bad slug charset', () => {
      expect(codeOf(() => runExtraFieldChecks({ slug: 'has space' }))).to.equal('VALIDATION_ERROR');
    });
    it('rejects a non-http(s) url', () => {
      expect(
        codeOf(() => runExtraFieldChecks({ links: [{ title: 'x', url: 'ftp://x' }] }))
      ).to.equal('VALIDATION_ERROR');
    });
    it('rejects a non-integer amount', () => {
      expect(
        codeOf(() =>
          runExtraFieldChecks({
            service_rates: {
              currency: 'NGN',
              rates: [{ name: 'abc', description: 'd', amount: 1.5 }],
            },
          })
        )
      ).to.equal('VALIDATION_ERROR');
    });
    it('rejects empty rates', () => {
      expect(
        codeOf(() => runExtraFieldChecks({ service_rates: { currency: 'NGN', rates: [] } }))
      ).to.equal('VALIDATION_ERROR');
    });
    it('passes valid links and slug', () => {
      expect(
        codeOf(() =>
          runExtraFieldChecks({
            slug: 'george-cooks',
            links: [{ title: 'x', url: 'https://x.io' }],
          })
        )
      ).to.equal(null);
    });
  });

  describe('null container guard', () => {
    it('rejects service_rates: null', () => {
      expect(codeOf(() => assertNoNullContainers({ service_rates: null }))).to.equal(
        'VALIDATION_ERROR'
      );
    });
    it('rejects links: [null]', () => {
      expect(codeOf(() => assertNoNullContainers({ links: [null] }))).to.equal('VALIDATION_ERROR');
    });
    it('rejects rates: [null]', () => {
      expect(
        codeOf(() => assertNoNullContainers({ service_rates: { currency: 'NGN', rates: [null] } }))
      ).to.equal('VALIDATION_ERROR');
    });
    it('passes a clean body', () => {
      expect(codeOf(() => assertNoNullContainers({ title: 'x' }))).to.equal(null);
    });
  });

  describe('access_code business rules', () => {
    it('AC05 when public + code present', () => {
      expect(codeOf(() => assertAccessCodeRules('public', 'A1B2C3'))).to.equal('AC05');
    });
    it('AC01 when private + code missing', () => {
      expect(codeOf(() => assertAccessCodeRules('private', undefined))).to.equal('AC01');
    });
    it('400 when private + bad format', () => {
      expect(codeOf(() => assertAccessCodeRules('private', 'xx'))).to.equal('VALIDATION_ERROR');
    });
    it('passes private + valid code', () => {
      expect(codeOf(() => assertAccessCodeRules('private', 'A1B2C3'))).to.equal(null);
    });
    it('passes public + no code', () => {
      expect(codeOf(() => assertAccessCodeRules('public', undefined))).to.equal(null);
    });
  });

  describe('slug generation', () => {
    it('slugifies a title', () => {
      expect(slugifyTitle('Ada Designs Things')).to.equal('ada-designs-things');
    });
    it('strips punctuation', () => {
      expect(slugifyTitle('Hi!!! There')).to.equal('hi-there');
    });
    it('validates charset', () => {
      expect(isValidSlugCharset('a_b-1')).to.equal(true);
      expect(isValidSlugCharset('a b')).to.equal(false);
    });
    it('returns the base when free', async () => {
      expect(await generateUniqueSlug('Ada Designs Things', async () => false)).to.equal(
        'ada-designs-things'
      );
    });
    it('appends a suffix when the base is taken', async () => {
      const s = await generateUniqueSlug('Cook', async (x) => x === 'cook');
      expect(s).to.match(/^cook-[0-9a-f]{6}$/);
    });
  });

  describe('serializer', () => {
    const doc = {
      _id: '01ABC',
      title: 'T',
      description: 'd',
      slug: 's-lug',
      creator_reference: 'crt_0000000000000001',
      links: [{ title: 'x', url: 'https://x' }],
      service_rates: { currency: 'NGN', rates: [] },
      status: 'published',
      access_type: 'public',
      access_code: null,
      created: 1,
      updated: 2,
      deleted: null,
    };

    it('maps _id to id and includes access_code (create/delete)', () => {
      const c = serializeCard(doc);
      expect(c.id).to.equal('01ABC');
      expect(c).to.not.have.property('_id');
      expect(c).to.have.property('access_code');
    });

    it('omits access_code and _id on retrieval', () => {
      const c = serializePublicCard(doc);
      expect(c).to.not.have.property('access_code');
      expect(c).to.not.have.property('_id');
      expect(c.id).to.equal('01ABC');
    });

    it('omits absent optional fields', () => {
      const c = serializeCard({
        _id: '1',
        title: 'T',
        slug: 'sslug',
        creator_reference: 'crt_0000000000000001',
        status: 'published',
        access_type: 'public',
        access_code: null,
        created: 1,
        updated: 1,
        deleted: null,
      });
      expect(c).to.not.have.property('description');
      expect(c).to.not.have.property('links');
      expect(c).to.not.have.property('service_rates');
    });
  });
});
