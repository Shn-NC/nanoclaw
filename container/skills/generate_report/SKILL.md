---
name: generate_report
description: Generate a formatted Markdown report with tables and sections. Use when creating status reports, test summaries, or any structured output for stakeholders.
---

# /generate_report — Generate Formatted Report

Generate a visually appealing Markdown report and save it to `/workspace/group`.

## Parameters

- `title` — report title (e.g. `Raport z testów — Sprint 3`)
- `data` — description of what to include in the report (sections, metrics, findings)
- `outputFile` — (optional) filename to save, relative to `/workspace/group` (default: `raport.md`)

## How to execute

### Step 1 — compose the report

Build a Markdown document using this structure:

```markdown
# {title}

**Data:** {current date}
**Przygotował:** {your role}

---

## Podsumowanie

{one-paragraph executive summary}

## Wyniki

| Obszar | Status | Uwagi |
|--------|--------|-------|
| ...    | ✅/❌/⚠️ | ...   |

## Szczegóły

{detailed findings, one section per topic}

## Wnioski i rekomendacje

{actionable conclusions}

---
*Wygenerowano automatycznie przez zespół QA*
```

### Step 2 — save the report

Use `/write_file {outputFile} {content}` to save the report.

### Step 3 — confirm

Return the file path and a brief summary of what the report contains.

## Response format

```
Raport zapisany: /workspace/group/{outputFile}

Zawiera: {one-line summary of sections}
```
