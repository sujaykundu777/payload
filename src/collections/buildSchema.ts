import paginate from 'mongoose-paginate-v2';
import buildQueryPlugin from '../mongoose/buildQuery';
import buildSchema from '../mongoose/buildSchema';

const buildCollectionSchema = (collection, config, schemaOptions = {}) => {
  const schema = buildSchema(config, collection.fields, { timestamps: collection.timestamps !== false, ...schemaOptions });
  if (collection.id) {
    schema.add({ _id: collection.id });
  }
  schema.plugin(paginate)
    .plugin(buildQueryPlugin);

  return schema;
};

export default buildCollectionSchema;
