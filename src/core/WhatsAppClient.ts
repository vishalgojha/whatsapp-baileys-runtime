import fs from 'fs';
import path from 'path';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { sanitizeForWhatsApp } from '../utils/sanitize';
import type {
  ConnectionStatus,
  GroupInfo,
  IncomingMessageRecord,
  SessionCreateOptions,
  SessionSnapshot,
  WhatsAppRuntimeHooks,
  WhatsAppStorageAdapter,
} from '../types';

type WhatsAppClientOptions = {
  tenantId: string;
  storage: WhatsAppStorageAdapter;
  hooks?: WhatsAppRuntimeHooks;
  sessionRoot: string;
} & SessionCreateOptions;

export class WhatsAppClient {
  private socket: any;
  private readonly tenantId: string;
  private readonly storage: WhatsAppStorageAdapter;
  private readonly hooks?: WhatsAppRuntimeHooks;
  private readonly sessionPath: string;
  private readonly label: string;
  private readonly ownerName?: string;
  private connectedPhoneNumber?: string;
  private isConnecting = false;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private readonly recentOutgoingMessages = new Map<string, number>();

  constructor(options: WhatsAppClientOptions) {
    this.tenantId = options.tenantId;
    this.storage = options.storage;
    this.hooks = options.hooks;
    this.label = options.label;
    this.ownerName = options.ownerName;
    this.connectedPhoneNumber = options.phoneNumber || options.usePairingCode;
    this.sessionPath = path.join(options.sessionRoot, `${options.tenantId}_${options.label}`);
  }

  async connect(options: { usePairingCode?: string; phoneNumber?: string } = {}) {
    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.connectedPhoneNumber = options.phoneNumber || options.usePairingCode || this.connectedPhoneNumber;
    this.connectionStatus = 'connecting';

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
      const { version } = await fetchLatestBaileysVersion();

      if (this.socket) {
        this.socket.ev.removeAllListeners();
      }

      this.socket = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
      });

      if (options.usePairingCode) {
        const code = await this.socket.requestPairingCode(options.usePairingCode);
        await this.emitQR(code);
      }

      this.socket.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !options.usePairingCode) {
          await this.emitQR(qr);
        }

        if (connection === 'close') {
          this.connectionStatus = 'disconnected';
          const shouldReconnect =
            (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

          if (shouldReconnect) {
            await this.connect(options);
          } else {
            await this.persistStatus('disconnected');
          }
        } else if (connection === 'open') {
          this.connectionStatus = 'connected';
          await this.persistStatus('connected');
        }
      });

      this.socket.ev.on('creds.update', saveCreds);

      this.socket.ev.on('messages.upsert', async (payload: any) => {
        const msg = payload?.messages?.[0];
        if (!msg?.message) {
          return;
        }

        const messageText = this.extractMessageText(msg.message);
        const remoteJid = msg.key.remoteJid || '';
        const wasSentByThisClient = this.isRecentOutgoingMessage(remoteJid, messageText);

        if (!messageText) {
          return;
        }

        if (msg.key.fromMe && wasSentByThisClient) {
          return;
        }

        const event: IncomingMessageRecord = {
          tenantId: this.tenantId,
          label: this.label,
          remoteJid,
          text: messageText,
          sender: msg.pushName || null,
          timestamp: new Date().toISOString(),
          fromMe: Boolean(msg.key.fromMe),
          rawMessage: msg,
        };

        await this.storage.saveInboundMessage(event);
        await this.hooks?.onMessage?.(event);
      });
    } catch (error) {
      this.connectionStatus = 'disconnected';
      await this.persistStatus('disconnected');
      await this.hooks?.onError?.({
        tenantId: this.tenantId,
        label: this.label,
        error,
        stage: 'connect',
      });
    } finally {
      this.isConnecting = false;
    }
  }

  async sendMessage(jid: string, text: string) {
    if (!this.socket) {
      throw new Error('WhatsApp session is not connected');
    }

    const sanitizedText = sanitizeForWhatsApp(text);
    this.rememberOutgoingMessage(jid, sanitizedText);
    await this.socket.sendMessage(jid, { text: sanitizedText });
    await this.hooks?.onOutgoingMessage?.({
      tenantId: this.tenantId,
      label: this.label,
      remoteJid: jid,
      text: sanitizedText,
      timestamp: new Date().toISOString(),
    });
  }

  async getParticipatingGroups(): Promise<GroupInfo[]> {
    if (!this.socket) {
      throw new Error('WhatsApp session is not connected');
    }

    const groups = await this.socket.groupFetchAllParticipating?.();
    if (groups) {
      return Object.values(groups).map((group: any) => ({
        id: group.id,
        name: group.subject || group.name || group.id,
      }));
    }

    const fallbackGroups = this.socket.store?.chats?.chats?.filter((chat: any) => chat.id.endsWith('@g.us')) || [];
    return fallbackGroups.map((group: any) => ({
      id: group.id,
      name: group.name || group.subject || group.id,
    }));
  }

  getStatusSnapshot(): SessionSnapshot {
    return {
      label: this.label,
      ownerName: this.ownerName || null,
      phoneNumber: this.connectedPhoneNumber || null,
      status: this.connectionStatus,
    };
  }

  async disconnect() {
    if (!this.socket) {
      return;
    }

    await this.socket.logout();
    if (fs.existsSync(this.sessionPath)) {
      fs.rmSync(this.sessionPath, { recursive: true, force: true });
    }

    this.connectionStatus = 'disconnected';
    await this.persistStatus('disconnected');
    await this.storage.deleteSession?.({
      tenantId: this.tenantId,
      label: this.label,
    });
  }

  private async emitQR(qr: string) {
    await this.hooks?.onQR?.({
      tenantId: this.tenantId,
      label: this.label,
      qr,
    });
  }

  private async persistStatus(status: ConnectionStatus) {
    const payload = {
      tenantId: this.tenantId,
      label: this.label,
      ownerName: this.ownerName || null,
      phoneNumber: this.connectedPhoneNumber || null,
      status,
      lastSync: new Date().toISOString(),
    };

    await this.storage.saveSessionStatus(payload);
    await this.hooks?.onConnectionUpdate?.(payload);
  }

  private extractMessageText(message: any): string {
    return (
      message?.conversation ||
      message?.extendedTextMessage?.text ||
      message?.imageMessage?.caption ||
      message?.videoMessage?.caption ||
      ''
    );
  }

  private createOutgoingMessageKey(jid: string, text: string) {
    return `${jid}:${text.trim()}`;
  }

  private rememberOutgoingMessage(jid: string, text: string) {
    const key = this.createOutgoingMessageKey(jid, text);
    this.recentOutgoingMessages.set(key, Date.now() + 60_000);
  }

  private isRecentOutgoingMessage(jid: string, text: string) {
    const now = Date.now();
    for (const [key, expiresAt] of this.recentOutgoingMessages.entries()) {
      if (expiresAt <= now) {
        this.recentOutgoingMessages.delete(key);
      }
    }

    const key = this.createOutgoingMessageKey(jid, text);
    const expiresAt = this.recentOutgoingMessages.get(key);
    if (!expiresAt) {
      return false;
    }

    this.recentOutgoingMessages.delete(key);
    return true;
  }

  getSessionPath() {
    return this.sessionPath;
  }
}
