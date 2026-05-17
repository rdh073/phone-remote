/**
 * Shared test helpers for the provisioning suite. Lives here (not in src/)
 * so production code can't accidentally import it.
 *
 * Note on vi.mock: factories are hoisted and run before imports, so the
 * raw module mocks (bonjour-service, child_process, tailnet) stay inline
 * in each test file. Only post-import helpers belong here.
 */

/**
 * Construct a fresh provisioning service with explicit capabilities.
 * Uses dynamic import so vi.resetModules() in beforeEach picks up a fresh
 * module-scoped mdns singleton on each call.
 */
export async function makeService(opts: { mdns?: boolean; tailnet?: boolean } = {}) {
  const { createDefaultProvisioningService } = await import('../../src/provisioning.js');
  return createDefaultProvisioningService({
    mdns: opts.mdns ?? true,
    tailnet: opts.tailnet ?? false,
  });
}
