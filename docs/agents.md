# Agent Guide

This guide explains how to configure and create custom agents in TAKT.

## Built-in Agents

TAKT includes three built-in agents:

| Agent | Tools | Purpose |
|-------|-------|---------|
| `coder` | Read, Glob, Grep, Edit, Write, Bash, WebSearch, WebFetch | Implements features and fixes bugs |
| `architect` | Read, Glob, Grep, WebSearch, WebFetch | Reviews code and provides feedback |
| `supervisor` | Read, Glob, Grep, Bash, WebSearch, WebFetch | Final verification and approval |

## Specifying Agents

In workflow YAML, agents can be specified by:

```yaml
# Built-in agent name
agent: coder

# Path to prompt file
agent: ~/.takt/agents/my-agent.md

# Project-local agent
agent: ./.takt/agents/reviewer.md

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

## Output Format
Output one of these status markers:
- [REVIEWER:APPROVE] if code is secure
- [REVIEWER:REJECT] if issues found
```

### Status Markers

Agents must output status markers for workflow transitions:

| Status | Example Pattern |
|--------|----------------|
| done | `[AGENT:DONE]` |
| blocked | `[AGENT:BLOCKED]` |
| approved | `[AGENT:APPROVED]`, `[AGENT:APPROVE]` |
| rejected | `[AGENT:REJECTED]`, `[AGENT:REJECT]` |

## Advanced Configuration

### Using agents.yaml

For more control, define agents in `.takt/agents.yaml`:

```yaml
agents:
  - name: security-reviewer
    prompt_file: .takt/prompts/security-reviewer.md
    allowed_tools:
      - Read
      - Glob
      - Grep
    status_patterns:
      approved: "\\[SECURITY:APPROVE\\]"
      rejected: "\\[SECURITY:REJECT\\]"
```

### Tool Permissions

Available tools:
- `Read` - Read files
- `Glob` - Find files by pattern
- `Grep` - Search file contents
- `Edit` - Modify files
- `Write` - Create/overwrite files
- `Bash` - Execute commands
- `WebSearch` - Search the web
- `WebFetch` - Fetch web content

## Best Practices

1. **Clear role definition** - State what the agent does and doesn't do
2. **Explicit output format** - Define exact status markers
3. **Minimal tools** - Grant only necessary permissions
4. **Focused scope** - One agent, one responsibility
5. **Examples** - Include examples of expected behavior

## Example: Multi-Reviewer Setup

```yaml
# .takt/agents.yaml
agents:
  - name: security-reviewer
    prompt_file: .takt/prompts/security.md
    allowed_tools: [Read, Glob, Grep]
    status_patterns:
      approved: "\\[SEC:OK\\]"
      rejected: "\\[SEC:FAIL\\]"

  - name: performance-reviewer
    prompt_file: .takt/prompts/performance.md
    allowed_tools: [Read, Glob, Grep, Bash]
    status_patterns:
      approved: "\\[PERF:OK\\]"
      rejected: "\\[PERF:FAIL\\]"
```

```yaml
# workflow.yaml
steps:
  - name: implement
    agent: coder
    # ...

  - name: security-review
    agent: security-reviewer
    transitions:
      - condition: approved
        next_step: performance-review
      - condition: rejected
        next_step: implement

  - name: performance-review
    agent: performance-reviewer
    transitions:
      - condition: approved
        next_step: COMPLETE
      - condition: rejected
        next_step: implement
```
