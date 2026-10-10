import { logger } from '../logger.js';
import { composeProjectNameFromStack } from '../lib/stackPaths.js';

const containerUpdateResults = new Map<string, boolean>();
// keyed by compose project name (normalized the same way stacks are deployed)
const stackUpdateResults = new Map<string, boolean>();

const REGISTRY_TIMEOUT_MS = 15_000;

function stackKey(stackName: string): string {
  return composeProjectNameFromStack({ name: stackName });
}

export function getUpdateStatus(containerId: string): boolean {
  return containerUpdateResults.get(containerId) || false;
}

export function getStackUpdateStatus(stackName: string): boolean {
  return stackUpdateResults.get(stackKey(stackName)) || false;
}

export function setStackUpdateStatus(stackName: string, hasUpdate: boolean): void {
  stackUpdateResults.set(stackKey(stackName), hasUpdate);
}

export interface ImageRef {
  registry: string;
  repo: string;
  tag: string;
  /** Set when the reference is pinned by digest; such images never get updates */
  digest?: string;
  isDockerHub: boolean;
}

const DOCKER_HUB_HOSTS = new Set(['docker.io', 'index.docker.io', 'registry-1.docker.io']);

/**
 * Parses an image reference the way Docker does: a first path component with a
 * dot, a colon or "localhost" is a registry; the tag is only what follows the last
 * colon after the last slash (so "registry:5000/app" has no tag); "@sha256:" pins a digest.
 */
export function parseImageRef(reference: string): ImageRef | null {
  let rest = reference.trim();
  if (!rest || rest.startsWith('sha256:')) return null;

  let digest: string | undefined;
  const at = rest.indexOf('@');
  if (at >= 0) {
    digest = rest.slice(at + 1);
    rest = rest.slice(0, at);
  }

  let tag = 'latest';
  const lastSlash = rest.lastIndexOf('/');
  const lastColon = rest.lastIndexOf(':');
  if (lastColon > lastSlash) {
    tag = rest.slice(lastColon + 1);
    rest = rest.slice(0, lastColon);
  }

  const parts = rest.split('/');
  const first = parts[0] || '';
  const hasRegistry = parts.length > 1 && (first.includes('.') || first.includes(':') || first === 'localhost');
  const registry = hasRegistry ? first : 'docker.io';
  let repo = hasRegistry ? parts.slice(1).join('/') : rest;
  const isDockerHub = DOCKER_HUB_HOSTS.has(registry);
  if (isDockerHub && !repo.includes('/')) repo = `library/${repo}`;
  if (!repo || !tag) return null;

  return { registry: isDockerHub ? 'docker.io' : registry, repo, tag, digest, isDockerHub };
}

/**
 * Digests the local image is known under for the given repository. RepoDigests can hold
 * entries for several repositories (and several digests per repository), so picking the
 * first one compares against the wrong thing.
 */
export function localDigestsFor(ref: ImageRef, repoDigests: string[]): string[] {
  const digests: string[] = [];
  for (const entry of repoDigests) {
    const at = entry.lastIndexOf('@');
    if (at < 0) continue;
    const entryRef = parseImageRef(entry.slice(0, at));
    if (entryRef && entryRef.registry === ref.registry && entryRef.repo === ref.repo) {
      digests.push(entry.slice(at + 1));
    }
  }
  return digests;
}

let checkInProgress: Promise<void> | null = null;

export function checkForUpdates(): Promise<void> {
  if (!checkInProgress) {
    checkInProgress = runUpdateCheck().finally(() => { checkInProgress = null; });
  }
  return checkInProgress;
}

let recheckTimer: ReturnType<typeof setTimeout> | null = null;

/** Re-runs the update check shortly, e.g. after a stack was updated outside the regular schedule. */
export function scheduleUpdateRecheck(delayMs = 60_000): void {
  if (recheckTimer) clearTimeout(recheckTimer);
  recheckTimer = setTimeout(() => {
    recheckTimer = null;
    void checkForUpdates();
  }, delayMs);
}

