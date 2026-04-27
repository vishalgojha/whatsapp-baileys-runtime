"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const WhatsAppClient_1 = require("./WhatsAppClient");
class SessionManager {
    constructor(options) {
        this.options = options;
        this.clients = new Map();
        this.qrs = new Map();
        this.storage = this.options.storage;
        this.rehydrationStarted = false;
    }
    async createSession(tenantId, sessionOptions) {
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
        const client = new WhatsAppClient_1.WhatsAppClient({
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
    async getSession(tenantId, label) {
        if (label) {
            return this.clients.get(`${tenantId}:${label}`);
        }
        const allKeys = Array.from(this.clients.keys()).filter((key) => key.startsWith(`${tenantId}:`));
        return allKeys.length > 0 ? this.clients.get(allKeys[0]) : undefined;
    }
    getLiveSessionSnapshots(tenantId) {
        const allKeys = Array.from(this.clients.keys()).filter((key) => key.startsWith(`${tenantId}:`));
        return allKeys
            .map((key) => this.clients.get(key))
            .filter(Boolean)
            .map((client) => client.getStatusSnapshot());
    }
    getQR(tenantId, label) {
        const key = label
            ? `${tenantId}:${label}`
            : Array.from(this.qrs.keys()).find((entry) => entry.startsWith(`${tenantId}:`));
        return this.qrs.get(key || '');
    }
    async removeSession(tenantId, label) {
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
        let sessions = [];
        try {
            sessions = await this.storage.loadPersistedSessions();
        }
        catch (error) {
            await this.options.hooks?.onError?.({
                tenantId: 'system',
                label: 'rehydration',
                error,
                stage: 'rehydrate.loadPersistedSessions',
            });
            return;
        }
        for (const session of sessions) {
            const fullKey = `${session.tenantId}:${session.label}`;
            const sessionPath = path_1.default.join(this.options.sessionRoot, `${session.tenantId}_${session.label}`);
            const hasAuthState = fs_1.default.existsSync(sessionPath);
            try {
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
            catch (error) {
                await this.options.hooks?.onError?.({
                    tenantId: session.tenantId,
                    label: session.label,
                    error,
                    stage: 'rehydrate.session',
                });
            }
        }
    }
    getAllSessions() {
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
exports.SessionManager = SessionManager;
