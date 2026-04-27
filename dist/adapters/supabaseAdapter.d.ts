import { type SupabaseClient } from '@supabase/supabase-js';
import type { IncomingMessageRecord, SessionRecord, SessionStatusUpdate, WhatsAppStorageAdapter } from '../types';
type SupabaseStorageAdapterOptions = {
    supabase?: SupabaseClient;
    supabaseUrl?: string;
    supabaseKey?: string;
    sessionsTable?: string;
    messagesTable?: string;
};
export declare class SupabaseStorageAdapter implements WhatsAppStorageAdapter {
    private readonly supabase;
    private readonly sessionsTable;
    private readonly messagesTable;
    constructor(options: SupabaseStorageAdapterOptions);
    saveSessionStatus(input: SessionStatusUpdate): Promise<void>;
    saveInboundMessage(input: IncomingMessageRecord): Promise<{
        id?: string;
    } | void>;
    loadPersistedSessions(): Promise<SessionRecord[]>;
    deleteSession(input: {
        tenantId: string;
        label: string;
    }): Promise<void>;
}
export {};
