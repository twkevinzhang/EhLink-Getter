---
description: Summarize conversation content and generate a git commit command following the Angular Commit Style, with support for specifying the author.
---

# Commit Workflow

This workflow guides you through summarizing changes from the current conversation and generating a `git commit` command that adheres to the Angular Commit Style.

## Critical Constraint: Selective Staging

**You must ONLY stage and commit changes directly related to the current conversation and task.** To ensure commit atomicity and avoid including unrelated local modifications, follow the precise staging steps below.

## Steps

1. **Stage Relevant Changes**:
   - Use `git add <file_path>` for specific files changed during the session.
   - **Pro Tip**: Use `git add -p` (patch mode) to interactively review and select specific code hunks, ensuring no debug code or unrelated configuration changes are staged.

2. **Summarize Conversation Changes**:
   - **Language**: Use English for the commit message.
   - **Analysis**: Review the conversation history and identify all completed technical changes.
   - **Formatting**: Summarize these changes into a clear, concise bulleted list.

3. **Analyze Angular Commit Type**:
   - Determine the `type`: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, etc.
   - Define an applicable `scope` (optional) to provide architectural context.

4. **Handle Author Configuration**:
   - Map the specified user to the corresponding identity:
     - `twkevinzhang` -> `twkevinzhang <twkevinzhang@gmail.com>`
     - `Gemini 3 Flash` -> `Gemini 3 Flash <gemini@antigravity.google>`
     - `Gemini 3 Pro` -> `Gemini 3 Pro <gemini@antigravity.google>`
     - `Sonnet 4.5` -> `Sonnet 4.5 <noreply@anthropic.com>`
   - Omit the `--author` flag if not specified.

5. **Generate Git Command**:
   - **Format**: `git commit -m "<type>(<scope>): <subject>\n\n<bullet points>"`
   - Append `--author="<Name> <email>"` if applicable.

6. **Execution & Confirmation**:
   - Present the final command.

## Example Command

```bash
# Step 1: Stage specific changes
git add -p

# Step 2: Commit with generated message
git commit -m "feat(scraper): implement pagination scraping functionality

- Add maxPages parameter to startFetch
- Update frontend UI to support pagination input
- Fix sidebar status display issues" --author="twkevinzhang <twkevinzhang@gmail.com>"
```
