const { createHandler } = require('@app-core/server');
const { appLogger } = require('@app-core/logger');
const getCreatorCardBySlug = require('@app/services/creator-cards/get-by-slug');
const { CreatorCardMessages } = require('@app/messages');

module.exports = createHandler({
  path: '/creator-cards/:slug',
  method: 'get',
  middlewares: [],
  async onResponseEnd(rc, rs) {
    appLogger.info({ requestContext: rc, response: rs }, 'get-creator-card-completed');
  },
  async handler(rc, helpers) {
    const data = await getCreatorCardBySlug({
      slug: rc.params.slug,
      accessCode: rc.query.access_code,
    });
    return {
      status: helpers.http_statuses.HTTP_200_OK,
      message: CreatorCardMessages.RETRIEVED,
      data,
    };
  },
});
