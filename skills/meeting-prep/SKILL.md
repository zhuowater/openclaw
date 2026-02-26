---
name: meeting-prep
description: Automatic meeting preparation - fetches upcoming calendar events and generates context summaries. Use when you need to prepare for meetings or when asked about upcoming events.
---

# Meeting Prep

Automatic meeting context preparation from calendar and memory.

## What It Does

1. Fetches upcoming calendar events (Google Calendar via `gog` CLI or direct API)
2. Searches MEMORY.md and daily notes for relevant context
3. Generates a concise pre-meeting brief with:
   - Event details (time, participants, agenda)
   - Relevant background from past conversations
   - Action items or follow-ups from previous meetings
   - Suggested preparation points

## When To Use

- When asked "what meetings do I have?"
- When preparing for an upcoming meeting
- As part of morning briefing routine
- Before important calls or events

## Requirements

- `gog` CLI installed (Google Workspace tools) OR
- Direct Google Calendar API access configured
- MEMORY.md and daily notes in place

## Usage

```javascript
const { prepareMeeting, listUpcoming } = require('./skills/meeting-prep');

// List upcoming events
const events = await listUpcoming({ hours: 24 });

// Prepare for a specific event
const brief = await prepareMeeting(eventId);
```

## Integration

Can be triggered:
- Manually via user request
- Automatically via heartbeat (check for meetings in next 2h)
- Via cron job for morning briefing
