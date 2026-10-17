# Match Cap's editor features in our own code; reuse only Cap's MIT capture crates

Flowcam's editor targets feature parity with Cap's (cuts, transitions, backgrounds and padding, caption presets and SRT/VTT export, music, noise reduction, crop, text and image tracks, colour presets, camera shots), implemented in our own code. Cap is AGPLv3 apart from its MIT `scap-*` and `cap-camera*` crates; copying AGPL code would oblige us to publish all of Flowcam, server included, under AGPLv3, letting near-rivals legally copy the Presentation engine, and Cap's Rust/wgpu/SolidJS editor does not fit our browser renderer (ADR 0002, 0004) anyway. Going fully open source like Cap was a valid alternative we declined in favour of protecting the code.

## Consequences

- **Update (17 Oct 2026):** the Flowcam repository is public. It carries no open-source licence, so the code is visible but all rights are reserved: others may read it but not legally reuse it. This keeps the protection this ADR wanted while letting the documentation be public; adding an open-source licence later would be a new decision.
- No Cap source outside the MIT crates may be copied into this repo; reading it for ideas is fine, copying lines is not.
- The MIT crates may be used in the desktop native Screen module (ADR 0004), keeping their licence notices.
