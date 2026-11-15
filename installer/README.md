# TechBrowser Windows installer

`npm run preview:installer` compiles and opens the native WPF visual preview. It contains no application payload and never installs the browser.

`npm run build-win` builds the existing NSIS installer as `dist/TechBrowser-Core-VERSION.exe`, then embeds it in `dist/TechBrowser-Setup-VERSION.exe` with the custom interface. It never publishes. The generated latest.yml and blockmap continue to reference the core NSIS artifact for electron-updater compatibility. Publish the core artifact and its update metadata together when releasing; the branded Setup is the manual-download entry point.

The wrapper uses per-user installation, exposes destination selection and license text, checks the embedded payload SHA-256, waits for the NSIS exit code and checks the installed executable. Preparation percentage measures payload extraction; NSIS installation uses an indeterminate bar because it does not expose byte progress. Cancellation is disabled during file installation. Application data is still managed by the unchanged NSIS installer. The wrapper does not run at browser startup.

Requires Windows .NET Framework 4.x and its C# compiler (available on this development machine). The wrapper is not code-signed by this script; a release signing step should sign the final Setup after compilation if a certificate is configured.

Artwork in installer/assets is installer-only and is not included in the application assets. Original user-supplied browser and developer logos are kept separate.

Validation: visual preview compiled and captured successfully; 27 application unit tests passed. Embedded fixture tests passed: extraction, SHA-256 verification, spaced destination, success detection, and rejection of corrupt payload before execution. No full installer build or real application installation was performed. Antivirus compatibility and release signing still require validation.


## 3 November 2026 update

The complete 3.0.1 NSIS Core and branded Setup were built successfully. Packaged renderer initialization, version IPC, extracted CSS and button binding passed in a disposable profile. Payload fixture tests passed. Both installers remain unsigned; no release was published. Clean-machine installation, uninstallation and upgrading are still pending. See DUZELTME-RAPORU.md for the current test results; the earlier validation paragraph above records the previous phase.


## 4 November 2026 update

Version 3.0.2 Core and branded Setup were built. Packaged launch and source integrity checks passed (55 files); environment files are excluded and updater SHA-512 matches the Core installer. See tests/results/release-3.0.2.json. Signing and clean-machine install/uninstall/update checks remain pending.

## 10 November 2026 — 3.0.4 installer theme
The installer now uses the browser's graphite/black palette, silver primary action, Windows caption icons, and Segoe UI typography. Green artwork and rotating slogans were removed. The license window matches the dark surface. Ready-state preview: `node installer/build.cjs --capture --ready`; progress preview: `node installer/build.cjs --capture`.
The payload verification and failure-path fixture tests passed. This release includes the hosted Misket connection and all current source changes. The user confirmed a real Misket reply before this packaging task. Code signing and clean-machine installation/upgrade/uninstallation remain separate release checks.

## 10 November 2026 — 3.0.5 correction
The original 1040×650 two-column installer, glass artwork, large browser logo, animated mottos and footer were restored at the user's request. Only the palette changed to graphite/silver; the original artwork is displayed in grayscale using WPF, without replacing its source file.
`installer/uninstaller.nsh` customizes the existing NSIS uninstaller with a welcome page, explicit confirmation, progress and completion. A `TechBrowser Kaldır` Start-menu shortcut is installed and removed through the same NSIS lifecycle. Windows Installed Apps also uses this uninstaller. `deleteAppDataOnUninstall` remains false. No real user installation or profile was removed during validation.

## 11 November 2026 — 3.0.6 branded removal wizard

Windows Installed Apps and the Start-menu removal shortcut now open `TechBrowser-Uninstall.exe`, a WPF wizard compiled from the same `Window.xaml` and artwork as the installer. It displays preparation, removal progress, completion and retry states in the same two-column interface. The wrapper runs the native NSIS uninstaller silently so file, shortcut and registry cleanup still use electron-builder's established implementation. The UI copies itself to a temporary location before removal, allowing the installation directory to be removed; the temporary copy is scheduled for deletion by Windows.

Personal browser data remains preserved because the native uninstaller is invoked without `--delete-app-data` and `deleteAppDataOnUninstall` remains false. The visual preview is `dist/uninstaller-preview.png`. Build, fixture, package-integrity and packaged-launch checks passed; no real user installation was removed during validation.
