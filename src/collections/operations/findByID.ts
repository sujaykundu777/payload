/* eslint-disable no-underscore-dangle */
import memoize from 'micro-memoize';
import { PayloadRequest } from '../../express/types';
import { Collection } from '../config/types';
import sanitizeInternalFields from '../../utilities/sanitizeInternalFields';
import { Forbidden, NotFound } from '../../errors';
import executeAccess from '../../auth/executeAccess';
import { Document, Where } from '../../types';
import { hasWhereAccessResult } from '../../auth/types';

export type Arguments = {
  collection: Collection
  id: string
  req: PayloadRequest
  disableErrors?: boolean
  currentDepth?: number
  overrideAccess?: boolean
  showHiddenFields?: boolean
  depth?: number
}

async function findByID(incomingArgs: Arguments): Promise<Document> {
  let args = incomingArgs;

  // /////////////////////////////////////
  // beforeOperation - Collection
  // /////////////////////////////////////

  await args.collection.config.hooks.beforeOperation.reduce(async (priorHook, hook) => {
    await priorHook;

    args = (await hook({
      args,
      operation: 'read',
    })) || args;
  }, Promise.resolve());

  const {
    depth,
    collection: {
      Model,
      config: collectionConfig,
    },
    id,
    req,
    req: {
      locale,
    },
    disableErrors,
    currentDepth,
    overrideAccess,
    showHiddenFields,
  } = args;

  // /////////////////////////////////////
  // Access
  // /////////////////////////////////////

  const accessResults = !overrideAccess ? await executeAccess({ req, disableErrors, id }, collectionConfig.access.read) : true;

  // If errors are disabled, and access returns false, return null
  if (accessResults === false) return null;

  const hasWhereAccess = typeof accessResults === 'object';

  const queryToBuild: { where: Where } = {
    where: {
      and: [
        {
          _id: {
            equals: id,
          },
        },
      ],
    },
  };

  if (hasWhereAccessResult(accessResults)) {
    (queryToBuild.where.and as Where[]).push(accessResults);
  }

  const query = await Model.buildQuery(queryToBuild, locale);

  // /////////////////////////////////////
  // Find by ID
  // /////////////////////////////////////

  if (!query.$and[0]._id) throw new NotFound();

  if (!req.findByID) req.findByID = {};

  if (!req.findByID[collectionConfig.slug]) {
    const nonMemoizedFindByID = async (q) => Model.findOne(q, {}).lean();
    req.findByID[collectionConfig.slug] = memoize(nonMemoizedFindByID, {
      isPromise: true,
      maxSize: 100,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore This is straight from their docs, bad typings
      transformKey: JSON.stringify,
    });
  }

  let result = await req.findByID[collectionConfig.slug](query);

  if (!result) {
    if (!disableErrors) {
      if (!hasWhereAccess) throw new NotFound();
      if (hasWhereAccess) throw new Forbidden();
    }

    return null;
  }

  // Clone the result - it may have come back memoized
  result = JSON.parse(JSON.stringify(result));

  result = sanitizeInternalFields(result);

  // /////////////////////////////////////
  // beforeRead - Collection
  // /////////////////////////////////////

  await collectionConfig.hooks.beforeRead.reduce(async (priorHook, hook) => {
    await priorHook;

    result = await hook({
      req,
      query,
      doc: result,
    }) || result;
  }, Promise.resolve());

  // /////////////////////////////////////
  // afterRead - Fields
  // /////////////////////////////////////

  result = await this.performFieldOperations(collectionConfig, {
    depth,
    req,
    id,
    data: result,
    hook: 'afterRead',
    operation: 'read',
    currentDepth,
    overrideAccess,
    flattenLocales: true,
    showHiddenFields,
  });

  // /////////////////////////////////////
  // afterRead - Collection
  // /////////////////////////////////////

  await collectionConfig.hooks.afterRead.reduce(async (priorHook, hook) => {
    await priorHook;

    result = await hook({
      req,
      query,
      doc: result,
    }) || result;
  }, Promise.resolve());

  // /////////////////////////////////////
  // Return results
  // /////////////////////////////////////

  return result;
}

export default findByID;
