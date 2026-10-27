# Web first; desktop apps are a native shell over the same codebase

The web app is the full product (Authoring, Recordings of a Presentation, basic Recordings of a Screen, editing and sharing), and the macOS and Windows apps reuse that codebase while adding only native Screen capabilities: cursor and click data for auto-zoom, system audio, global hotkeys and a Camera Bubble that floats over other apps. Recordings of a Presentation need no screen capture (the Board is recorded as data, see ADR 0002), so the differentiating feature runs with zero install; we rejected a desktop-first product and separately built web and desktop products.

## Consequences

- Every feature must work in a browser unless it is explicitly a native Screen capability.
