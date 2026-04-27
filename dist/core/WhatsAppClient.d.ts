import type { GroupInfo, SessionCreateOptions, SessionSnapshot, WhatsAppRuntimeHooks, WhatsAppStorageAdapter } from '../types';
type WhatsAppClientOptions = {
    tenantId: string;
    storage: WhatsAppStorageAdapter;
    hooks?: WhatsAppRuntimeHooks;
    sessionRoot: string;
} & SessionCreateOptions;
export declare class WhatsAppClient {
    private socket;
    private readonly tenantId;
    private readonly storage;
    private readonly hooks?;
    private readonly sessionPath;
    private readonly label;
    private readonly ownerName?;
    private connectedPhoneNumber?;
    private isConnecting;
    private connectionStatus;
    private readonly recentOutgoingMessages;
    constructor(options: WhatsAppClientOptions);
    connect(options?: {
        usePairingCode?: string;
        phoneNumber?: string;
    }): Promise<void>;
    sendMessage(jid: string, text: string): Promise<void>;
    getParticipatingGroups(): Promise<GroupInfo[]>;
    getStatusSnapshot(): SessionSnapshot;
    disconnect(): Promise<void>;
    private emitQR;
    private persistStatus;
    private extractMessageText;
    private createOutgoingMessageKey;
    private rememberOutgoingMessage;
    private isRecentOutgoingMessage;
    getSessionPath(): string;
}
export {};
