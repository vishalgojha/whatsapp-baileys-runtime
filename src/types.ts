export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export type SessionRecord = {
  tenantId: string;
  label: string;
  ownerName?: string | null;
  phoneNumber?: string | null;
  status: ConnectionStatus;
};

export type SessionStatusUpdate = SessionRecord & {
  lastSync?: string;
};

export type IncomingMessageRecord = {
  tenantId: string;
  label: string;
  remoteJid: string;
  text: string;
  sender?: string | null;
  timestamp?: string;
  fromMe: boolean;
  rawMessage: unknown;
};

export type OutgoingMessageRecord = {
  tenantId: string;
  label: string;
  remoteJid: string;
  text: string;
  timestamp?: string;
};

export type GroupInfo = {
  id: string;
  name: string;
};

export type SessionSnapshot = {
  label: string;
  ownerName?: string | null;
  phoneNumber?: string | null;
  status: ConnectionStatus;
};

export interface WhatsAppStorageAdapter {
  saveSessionStatus(input: SessionStatusUpdate): Promise<void>;
  saveInboundMessage(input: IncomingMessageRecord): Promise<{ id?: string } | void>;
  loadPersistedSessions(): Promise<SessionRecord[]>;
  deleteSession?(input: { tenantId: string; label: string }): Promise<void>;
}

export interface WhatsAppRuntimeHooks {
  onQR?: (event: { tenantId: string; label: string; qr: string }) => Promise<void> | void;
  onConnectionUpdate?: (event: SessionStatusUpdate) => Promise<void> | void;
  onMessage?: (event: IncomingMessageRecord) => Promise<void> | void;
  onOutgoingMessage?: (event: OutgoingMessageRecord) => Promise<void> | void;
  onError?: (event: { tenantId: string; label: string; error: unknown; stage: string }) => Promise<void> | void;
}

export type SessionCreateOptions = {
  label: string;
  ownerName?: string;
  phoneNumber?: string;
  usePairingCode?: string;
  skipLimitCheck?: boolean;
};

export type SessionManagerOptions = {
  storage: WhatsAppStorageAdapter;
  sessionRoot: string;
  hooks?: WhatsAppRuntimeHooks;
  canCreateSession?: (input: { tenantId: string; label: string; existingSessions: SessionRecord[] }) => Promise<void> | void;
};
