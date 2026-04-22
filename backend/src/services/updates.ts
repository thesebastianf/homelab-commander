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

export function setStackUpdateStatus(stackName: string, hasUpdate: boolean): void {
  stackUpdateResults.set(stackName.toLowerCase(), hasUpdate);
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
  const manifestAccept = [
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.index.v1+json',
  ].join(', ');

  const getParsedImageRef = (name: string) => {
    const parts = name.split('/');
    const first = parts[0] || '';
    const hasRegistry = first.includes('.') || first.includes(':') || first === 'localhost';

    if (!hasRegistry) {
      const repo = parts.length === 1 ? `library/${name}` : name;
      return { registry: 'registry-1.docker.io', repo, isDockerHub: true };
    }

    return {
      registry: first,
      repo: parts.slice(1).join('/'),
      isDockerHub: first === 'docker.io' || first === 'index.docker.io' || first === 'registry-1.docker.io',
    };
  };

  const parseBearerChallenge = (header: string) => {
    const realm = /realm="([^"]+)"/.exec(header)?.[1];
    const service = /service="([^"]+)"/.exec(header)?.[1];
    const scope = /scope="([^"]+)"/.exec(header)?.[1];
    return { realm, service, scope };
  };

  const extractToken = (payload: unknown): string | null => {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const token = record.token;
    const accessToken = record.access_token;
    if (typeof token === 'string' && token.length > 0) return token;
    if (typeof accessToken === 'string' && accessToken.length > 0) return accessToken;
    return null;
  };

  try {
    const ref = getParsedImageRef(image);
    const registryHost = ref.isDockerHub ? 'registry-1.docker.io' : ref.registry;
    const manifestUrl = `https://${registryHost}/v2/${ref.repo}/manifests/${tag}`;

    if (ref.isDockerHub) {
      const authRes = await fetch(
        `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${ref.repo}:pull`
      );
      if (!authRes.ok) return null;

      const tokenPayload = await authRes.json();
      const token = extractToken(tokenPayload);
      if (!token) return null;

      const manifestRes = await fetch(manifestUrl, {
        method: 'HEAD',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: manifestAccept,
        },
      });

      return manifestRes.headers.get('docker-content-digest');
    }

    // Try generic OCI registry flow (unauthenticated first, then Bearer challenge if needed).
    let manifestRes = await fetch(manifestUrl, {
      method: 'HEAD',
      headers: { Accept: manifestAccept },
    });

    if (manifestRes.status === 401) {
      const challenge = manifestRes.headers.get('www-authenticate') || '';
      if (challenge.toLowerCase().startsWith('bearer')) {
        const { realm, service, scope } = parseBearerChallenge(challenge);
        if (realm) {
          const tokenUrl = new URL(realm);
          if (service) tokenUrl.searchParams.set('service', service);
          tokenUrl.searchParams.set('scope', scope || `repository:${ref.repo}:pull`);

          const tokenRes = await fetch(tokenUrl.toString());
          if (!tokenRes.ok) return null;
          const tokenPayload = await tokenRes.json();
          const token = extractToken(tokenPayload);
          if (!token) return null;

          manifestRes = await fetch(manifestUrl, {
            method: 'HEAD',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: manifestAccept,
            },
          });
        }
      }
    }

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
