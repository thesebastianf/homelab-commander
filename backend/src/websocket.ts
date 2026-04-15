import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { URL } from 'url';
import * as dockerService from '../services/docker.js';
import { logger } from '../logger.js';

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    const pathname = url.pathname;

    if (pathname.startsWith('/ws/')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    const pathname = url.pathname;

    if (pathname.startsWith('/ws/logs/')) {
      const containerId = pathname.split('/ws/logs/')[1];
      handleLogStream(ws, containerId);
    } else if (pathname.startsWith('/ws/stats/')) {
      const containerId = pathname.split('/ws/stats/')[1];
      handleStatsStream(ws, containerId);
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
