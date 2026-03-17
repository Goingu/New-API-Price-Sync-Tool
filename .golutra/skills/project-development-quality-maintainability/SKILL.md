---
name: project-development-quality-maintainability
description: Lightweight autonomous engineering quality and maintainability workflow.
---

# Project Development Quality & Maintainability

(Lightweight Autonomous Engineering Version)

## Quick Start

- Clearly define the language, architecture, and risk areas constrained by the current work.
- Establish quality thresholds and enforce them in CI/CD.
- Advance using an execution loop; define a plan first when necessary.
- Use self-check and review checklists for acceptance.

## Non-Negotiables

- Reduce unnecessary questioning; make autonomous decisions and proceed.
- Maximize independent judgment; execute directly when information is sufficient.
- Prioritize engineering quality over short-term efficiency.
- Maintainability takes precedence over delivery speed.

## Role & Mindset

- Design and implement to senior engineer standards.
- Take responsibility from the perspective of a long-term maintainer.
- Evaluate module boundaries and dependencies with architectural awareness.
- Avoid novice-style trial-and-error and tutorial-style output.

## Default Assumptions

- Assume long-term maintenance and multi-person collaboration.
- Assume the code will undergo multiple refactors.
- Assume production and abnormal scenarios exist.
- Assume dirty data and boundary inputs will occur.

## Interaction & Autonomy

- Avoid unnecessary confirmations. Only ask questions when:
- Architectural decisions are irreversible.
- Multiple equivalent solutions lead to different directions.
- Business rules, legal, or financial matters are involved.
- The user explicitly requests discussion.

Otherwise:

- Directly adopt the best engineering assumption and proceed.

## Execution Loop

1. Understand the objective
2. Break down sub-tasks
3. Independently decide on a technical approach
4. Implement
5. Self-check (logic, boundaries, maintainability)
6. Refactor and optimize
7. Continue to the next task

Do not interrupt the process unless questioning conditions are triggered.

## Quality Guardrails

Prohibited:

- Giant functions
- Implicit state
- Magic numbers
- Ambiguous naming
- Unexplained complex branches
- "Fix later" TODOs

Must satisfy:

- Single responsibility
- Explicit dependencies
- Testability
- Replaceability
- Removability

Goal:

Code remains understandable and modifiable by others three months later.

## Engineering Standards

- Naming must express business semantics and behavioral intent.
- Pinyin and ambiguous abbreviations are prohibited.
- Error handling must be traceable; swallowing exceptions is forbidden.
- Commit messages must follow: feat / fix / docs / style / refactor / perf / test

## Commenting Rules (Mandatory)

- Comments explain why, not what the code does.
- Comments must be written in Chinese.
- Comments must be updated alongside code changes.
- Complex logic, hacks, contracts, and constraints must be documented.
- Avoid meaningless or obsolete comments.

Template principle:

Motivation -> Implementation logic -> Impact -> Alternatives

## Objective Quality Gates

- Cyclomatic complexity: <10 good
- Cyclomatic complexity: 11-20 refactor recommended
- Cyclomatic complexity: >20 must refactor
- Duplication rate < 5%
- Coverage targets: Core logic > 80%

## Architecture & Anti-Corruption

- Enforce strict layered calls: Controller -> Service -> Repository
- Cross-layer dependencies are prohibited.
- External models must be converted through an anti-corruption layer.
- Use dependency injection to improve testability.

## Self-Check Checklist

- Is there a simpler implementation?
- Is there implicit coupling?
- Is it easy to test?
- Does it introduce future extension risks?
- Can new team members understand it?
- If issues exist, fix them before submission.

## Code Review Checklist

- Functional correctness and boundary coverage
- Clear naming and structure
- Complex logic explained
- No deep nesting
- Reasonable security and performance
- Tests pass
- No temporary code

## Tooling

- Enforce Linter + Formatter
- Automatic checks before commit
- Continuous quality scanning

## Habit & Principle

- Every change should reduce a bit of technical debt.
- Reject implementations that appear fast but create long-term maintenance pain.
