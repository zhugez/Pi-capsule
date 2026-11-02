# Changelog

## [1.1.0] - 2026-11-02

### Added

- `pnpm typecheck` (`tsc --noEmit` over `agent/extensions`) and `pnpm check`, which runs typecheck then the existing tests. The pi extension types are a devDependency pinned to 1.5.0, so a future pi release that changes them fails loudly instead of silently.

### Fixed

- `dejavu.ts`: two message-content casts now bridge through `unknown`. pi 1.5.0 added `BashExecutionMessage` to `AgentMessage` and tightened message content to `(TextContent | ImageContent)[]`, so the previous direct casts to `{ content: Record<string, unknown>[] }` no longer overlapped. The code compiled against pi 1.4.0 and fails against 1.5.0 without this. Runtime behaviour is unchanged: the role whitelist and `Array.isArray` guard still decide what gets rewritten.

## [1.0.0] - 2026-11-02

### Changed

- Verified compatible with pi 1.5.0. The capsule extensions register hooks only, no tools, so the pi-schema tool-argument validation change does not reach them, and the extension API surface only gained members (`blocked`, `keyHint`, `keyText`, `messageId`).
