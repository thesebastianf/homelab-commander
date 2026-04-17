import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import pinoHttp from 'pino-http';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { logger } from './logger.js';
import { initDatabase, pool } from './database.js';
import { basicAuth } from './middleware/basicAuth.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import { setupWebSocket } from './websocket.js';

// Routes
import healthRoutes from './routes/health.js';
import containerRoutes from './routes/containers.js';
import imageRoutes from './routes/images.js';
import volumeRoutes from './routes/volumes.js';
import networkRoutes from './routes/networks.js';
import systemRoutes from './routes/system.js';
import settingsRoutes from './routes/settings.js';
import stackRoutes from './routes/stacks.js';
import backupRoutes from './routes/backups.js';
import notificationServiceRoutes from './routes/notificationServices.js';
import portReservationRoutes from './routes/portReservations.js';
import smartStartupRoutes from './routes/smartStartup.js';
import aiRoutes from './routes/ai.js';

// Background services
import { initBackupScheduler } from './services/backupScheduler.js';
import { initSmartStartup } from './services/smartStartup.js';
import { initUpdateChecker } from './services/updates.js';
import { initThresholdMonitor } from './services/notifications.js';
import { initAutoUpdateScheduler } from './services/autoUpdateScheduler.js';
import { seedSettings } from './lib/seed.js';

const app = express();

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      // MUST be null — Helmet adds upgrade-insecure-requests by default, which
      // forces the browser to reload all assets (JS/CSS) over HTTPS, causing
      // ERR_SSL_PROTOCOL_ERROR on plain-HTTP homelab deployments.
      upgradeInsecureRequests: null,
    },
  },
  // Disable HSTS — app is served over plain HTTP in homelab; HSTS would cause
  // browsers to force HTTPS and enter an ERR_SSL_PROTOCOL_ERROR redirect loop.
  strictTransportSecurity: false,
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
  // Disable Origin-Agent-Cluster header — it causes a browser warning when the
  // same origin has been seen with mixed keying policies.
  originAgentCluster: false,
}));

app.use(cors({
  origin: config.corsOrigin || true,
  credentials: true,
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => (req as any).url === '/healthz' } }));
app.use(basicAuth);

// Routes
app.use('/', healthRoutes);
app.use('/api/containers', containerRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/volumes', volumeRoutes);
app.use('/api/networks', networkRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/stacks', stackRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/notifications', notificationServiceRoutes);
app.use('/api/ports', portReservationRoutes);
app.use('/api/smart-startup', smartStartupRoutes);
app.use('/api/ai', aiRoutes);

// Serve React frontend static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));
// SPA fallback — serve index.html for all non-API routes
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }
  if (req.path.startsWith('/api/') || req.path === '/healthz' || req.path === '/readyz') {
    return next();
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Error handler (must be last)
app.use(globalErrorHandler);

const server = createServer(app);
setupWebSocket(server);

async function main() {
  await initDatabase();
  await seedSettings();

  server.listen(config.port, '0.0.0.0', () => {
    logger.info({ port: config.port }, 'Homelab Commander Backend started');
  });

  // Initialize background services
  await initBackupScheduler();
  await initSmartStartup();
  initUpdateChecker();
  initThresholdMonitor();
  await initAutoUpdateScheduler();
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gracefully');
  server.close();
  await pool.end();
  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  process.exit(1);
});

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
