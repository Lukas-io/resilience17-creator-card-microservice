const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { CreatorCardMessages } = require('@app/messages');
const creatorCardRepo = require('@app/repository/creator-card');
const { parsedDeleteSpec } = require('./validation');
const { serializeCard } = require('./serializer');

async function deleteCreatorCard({ slug, body }) {
  const { creator_reference: creatorReference } = validator.validate(body, parsedDeleteSpec);

  const deletedAt = Date.now();
  const card = await creatorCardRepo.raw().findOneAndUpdate(
    { slug, creator_reference: creatorReference, deleted: null },
    { $set: { deleted: deletedAt } },
    {
      new: false,
      lean: true,
    }
  );

  if (!card) {
    throwAppError(CreatorCardMessages.CARD_NOT_FOUND, ERROR_CODE.NF01);
  }

  return serializeCard({ ...card, deleted: deletedAt });
}

module.exports = deleteCreatorCard;
