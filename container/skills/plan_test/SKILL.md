---
name: plan_test
description: Create a test plan from documentation. Use when given requirements or a specification and asked to produce a structured test plan with test cases.
---

# /plan_test — Create Test Plan

Read documentation and produce a structured test plan saved to `/workspace/group`.

## Parameters

- `docPath` — path to the requirements document, relative to `/docs` (e.g. `REQUIREMENTS.md`)
- `outputFile` — (optional) filename for the plan, relative to `/workspace/group` (default: `plan_testow.md`)

## How to execute

### Step 1 — read the documentation

Use `/read_documentation {docPath}` to load the requirements.

If `docPath` is not provided, list available files:

```bash
find /docs -type f | sort
```

### Step 2 — analyse and extract testable requirements

Identify:
- Functional requirements → functional test cases
- Edge cases and boundary conditions
- Error/exception scenarios
- Integration points between components

### Step 3 — compose the test plan

Structure the output as:

```markdown
# Plan testów — {document name}

**Data:** {current date}
**Przygotował:** Test Lead

---

## 1. Zakres testów

{what is and is not in scope}

## 2. Strategia testowania

| Typ testów         | Odpowiedzialny      | Priorytet |
|--------------------|---------------------|-----------|
| Testy manualne     | Manual Tester       | Wysoki    |
| Testy automatyczne | Automation Engineer | Średni    |

## 3. Przypadki testowe

### TC-001: {test case title}

- *Warunek wstępny:* {precondition}
- *Kroki:*
  1. {step 1}
  2. {step 2}
- *Oczekiwany rezultat:* {expected result}
- *Typ:* Manualny / Automatyczny
- *Priorytet:* Wysoki / Średni / Niski

### TC-002: ...

## 4. Kryteria akceptacji

{definition of done for this test cycle}

## 5. Ryzyka

| Ryzyko | Prawdopodobieństwo | Wpływ | Mitygacja |
|--------|-------------------|-------|-----------|
| ...    | ...               | ...   | ...       |
```

### Step 4 — save the plan

Use `/write_file {outputFile} {content}` to save.

## Response format

```
Plan testów zapisany: /workspace/group/{outputFile}

Zidentyfikowano {N} przypadków testowych:
• Manualnych: {n}
• Automatycznych: {n}
```
