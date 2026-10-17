# Desktop apps are downloaded from our website, signed and auto-updated by us

The macOS and Windows apps are downloaded from Flowcam's website, not app stores. macOS builds are signed with an Apple Developer ID ($99/year Apple Developer Program) and notarised by Apple. Windows installers are signed with a code-signing certificate bought from a certificate authority that sells to individuals worldwide, signing through a cloud key so builds can be signed automatically: SSL.com Individual Validation with eSigner, or Certum Standard Code Signing in the Cloud (from €209). Updates are delivered by the app itself from installers hosted on Cloudflare R2, whose free outbound transfer suits 100 MB+ downloads. We rejected Microsoft's Artifact Signing (individuals must be in the US or Canada), the Mac App Store (sandboxing and Apple's 15–30% in-app purchase cut on subscriptions) and the Microsoft Store (chosen against to keep one distribution path the founder controls).

## Consequences

- Windows may still show a SmartScreen warning for new releases until the certificate builds download reputation; the download page should explain this.
- Apple Developer Program enrollment from Bangladesh is not confirmed on Apple's site; check it before building macOS releases, with a card that can be charged in USD.
- The signing certificate is issued in the founder's personal name until a business is registered (MONEY-FLOW.md §4, kept locally, not in the public repo); reissue it in the business name then.
- Yearly costs: Apple $99, Windows certificate roughly €140–380 depending on provider and type.
