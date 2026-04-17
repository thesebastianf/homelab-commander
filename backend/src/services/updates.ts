import { logger } from '../logger.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const containerUpdateResults = new Map<string, boolean>();
// keyed by stack project name (com.docker.compose.project label, lowercased)
const stackUpdateResults = new Map<string, boolean>();

export function getUpdateStatus(containerId: string): boolean {
  return containerUpdateResults.get(containerId) || false;
}

export function getStackUpdateStatus(stackName: string): boolean {
  return stackUpdateResults.get(stackName.toLowerCase()) || false;
}

export async function checkForUpdates(): Promise<void> {
  try {
    const { listContainers } = await import('./docker.js');
    const containers = await listContainers();

    // Accumulate per-stack results in this run
    const thisRunStackResults = new Map<string, boolean>();

    for (const container of containers) {
      const colonIdx = container.image.lastIndexOf(':');
      const imageName = colonIdx > 0 ? container.image.slice(0, colonIdx) : container.image;
      const tag = colonIdx > 0 ? container.image.slice(colonIdx + 1) : 'latest';
      if (!imageName) continue;

      // Derive stack name from container name (compose format: stackname-service-1)
      // Also works for: stackname_service_1 (older compose)
      const stackNameFromContainer = container.name.replace(/-[^-]+-\d+$/, '').replace(/_[^_]+_\d+$/, '').toLowerCase();

      try {
        // Get local image manifest digest
        const { stdout: repoDigestRaw } = await execFileAsync(
          'docker',
          ['inspect', container.image, '--format', '{{index .RepoDigests 0}}'],
          { timeout: 5000 }
        ).catch(() => ({ stdout: '' }));
        const localDigest = repoDigestRaw.trim().split('@')[1] || '';

        // Get remote manifest digest
        const remoteDigest = await checkRegistryDigest(imageName, tag);

        let hasUpdate = false;
        if (remoteDigest && localDigest && localDigest !== remoteDigest) {
          hasUpdate = true;
          logger.debug({ image: container.image, localDigest, remoteDigest }, 'Update available');
        }

        containerUpdateResults.set(container.id, hasUpdate);

        // Accumulate: if ANY container in the stack has an update, mark the stack
        const existing = thisRunStackResults.get(stackNameFromContainer) || false;
        thisRunStackResults.set(stackNameFromContainer, existing || hasUpdate);
      } catch {
        containerUpdateResults.set(container.id, false);
        if (!thisRunStackResults.has(stackNameFromContainer)) {
          thisRunStackResults.set(stackNameFromContainer, false);
        }
      }
    }

    // Replace stack results with this run's results
    stackUpdateResults.clear();
    thisRunStackResults.forEach((v, k) => stackUpdateResults.set(k, v));

    const updatable = [...stackUpdateResults.entries()].filter(([, v]) => v).map(([k]) => k);
    logger.info({ checked: containers.length, stacksWithUpdates: updatable }, 'Update check completed');
  } catch (err) {
    logger.error({ err }, 'Update check failed');
  }
}

async function checkRegistryDigest(image: string, tag: string): Promise<string | null> {
  const [namespace, repo] = image.includes('/')
    ? [image.split('/')[0], image.split('/').slice(1).join('/')]
    : ['library', image];

  try {
    const authRes = await fetch(
      `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${namespace}/${repo}:pull`
    );
    if (!authRes.ok) return null;
    const { token } = await authRes.json() as { token: string };

    const manifestRes = await fetch(
      `https://registry-1.docker.io/v2/${namespace}/${repo}/manifests/${tag}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.docker.distribution.manifest.v2+json',
        },
      }
    );

    return manifestRes.headers.get('docker-content-digest');
  } catch {
    return null;
  }
}

export function initUpdateChecker(): void {
  // Check every 6 hours
  setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
  // First check after 30 seconds
  setTimeout(checkForUpdates, 30_000);
  logger.info('Update checker initialized');
}
