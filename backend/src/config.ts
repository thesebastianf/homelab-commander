export const config = {
  port: parseInt(process.env.APP_PORT || '3210', 10),
  nodeEnv: process.env.NODE_ENV || 'production',
  logLevel: process.env.LOG_LEVEL || 'info',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://hlc:hlc_secret_change_me@db:5432/hlc',
  stacksPath: process.env.STACKS_PATH || '/data/stacks',
  backupsPath: process.env.BACKUPS_PATH || '/data/backups',
  authUser: process.env.AUTH_USER || '',
  authPass: process.env.AUTH_PASS || '',
  corsOrigin: process.env.CORS_ORIGIN || '',
  composeRuntimeMode: process.env.COMPOSE_RUNTIME_MODE || 'auto',
  composeSidecarImages: (process.env.COMPOSE_SIDECAR_IMAGES
    || process.env.DOCKER_COMPOSE_SIDECAR_IMAGE
    || 'docker/compose:2.29.2,docker/compose:latest,docker/compose:v2.29.2')
    .split(',')
    .map((image) => image.trim())
    .filter(Boolean),
};
