"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppClient = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const sanitize_1 = require("../utils/sanitize");
class WhatsAppClient {
    constructor(options) {
        this.isConnecting = false;
        this.connectionStatus = 'disconnected';
        this.recentOutgoingMessages = new Map();
        this.tenantId = options.tenantId;
        this.storage = options.storage;
        this.hooks = options.hooks;
        this.label = options.label;
        this.ownerName = options.ownerName;
        this.connectedPhoneNumber = options.phoneNumber || options.usePairingCode;
        this.sessionPath = path_1.default.join(options.sessionRoot, `${options.tenantId}_${options.label}`);
    }
    async connect(options = {}) {
        if (this.isConnecting) {
            return;
        }
        this.isConnecting = true;
        this.connectedPhoneNumber = options.phoneNumber || options.usePairingCode || this.connectedPhoneNumber;
        this.connectionStatus = 'connecting';
        try {
            const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)(this.sessionPath);
            const { version } = await (0, baileys_1.fetchLatestBaileysVersion)();
            if (this.socket) {
                this.socket.ev.removeAllListeners();
            }
            this.socket = (0, baileys_1.default)({
                version,
                auth: state,
                printQRInTerminal: false,
            });
            if (options.usePairingCode) {
                const code = await this.socket.requestPairingCode(options.usePairingCode);
                await this.emitQR(code);
            }
            this.socket.ev.on('connection.update', async (update) => {
                try {
                    const { connection, lastDisconnect, qr } = update;
                    if (qr && !options.usePairingCode) {
                        await this.emitQR(qr);
                    }
                    if (connection === 'close') {
                        this.connectionStatus = 'disconnected';
                        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== baileys_1.DisconnectReason.loggedOut;
                        if (shouldReconnect) {
                            await this.connect(options);
                        }
                        else {
                            await this.persistStatus('disconnected');
                        }
                    }
                    else if (connection === 'open') {
                        this.connectionStatus = 'connected';
                        await this.persistStatus('connected');
                    }
                }
                catch (error) {
                    await this.hooks?.onError?.({
                        tenantId: this.tenantId,
                        label: this.label,
                        error,
                        stage: 'connection.update',
                    });
                }
            });
            this.socket.ev.on('creds.update', async () => {
                try {
                    await saveCreds();
                }
                catch (error) {
                    await this.hooks?.onError?.({
                        tenantId: this.tenantId,
                        label: this.label,
                        error,
                        stage: 'creds.update',
                    });
                }
            });
            this.socket.ev.on('messages.upsert', async (payload) => {
                try {
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
                    const event = {
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
                }
                catch (error) {
                    await this.hooks?.onError?.({
                        tenantId: this.tenantId,
                        label: this.label,
                        error,
                        stage: 'messages.upsert',
                    });
                }
            });
        }
        catch (error) {
            this.connectionStatus = 'disconnected';
            await this.persistStatus('disconnected');
            await this.hooks?.onError?.({
                tenantId: this.tenantId,
                label: this.label,
                error,
                stage: 'connect',
            });
        }
        finally {
            this.isConnecting = false;
        }
    }
    async sendMessage(jid, text) {
        if (!this.socket) {
            throw new Error('WhatsApp session is not connected');
        }
        const sanitizedText = (0, sanitize_1.sanitizeForWhatsApp)(text);
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
    async getParticipatingGroups() {
        if (!this.socket) {
            throw new Error('WhatsApp session is not connected');
        }
        const groups = await this.socket.groupFetchAllParticipating?.();
        if (groups) {
            return Object.values(groups).map((group) => ({
                id: group.id,
                name: group.subject || group.name || group.id,
            }));
        }
        const fallbackGroups = this.socket.store?.chats?.chats?.filter((chat) => chat.id.endsWith('@g.us')) || [];
        return fallbackGroups.map((group) => ({
            id: group.id,
            name: group.name || group.subject || group.id,
        }));
    }
    getStatusSnapshot() {
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
        if (fs_1.default.existsSync(this.sessionPath)) {
            fs_1.default.rmSync(this.sessionPath, { recursive: true, force: true });
        }
        this.connectionStatus = 'disconnected';
        await this.persistStatus('disconnected');
        await this.storage.deleteSession?.({
            tenantId: this.tenantId,
            label: this.label,
        });
    }
    async emitQR(qr) {
        await this.hooks?.onQR?.({
            tenantId: this.tenantId,
            label: this.label,
            qr,
        });
    }
    async persistStatus(status) {
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
    extractMessageText(message) {
        return (message?.conversation ||
            message?.extendedTextMessage?.text ||
            message?.imageMessage?.caption ||
            message?.videoMessage?.caption ||
            '');
    }
    createOutgoingMessageKey(jid, text) {
        return `${jid}:${text.trim()}`;
    }
    rememberOutgoingMessage(jid, text) {
        const key = this.createOutgoingMessageKey(jid, text);
        this.recentOutgoingMessages.set(key, Date.now() + 60000);
    }
    isRecentOutgoingMessage(jid, text) {
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
exports.WhatsAppClient = WhatsAppClient;
