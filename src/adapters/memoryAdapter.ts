import {
  type IncomingMessageRecord,
  type SessionRecord,
  type SessionStatusUpdate,
  type WhatsAppStorageAdapter,
} from '../types';

export class MemoryStorageAdapter implements WhatsAppStorageAdapter {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly messages: IncomingMessageRecord[] = [];

  async saveSessionStatus(input: SessionStatusUpdate): Promise<void> {
    const key = `${input.tenantId}:${input.label}`;
    this.sessions.set(key, {
      tenantId: input.tenantId,
      label: input.label,
      ownerName: input.ownerName || null,
      phoneNumber: input.phoneNumber || null,
      status: input.status,
    });
  }

  async saveInboundMessage(input: IncomingMessageRecord): Promise<{ id?: string } | void> {
    this.messages.push(input);
    return { id: `${this.messages.length}` };
  }

  async loadPersistedSessions(): Promise<SessionRecord[]> {
    return Array.from(this.sessions.values()).filter((session) =>
      session.status === 'connecting' || session.status === 'connected'
    );
  }

  async deleteSession(input: { tenantId: string; label: string }): Promise<void> {
    this.sessions.delete(`${input.tenantId}:${input.label}`);
  }

  getMessages() {
    return [...this.messages];
  }
}
