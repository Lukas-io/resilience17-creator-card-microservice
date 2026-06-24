const { ModelSchema, SchemaTypes, DatabaseModel } = require('@app-core/mongoose');

const modelName = 'idempotency_keys';

/**
 * @typedef {Object} IdempotencyKeySchema
 * @property {String} _id
 * @property {String} key
 * @property {String} request_hash
 * @property {String} status
 * @property {Object|null} response
 * @property {Date} expires_at
 * @property {Number} created
 * @property {Number} updated
 */

const schemaConfig = {
  _id: { type: SchemaTypes.ULID, required: true },
  key: { type: SchemaTypes.String, required: true, unique: true },
  request_hash: { type: SchemaTypes.String, required: true },
  status: { type: SchemaTypes.String, required: true },
  response: { type: SchemaTypes.Mixed, default: null },
  expires_at: { type: SchemaTypes.Date, required: true },
  created: { type: SchemaTypes.Number, required: true },
  updated: { type: SchemaTypes.Number, required: true },
};

const modelSchema = new ModelSchema(schemaConfig, { collection: modelName });

modelSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

/** @type {IdempotencyKeySchema} */
module.exports = DatabaseModel.model(modelName, modelSchema);
