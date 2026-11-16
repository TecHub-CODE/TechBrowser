<div align="center">
  <img src="assets/techbrowser-logo.png" alt="TechBrowser" width="112">
  <h1>TechBrowser</h1>
  <p>A Windows-first, open-source desktop browser by TechHub Studio.</p>

  [![Version](https://img.shields.io/badge/version-3.1.2-7c83ff)](https://github.com/TecHub-CODE/TechBrowser/releases)
  [![License](https://img.shields.io/badge/license-MIT-58d6ff)](LICENSE.txt)
  [![Electron](https://img.shields.io/badge/Electron-44-121722?logo=electron)](https://www.electronjs.org/)
</div>

## About

TechBrowser combines a custom desktop browser interface with tabs, bookmarks, history,
downloads, privacy controls, onboarding, TechAccount and the Misket AI assistant. The
stable 3.1 release uses Electron and Chromium while keeping application services behind
explicit, replaceable server boundaries.

## Highlights

- Native-feeling horizontal and vertical tab layouts
- Bookmarks, history, downloads, notes and password-vault interfaces
- Per-site permission controls and isolated private sessions
- TechAccount authentication and optional Firebase bookmark sync
- Misket AI through a rate-limited Cloudflare Worker
- Custom Windows setup and uninstall experience
- Performance mode for lower-spec hardware

## Requirements

- Node.js 22 or newer
- npm
- Windows 10 or Windows 11 for the supported desktop build

Windows 8.1 is available only through the separately generated legacy build. It uses
Electron 22, an end-of-life runtime, and must not be treated as a security-supported
release.

## Development

```powershell
git clone https://github.com/TecHub-CODE/TechBrowser.git
Set-Location TechBrowser
npm install
npm start
```

Optional development variables are documented in `.env.example`. Copy it to `.env`
locally and add only your own credentials. `.env` files are excluded from Git.

## Tests

```powershell
npm test
npm run test:integration
npm run test:packaged
```

## Builds

```powershell
# Supported Windows 10/11 installer
npm run build-win

# Unsupported Windows 8.1 legacy installer
npm run build-win81
```

Generated installers are written to `dist/` and are not committed to the repository.

## Hosted services

The desktop application never needs provider secrets embedded in its source or setup
package. The optional Worker in `cloudflare/` provides authenticated AI, email-code,
Google OAuth exchange and support-report endpoints. See `cloudflare/README.md` for the
deployment model. Configure your own secrets with the hosting provider.

## Security

- Never commit `.env`, API keys, OAuth secrets or Firebase administrator credentials.
- Public client identifiers and service URLs live in `src/service-config.json`.
- Provider credentials belong in the Cloudflare secret store or the developer's local
  environment.
- Please report sensitive vulnerabilities privately instead of opening a public issue.

## Contributing

Bug fixes and focused improvements are welcome. Open an issue before large architectural
changes, keep unrelated changes separate, and include relevant tests with code changes.

## License and branding

The source code is released under the [MIT License](LICENSE.txt). TechBrowser, TechHub
Studio, Misket and their logos are TechHub Studio brand identifiers; the MIT license does
not grant trademark rights or imply endorsement of modified builds.
