# Application adapters — not another AI engine

This folder was formerly named `backend/app/ai_engine/`. It contains no model
artifact, training routine or optimizer.

- `client.py`: internal HTTP connection, timeouts and error handling.
- `inference.py`: validates scoring requests/results and calls the AI service.
- `assistant.py`: app-specific conversation and planning orchestration.
- `domain.py`: existing thermal scenarios and human verification checklists;
  policy differences are documented in the duplication matrix.

The actual engine is the repository's root `ai_engine/` folder. Both folders are
required because they perform different jobs. See the
[duplication matrix](../../../docs/AI_ENGINE_DUPLICATION_MATRIX.md).
