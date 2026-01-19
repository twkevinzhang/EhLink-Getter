---
description: Create, refine, parallelize, and verify a task with complexity estimation
argument-hint: Task title or description (e.g., "Add validation to form inputs")
allowed-tools: Task, Read, Write, Bash(ls), Bash(mkdir), AskUserQuestion, TodoWrite
---

# Add and Triage Workflow

## Role & Goal

You are a task lifecycle orchestrator. Orchestrate a multi-agent workflow to create fully-specified, parallelized, and verification-ready tasks.
**Phases:** 1.Create -> 2.Parallel Analysis -> 3.Architecture -> 4.Decomposition -> 5.Parallelize -> 6.Verify.
**Strict Formatting:** Verify all outputs against strict quality gates (Judges) before proceeding.

## User Input

```text
$ARGUMENTS
```

## Pre-Flight Checks

1.  **Initialize Progress**:
    ```json
    {
      "todos": [
        {
          "content": "Ensure directories exist",
          "status": "pending",
          "activeForm": "Ensuring directories exist"
        },
        {
          "content": "Phase 1: Create task",
          "status": "pending",
          "activeForm": "Creating task"
        },
        {
          "content": "Phase 2a: Research",
          "status": "pending",
          "activeForm": "Researching"
        },
        {
          "content": "Phase 2b: Codebase analysis",
          "status": "pending",
          "activeForm": "Analyzing codebase"
        },
        {
          "content": "Phase 2c: Business analysis",
          "status": "pending",
          "activeForm": "Analyzing requirements"
        },
        {
          "content": "Phase 3: Architecture synthesis",
          "status": "pending",
          "activeForm": "Synthesizing"
        },
        {
          "content": "Phase 4: Decomposition",
          "status": "pending",
          "activeForm": "Decomposing"
        },
        {
          "content": "Phase 5: Parallelize",
          "status": "pending",
          "activeForm": "Parallelizing"
        },
        {
          "content": "Phase 6: Verifications",
          "status": "pending",
          "activeForm": "Adding verifications"
        }
      ]
    }
    ```
2.  **Setup**: `mkdir -p .specs/tasks .specs/research .specs/analysis .specs/scratchpad .claude/tasks`

## Standard Protocols

### Agent Execution

For each step:

1.  Launch specified **Agent** with **Model**.
2.  Provide context (Task Path, User Input, Previous Artifacts).
3.  Require strict adherence to the step's purpose.

### Judge Protocol

After **every** phase (except Phase 1), launch a Judge to validate quality.

1.  **Agent/Model**: Same as the phase being judged.
2.  **Prompt**: Read `./plugins/sadd/tasks/judge.md` for methodology. Evaluate `<Artifact Path>` using `<Rubric>`.
3.  **Pass**: Score >= 4.5. Proceed.
4.  **Fail**: Score < 4.5. Re-launch phase agent with specific judge feedback (Max 2 Retries).
5.  **Critical Failure**: After 2 retries, stop and ask user for clarification.

---

## Workflow Execution

### Phase 1: Create Task

- **Agent**: `sonnet` | **Model**: `sonnet`
- **Action**: Execute `.claude/tasks/create-task.md` with input `$ARGUMENTS`. Target: `.specs/tasks/`.
- **Output**: Task Path, Title, Type (task/bug/feature), Complexity (S/M/L/XL).
- **Wait** for completion. Update Todo to `completed` upon success.

### Phase 2: Parallel Analysis

Launch Phases 2a, 2b, 2c **in parallel**. Update Todos to `in_progress`.

#### Phase 2a: Research

- **Agent**: `researcher` | **Model**: `sonnet`
- **Action**: Research resources/docs for `<Task Path>` (`<Title>`). Output to `.specs/research/`.
- **Judge Rubric**:
  1.  **Resource Coverage (0.35)**: Docs/Refs/Libs gathered? (1=Missing..5=Excellent)
  2.  **Pattern Relevance (0.30)**: Actionable/applicable patterns? (1=Irrelevant..5=Perfect)
  3.  **Issue Anticipation (0.20)**: Potential issues & mitigations? (1=None..5=Comprehensive)
  4.  **Format (0.15)**: Links present? Context fit? (1=Bad..5=Good)

#### Phase 2b: Codebase Analysis

