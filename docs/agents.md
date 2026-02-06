# Agent Guide

This guide explains how to configure and create custom agents in TAKT.

## Built-in Agents

TAKT includes six built-in agents (located in `resources/global/{lang}/agents/default/`):

| Agent | Description |
|-------|-------------|
| **planner** | Task analysis, spec investigation, and implementation planning |
| **coder** | Implements features and fixes bugs |
| **ai-antipattern-reviewer** | Reviews for AI-specific anti-patterns (hallucinated APIs, incorrect assumptions, scope creep) |
| **architecture-reviewer** | Reviews architecture and code quality, verifies spec compliance |
| **security-reviewer** | Security vulnerability assessment |
| **supervisor** | Final verification, validation, and approval |

## Specifying Agents

In piece YAML, agents are specified by file path:

```yaml
# Relative to piece file directory
agent: ../agents/default/coder.md

# Home directory
agent: ~/.takt/agents/default/coder.md

# Absolute path
agent: /path/to/custom/agent.md
```

## Creating Custom Agents

### Agent Prompt File

Create a Markdown file with your agent's instructions:

```markdown
# Security Reviewer

You are a security-focused code reviewer.

## Your Role
- Check for security vulnerabilities
- Verify input validation
- Review authentication logic

## Guidelines
- Focus on OWASP Top 10 issues
- Check for SQL injection, XSS, CSRF
- Verify proper error handling
```

> **Note**: Agents do NOT need to output status markers manually. The piece engine auto-injects status output rules into agent instructions based on the step's `rules` configuration. Agents output `[STEP:N]` tags (where N is the 0-based rule index) which the engine uses for routing.

### Using agents.yaml

For more control, define agents in `.takt/agents.yaml`:

```yaml
agents:
  - name: my-reviewer
    prompt_file: .takt/prompts/reviewer.md
    allowed_tools:
      - Read
      - Glob
      - Grep
    provider: claude             # Optional: claude or codex
    model: opus                  # Optional: model alias or full name
```

### Agent Configuration Options

| Field | Description |
|-------|-------------|
| `name` | Agent identifier (referenced in piece steps) |
| `prompt_file` | Path to Markdown prompt file |
| `prompt` | Inline prompt text (alternative to `prompt_file`) |
| `allowed_tools` | List of tools the agent can use |
| `claude_agent` | Claude Code agent name (for Claude Code native agents) |
| `claude_skill` | Claude Code skill name (for Claude Code native skills) |
| `provider` | Provider override: `claude` or `codex` |
| `model` | Model override (alias or full name) |

### Available Tools

- `Read` — Read files
- `Glob` — Find files by pattern
- `Grep` — Search file contents
- `Edit` — Modify files
- `Write` — Create/overwrite files
- `Bash` — Execute commands
- `WebSearch` — Search the web
- `WebFetch` — Fetch web content

## Best Practices

1. **Clear role definition** — State what the agent does and doesn't do
2. **Minimal tools** — Grant only necessary permissions
3. **Use `edit: false`** — Review agents should not modify files
4. **Focused scope** — One agent, one responsibility
5. **Customize via `/eject`** — Copy builtin agents to `~/.takt/` for modification rather than writing from scratch

## Example: Multi-Reviewer Setup

```yaml
# .takt/agents.yaml
agents:
  - name: performance-reviewer
    prompt_file: .takt/prompts/performance.md
    allowed_tools: [Read, Glob, Grep, Bash]
```

```yaml
# piece.yaml
steps:
  - name: implement
    agent: ../agents/default/coder.md
    edit: true
    rules:
      - condition: Implementation complete
        next: review
      - condition: Cannot proceed
        next: ABORT

  - name: review
    agent: performance-reviewer
    edit: false
    rules:
      - condition: Approved
        next: COMPLETE
      - condition: Needs fix
        next: implement
    instruction_template: |
      Review the implementation for performance issues.
```
