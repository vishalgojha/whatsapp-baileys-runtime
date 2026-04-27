# whatsapp-baileys-runtime

Reusable Baileys-based WhatsApp runtime extracted from production learnings in PropAI Pulse.

This package focuses on the transport/runtime layer only:

- QR session connect flow
- multi-session management
- session rehydration from persisted auth folders
- inbound/outbound message handling
- group discovery
- storage adapter hooks
- app-specific event hooks

It intentionally does not contain product logic such as CRM writes, AI agents, billing, channels, or Supabase-specific assumptions.

## What this package is for

Use this when you want the same WhatsApp Web / Baileys engine across multiple products, while keeping business logic in each host app.

## Install

```bash
npm install @vishalgojha/whatsapp-baileys-runtime
```

## Core concepts

### Storage adapter

You provide a storage adapter so the runtime can persist session status and inbound messages without knowing whether your product uses Supabase, Postgres, MongoDB, or anything else.

### Hooks

You provide runtime hooks for product behavior:

- when QR is generated
- when connection state changes
- when inbound messages arrive
- when outbound messages are sent
- when runtime errors occur

## Quick example

```ts
import {
  MemoryStorageAdapter,
  SessionManager,
} from '@vishalgojha/whatsapp-baileys-runtime';

const storage = new MemoryStorageAdapter();

const sessionManager = new SessionManager({
  storage,
  sessionRoot: './sessions',
  hooks: {
    onMessage: async (event) => {
      console.log('Inbound:', event.remoteJid, event.text);
    },
    onConnectionUpdate: async (event) => {
      console.log('Status:', event.status);
    },
  },
});

await sessionManager.createSession('tenant-1', {
  label: 'owner-device',
  ownerName: 'Vishal',
  phoneNumber: '919820056180',
});
```

## Recommended host-app architecture

Keep these outside this package:

- AI agent execution
- lead parsing
- CRM persistence
- subscription/device limits
- custom dashboards
- domain workflows

Your host app should attach those with hooks.

## Suggested next adapters

- `SupabaseStorageAdapter`
- `PostgresStorageAdapter`
- `FilesystemSessionMetadataAdapter`

## Current exports

- `WhatsAppClient`
- `SessionManager`
- `MemoryStorageAdapter`
- `sanitizeForWhatsApp`
- shared types
