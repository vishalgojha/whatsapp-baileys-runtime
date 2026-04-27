import { WhatsAppClient } from './WhatsAppClient';
import type { SessionCreateOptions, SessionManagerOptions, SessionRecord, SessionSnapshot } from '../types';
export declare class SessionManager {
    private readonly options;
    private readonly clients;
    private readonly qrs;
    private readonly storage;
    private rehydrationStarted;
    constructor(options: SessionManagerOptions);
    createSession(tenantId: string, sessionOptions: SessionCreateOptions): Promise<WhatsAppClient | undefined>;
    getSession(tenantId: string, label?: string): Promise<WhatsAppClient | undefined>;
    getLiveSessionSnapshots(tenantId: string): SessionSnapshot[];
    getQR(tenantId: string, label?: string): string | undefined;
    removeSession(tenantId: string, label?: string): Promise<void>;
    rehydratePersistedSessions(): Promise<void>;
    getAllSessions(): SessionRecord[];
}
