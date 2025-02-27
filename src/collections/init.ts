import mongoose from 'mongoose';
import express from 'express';
import passport from 'passport';
import passportLocalMongoose from 'passport-local-mongoose';
import Passport from 'passport-local';
import { UpdateQuery } from 'mongodb';
import apiKeyStrategy from '../auth/strategies/apiKey';
import buildSchema from './buildSchema';
import bindCollectionMiddleware from './bindCollection';
import { SanitizedCollectionConfig } from './config/types';
import { SanitizedConfig } from '../config/types';
import { Payload } from '../index';

const LocalStrategy = Passport.Strategy;

export default function registerCollections(ctx: Payload): void {
  ctx.config.collections = ctx.config.collections.map((collection: SanitizedCollectionConfig) => {
    const formattedCollection = collection;

    const schema = buildSchema(formattedCollection, ctx.config as SanitizedConfig);

    if (collection.auth) {
      schema.plugin(passportLocalMongoose, {
        usernameField: 'email',
      });


      const { maxLoginAttempts, lockTime } = collection.auth;

      if (maxLoginAttempts > 0) {
        type LoginSchema = {
          loginAttempts: number
          lockUntil: number
          isLocked: boolean
        };

        // eslint-disable-next-line func-names
        schema.methods.incLoginAttempts = function (this: mongoose.Document<any> & LoginSchema, cb) {
          // Expired lock, restart count at 1
          if (this.lockUntil && this.lockUntil < Date.now()) {
            return this.updateOne({
              $set: { loginAttempts: 1 },
              $unset: { lockUntil: 1 },
            }, cb);
          }

          const updates: UpdateQuery<LoginSchema> = { $inc: { loginAttempts: 1 } };
          // Lock the account if at max attempts and not already locked
          if (this.loginAttempts + 1 >= maxLoginAttempts && !this.isLocked) {
            updates.$set = { lockUntil: Date.now() + lockTime };
          }
          return this.updateOne(updates, cb);
        };

        // eslint-disable-next-line func-names
        schema.methods.resetLoginAttempts = function (cb) {
          return this.updateOne({
            $set: { loginAttempts: 0 },
            $unset: { lockUntil: 1 },
          }, cb);
        };
      }
    }

    ctx.collections[formattedCollection.slug] = {
      Model: mongoose.model(formattedCollection.slug, schema),
      config: formattedCollection,
    };

    // If not local, open routes
    if (!ctx.local) {
      const router = express.Router();
      const { slug } = collection;

      router.all(`/${slug}*`, bindCollectionMiddleware(ctx.collections[formattedCollection.slug]));

      const {
        create,
        find,
        update,
        findByID,
        delete: deleteHandler,
      } = ctx.requestHandlers.collections;

      if (collection.auth) {
        const AuthCollection = ctx.collections[formattedCollection.slug];
        passport.use(new LocalStrategy(AuthCollection.Model.authenticate()));

        if (collection.auth.useAPIKey) {
          passport.use(`${AuthCollection.config.slug}-api-key`, apiKeyStrategy(ctx, AuthCollection));
        }

        const {
          init,
          login,
          logout,
          refresh,
          me,
          registerFirstUser,
          forgotPassword,
          resetPassword,
          verifyEmail,
          unlock,
        } = ctx.requestHandlers.collections.auth;

        if (collection.auth.verify) {
          router
            .route(`/${slug}/verify/:token`)
            .post(verifyEmail);
        }

        if (collection.auth.maxLoginAttempts > 0) {
          router
            .route(`/${slug}/unlock`)
            .post(unlock);
        }

        router
          .route(`/${slug}/init`)
          .get(init);

        router
          .route(`/${slug}/login`)
          .post(login);

        router
          .route(`/${slug}/logout`)
          .post(logout);

        router
          .route(`/${slug}/refresh-token`)
          .post(refresh);

        router
          .route(`/${slug}/me`)
          .get(me);

        router
          .route(`/${slug}/first-register`)
          .post(registerFirstUser);

        router
          .route(`/${slug}/forgot-password`)
          .post(forgotPassword);

        router
          .route(`/${slug}/reset-password`)
          .post(resetPassword);
      }

      router.route(`/${slug}`)
        .get(find)
        .post(create);

      router.route(`/${slug}/:id`)
        .put(update)
        .get(findByID)
        .delete(deleteHandler);

      ctx.router.use(router);
    }

    return formattedCollection;
  });
}
