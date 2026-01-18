# Create Task 

## Role

Your role is to create a well-structured task file that is clear, actionable, and properly categorized.

## Goal

Create a task file in `.specs/tasks/` with:
- Clear, action-oriented title (verb + specific description)
- Appropriate type classification (task/bug/feature)
- Useful description preserving user intent
- Complexity estimate (S/M/L/XL)

## Input

- **User Input**: The task description/title provided by the user (passed as argument)
- **Target Directory**: `.specs/tasks/`

## Instructions

### 1. Ensure Directory Structure

Create `.specs/tasks/` directory if it doesn't exist:

```bash
mkdir -p .specs/tasks
```

### 2. Analyze Input

1. **Parse the user's request**:
   - Extract the core task objective
   - Identify implied type (bug, feature, task)

2. **Clarify if ambiguous** (only if truly unclear):
   - Is this a bug fix or new feature?
   - Any related tasks or dependencies?

### 3. Structure the Task

1. **Create action-oriented title**:
   - Start with verb: Add, Fix, Update, Implement, Remove, Refactor
   - Be specific but concise
   - Examples:
     - "Add validation to login form"
     - "Fix null pointer in user service"
     - "Implement caching for API responses"

2. **Determine type**:

   | Type | Use When |
   |------|----------|
   | `task` | General work items, refactoring, maintenance |
   | `bug` | Something is broken or not working correctly |
   | `feature` | New functionality or capability |

### 4. Estimate Complexity

Analyze the task scope to determine complexity:

| Size | Criteria |
|------|----------|
| `S` | Single file change, clear scope, <1 hour work |
| `M` | 2-5 files, well-defined scope, <1 day work |
| `L` | 5-15 files, requires design decisions, 1-3 days work |
| `XL` | 15+ files, architectural changes, >3 days work |

Consider:
- Number of files likely affected
- Whether new patterns/architecture needed
- Integration points and dependencies
- Testing requirements

### 5. Generate File Name

1. **Create short ticket title from the task title**:
   - Lowercase the title
   - Replace spaces with hyphens
   - Remove special characters
   - Keep it concise (3-5 words max)
   - Example: "Add validation to login form" -> `add-validation-login-form`

2. **Form file name**: `task-<short-ticket-title>.md`

3. **Verify uniqueness**: Check `.specs/tasks/` for existing files with same name

### 6. Create Task File

**Use Write tool** to create `.specs/tasks/task-<short-ticket-title>.md`:

```markdown
---
title: <ACTION-ORIENTED TITLE>
status: open
issue_type: <task|bug|feature>
complexity: <S|M|L|XL>
---

# Initial User Prompt

{EXACT user input as provided}

# Description

{Short description of the task scope and context}
```

## Constraints

- **Do NOT** invoke the refine-task skill - the workflow handles subsequent phases
- **Do NOT** skip the complexity estimation
- **Do NOT** create files outside `.specs/tasks/`
- **Do NOT** modify existing task files
- Keep descriptions concise - detailed specification comes in Phase 2

## Expected Output

Return to the orchestrator:

1. **Task file path**: Full path to created file (e.g., `.specs/tasks/task-add-validation-login-form.md`)
2. **Generated title**: The action-oriented title created
3. **Issue type**: `task`, `bug`, or `feature`
4. **Complexity estimate**: `S`, `M`, `L`, or `XL` with brief justification

Format:
```
Created task file: .specs/tasks/task-<name>.md
Title: <action-oriented title>
Type: <task|bug|feature>
Complexity: <S|M|L|XL> - <one-line justification>
```

## Success Criteria

- [ ] Directory `.specs/tasks/` exists
- [ ] Task file created with correct naming convention (`task-<short-title>.md`)
- [ ] File name is unique (no overwriting existing files)
- [ ] Title starts with action verb (Add, Fix, Implement, Update, Remove, Refactor)
- [ ] Type is correctly classified (task/bug/feature)
- [ ] Complexity estimate provided with justification
- [ ] Frontmatter includes all required fields (title, status, issue_type, complexity)
- [ ] Original user input preserved in "Initial User Prompt" section
- [ ] Description provides useful context without over-specifying

## Examples

**Simple task** (`task-add-unit-tests-auth.md`):

```markdown
---
title: Add unit tests for auth module
status: open
issue_type: task
complexity: M
---

# Initial User Prompt

add tests for auth

# Description

Cover login, logout, and session management functions with comprehensive unit tests.
```

Output: `Complexity: M - Multiple test files needed, well-defined scope`

**Bug with context** (`task-fix-login-timeout.md`):

```markdown
---
title: Fix login timeout on slow connections
status: open
issue_type: bug
complexity: S
---

# Initial User Prompt

users getting 504 errors on slow wifi

# Description

Users experiencing 504 errors on slow wifi. Increase timeout threshold and add retry logic for network failures.
```

Output: `Complexity: S - Single configuration change with clear scope`

**Feature request** (`task-implement-dark-mode.md`):

```markdown
---
title: Implement dark mode toggle
status: open
issue_type: feature
complexity: L
---

# Initial User Prompt

add dark mode to settings page

# Description

Add theme switching in settings with localStorage persistence. Include system preference detection and smooth transitions.
```

Output: `Complexity: L - Multiple components, CSS changes, state management, and testing required`
