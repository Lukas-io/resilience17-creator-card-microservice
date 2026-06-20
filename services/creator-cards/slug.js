/* eslint-disable no-await-in-loop */
const { randomBytes } = require('@app-core/randomness');

const SLUG_MIN = 5;
const SLUG_MAX = 50;
const SUFFIX_LEN = 6;
const SLUG_CHARSET = /^[A-Za-z0-9_-]+$/;

function isValidSlugCharset(slug) {
  return typeof slug === 'string' && SLUG_CHARSET.test(slug);
}

function randomSuffix() {
  return randomBytes(SUFFIX_LEN);
}

function slugifyTitle(title) {
  return String(title)
    .toLowerCase()
    .replace(/\s/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, SLUG_MAX);
}

function withSuffix(base) {
  const root = (base || 'card').slice(0, SLUG_MAX - SUFFIX_LEN - 1);
  return `${root}-${randomSuffix()}`;
}

async function generateUniqueSlug(title, isSlugTaken) {
  const base = slugifyTitle(title);

  if (base.length >= SLUG_MIN && !(await isSlugTaken(base))) {
    return base;
  }

  for (let i = 0; i < 5; i += 1) {
    const candidate = withSuffix(base);
    if (!(await isSlugTaken(candidate))) return candidate;
  }

  return withSuffix(`${base || 'card'}-${randomSuffix()}`);
}

module.exports = { isValidSlugCharset, slugifyTitle, generateUniqueSlug, SLUG_MIN, SLUG_MAX };