async function runUpdateCheck(): Promise<void> {
  try {
    const { listContainersForUpdateCheck } = await import('./docker.js');
    const containers = await listContainersForUpdateCheck();

    // Several containers often share one image; ask the registry once per reference.
    const remoteDigests = new Map<string, Promise<string | null>>();
    const remoteDigestFor = (ref: ImageRef) => {
      const key = `${ref.registry}/${ref.repo}:${ref.tag}`;
      let pending = remoteDigests.get(key);
      if (!pending) {
        pending = checkRegistryDigest(ref);
        remoteDigests.set(key, pending);
      }
      return pending;
    };

    const nextContainerResults = new Map<string, boolean>();
    let unknown = 0;

    await Promise.all(containers.map(async (container) => {
      const ref = parseImageRef(container.imageRef);
      // Digest-pinned and locally built images (no repo digest) can't be compared.
      const localDigests = ref && !ref.digest ? localDigestsFor(ref, container.repoDigests) : [];
      if (!ref || localDigests.length === 0) {
        nextContainerResults.set(container.id, false);
        return;
      }

      const remoteDigest = await remoteDigestFor(ref);
      if (!remoteDigest) {
        // Registry unreachable or rate limited: keep the last known answer instead of
        // silently dropping a pending update until the next successful check.
        unknown++;
        nextContainerResults.set(container.id, containerUpdateResults.get(container.id) || false);
        return;
      }

      const hasUpdate = !localDigests.includes(remoteDigest);
      if (hasUpdate) {
        logger.debug({ image: container.imageRef, localDigests, remoteDigest }, 'Update available');
      }
      nextContainerResults.set(container.id, hasUpdate);
    }));

    const nextStackResults = new Map<string, boolean>();
    for (const container of containers) {
      if (!container.project) continue;
      const key = stackKey(container.project);
      nextStackResults.set(key, (nextStackResults.get(key) || false) || (nextContainerResults.get(container.id) || false));
    }

    containerUpdateResults.clear();
    nextContainerResults.forEach((v, k) => containerUpdateResults.set(k, v));
    stackUpdateResults.clear();
    nextStackResults.forEach((v, k) => stackUpdateResults.set(k, v));

    const updatable = [...stackUpdateResults.entries()].filter(([, v]) => v).map(([k]) => k);
    logger.info({ checked: containers.length, registryErrors: unknown, stacksWithUpdates: updatable }, 'Update check completed');
  } catch (err) {
    logger.error({ err }, 'Update check failed');
  }
}

async function checkRegistryDigest(ref: ImageRef): Promise<string | null> {
  const manifestAccept = [
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json',
  ].join(', ');

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

  const request = (url: string, method: 'HEAD' | 'GET', token?: string) => fetch(url, {
    method,
    headers: {
      Accept: manifestAccept,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
  });

  const fetchToken = async (url: string): Promise<string | null> => {
    const res = await fetch(url, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) });
    if (!res.ok) return null;
    return extractToken(await res.json());
  };

  try {
    const registryHost = ref.isDockerHub ? 'registry-1.docker.io' : ref.registry;
    const manifestUrl = `https://${registryHost}/v2/${ref.repo}/manifests/${ref.tag}`;

    let token: string | undefined;
    if (ref.isDockerHub) {
      token = await fetchToken(
        `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${ref.repo}:pull`
      ) ?? undefined;
      if (!token) return null;
    }

    let manifestRes = await request(manifestUrl, 'HEAD', token);

    if (manifestRes.status === 401 && !token) {
      const challenge = manifestRes.headers.get('www-authenticate') || '';
      if (challenge.toLowerCase().startsWith('bearer')) {
        const { realm, service, scope } = parseBearerChallenge(challenge);
        if (realm) {
          const tokenUrl = new URL(realm);
          if (service) tokenUrl.searchParams.set('service', service);
          tokenUrl.searchParams.set('scope', scope || `repository:${ref.repo}:pull`);
          token = await fetchToken(tokenUrl.toString()) ?? undefined;
          if (!token) return null;
          manifestRes = await request(manifestUrl, 'HEAD', token);
        }
      }
    }

    if (!manifestRes.ok) {
      logger.debug({ registry: ref.registry, repo: ref.repo, tag: ref.tag, status: manifestRes.status }, 'Registry manifest lookup failed');
      return null;
    }

    const digest = manifestRes.headers.get('docker-content-digest');
    if (digest) return digest;

    // Some registries omit the digest header on HEAD; GET returns it (or we hash the body).
    const getRes = await request(manifestUrl, 'GET', token);
    if (!getRes.ok) return null;
    const headerDigest = getRes.headers.get('docker-content-digest');
    if (headerDigest) return headerDigest;
    const { createHash } = await import('crypto');
    const body = Buffer.from(await getRes.arrayBuffer());
    return `sha256:${createHash('sha256').update(body).digest('hex')}`;
  } catch (err) {
    logger.debug({ err, registry: ref.registry, repo: ref.repo, tag: ref.tag }, 'Registry digest check failed');
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
