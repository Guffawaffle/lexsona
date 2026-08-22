# Scoped behavioral bindings migration

LexSona's canonical library contract consumes Lex's typed behavioral-store service. It does not open
or receive a database driver and it does not discover authority from ambient process state.
The LexSona 2.x scoped-binding line requires public `@smartergpt/lex@4.0.1` or later within Lex 4.

## Canonical host integration

A trusted host resolves and authenticates the invocation through Lex, selects a Lex-owned SQLite or
PostgreSQL `BehavioralStoreBinder`, and passes LexSona:

- the binder;
- its immutable `BehavioralStoreBindingV1`;
- an explicit persona ID and optional revision;
- `read-only` or `read-write` mode.

Lex validates the binding and capability at bind time. The resulting LexSona instance is local to
that request or worker. Persona state is not process-global. Missing personas, mismatched revisions,
expired scope, and missing capabilities fail without path or persona fallback.

Read-only derivation and mutation are deliberately separate. Scoped mutation uses immutable persona
or rule revisions and explicit evidence/promotion operations with caller-provided idempotency keys.
Legacy `learn()` and `teach()` cannot manufacture those fields and therefore fail with a migration
message on scoped connections.

## Immutable derivation receipt

Use `deriveScopedConstraintReceipt(context)` when a consumer needs evidence that one exact scoped
read produced one constraint snapshot. The method is available only for `read-only` instances whose
binding contains exactly `behavior:read`; broader capability sets fail before snapshot access.

The `ScopedConstraintReceipt_v1` result binds:

- the complete non-secret tenant, workspace, repository-instance, principal, capability, and
  authority identity plus a recomputable binding digest;
- the requested persona reference, selected Lex persona revision/content digest, and parsed persona
  manifest ID/version/digest as separate identities;
- the Lex behavioral snapshot revision and content digest;
- the complete `ConstraintSnapshot_v1`, including its behavioral digest and diagnostic provenance;
- an outer digest over the complete receipt payload.

Each invocation performs one normalized `getSnapshot()` read and derives persona/rule behavior only
from that returned value. The reviewed baseline bundled with the selected LexSona provider is a
separate derivation input; its revision and digest are bound inside the constraint snapshot. The
returned object is deeply frozen. A later invocation may deliberately observe newer authorized
state and return a different receipt; retaining the earlier receipt is the replay pin. The method
accepts no caller-supplied bindings, engine version, provenance reference, or authority ceiling,
and it never returns the binder or read/write store handles.

Ordinary `deriveConstraints()` and `deriveConstraintSnapshot()` remain compatibility/current-state
surfaces. Do not promote their descriptive fields to immutable store-binding evidence.

## Compatibility window

| Surface                               | LexSona 2.x behavior                            | LexSona 3.0 target                                   |
| ------------------------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| `LexSona.connect({ lexDb, persona })` | Accepted only with an explicit path; deprecated | Removed                                              |
| bare library `LexSona.connect()`      | Disconnected; no ambient storage discovery      | Unchanged or replaced by an explicit static/off mode |
| `LEX_DB_PATH`                         | Read only by trusted CLI/source-MCP bootstrap   | Remove or require a separately approved adapter      |
| cwd/home database candidates          | CLI/source-MCP compatibility bootstrap only     | Removed                                              |
| project/user-global persona discovery | Compatibility CLI/persona tools only            | Removed from connected library composition           |
| Lex mutable-row rule APIs             | Compatibility commands only                     | Removed after revision/evidence migration            |

The compatibility bootstrap returns a receipt containing its selected path, selection source,
existence result, and removal target. `lexsona db status` and `lexsona doctor` remain the
operator-facing diagnostics during the window.

## Failure and recovery

If scoped construction fails:

1. preserve the original binding/authority error;
2. do not retry through `LEX_DB_PATH`, cwd, home, or a local SQLite fallback;
3. ask the trusted host to re-resolve or renew the Lex binding;
4. use a deliberately selected static/offline-safe path only when the persona contract permits it.

If a legacy CLI stops finding the expected database, run `lexsona db status` or `lexsona doctor`,
then pass `LEX_DB_PATH` explicitly while migrating. A path proves storage selection only; it does not
prove tenant, workspace, repository, or principal authority.

## Cross-surface identity

Canonical binding uses Lex's repository and repository-instance identifiers. Windows, WSL, Linux,
container, and remote surfaces must resolve through Lex bootstrap; LexSona never equates path aliases
or repository names. The compatibility path cannot make this guarantee and must not be used for a
multi-tenant containment claim.
