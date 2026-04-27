import { type IncomingMessageRecord, type SessionRecord, type SessionStatusUpdate, type WhatsAppStorageAdapter } from '../types';
export declare class MemoryStorageAdapter implements WhatsAppStorageAdapter {
    private readonly sessions;
    private readonly messages;
    saveSessionStatus(input: SessionStatusUpdate): Promise<void>;
    saveInboundMessage(input: IncomingMessageRecord): Promise<{
        id?: string;
    } | void>;
    loadPersistedSessions(): Promise<SessionRecord[]>;
    deleteSession(input: {
        tenantId: string;
        label: string;
    }): Promise<void>;
    getMessages(): IncomingMessageRecord[];
}
