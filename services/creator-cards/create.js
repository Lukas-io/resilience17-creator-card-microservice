/* eslint-disable no-await-in-loop */
const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { CreatorCardMessages } = require('@app/messages');
const creatorCardRepo = require('@app/repository/creator-card');
const {
  parsedCreateSpec,
  assertNoNullContainers,
  runExtraFieldChecks,
  assertAccessCodeRules,
} = require('./validation');
const { generateUniqueSlug } = require('./slug');
const { serializeCard } = require('./serializer');
const { withIdempotency } = require('./idempotency');

const MAX_CREATE_ATTEMPTS = 5;

async function isSlugTaken(slug) {
  const existing = await creatorCardRepo.findOne({ query: { slug } });
  return !!existing;
}

async function persistCreatorCard(serviceData) {
  assertNoNullContainers(serviceData);

  const data = validator.validate(serviceData, parsedCreateSpec);

  runExtraFieldChecks(data);

  const accessType = data.access_type || 'public';
  assertAccessCodeRules(accessType, data.access_code);

  const slugProvided = data.slug !== undefined;
  let { slug } = data;

  if (slugProvided) {
    if (await isSlugTaken(slug)) {
      throwAppError(CreatorCardMessages.SLUG_TAKEN, ERROR_CODE.SL02);
    }
  } else {
    slug = await generateUniqueSlug(data.title, isSlugTaken);
  }

  const toCreate = {
    title: data.title,
    creator_reference: data.creator_reference,
    status: data.status,
    access_type: accessType,
    access_code: accessType === 'private' ? data.access_code : null,
  };
  if (data.description !== undefined) toCreate.description = data.description;
  if (data.links !== undefined) toCreate.links = data.links;
  if (data.service_rates !== undefined) toCreate.service_rates = data.service_rates;

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
    try {
      const created = await creatorCardRepo.create({ ...toCreate, slug });
      return serializeCard(created);
    } catch (e) {
      if (e.errorCode !== ERROR_CODE.DUPLRCRD) throw e;
      if (slugProvided) throwAppError(CreatorCardMessages.SLUG_TAKEN, ERROR_CODE.SL02);
      slug = await generateUniqueSlug(data.title, isSlugTaken);
    }
  }

  return throwAppError(CreatorCardMessages.SLUG_TAKEN, ERROR_CODE.SL02);
}

async function createCreatorCard(serviceData, options = {}) {
  const { idempotencyKey } = options;
  if (idempotencyKey) {
    return withIdempotency(idempotencyKey, serviceData, () => persistCreatorCard(serviceData));
  }
  return persistCreatorCard(serviceData);
}

module.exports = createCreatorCard;
