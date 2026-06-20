const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { CreatorCardMessages } = require('@app/messages');
const creatorCardRepo = require('@app/repository/creator-card');
const { serializePublicCard } = require('./serializer');

async function getCreatorCardBySlug({ slug, accessCode }) {
  const card = await creatorCardRepo.findOne({ query: { slug } });

  if (!card || card.deleted) {
    throwAppError(CreatorCardMessages.CARD_NOT_FOUND, ERROR_CODE.NF01);
  }

  if (card.status === 'draft') {
    throwAppError(CreatorCardMessages.CARD_NOT_FOUND, ERROR_CODE.NF02);
  }

  if (card.access_type === 'private') {
    if (accessCode === undefined || accessCode === null || accessCode === '') {
      throwAppError(CreatorCardMessages.PRIVATE_ACCESS_CODE_REQUIRED, ERROR_CODE.AC03);
    }
    if (accessCode !== card.access_code) {
      throwAppError(CreatorCardMessages.INVALID_ACCESS_CODE, ERROR_CODE.AC04);
    }
  }

  return serializePublicCard(card);
}

module.exports = getCreatorCardBySlug;
