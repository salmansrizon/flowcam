# The Board is recorded as data and re-rendered at export, not captured as pixels

A Presentation's Track is a timestamped log of what happened while Presenting (Step advances, Ink, pointer, pan and zoom), replayed through the renderer frame by frame at export and composited with the Camera and other Tracks. This lets users fix a typo on the Board, retime a Step or re-export at another resolution or theme without re-recording, which no surveyed competitor offers; the cost is that rendering must be deterministic.

## Consequences

- Flow animations and all Board rendering are driven by the Recording's clock, never the wall clock.
- Every Image is copied into the Recording's storage so a dead URL cannot break a re-export.
- Live preview and instant share links still need a quick pixel capture alongside the log.
- Because the Board is built before Presenting and cannot be edited during it, the log stays small.
