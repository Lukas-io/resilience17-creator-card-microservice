function buildCard(doc, { includeAccessCode }) {
  const card = { id: doc._id, title: doc.title };

  if (doc.description !== undefined && doc.description !== null) {
    card.description = doc.description;
  }

  card.slug = doc.slug;
  card.creator_reference = doc.creator_reference;

  if (doc.links !== undefined && doc.links !== null) card.links = doc.links;
  if (doc.service_rates !== undefined && doc.service_rates !== null) {
    card.service_rates = doc.service_rates;
  }

  card.status = doc.status;
  card.access_type = doc.access_type;

  if (includeAccessCode) card.access_code = doc.access_code ?? null;

  card.created = doc.created;
  card.updated = doc.updated;
  card.deleted = doc.deleted ?? null;

  return card;
}

function serializeCard(doc) {
  return buildCard(doc, { includeAccessCode: true });
}

function serializePublicCard(doc) {
  return buildCard(doc, { includeAccessCode: false });
}

module.exports = { serializeCard, serializePublicCard };
