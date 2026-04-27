"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryStorageAdapter = void 0;
class MemoryStorageAdapter {
    constructor() {
        this.sessions = new Map();
        this.messages = [];
    }
    async saveSessionStatus(input) {
        const key = `${input.tenantId}:${input.label}`;
        this.sessions.set(key, {
            tenantId: input.tenantId,
            label: input.label,
            ownerName: input.ownerName || null,
            phoneNumber: input.phoneNumber || null,
            status: input.status,
        });
    }
    async saveInboundMessage(input) {
        this.messages.push(input);
        return { id: `${this.messages.length}` };
    }
    async loadPersistedSessions() {
        return Array.from(this.sessions.values()).filter((session) => session.status === 'connecting' || session.status === 'connected');
    }
    async deleteSession(input) {
        this.sessions.delete(`${input.tenantId}:${input.label}`);
    }
    getMessages() {
        return [...this.messages];
    }
}
exports.MemoryStorageAdapter = MemoryStorageAdapter;
