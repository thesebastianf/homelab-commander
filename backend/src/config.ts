export const config = {
  port: parseInt(process.env.BACKEND_PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'production',
  logLevel: process.env.LOG_LEVEL || 'info',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://hlc:hlc_secret_change_me@db:5432/hlc',
  stacksPath: process.env.STACKS_PATH || '/data/stacks',
  backupsPath: process.env.BACKUPS_PATH || '/data/backups',
  authUser: process.env.AUTH_USER || '',
  authPass: process.env.AUTH_PASS || '',
  corsOrigin: process.env.CORS_ORIGIN || '',
};
