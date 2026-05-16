import type { ProvisioningSession } from './types.js';

export class ProvisioningSessionStore {
  private readonly sessions = new Map<string, ProvisioningSession>();

  set(session: ProvisioningSession): void {
    this.sessions.set(session.id, session);
  }

  get(id: string): ProvisioningSession | undefined {
    return this.sessions.get(id);
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  expired(now: number): ProvisioningSession[] {
    return Array.from(this.sessions.values()).filter((session) => session.expiresAt.getTime() <= now);
  }
}
