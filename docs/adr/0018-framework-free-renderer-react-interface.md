# A framework-free Board renderer inside a React interface, styled after Cap

The Board renderer stays plain TypeScript drawing on a canvas, with no React inside it, so it runs unchanged in the editor, in the export worker and in the desktop app, and React's re-render timing can never disturb deterministic replay (ADR 0002). Everything around the canvas is React with Tailwind CSS and shadcn/ui, with Zustand for shared editor state. Cap's interface is the visual reference (neutral studio look, and its preview-plus-timeline-plus-settings-sidebar layout for the post-recording editor), recreated in our own code because Cap's UI code and styles are AGPL (ADR 0013). Authoring keeps a Keynote-style layout: Boards strip, canvas, and Style/Steps/Script panel.

## Considered Options

- Rendering Boards with React or SVG: simpler to start, too slow for Flows and 4K export.
- Mantine or Chakra UI: more ready-made, but a stronger default look that fights the calm studio direction.
- SolidJS, as in Cap's desktop app: does not fit the shared React codebase across web and Electron.
