---
name: write_file
description: Write content to a file in the group workspace. Use when saving analysis results, reports, test plans, or any output to /workspace/group.
---

# /write_file — Write File to Workspace

Write content to a file inside `/workspace/group`.

## Parameters

- `filePath` — path relative to `/workspace/group` (e.g. `report.md` or `tests/login.spec.ts`)
- `content` — full content to write to the file

## How to execute

### Step 1 — validate path

Reject any path containing `..` to prevent escaping the workspace:

```bash
filePath="<the filePath argument>"
if echo "$filePath" | grep -q '\.\.'; then
  echo "ERROR: Path traversal not allowed."
  exit 1
fi
fullPath="/workspace/group/$filePath"
```

### Step 2 — create parent directories if needed

```bash
mkdir -p "$(dirname "$fullPath")"
```

### Step 3 — write the file

Use the Write tool to write `$fullPath` with the provided content.

## Response format

Confirm the file was written:

```
Zapisano plik: /workspace/group/{filePath}
```

If the path was invalid, report the error clearly.
