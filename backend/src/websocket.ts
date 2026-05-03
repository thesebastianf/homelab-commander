import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { URL } from 'url';
import { timingSafeEqual } from 'crypto';
import { Duplex } from 'stream';
import * as dockerService from './services/docker.js';
import { config } from './config.js';
import { logger } from './logger.js';

function isAuthorized(request: IncomingMessage, url: URL): boolean {
  if (!config.authUser || !config.authPass) {
    return true;
  }

  const headerAuth = request.headers.authorization;
  const queryAuth = url.searchParams.get('auth');
  const authValue = headerAuth?.startsWith('Basic ')
    ? headerAuth.slice(6)
    : (queryAuth || '');

  if (!authValue) {
    return false;
  }

  let decoded = '';
  try {
    decoded = Buffer.from(authValue, 'base64').toString();
  } catch {
    return false;
  }

  const colonIndex = decoded.indexOf(':');
  if (colonIndex === -1) {
    return false;
  }

  const user = decoded.slice(0, colonIndex);
  const pass = decoded.slice(colonIndex + 1);

  const userBuf = Buffer.from(user);
  const passBuf = Buffer.from(pass);
  const expectedUserBuf = Buffer.from(config.authUser);
  const expectedPassBuf = Buffer.from(config.authPass);

  const userMatch = userBuf.length === expectedUserBuf.length && timingSafeEqual(userBuf, expectedUserBuf);
  const passMatch = passBuf.length === expectedPassBuf.length && timingSafeEqual(passBuf, expectedPassBuf);
  return userMatch && passMatch;
}

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      const ws = client as WebSocket & { isAlive?: boolean };
      if (ws.isAlive === false) {
        try { ws.terminate(); } catch { /* ignore */ }
        return;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    });
  }, 25_000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    const pathname = url.pathname;

    if (pathname.startsWith('/ws/')) {
      if (!isAuthorized(request, url)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    const trackedWs = ws as WebSocket & { isAlive?: boolean };
    trackedWs.isAlive = true;
    trackedWs.on('pong', () => {
      trackedWs.isAlive = true;
    });

    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    const pathname = url.pathname;

    if (pathname.startsWith('/ws/logs/')) {
      const containerId = pathname.split('/ws/logs/')[1];
      handleLogStream(ws, containerId);
    } else if (pathname.startsWith('/ws/stats/')) {
      const containerId = pathname.split('/ws/stats/')[1];
      handleStatsStream(ws, containerId);
    } else if (pathname.startsWith('/ws/exec/')) {
      const containerId = pathname.split('/ws/exec/')[1];
      handleExecShell(ws, decodeURIComponent(containerId));
    } else if (pathname === '/ws/events') {
      handleEventStream(ws);
    } else {
      ws.close(4004, 'Unknown endpoint');
    }
  });

  logger.info('WebSocket server initialized');
}

async function handleLogStream(ws: WebSocket, containerId: string): Promise<void> {
  try {
    const stream = await dockerService.streamContainerLogs(containerId);
    const readable = stream as any;

    readable.on('data', (chunk: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk.toString('utf8'));
      }
    });

    readable.on('end', () => ws.close());
    readable.on('error', (err: Error) => {
      logger.error({ err, containerId }, 'Log stream error');
      ws.close();
    });

    ws.on('close', () => {
      try { readable.destroy(); } catch { /* ignore */ }
    });
  } catch (err) {
    logger.error({ err, containerId }, 'Failed to start log stream');
    ws.close(4000, 'Failed to start stream');
  }
}

async function handleStatsStream(ws: WebSocket, containerId: string): Promise<void> {
  try {
    const stream = await dockerService.streamContainerStats(containerId);
    const readable = stream as any;
    let buffer = '';

    readable.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const stats = JSON.parse(line);
          const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage || 0) -
            (stats.precpu_stats?.cpu_usage?.total_usage || 0);
          const systemDelta = (stats.cpu_stats?.system_cpu_usage || 0) -
            (stats.precpu_stats?.system_cpu_usage || 0);
          const numCpus = stats.cpu_stats?.online_cpus || 1;
          const cpu = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;
          const memUsage = stats.memory_stats?.usage || 0;
          const memLimit = stats.memory_stats?.limit || 1;

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              cpu: parseFloat(cpu.toFixed(2)),
              memory: memUsage,
              memoryLimit: memLimit,
              memoryPercent: parseFloat(((memUsage / memLimit) * 100).toFixed(2)),
            }));
          }
        } catch { /* skip malformed chunks */ }
      }
    });

    readable.on('end', () => ws.close());
    ws.on('close', () => {
      try { readable.destroy(); } catch { /* ignore */ }
    });
  } catch (err) {
    logger.error({ err, containerId }, 'Failed to start stats stream');
    ws.close(4000, 'Failed to start stream');
  }
}

async function handleEventStream(ws: WebSocket): Promise<void> {
  try {
    const stream = await dockerService.getDockerEventStream();
    const readable = stream as any;
    let buffer = '';

    readable.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: event.Type,
              action: event.Action,
              actor: {
                id: event.Actor?.ID?.slice(0, 12),
                name: event.Actor?.Attributes?.name,
              },
              time: event.time,
            }));
          }
        } catch { /* skip */ }
      }
    });

    readable.on('end', () => ws.close());
    ws.on('close', () => {
      try { readable.destroy(); } catch { /* ignore */ }
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start event stream');
    ws.close(4000, 'Failed to start stream');
  }
}

async function handleExecShell(ws: WebSocket, containerId: string): Promise<void> {
  let stream: Duplex | null = null;
  let execRef: any = null;

  try {
    const { stream: shellStream, exec } = await dockerService.openContainerShell(containerId);
    stream = shellStream as unknown as Duplex;
    execRef = exec;

    stream.on('data', (chunk: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk, { binary: true });
      }
    });

    stream.on('end', () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    });

    stream.on('error', (err: Error) => {
      logger.error({ err, containerId }, 'Exec stream error');
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'Terminal stream failed' }));
        ws.close(1011, 'Terminal stream failed');
      }
    });

    ws.on('message', async (rawData, isBinary) => {
      if (!stream) return;
      try {
        if (!isBinary) {
          const text = rawData.toString();
          try {
            const msg = JSON.parse(text);
            if (msg?.type === 'resize' && execRef) {
              const cols = Number(msg.cols || 120);
              const rows = Number(msg.rows || 30);
              if (cols > 0 && rows > 0) {
                await dockerService.resizeContainerShell(execRef, cols, rows);
              }
              return;
            }
          } catch {
            // Not control JSON, treat as terminal input.
          }
          stream.write(Buffer.from(text, 'utf8'));
          return;
        }

        if (Buffer.isBuffer(rawData)) {
          stream.write(rawData);
        } else if (Array.isArray(rawData)) {
          stream.write(Buffer.concat(rawData as Buffer[]));
        } else {
          stream.write(Buffer.from(rawData as ArrayBuffer));
        }
      } catch (err) {
        logger.error({ err, containerId }, 'Failed to relay terminal input');
      }
    });

    ws.on('close', () => {
      try { stream?.end(); } catch { /* ignore */ }
      try { stream?.destroy(); } catch { /* ignore */ }
    });
  } catch (err: any) {
    logger.error({ err, containerId }, 'Failed to start interactive shell');
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: err?.message || 'Failed to start shell' }));
      ws.close(1011, 'Failed to start shell');
    }
  }
}
