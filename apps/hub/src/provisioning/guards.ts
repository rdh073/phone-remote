/**
 * Precondition guards for provisioning operations. Each throws a typed
 * error that the route layer's mapProvisioningFailure translates to a
 * specific HTTP status. Kept separate from service.ts so the orchestration
 * code reads as a sequence of high-level steps and the "why this throws"
 * lives close to the typed error definition.
 */
import {
  MdnsUnavailableError,
  ProvisioningSessionError,
  SessionKindMismatchError,
} from './errors.js';
import type { CapabilitiesPort, ProvisioningSession, SessionKind } from './types.js';

/** Reject sessions that have already been revoked. Other terminal states
 *  (`paired`, `failed`) are handled by their own status checks in the
 *  caller — only `revoked` is structurally unrecoverable. */
export function assertPairable(session: ProvisioningSession): void {
  if (session.status === 'revoked') {
    throw new ProvisioningSessionError(`session already ${session.status}`);
  }
}

/** Refuse if the session's immutable kind doesn't match what this code path
 *  needs (e.g. QR pairing requires `lan`, since mDNS doesn't cross WireGuard). */
export function requireSessionKind(
  session: ProvisioningSession,
  kind: SessionKind,
  reason: string,
): void {
  if (session.kind !== kind) {
    throw new SessionKindMismatchError([kind], session.kind, reason);
  }
}

/** Refuse if the hub's boot-time mDNS probe came back false. Fail fast at
 *  the service boundary instead of letting the user hit a Bonjour bind error
 *  25 seconds later. */
export function requireMdnsCapability(capabilities: CapabilitiesPort): void {
  if (!capabilities.mdnsAvailable()) {
    throw new MdnsUnavailableError(
      'mDNS is unavailable on this hub (boot probe failed: socket bind error, ' +
        'avahi-daemon conflict, or container-blocked multicast). Use the Pairing code flow instead.',
    );
  }
}
