import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  IncomingMessageRecord,
  SessionRecord,
  SessionStatusUpdate,
  WhatsAppStorageAdapter,
} from '../types';

type SupabaseStorageAdapterOptions = {
  supabase?: SupabaseClient;
  supabaseUrl?: string;
  supabaseKey?: string;
  sessionsTable?: string;
  messagesTable?: string;
};

export class SupabaseStorageAdapter implements WhatsAppStorageAdapter {
  private readonly supabase: SupabaseClient;
  private readonly sessionsTable: string;
  private readonly messagesTable: string;

  constructor(options: SupabaseStorageAdapterOptions) {
    const client = options.supabase
      ?? (options.supabaseUrl && options.supabaseKey
        ? createClient(options.supabaseUrl, options.supabaseKey)
        : null);

    if (!client) {
      throw new Error(
        'SupabaseStorageAdapter requires either an existing supabase client or supabaseUrl + supabaseKey.',
      );
    }

    this.supabase = client;
    this.sessionsTable = options.sessionsTable || 'whatsapp_sessions';
    this.messagesTable = options.messagesTable || 'messages';
  }

  async saveSessionStatus(input: SessionStatusUpdate): Promise<void> {
    const payload = {
      tenant_id: input.tenantId,
      label: input.label,
      owner_name: input.ownerName ?? null,
      phone_number: input.phoneNumber ?? null,
      status: input.status,
      last_sync: input.lastSync ?? new Date().toISOString(),
    };

    const { error } = await this.supabase
      .from(this.sessionsTable)
      .upsert(payload, { onConflict: 'tenant_id,label' });

    if (error) {
      throw error;
    }
  }

  async saveInboundMessage(input: IncomingMessageRecord): Promise<{ id?: string } | void> {
    const payload = {
      tenant_id: input.tenantId,
      label: input.label,
      remote_jid: input.remoteJid,
      text: input.text,
      sender: input.sender ?? null,
      timestamp: input.timestamp ?? new Date().toISOString(),
      from_me: input.fromMe,
      raw_message: input.rawMessage,
    };

    const { data, error } = await this.supabase
      .from(this.messagesTable)
      .insert(payload)
      .select('id')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? { id: String(data.id) } : undefined;
  }

  async loadPersistedSessions(): Promise<SessionRecord[]> {
    const { data, error } = await this.supabase
      .from(this.sessionsTable)
      .select('tenant_id,label,owner_name,phone_number,status')
      .in('status', ['connecting', 'connected']);

    if (error) {
      throw error;
    }

    return (data || []).map((row: any) => ({
      tenantId: row.tenant_id,
      label: row.label,
      ownerName: row.owner_name ?? null,
      phoneNumber: row.phone_number ?? null,
      status: row.status,
    }));
  }

  async deleteSession(input: { tenantId: string; label: string }): Promise<void> {
    const { error } = await this.supabase
      .from(this.sessionsTable)
      .delete()
      .eq('tenant_id', input.tenantId)
      .eq('label', input.label);

    if (error) {
      throw error;
    }
  }
}
