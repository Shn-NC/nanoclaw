---
name: read_documentation
description: Read a documentation file from /docs by relative path. Use when the user asks to read, show, or look up a documentation file, or invokes /read_documentation.
---

# /read_documentation — Read Documentation File

Read and return the contents of a file from the `/docs` directory.

## Parameters

- `filePath` — path to the file relative to `/docs` (e.g. `REQUIREMENTS.md` or `subdir/file.txt`)

## How to execute

1. Resolve the full path: `/docs/{filePath}`
2. Validate the path stays within `/docs` — reject any path containing `..` or starting with `/` that would escape the docs directory
3. Read the file and return its contents

### Step 1 — validate path

```bash
filePath="<the filePath argument>"
# Reject traversal attempts
if echo "$filePath" | grep -q '\.\.'; then
  echo "ERROR: Path traversal not allowed."
  exit 1
fi
fullPath="/docs/$filePath"
```

### Step 2 — check file exists

```bash
if [ ! -f "$fullPath" ]; then
  echo "ERROR: File not found: /docs/$filePath"
  echo "Available files:"
  find /docs -type f | sed 's|/docs/||' | sort
  exit 1
fi
```

### Step 3 — read and return contents

Use the Read tool to read `$fullPath` and return the full contents to the user.

```
Read /docs/{filePath}
```

## Response format

Return the file contents directly. Prepend a one-line header:

```
📄 /docs/{filePath}

{file contents}
```

If the file is not found, list available files in `/docs` so the user can pick the right one.
