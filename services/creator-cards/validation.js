const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { CreatorCardMessages } = require('@app/messages');
const { isValidSlugCharset } = require('./slug');

const createSpec = `root {
  title string<trim|minLength:3|maxLength:100>
  description? string<maxLength:500>
  slug? string<minLength:5|maxLength:50>
  creator_reference string<length:20>
  links[]? {
    title string<minLength:1|maxLength:100>
    url string<maxLength:200>
  }
  service_rates? {
    currency string(NGN|USD|GBP|GHS)
    rates[] {
      name string<minLength:3|maxLength:100>
      description string<maxLength:250>
      amount number<min:1>
    }
  }
  status string(draft|published)
  access_type? string(public|private)
  access_code? string
}`;

const deleteSpec = `root {
  creator_reference string<length:20>
}`;

const parsedCreateSpec = validator.parse(createSpec);
const parsedDeleteSpec = validator.parse(deleteSpec);

const URL_SCHEME = /^https?:\/\//;
const ACCESS_CODE = /^[A-Za-z0-9]{6}$/;

function badRequest(message) {
  throwAppError(message, ERROR_CODE.VALIDATIONERR);
}

function assertNoNullContainers(body) {
  if (!body || typeof body !== 'object') return;

  if (body.service_rates === null) {
    badRequest(CreatorCardMessages.INVALID_SERVICE_RATES);
  }

  if (Array.isArray(body.links) && body.links.some((link) => link === null)) {
    badRequest(CreatorCardMessages.INVALID_LINK);
  }

  const rates = body.service_rates && body.service_rates.rates;
  if (Array.isArray(rates) && rates.some((rate) => rate === null)) {
    badRequest(CreatorCardMessages.INVALID_SERVICE_RATES);
  }
}

function runExtraFieldChecks(data) {
  if (data.slug !== undefined && !isValidSlugCharset(data.slug)) {
    badRequest(CreatorCardMessages.INVALID_SLUG_FORMAT);
  }

  if (Array.isArray(data.links) && !data.links.every((link) => URL_SCHEME.test(link.url))) {
    badRequest(CreatorCardMessages.INVALID_LINK_URL);
  }

  if (data.service_rates !== undefined) {
    const { rates } = data.service_rates;
    if (!Array.isArray(rates) || rates.length === 0) {
      badRequest(CreatorCardMessages.RATES_REQUIRED);
    }
    if (!rates.every((rate) => Number.isInteger(rate.amount) && rate.amount >= 1)) {
      badRequest(CreatorCardMessages.INVALID_AMOUNT);
    }
  }
}

function assertAccessCodeRules(accessType, accessCode) {
  const provided = accessCode !== undefined && accessCode !== null;

  if (accessType === 'private') {
    if (!provided) throwAppError(CreatorCardMessages.ACCESS_CODE_REQUIRED, ERROR_CODE.AC01);
    if (!ACCESS_CODE.test(accessCode)) badRequest(CreatorCardMessages.INVALID_ACCESS_CODE_FORMAT);
  } else if (provided) {
    throwAppError(CreatorCardMessages.ACCESS_CODE_NOT_ALLOWED, ERROR_CODE.AC05);
  }
}

module.exports = {
  parsedCreateSpec,
  parsedDeleteSpec,
  assertNoNullContainers,
  runExtraFieldChecks,
  assertAccessCodeRules,
};
