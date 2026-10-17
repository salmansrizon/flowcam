# New repo, porting the Excaliflow renderer instead of building on Excalidraw

Flowcam lives in its own monorepo and ports Excaliflow's hand-drawn renderer and arrow Flow animations as its Board engine, rather than growing Excaliflow in place or building on the Excalidraw library. Excaliflow is a single-file showcase inside a third-party repo (awesome-llm-apps, Apache-2.0) and cannot grow into web, macOS and Windows apps with accounts and billing; the Excalidraw library would have given file compatibility and a mature editor for free, but its animated Flows, which no competitor (ExcaliRec, Excalimate) has, would have had to be rebuilt on top of it.

## Consequences

- Excalidraw compatibility is an import/export concern, not a free inheritance.
- Keep the Apache-2.0 attribution for code ported from Excaliflow.
