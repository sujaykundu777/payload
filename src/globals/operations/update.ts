import executeAccess from '../../auth/executeAccess';
import sanitizeInternalFields from '../../utilities/sanitizeInternalFields';

async function update(args) {
  const { globals: { Model } } = this;

  const {
    globalConfig,
    slug,
    req,
    depth,
    overrideAccess,
    showHiddenFields,
  } = args;

  // /////////////////////////////////////
  // 1. Retrieve and execute access
  // /////////////////////////////////////

  if (!overrideAccess) {
    await executeAccess({ req }, globalConfig.access.update);
  }

  // /////////////////////////////////////
  // 2. Retrieve document
  // /////////////////////////////////////

  let global = await Model.findOne({ globalType: slug });
  let globalJSON;

  if (global) {
    globalJSON = global.toJSON({ virtuals: true });
    globalJSON = JSON.stringify(globalJSON);
    globalJSON = JSON.parse(globalJSON);

    if (globalJSON._id) {
      delete globalJSON._id;
    }
  }

  const originalDoc = await this.performFieldOperations(globalConfig, {
    depth,
    req,
    data: globalJSON,
    hook: 'afterRead',
    operation: 'update',
    overrideAccess,
    flattenLocales: true,
    showHiddenFields,
  });

  let { data } = args;

  // /////////////////////////////////////
  // beforeValidate - Fields
  // /////////////////////////////////////

  data = await this.performFieldOperations(globalConfig, {
    data,
    req,
    originalDoc,
    hook: 'beforeValidate',
    operation: 'update',
    overrideAccess,
  });

  // /////////////////////////////////////
  // beforeValidate - Global
  // /////////////////////////////////////

  await globalConfig.hooks.beforeValidate.reduce(async (priorHook, hook) => {
    await priorHook;

    data = (await hook({
      data,
      req,
      originalDoc,
    })) || data;
  }, Promise.resolve());

  // /////////////////////////////////////
  // beforeChange - Global
  // /////////////////////////////////////

  await globalConfig.hooks.beforeChange.reduce(async (priorHook, hook) => {
    await priorHook;

    data = (await hook({
      data,
      req,
      originalDoc,
    })) || data;
  }, Promise.resolve());

  // /////////////////////////////////////
  // beforeChange - Fields
  // /////////////////////////////////////

  const result = await this.performFieldOperations(globalConfig, {
    data,
    req,
    hook: 'beforeChange',
    operation: 'update',
    unflattenLocales: true,
    originalDoc,
    docWithLocales: globalJSON,
  });

  // /////////////////////////////////////
  // Update
  // /////////////////////////////////////

  if (global) {
    global = await Model.findOneAndUpdate(
      { globalType: slug },
      result,
      { new: true },
    );
  } else {
    result.globalType = slug;
    global = await Model.create(result);
  }

  global = global.toJSON({ virtuals: true });
  global = JSON.stringify(global);
  global = JSON.parse(global);
  global = sanitizeInternalFields(global);

  // /////////////////////////////////////
  // afterRead - Fields
  // /////////////////////////////////////

  global = await this.performFieldOperations(globalConfig, {
    data: global,
    hook: 'afterRead',
    operation: 'read',
    req,
    depth,
    showHiddenFields,
    flattenLocales: true,
  });

  // /////////////////////////////////////
  // afterRead - Global
  // /////////////////////////////////////

  await globalConfig.hooks.afterChange.reduce(async (priorHook, hook) => {
    await priorHook;

    global = await hook({
      doc: global,
      req,
    }) || global;
  }, Promise.resolve());

  // /////////////////////////////////////
  // Return results
  // /////////////////////////////////////

  return global;
}

export default update;
