# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-02-16

### Added
- **REST API Server** - Full HTTP API for memory operations
- **Web Dashboard** - Beautiful HTML UI to manage memories
- **Docker API Service** - Run `docker-compose up -d api` for HTTP server
- **Backup Script** - Auto-backup memory to GitHub
- **OpenClaw Integration Guide** - Documentation for integrating with OpenClaw
- **Dashboard served at /** - Access UI at http://localhost:3000

### Changed
- Simplified CLI usage with docker-entrypoint.sh
- Improved README with Thai/English docs
- Better error handling

### Fixed
- TypeScript build issues
- better-sqlite3 type declarations

---

## [1.0.0] - 2026-02-15

### Added
- 5-Tier Memory System (Working, Episodic, Semantic, Procedural, Meta)
- Hybrid Search (Vector + BM25 + Knowledge Graph)
- CLI Interface
- Docker support
- Minimax & OpenAI providers
- Thai language support

---

## [0.0.1] - 2026-02-14

### Added
- Initial release
- Basic memory storage
- Vector embeddings
