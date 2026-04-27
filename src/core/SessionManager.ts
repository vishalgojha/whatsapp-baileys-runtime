import fs from 'fs';
import path from 'path';
import { WhatsAppClient } from './WhatsAppClient';
import type {
  SessionCreateOptions,
  SessionManagerOptions,
  SessionRecord,
  SessionSnapshot,
} from '../types';

export class SessionManager {
  private readonly clients = new Map<string, WhatsAppClient>();
  private readonly qrs = new Map<string, string>();
  private readonly storage = this.options.storage;
  private rehydrationStarted = false;

  constructor(private readonly options: SessionManagerOptions) {}

  async createSession(tenantId: string, sessionOptions: SessionCreateOptions) {
    const fullKey = `${tenantId}:${sessionOptions.label}`;
    if (this.clients.has(fullKey)) {
      return this.clients.get(fullKey);
    }

    if (!sessionOptions.skipLimitCheck) {
      const existingSessions = await this.storage.loadPersistedSessions();
      await this.options.canCreateSession?.({
        tenantId,
        label: sessionOptions.label,
        existingSessions: existingSessions.filter((session) => session.tenantId === tenantId),
      });
    }

    const client = new WhatsAppClient({
      ...sessionOptions,
      tenantId,
      storage: this.storage,
      hooks: {
        ...this.options.hooks,
        onQR: async (event) => {
          this.qrs.set(fullKey, event.qr);
          await this.options.hooks?.onQR?.(event);
        },
        onConnectionUpdate: async (event) => {
          if (event.status === 'connected' || event.status === 'disconnected') {
            this.qrs.delete(fullKey);
          }
          await this.options.hooks?.onConnectionUpdate?.(event);
        },
      },
      sessionRoot: this.options.sessionRoot,
    });

    await client.connect({
      usePairingCode: sessionOptions.usePairingCode,
      phoneNumber: sessionOptions.phoneNumber,
    });

    this.clients.set(fullKey, client);
    return client;
  }

  async getSession(tenantId: string, label?: string) {
    if (label) {
      return this.clients.get(`${tenantId}:${label}`);
    }

    const allKeys = Array.from(this.clients.keys()).filter((key) => key.startsWith(`${tenantId}:`));
    return allKeys.length > 0 ? this.clients.get(allKeys[0]) : undefined;
  }

  getLiveSessionSnapshots(tenantId: string): SessionSnapshot[] {
    const allKeys = Array.from(this.clients.keys()).filter((key) => key.startsWith(`${tenantId}:`));
    return allKeys
      .map((key) => this.clients.get(key))
      .filter(Boolean)
      .map((client) => client!.getStatusSnapshot());
  }

  getQR(tenantId: string, label?: string) {
    const key = label
      ? `${tenantId}:${label}`
      : Array.from(this.qrs.keys()).find((entry) => entry.startsWith(`${tenantId}:`));
    return this.qrs.get(key || '');
  }

  async removeSession(tenantId: string, label?: string) {
    const fullKey = label
      ? `${tenantId}:${label}`
      : Array.from(this.clients.keys()).find((key) => key.startsWith(`${tenantId}:`));

    if (!fullKey) {
      return;
    }

    const client = this.clients.get(fullKey);
    if (!client) {
      return;
    }

    await client.disconnect();
    this.clients.delete(fullKey);
    this.qrs.delete(fullKey);
  }

  async rehydratePersistedSessions() {
    if (this.rehydrationStarted) {
      return;
    }

    this.rehydrationStarted = true;
    const sessions = await this.storage.loadPersistedSessions();

    for (const session of sessions) {
      const fullKey = `${session.tenantId}:${session.label}`;
      const sessionPath = path.join(this.options.sessionRoot, `${session.tenantId}_${session.label}`);
      const hasAuthState = fs.existsSync(sessionPath);

      if (!hasAuthState) {
        await this.storage.saveSessionStatus({
          ...session,
          status: 'disconnected',
          lastSync: new Date().toISOString(),
        });
        continue;
      }

      if (this.clients.has(fullKey)) {
        continue;
      }

      await this.createSession(session.tenantId, {
        label: session.label,
        ownerName: session.ownerName || undefined,
        phoneNumber: session.phoneNumber || undefined,
        skipLimitCheck: true,
      });
    }
  }

  getAllSessions(): SessionRecord[] {
    return Array.from(this.clients.entries()).map(([key, client]) => {
      const [tenantId] = key.split(':');
      const snapshot = client.getStatusSnapshot();
      return {
        tenantId,
        label: snapshot.label,
        ownerName: snapshot.ownerName,
        phoneNumber: snapshot.phoneNumber,
        status: snapshot.status,
      };
    });
  }
}
