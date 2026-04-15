
# AI Agent Instructions (v2)

## Mental Model
You are not building a CRUD app.
You are building an operator system.

## Architecture Rules
- Event-driven over polling
- Explicit over implicit
- Every action must be reversible (backup/rollback)

## Critical Systems
1. Event Bus
2. Policy Engine
3. Backup Engine
4. Update Engine

## Development Order (STRICT)
Follow ROADMAP phases sequentially.

DO NOT:
- build UI before backend logic
- skip backup before update system
