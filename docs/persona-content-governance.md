# Persona content governance

Bundled personas are reviewed behavioral inputs. They describe decision style; they do not authorize
tools, filesystem mutation, network access, CI, publishing, signing, or repository operations. A host
or AXF authority surface remains the source of runtime capabilities and permissions.

## Content classes

Every structured duty and constraint-pack entry uses one of these review classes:

| Class                     | Owner and treatment                                                     |
| ------------------------- | ----------------------------------------------------------------------- |
| `behavioral-invariant`    | Portable LexSona behavior; retained when it is useful across runtimes   |
| `repository-policy`       | Move to the owning repository instruction or policy surface             |
| `host-runtime-procedure`  | Retain only with explicit runtime applicability                         |
| `capability-precondition` | Retain only with declared capability applicability                      |
| `historical-guidance`     | Compatibility or history; do not project as an unconditional constraint |
| `stale`                   | Remove from behavior-bearing bundled content                            |

Applicability is a selector, not a grant. If a required agent family, runtime family, or capability
is missing or unknown, LexSona omits that item and reports a bounded diagnostic. Portable items with
no applicability remain eligible everywhere.

## Bundled inventory

### `quality-first_engineering@1.2.0`

| Surface      | IDs/content                                                                                                       | Class                    | Disposition                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------- |
| Must do      | `gather-context`, `proportional-verification`, `test-behavior-changes`, `report-friction`                         | behavioral invariant     | Retained in portable form                      |
| Must not do  | `no-unverified-claims`, `no-silent-validation-gaps`, `no-assumed-capability`, `no-unrelated-changes`              | behavioral invariant     | Retained in portable form                      |
| Should do    | `bounded-context`, `explicit-uncertainty`                                                                         | behavioral invariant     | Retained in portable form                      |
| Should do    | `structured-edits`                                                                                                | capability precondition  | Requires declared `structured-edit` capability |
| Pack         | `agent-integration/interface-completeness`, `fixture-schema-sync`, `mock-data-realism`                            | behavioral invariant     | Retained; file-scoped                          |
| Former pack  | `agent-integration/export-new-types`                                                                              | repository policy        | Moved to `AGENTS.md`                           |
| Triggers     | `senior dev`, `quality first`, `engineering mode`; keywords `implementation`, `code`, `engineering`               | historical guidance      | Retained only as explicit activation aliases   |
| Removed      | named editor commands, shell-edit bans, blanket local/remote CI claims, branch procedures, commit/PR requirements | host procedure or stale  | Removed                                        |
| Former scope | persona-owned read/write globs and procedure-specific mutation scopes                                             | repository/AXF authority | Removed; default request is read-only          |

### `momentum-first_product@1.2.0`

| Surface      | IDs/content                                                                                | Class                    | Disposition                                  |
| ------------ | ------------------------------------------------------------------------------------------ | ------------------------ | -------------------------------------------- |
| Must do      | `prioritize-impact`, `connect-related-work`, `distinguish-patterns`, `define-done`         | behavioral invariant     | Retained in portable form                    |
| Must not do  | `no-hidden-blockers`, `no-silent-scope-growth`, `no-unverified-completion`                 | behavioral invariant     | Retained in portable form                    |
| Should do    | `reversible-next-step`, `explicit-tradeoffs`                                               | behavioral invariant     | Retained in portable form                    |
| Triggers     | `eager pm`, `momentum first`, `product mode`; keywords `planning`, `scope`, `coordination` | historical guidance      | Retained only as explicit activation aliases |
| Removed      | merge execution, issue closure, remote push, forced continuation, and cleanup procedures   | host procedure/authority | Removed                                      |
| Former scope | persona-owned documentation write globs and procedure-specific mutation scopes             | repository/AXF authority | Removed; default request is read-only        |

The Markdown persona files carry the same reviewed duties as their canonical YAML peers. Their prose
is explanatory only and must not add behavior absent from the manifest.

## Version and identity rule

A behavior-bearing change to duties, constraints, applicability, triggers, behavioral description,
or offline behavior must:

1. bump the persona semantic version;
2. update this inventory in the same change; and
3. add or update a deterministic derivation/snapshot test.

`ConstraintSnapshot_v1.persona.digest` hashes the complete validated persona. Constraint-pack
digests include their structured entries. The derivation input hash also hashes full persona, rule,
baseline, and applicability context content rather than IDs alone. A behavior change therefore
changes identity even if a contributor forgets the version bump; review and tests still enforce the
human-readable version rule.

## Controlled experiment profiles

Rack campaigns should pin one immutable input fixture per run:

| Mode                | Persona content | Lex rules                       | Learning during run |
| ------------------- | --------------- | ------------------------------- | ------------------- |
| `off`               | none            | none                            | disabled            |
| `static`            | pinned bundle   | none                            | disabled            |
| `frozen-memory`     | pinned bundle   | pinned read-only rule snapshot  | disabled            |
| `reviewed-learning` | pinned bundle   | rules approved before run start | disabled            |

Review or learning may produce the input for a later run; it never mutates a profile mid-run.
Fixtures under `tests/fixtures/rack/` encode these controls without executing work.
