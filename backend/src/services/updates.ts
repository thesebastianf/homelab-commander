import { logger } from '../logger.js';

const updateResults = new Map<string, boolean>();

export function getUpdateStatus(containerId: string): boolean {
  return updateResults.get(containerId) || false;
}

export async function checkForUpdates(): Promise<void> {
  try {
    const { listContainers } = await import('./docker.js');
    const containers = await listContainers();

    for (const container of containers) {
      const [name, tag] = container.image.split(':');
      if (!name) continue;

      try {
        const remoteDigest = await checkRegistryDigest(name, tag || 'latest');
        // If we can't get remote digest, skip (private registries, etc.)
        if (!remoteDigest) {
          updateResults.set(container.id, false);
          continue;
        }

        // For now just mark as no update — proper local digest comparison
        // requires inspecting the image which may not always match
        updateResults.set(container.id, false);
      } catch {
        updateResults.set(container.id, false);
      }
    }

    logger.info({ checked: containers.length }, 'Update check completed');
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
