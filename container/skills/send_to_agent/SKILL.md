---
name: send_to_agent
description: Send a message to another agent in the QA team. Writes a JSON file to /shared/inbox/ so the target agent can read it on next invocation. Available to all agents.
---

# /send_to_agent — Send Message to Another Agent

Leave a message for another agent in the shared inbox at `/shared/inbox/`.

## Available agents

| Agent name (agentName) | Role |
|------------------------|------|
| `SolutionDesigner`     | Analyzes requirements, clarifies gaps |
| `TestManager`          | Coordinates team, manages reports |
| `TestLead`             | Creates test plans, assigns test cases |
| `ManualTester`         | Executes manual test cases |
| `AutomationEngineer`   | Writes automated tests |

## Parameters

- `agentName` — target agent name (see table above)
- `message` — text content of the message (may include file references, instructions, or data)

## How to execute

### Step 1 — validate agentName

Accepted values: `SolutionDesigner`, `TestManager`, `TestLead`, `ManualTester`, `AutomationEngineer`.

### Step 2 — compose the message JSON

```json
{
  "from": "{your role}",
  "to": "{agentName}",
  "timestamp": "{ISO timestamp}",
  "message": "{message content}"
}
```

Get the current timestamp:

```bash
date -u +"%Y-%m-%dT%H:%M:%SZ"
```

### Step 3 — write to inbox

Use the Write tool to save the file:

```
/shared/inbox/to_{agentName}.json
```

If a file already exists for that agent, read it first and append your message to a JSON array, so no previous messages are lost:

```json
[
  { "from": "...", "to": "...", "timestamp": "...", "message": "..." },
  { "from": "...", "to": "...", "timestamp": "...", "message": "..." }
]
```

### Step 4 — confirm

```
Wiadomość wysłana do {agentName}.
Plik: /shared/inbox/to_{agentName}.json
```

## Reading your inbox

To check messages sent to you:

```bash
cat /shared/inbox/to_{YourAgentName}.json 2>/dev/null || echo "Brak wiadomości"
```

After reading, you may archive processed messages to `/shared/inbox/processed/` to keep the inbox clean.
