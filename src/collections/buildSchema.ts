import paginate from 'mongoose-paginate-v2';
import buildQueryPlugin from '../mongoose/buildQuery';
import buildSchema from '../mongoose/buildSchema';

const buildCollectionSchema = (collection, config, schemaOptions = {}) => {
  const schema = buildSchema(config, collection.fields, { timestamps: collection.timestamps !== false, ...schemaOptions });

  if (collection.idType) {
    const idSchemaType = collection.idType === 'number' ? Number : String;
    schema.add({ _id: idSchemaType });
  }

  schema.plugin(paginate)
    .plugin(buildQueryPlugin);

  return schema;
};

export default buildCollectionSchema;