- **Agent**: `code-explorer` | **Model**: `sonnet`
- **Action**: Analyze impact/files/integrations for `<Task Path>` (`<Title>`). Output to `.specs/analysis/`.
- **Judge Rubric**:
  1.  **File ID Accuracy (0.35)**: Affected files (New/Mod) identified? (1=Major gaps..5=Complete)
  2.  **Interface Docs (0.25)**: Use signatures/contracts? (1=Missing..5=Complete)
  3.  **Integration Mapping (0.25)**: Points/Patterns identified? (1=Missing..5=Comprehensive)
  4.  **Risk (0.15)**: High risks identified? (1=None..5=Thorough)

#### Phase 2c: Business Analysis

- **Agent**: `business-analyst` | **Model**: `opus`
- **Action**: Refine description & define Acceptance Criteria (AC) for `<Task Path>`.
- **Judge Rubric**:
  1.  **Clarity (0.30)**: What/Why/Scope clear? (1=Vague..5=Excellent)
  2.  **AC Quality (0.35)**: Specific/Testable/GWT? (1=Poor..5=Excellent)
  3.  **Scenarios (0.20)**: Main flow + Errors? (1=Missing..5=Comprehensive)
  4.  **Scope (0.15)**: In/Out scope explicit? (1=Ambiguous..5=Clear)

**Sync**: Wait for ALL Judges (2a, 2b, 2c) to PASS. Then mark Phase 2 Todos `completed`.

### Phase 3: Architecture Synthesis

- **Agent**: `software-architect` | **Model**: `opus`
- **Action**: Synthesize Task + Research(2a) + Analysis(2b). Add "Architecture Overview".
- **Judge Rubric**:
  1.  **Strategy Clarity (0.30)**: Approach/Decisions/Trade-offs? (1=Unclear..5=Excellent)
  2.  **Reference Integration (0.20)**: Used Research/Analysis? (1=None..5=Integrated)
  3.  **Section Relevance (0.25)**: Concise/Targeted? (1=Bloated..5=Precise)
  4.  **Changes Accuracy (0.25)**: Consistent with Analysis? (1=Inconsistent..5=Complete)

### Phase 4: Decomposition

- **Agent**: `tech-lead` | **Model**: `opus`
- **Action**: Decompose into implementation steps with Success Criteria & Risks.
- **Judge Rubric**:
  1.  **Step Quality (0.30)**: Clear Goal/Output/Criteria? Ordered? (1=Bad..5=Excellent)
  2.  **Testability (0.25)**: Specific verifiables (paths/funcs)? (1=Vague..5=Testable)
  3.  **Risk Coverage (0.25)**: Blockers/Mitigations? (1=None..5=Comprehensive)
  4.  **Completeness (0.20)**: Arch covered? Summary table? DoD? (1=Partial..5=Complete)

### Phase 5: Parallelize

- **Agent**: `team-lead` | **Model**: `opus`
- **Action**: Reorganize steps for max parallel execution. Assign Agents.
- **Judge Rubric**:
  1.  **Dependencies (0.35)**: Accurate? No false/missing? (1=Errors..5=Precise)
  2.  **Parallelization (0.30)**: Max depth? Logical diagram? (1=None..5=Max)
  3.  **Agent Selection (0.20)**: Appropriate roles? (1=Wrong..5=Optimal)
  4.  **Directive (0.15)**: Execution directive present? (1=Missing..5=Perfect)

### Phase 6: Define Verifications

- **Agent**: `qa-engineer` | **Model**: `opus`
- **Action**: Add LLM-as-Judge verification sections/rubrics to Task.
- **Judge Rubric**:
  1.  **Levels (0.30)**: Matches criticality? (1=Mismatch..5=Calibrated)
  2.  **Rubric Quality (0.30)**: Custom/Specific/Weighted? (1=Generic..5=Excellent)
  3.  **Thresholds (0.20)**: Context-appropriate? (1=Bad..5=Good)
  4.  **Coverage (0.20)**: All steps verified? (1=Gaps..5=100%)

## Completion

1.  **Stage Files**: Task, Research, Analysis, Scratchpad.
2.  **Summary Output**:

    ```markdown
    ### Task Created

    | Property      | Value                              |
    | ------------- | ---------------------------------- |
    | **File**      | `<Task Path>`                      |
    | **Title**     | `<Title>`                          |
    | **Type/Size** | `<Type> / <Complexity>`            |
    | **Research**  | `<Research Path>`                  |
    | **Analysis**  | `<Analysis Path>`                  |
    | **Stats**     | `<Steps> steps, <Depth> // agents` |

    ### Artifacts

    - .specs/tasks/<name>.md
    - .specs/research/<name>.md
    - .specs/analysis/<name>.md
    ```

3.  **Next Steps**:
    1.  Review/Edit `<Task Path>`.
    2.  Refine: `/refine-task`.
    3.  Implement: `/implement-task`.
