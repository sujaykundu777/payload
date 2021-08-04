import mkdirp from 'mkdirp';
import path from 'path';
import crypto from 'crypto';

import { UploadedFile } from 'express-fileupload';
import executeAccess from '../../auth/executeAccess';
import sanitizeInternalFields from '../../utilities/sanitizeInternalFields';

import { MissingFile, FileUploadError, ValidationError } from '../../errors';
import resizeAndSave from '../../uploads/imageResizer';
import getSafeFilename from '../../uploads/getSafeFilename';
import getImageSize from '../../uploads/getImageSize';
import isImage from '../../uploads/isImage';
import { FileData } from '../../uploads/types';

import sendVerificationEmail from '../../auth/sendVerificationEmail';
import { AfterChangeHook, BeforeOperationHook, BeforeValidateHook, Collection } from '../config/types';
import { PayloadRequest } from '../../express/types';
import { Document } from '../../types';
import { Payload } from '../..';
import saveBufferToFile from '../../uploads/saveBufferToFile';

export type Arguments = {
  collection: Collection
  req: PayloadRequest
  depth?: number
  disableVerificationEmail?: boolean
  overrideAccess?: boolean
  showHiddenFields?: boolean
  data: Record<string, unknown>
}

async function create(this: Payload, incomingArgs: Arguments): Promise<Document> {
  const { config, emailOptions } = this;

  let args = incomingArgs;

  // /////////////////////////////////////
  // beforeOperation - Collection
  // /////////////////////////////////////

  await args.collection.config.hooks.beforeOperation.reduce(async (priorHook: BeforeOperationHook | Promise<void>, hook: BeforeOperationHook) => {
    await priorHook;

    args = (await hook({
      args,
      operation: 'create',
    })) || args;
  }, Promise.resolve());

  const {
    collection: {
      Model,
      config: collectionConfig,
    },
    req,
    disableVerificationEmail,
    depth,
    overrideAccess,
    showHiddenFields,
  } = args;

  let { data } = args;

  // /////////////////////////////////////
  // Access
  // /////////////////////////////////////

  if (!overrideAccess) {
    await executeAccess({ req }, collectionConfig.access.create);
  }

  // /////////////////////////////////////
  // Custom id
  // /////////////////////////////////////

  if (args.collection.config.id !== undefined) {
    data = {
      _id: data.id,
      ...data,
    };
  }

  // /////////////////////////////////////
  // Upload and resize potential files
  // /////////////////////////////////////

  if (collectionConfig.upload) {
    const fileData: Partial<FileData> = {};

    const { staticDir, imageSizes } = collectionConfig.upload;

    const file = ((req.files && req.files.file) ? req.files.file : req.file) as UploadedFile;

    if (!file) {
      throw new MissingFile();
    }

    let staticPath = staticDir;

    if (staticDir.indexOf('/') !== 0) {
      staticPath = path.join(config.paths.configDir, staticDir);
    }

    mkdirp.sync(staticPath);

    const fsSafeName = await getSafeFilename(staticPath, file.name);

    try {
      await saveBufferToFile(file.data, `${staticPath}/${fsSafeName}`);

      if (isImage(file.mimetype)) {
        const dimensions = await getImageSize(`${staticPath}/${fsSafeName}`);
        fileData.width = dimensions.width;
        fileData.height = dimensions.height;

        if (Array.isArray(imageSizes) && file.mimetype !== 'image/svg+xml') {
          fileData.sizes = await resizeAndSave(staticPath, collectionConfig, fsSafeName, fileData.mimeType);
        }
      }
    } catch (err) {
      console.error(err);
      throw new FileUploadError();
    }


    fileData.filename = fsSafeName;
    fileData.filesize = file.size;
    fileData.mimeType = file.mimetype;

    data = {
      ...data,
      ...fileData,
    };
  }

  // /////////////////////////////////////
  // beforeValidate - Fields
  // /////////////////////////////////////

  data = await this.performFieldOperations(collectionConfig, {
    data,
    req,
    hook: 'beforeValidate',
    operation: 'create',
    overrideAccess,
  });

  // /////////////////////////////////////
  // beforeValidate - Collections
  // /////////////////////////////////////

  await collectionConfig.hooks.beforeValidate.reduce(async (priorHook: BeforeValidateHook | Promise<void>, hook: BeforeValidateHook) => {
    await priorHook;

    data = (await hook({
      data,
      req,
      operation: 'create',
    })) || data;
  }, Promise.resolve());

  // /////////////////////////////////////
  // beforeChange - Collection
  // /////////////////////////////////////

  await collectionConfig.hooks.beforeChange.reduce(async (priorHook, hook) => {
    await priorHook;

    data = (await hook({
      data,
      req,
      operation: 'create',
    })) || data;
  }, Promise.resolve());

  // /////////////////////////////////////
  // beforeChange - Fields
  // /////////////////////////////////////

  const resultWithLocales = await this.performFieldOperations(collectionConfig, {
    data,
    hook: 'beforeChange',
    operation: 'create',
    req,
    overrideAccess,
    unflattenLocales: true,
  });

  // /////////////////////////////////////
  // Create
  // /////////////////////////////////////

  let doc;

  if (collectionConfig.auth) {
    if (data.email) {
      resultWithLocales.email = (data.email as string).toLowerCase();
    }
    if (collectionConfig.auth.verify) {
      resultWithLocales._verified = false;
      resultWithLocales._verificationToken = crypto.randomBytes(20).toString('hex');
    }

    try {
      doc = await Model.register(resultWithLocales, data.password as string);
    } catch (error) {
      // Handle user already exists from passport-local-mongoose
      if (error.name === 'UserExistsError') {
        throw new ValidationError([{ message: error.message, field: 'email' }]);
      }
      throw error;
    }
  } else {
    try {
      doc = await Model.create(resultWithLocales);
    } catch (error) {
      // Handle uniqueness error from MongoDB
      throw error.code === 11000
        ? new ValidationError([{ message: 'Value must be unique', field: Object.keys(error.keyValue)[0] }])
        : error;
    }
  }

  let result: Document = doc.toJSON({ virtuals: true });
  const verificationToken = result._verificationToken;

  result = JSON.stringify(result);
  result = JSON.parse(result);
  result = sanitizeInternalFields(result);

  // /////////////////////////////////////
  // afterChange - Fields
  // /////////////////////////////////////

  result = await this.performFieldOperations(collectionConfig, {
    data: result,
    hook: 'afterChange',
    operation: 'create',
    req,
    depth,
    overrideAccess,
    showHiddenFields,
  });

  // /////////////////////////////////////
  // afterChange - Collection
  // /////////////////////////////////////

  await collectionConfig.hooks.afterChange.reduce(async (priorHook: AfterChangeHook | Promise<void>, hook: AfterChangeHook) => {
    await priorHook;

    result = await hook({
      doc: result,
      req: args.req,
      operation: 'create',
    }) || result;
  }, Promise.resolve());

  // /////////////////////////////////////
  // Send verification email if applicable
  // /////////////////////////////////////

  if (collectionConfig.auth && collectionConfig.auth.verify) {
    sendVerificationEmail({
      emailOptions,
      config: this.config,
      sendEmail: this.sendEmail,
      collection: { config: collectionConfig, Model },
      user: result,
      token: verificationToken,
      req,
      disableEmail: disableVerificationEmail,
    });
  }

  // /////////////////////////////////////
  // afterRead - Fields
  // /////////////////////////////////////

  result = await this.performFieldOperations(collectionConfig, {
    depth,
    req,
    data: result,
    hook: 'afterRead',
    operation: 'create',
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
      doc: result,
    }) || result;
  }, Promise.resolve());

  // /////////////////////////////////////
  // Return results
  // /////////////////////////////////////

  return result;
}

export default create;
