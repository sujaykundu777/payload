import path from 'path';

export const defaults = {
  defaultDepth: 2,
  maxDepth: 10,
  collections: [],
  globals: [],
  cookiePrefix: 'payload',
  csrf: [],
  cors: [],
  admin: {
    meta: {
      titleSuffix: '- Payload',
    },
    disable: false,
    indexHTML: path.resolve(__dirname, '../admin/index.html'),
    components: {},
    css: path.resolve(__dirname, '../admin/scss/custom.css'),
    scss: path.resolve(__dirname, '../admin/scss/overrides.scss'),
    dateFormat: 'MMMM do yyyy, h:mm a',
  },
  upload: {},
  graphQL: {
    maxComplexity: 1000,
    disablePlaygroundInProduction: true,
  },
  routes: {
    admin: '/admin',
    api: '/api',
    graphQL: '/graphql',
    graphQLPlayground: '/graphql-playground',
  },
  rateLimit: {
    window: 15 * 60 * 100, // 15min default,
    max: 500,
  },
  express: {
    json: {},
    compression: {},
    middleware: [],
  },
  hooks: {},
  localization: false,
};
