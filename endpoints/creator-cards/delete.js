const { createHandler } = require('@app-core/server');
const { appLogger } = require('@app-core/logger');
const deleteCreatorCardService = require('@app/services/creator-cards/delete');
const { CreatorCardMessages } = require('@app/messages');

module.exports = createHandler({
  path: '/creator-cards/:slug',
  method: 'delete',
  middlewares: [],
  async onResponseEnd(rc, rs) {
    appLogger.info({ requestContext: rc, response: rs }, 'delete-creator-card-completed');
  },
  async handler(rc, helpers) {
    const data = await deleteCreatorCardService({ slug: rc.params.slug, body: rc.body });
    return {
      status: helpers.http_statuses.HTTP_200_OK,
      message: CreatorCardMessages.DELETED,
      data,
    };
  },
});
