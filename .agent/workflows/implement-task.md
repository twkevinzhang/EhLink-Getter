---
description: Implement task with automated LLM-as-Judge verification
argument-hint: Task file path (e.g., task-feature.md)
allowed-tools: Task, Read, TodoWrite, Bash
---

# Implement Task with Verification (Strict Orchestrator)

**ROLE:** ORCHESTRATOR. You DISPATCH, AGGREGATE, and REPORT.
**PROHIBITIONS:** NO implementation. NO manual text reading (artifacts/code). NO manual verification.

## 1. EXECUTION PROTOCOLS

1.  **CONTEXT WALL**: Read the **Task File** ONCE. Never read other files. Relaying paths > reading content.
2.  **MANDATORY VERIFICATION**: If `#### Verification` exists, you MUST launch Judge Agents.
3.  **AGENT DELEGATION**:
    - **Developer**: Creates/Modifies code.
    - **Judge**: reads code & rubric, outputs score.

## 2. WORKFLOW

### PHASE 1: SETUP

1.  **READ**: `.specs/tasks/$TASK_FILE` (One-time only).
2.  **PARSE**: Identify Steps, Dependencies, Parallel groups, and Verification Specs.
3.  **INIT**: Create `TodoWrite` list.

### PHASE 2: EXECUTION LOOP

Execute steps in dependency order. Run parallel steps simultaneously.

#### PATTERN A: SIMPLE (No Verification)

- **Agent**: Developer (`model: opus`).
- **Task**: "Implement Step [N]: [Title]".
- **Action**: Upon success report, mark `[DONE]` in Task File & Todo.

#### PATTERN B: CRITICAL (Panel/Single Verification)

1.  **Implement**: Launch Developer.
    - _Prompt_: "Implement Step [N]. TaskFile: $TASK_FILE. Report artifact paths + confirmation."
2.  **Verify**: Launch **Judge Agents** (Parallel).
    - _Config_: `Single`=1 Judge, `Panel`=2 Judges.
    - _Prompt_:
      ```text
      Specific Task: Evaluate [ArtifactPath] from Step [N].
      Context: Read .specs/tasks/$TASK_FILE (Step [N] ONLY) & ./plugins/sadd/tasks/judge.md.
      Rubric: [Insert Rubric Table]
      Threshold: [Insert Threshold]
      Output: JSON { scores: {c1: x, c2: y}, total: z, pass: bool, reasoning: "..." }
      ```
3.  **Decide**:
    - **PASS** (Score ≥ Threshold): Mark `[DONE]`.
    - **FAIL** (Score < Threshold): **RETRY** (Max 2). Launch Developer ("Fix [Artifact] based on [Reasoning]"), then Re-Verify.
    - **SPLIT** (Variance > 2.0): Ask User.

#### PATTERN C: BATCH (Per-Item Verification)

1.  **Implement**: Launch multiple Developers (Parallel).
2.  **Verify**: Launch multiple Judges (Parallel, 1 per item).
3.  **Decide**: Retry failing items only. Mark `[DONE]` when ALL pass.

### PHASE 3: SUMMARY

Report:

- Steps: X/Y Completed.
- Quality: Pass Rate %, Retries needed.
- Judge Consensus: Any high variance?

## 3. VERIFICATION SPECS

| Level      | Agents | Use Case              |
| :--------- | :----- | :-------------------- |
| **None**   | 0      | Trivial (mkdir)       |
| **Single** | 1      | Standard Feature      |
| **Panel**  | 2      | Critical/Architecture |
| **Multi**  | 1/Item | Recurring Components  |

## 4. CRITICAL CHECKLIST

- [ ] Read Task File **ONCE**?
- [ ] Launched **Judges** for verified steps?
- [ ] Relied **ONLY** on agent reports (no reading)?
- [ ] Updated Task File markers (`[DONE]`, `[X]`)?
