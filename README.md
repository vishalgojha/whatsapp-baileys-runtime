# whatsapp-baileys-runtime

Reusable Baileys-based WhatsApp runtime with QR auth, session rehydration, adapters, and app hooks.

`whatsapp-baileys-runtime` is a reusable WhatsApp transport runtime built on Baileys. It handles QR authentication, multi-session lifecycle management, inbound and outbound messaging, group access, and session restoration, while leaving storage and product workflows to pluggable adapters and hooks.

This package focuses on the transport/runtime layer only:

- QR session connect flow
- multi-session management
- session rehydration from persisted auth folders
- inbound/outbound message handling
- group discovery
- storage adapter hooks
- app-specific event hooks

It intentionally does not contain product logic such as CRM writes, AI agents, billing, channels, or product-specific workflows.

## What this package is for

Use this when you want the same WhatsApp Web / Baileys engine across multiple products, while keeping business logic in each host app.

In architectural terms, this package gives you:

- a reusable WhatsApp transport layer
- adapter-driven persistence
- hook-based application orchestration
- a clean separation between session infrastructure and product logic

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

This means your app can attach things like:

- CRM persistence
- AI agent execution
- routing into app-specific workflows
- analytics and observability

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

The cleanest way to use this package is:

1. let `whatsapp-baileys-runtime` own the transport layer
2. plug in a storage adapter for persistence
3. attach your app behavior through runtime hooks
4. keep product decisions outside the runtime

That pattern is what lets the same engine power multiple products without copying WhatsApp infrastructure between repos.

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

## Supabase adapter

The package now includes a `SupabaseStorageAdapter` for teams already using Supabase.

```ts
import {
  SessionManager,
  SupabaseStorageAdapter,
} from '@vishalgojha/whatsapp-baileys-runtime';

const storage = new SupabaseStorageAdapter({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  sessionsTable: 'whatsapp_sessions',
  messagesTable: 'messages',
});

const sessionManager = new SessionManager({
  storage,
  sessionRoot: './sessions',
});
```

### Expected session table columns

- `tenant_id`
- `label`
- `owner_name`
- `phone_number`
- `status`
- `last_sync`

### Expected messages table columns

- `tenant_id`
- `label`
- `remote_jid`
- `text`
- `sender`
- `timestamp`
- `from_me`
- `raw_message`

## Current exports

- `WhatsAppClient`
- `SessionManager`
- `MemoryStorageAdapter`
- `SupabaseStorageAdapter`
- `sanitizeForWhatsApp`
- shared types

## One-line summary

Reusable Baileys-based WhatsApp runtime with adapter-driven persistence and hook-based application orchestration.
