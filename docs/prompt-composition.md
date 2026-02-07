# Faceted Prompting: Separation of Concerns for AI Prompts

## The Problem

As multi-agent systems grow complex, prompts become monolithic. A single prompt file contains the agent's role, behavioral rules, task-specific instructions, domain knowledge, and output format — all tangled together. This creates three problems:

1. **No reuse** — When two steps need the same reviewer persona but different instructions, you duplicate the entire prompt
2. **Hidden coupling** — Changing a coding standard means editing every prompt that references it
3. **Unclear ownership** — It's impossible to tell which part of a prompt defines *who* the agent is versus *what* it should do

## The Idea

Apply **Separation of Concerns** — a foundational software engineering principle — to prompt design.

Instead of one monolithic prompt per agent, decompose it into independent, reusable files organized by *what concern they address*. Then compose them declaratively per workflow step.

## Five Concerns

Faceted Prompting decomposes prompts into five orthogonal concerns:

| Concern | Question it answers | Example |
|---------|-------------------|---------|
| **Persona** | *Who* makes the judgment? | Role definition, expertise |
| **Policy** | *What* to uphold? | Prohibitions, quality standards, priorities |
| **Instruction** | *What* to do? | Goals, step-specific procedures |
| **Knowledge** | *What* to reference? | Domain context, reference materials, API specs |
| **Output Contract** | *How* to output? | Output structure, report templates |

Each concern is a standalone file (Markdown or template) stored in its own directory:

```
workflows/       # Workflow definitions
personas/        # WHO — role definitions
policies/        # RULES — prohibitions, quality standards
instructions/    # WHAT — step procedures
knowledge/       # CONTEXT — reference materials
output-contracts/ # OUTPUT — output contract templates
```

### Why These Five?

**Persona** and **Instruction** are the minimum — you need to define who the agent is and what it should do. But in practice, three more concerns emerge as independent axes:

- **Policy** captures rules and standards that apply across different tasks. A "coding policy" (naming conventions, error handling rules, prohibitions) applies whether the agent is implementing a feature or fixing a bug. Policies define *what to uphold* — prohibitions, quality standards (REJECT/APPROVE criteria), and priorities. They are *cross-cutting concerns* that constrain work regardless of what the work is.

- **Knowledge** captures reference information that agents consult as premises for their judgment. An architecture document is relevant to both the planner and the reviewer. Separating knowledge from instructions prevents duplication and keeps instructions focused on procedures. Knowledge is descriptive ("this is how the domain works"), while prescriptive rules ("you must do this") belong in Policy.

- **Output Contract** captures output structure independently of the work itself. The same review format can be used by an architecture reviewer and a security reviewer. Separating it allows format changes without touching agent behavior.

## Declarative Composition

The core mechanism of Faceted Prompting is **declarative composition**: a workflow definition declares *which* concerns to combine for each step, rather than embedding prompt content directly.

Key properties:

- **Each file has one concern.** A persona file contains only role and expertise — never step-specific procedures.
- **Composition is declarative.** The workflow says *which* concerns to combine, not *how* to assemble the prompt.
- **Mix and match.** The same `coder` persona can appear with different policies and instructions in different steps.
- **Files are the unit of reuse.** Share a policy across workflows by pointing to the same file.

### Implementation Example: TAKT

[TAKT](https://github.com/nrslib/takt) implements Faceted Prompting using YAML-based workflow definitions called "pieces." Concerns are mapped to short keys via section maps, then referenced by key in each step (called "movement" in TAKT):

```yaml
name: my-workflow
max_iterations: 10
initial_movement: plan

# Section maps — key: file path (relative to this YAML)
personas:
  coder: ../personas/coder.md
  reviewer: ../personas/architecture-reviewer.md

policies:
  coding: ../policies/coding.md
  review: ../policies/review.md

instructions:
  plan: ../instructions/plan.md
  implement: ../instructions/implement.md

knowledge:
  architecture: ../knowledge/architecture.md

output_contracts:
  review: ../output-contracts/review.md

movements:
  - name: implement
    persona: coder            # WHO — references personas.coder
    policy: coding            # RULES — references policies.coding
    instruction: implement    # WHAT — references instructions.implement
    knowledge: architecture   # CONTEXT — references knowledge.architecture
    edit: true
    rules:
      - condition: Implementation complete
        next: review

  - name: review
    persona: reviewer         # Different WHO
    policy: review            # Different RULES
    instruction: review       # Different WHAT (but could share)
    knowledge: architecture   # Same CONTEXT — reused
    report:
      name: review.md
      format: review          # OUTPUT — references output_contracts.review
    edit: false
    rules:
      - condition: Approved
        next: COMPLETE
      - condition: Needs fix
        next: implement
```

The engine resolves each key to its file, reads the content, and assembles the final prompt at runtime. The workflow author never writes a monolithic prompt — only selects which facets to combine.

## How It Differs from Existing Approaches

| Approach | What it does | How this differs |
|----------|-------------|-----------------|
| **Decomposed Prompting** (Khot et al.) | Breaks *tasks* into sub-tasks delegated to different LLMs | We decompose the *prompt structure*, not the task |
| **Modular Prompting** | Sections within a single prompt using XML/HTML tags | We separate concerns into *independent files* with declarative composition |
| **Prompt Layering** (Airia) | Stackable prompt segments for enterprise management | A management tool, not a design pattern for prompt architecture |
| **PDL** (IBM) | YAML-based prompt programming language for data pipelines | Focuses on control flow (if/for/model calls), not concern separation |
| **Role/Persona Prompting** | Assigns a role to shape responses | Persona is one of five concerns — we also separate policy, instruction, knowledge, and output contract |

The key distinction: existing approaches either decompose *tasks* (what to do) or *structure prompts* (how to format). Faceted Prompting decomposes *prompt concerns* (why each part exists) into independent, reusable units.

## Practical Benefits

**For workflow authors:**
- Change a coding policy in one file; every workflow using it gets the update
- Create a new workflow by combining existing personas, policies, and instructions
- Focus each file on a single responsibility

**For teams:**
- Standardize policies (quality standards, prohibitions) across projects without duplicating prompts
- Domain experts maintain knowledge files; workflow designers maintain instructions
- Review individual concerns independently

**For the engine:**
- Prompt assembly is deterministic — given the same workflow definition and files, the same prompt is built
- Policy placement can be optimized (e.g., placed at top and bottom to counter the "Lost in the Middle" effect)
- Concerns can be injected, omitted, or overridden per step without touching other parts

## Summary

Faceted Prompting is a design pattern that applies Separation of Concerns to AI prompt engineering. By decomposing prompts into five independent concerns — Persona, Policy, Instruction, Knowledge, and Output Contract — and composing them declaratively, it enables reusable, maintainable, and transparent multi-agent workflows.
