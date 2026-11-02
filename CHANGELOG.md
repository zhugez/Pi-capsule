# Changelog

## [1.0.0] - 2026-11-02

### Changed

- Verified compatible with pi 1.5.0. No extension code changes were required: the capsule extensions register hooks only, no tools, so the pi-schema tool-argument validation change does not reach them, and the extension API surface only gained members (`blocked`, `keyHint`, `keyText`, `messageId`).
