const { expect } = require('chai');
const { serializeCard, serializePublicCard } = require('../services/creator-cards/serializer');
const { slugifyTitle, generateUniqueSlug } = require('../services/creator-cards/slug');

describe('Creator Card — unit', () => {
  describe('slug generation', () => {
    it('lowercases the title and hyphenates whitespace', () => {
      expect(slugifyTitle('Ada Designs Things')).to.equal('ada-designs-things');
    });

    it('strips characters outside [a-z0-9_-]', () => {
      expect(slugifyTitle('Hi!!! There')).to.equal('hi-there');
    });

    it('appends a 6-char suffix when the base is already taken', async () => {
      const slug = await generateUniqueSlug('Cook', async (s) => s === 'cook');
      expect(slug).to.match(/^cook-[0-9a-f]{6}$/);
    });

    it('appends a suffix when the slugified base is shorter than 5 chars', async () => {
      const slug = await generateUniqueSlug('Hi', async () => false);
      expect(slug).to.match(/^hi-[0-9a-f]{6}$/);
    });
  });

  describe('serializer', () => {
    const doc = {
      _id: '01ABC',
      title: 'T',
      slug: 's-lug',
      creator_reference: 'crt_0000000000000001',
      status: 'published',
      access_type: 'private',
      access_code: 'A1B2C3',
      created: 1,
      updated: 1,
      deleted: null,
    };

    it('maps _id to id and includes access_code (create/delete shape)', () => {
      const card = serializeCard(doc);
      expect(card.id).to.equal('01ABC');
      expect(card).to.not.have.property('_id');
      expect(card.access_code).to.equal('A1B2C3');
    });

    it('omits access_code entirely on retrieval, even for an unlocked private card', () => {
      const card = serializePublicCard(doc);
      expect(card).to.not.have.property('access_code');
      expect(card).to.not.have.property('_id');
      expect(card.id).to.equal('01ABC');
    });
  });
});
