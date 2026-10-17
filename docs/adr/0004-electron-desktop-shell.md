# Electron for the desktop shell, with native capture behind a module boundary

The macOS and Windows apps use Electron so the Board renderer, encoding and audio run on the same Chromium engine as the web app, keeping replay-based exports (ADR 0002) identical everywhere. We rejected Tauri despite its much smaller footprint because its per-OS WebViews (WKWebView, WebView2) would render fonts and canvas differently and diverge from the web app; Cap can use Tauri only because it renders in Rust.

## Consequences

- Native Screen capture (cursor and click data, system audio) lives in a separate native module with a narrow interface, so the shell could later move to Tauri if footprint becomes the main complaint.
- macOS builds must declare `NSAudioCaptureUsageDescription`, or system audio capture fails silently.
