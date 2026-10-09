import { access, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { config } from '../config.js';

// Docker supports 4 compose filenames in priority order
export const COMPOSE_FILENAMES = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];

function getStackPathCandidates(stackPath: string): string[] {
  const candidates = new Set<string>();
  const normalizedPath = String(stackPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const mountedBase = config.stacksPath.replace(/\\/g, '/').replace(/\/+$/, '');

  if (!normalizedPath) return [];

  candidates.add(normalizedPath);

  const stackSegments = normalizedPath.split('/').filter(Boolean);
  const stackName = stackSegments[stackSegments.length - 1];
  if (stackName) {
    candidates.add(join(mountedBase, stackName).replace(/\\/g, '/'));
  }

  const marker = '/stacks/';
  const markerIndex = normalizedPath.lastIndexOf(marker);
  if (markerIndex !== -1) {
    const suffix = normalizedPath.slice(markerIndex + marker.length);
    if (suffix) {
      candidates.add(join(mountedBase, suffix).replace(/\\/g, '/'));
    }
  }

  return [...candidates];
}

export async function resolveAccessibleStackPath(stack: any): Promise<string | null> {
  for (const candidate of getStackPathCandidates(stack.stack_path)) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** Returns the first compose filename found in the given directory, or 'docker-compose.yml' as fallback */
export async function findComposeFile(dir: string): Promise<string> {
  for (const filename of COMPOSE_FILENAMES) {
    try {
      await access(join(dir, filename));
      return filename;
    } catch { /* not found, try next */ }
  }
  return 'docker-compose.yml'; // fallback for stacks created by THC
}

/**
 * Resolve where to run docker compose for a given stack.
 * - Preferred: use the real stack_path directly (works when mounted as volume, e.g. /data/stacks).
 *   This means relative bind mounts in the compose file resolve correctly.
 * - Fallback: write compose content to a temp dir (for adopted stacks whose host path is not
 *   accessible from within the container).
 */
export async function resolveStackCwd(stack: any): Promise<{ cwd: string; cleanup: (() => Promise<void>) | null }> {
  const accessiblePath = await resolveAccessibleStackPath(stack);
  if (accessiblePath) {
    return { cwd: accessiblePath, cleanup: null };
  }

  // Path not accessible (external/adopted stack) — fall back to in-container temp dir
  const tempDir = await mkdtemp(join(tmpdir(), 'hlc-'));
  await writeFile(join(tempDir, 'docker-compose.yml'), stack.compose_content || '');
  if (stack.env_content) {
    await writeFile(join(tempDir, '.env'), stack.env_content);
  }
  return {
    cwd: tempDir,
    cleanup: async () => { try { await rm(tempDir, { recursive: true, force: true }); } catch {} },
  };
}

export function composeProjectNameFromStack(stack: any): string {
  return String(stack.name || 'stack')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 63) || 'stack';
}
