# Windows prompt launcher MVP

## Architecture

`launcher/` is a native C#/.NET WPF application. It uses no third-party runtime
packages, web view, browser engine, backend, account, analytics, or network
connection.

```text
launcher/
  PromptLauncher.Core/   prompt schema, template, transfer, search, storage,
                         and testable paste coordination
  PromptLauncher/        WPF UI, tray lifecycle, global hotkey, and Win32 bridge
  PromptLauncher.Tests/  dependency-free automated console test runner
  PromptLauncher.sln
```

WPF was chosen over Electron (much smaller idle footprint and no browser
runtime), WinUI 3 (simpler deployment and more mature desktop interop), WinForms
(better hierarchical/layout support), and Avalonia (no cross-platform
requirement to justify another framework dependency).

## Compatibility and persistence

The launcher faithfully matches the JavaScript prompt core:

- Required string fields: `id`, `title`, `category`, and `text`.
- Optional normalized fields: `description` and boolean `pinned`.
- Whitespace-trimmed records and `{{ Variable }}` names.
- Duplicate/invalid record reporting.
- Legacy bare-array and schema-version-1 envelope imports.
- Existing-ID conflicts keep the local record.
- Schema-version-1 exports with `exportedAt`.
- Pinned-first search across title, description, category, and text.
- Slash-separated nested categories.

Local state is stored in `%LocalAppData%\PromptWorkspaceLauncher`:

- `prompts.json`: versioned prompt library, written through a temporary file and
  atomically replaced.
- `settings.json`: global keyboard shortcut.

No administrator access is required. The only OS facilities used are the
current-user clipboard and standard User32 hotkey/focus/keyboard APIs.

## Desktop insertion

When the global shortcut fires, the launcher records the current foreground
window handle before showing itself. On **Insert** it:

1. Validates that every variable has a nonblank value.
2. Copies the completed prompt to the clipboard (with short retries if busy).
3. Hides the launcher.
4. Checks and restores the previous window.
5. Sends only the four key transitions for `Ctrl+V`.

It never synthesizes Enter, clicks a send control, invokes application-specific
APIs, or uses UI Automation. If the target is gone, focus restoration fails, or
the complete paste sequence cannot be sent, the prompt remains on the clipboard
and the launcher reopens with a copy-only fallback message.

## Build and run

Prerequisite: Windows 10/11 with the .NET 10 SDK for builds. The SDK includes the
Windows Desktop targeting pack.

From the repository root:

```powershell
dotnet build launcher\PromptLauncher.sln --configuration Release
dotnet run --project launcher\PromptLauncher\PromptLauncher.csproj --configuration Release
```

The app starts in the notification area. Double-click its tray icon or press
`Ctrl+Shift+P`. Closing the launcher window hides it; choose **Exit** from the
tray menu to stop it.

### Publish for another Windows PC

Framework-dependent (smallest output; destination needs .NET 10 Desktop Runtime):

```powershell
dotnet publish launcher\PromptLauncher\PromptLauncher.csproj -c Release -r win-x64 --self-contained false -o artifacts\launcher-win-x64
```

Self-contained (larger output; destination needs no .NET installation):

```powershell
dotnet publish launcher\PromptLauncher\PromptLauncher.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o artifacts\launcher-win-x64-self-contained
```

Copy the chosen output directory to the destination and run
`PromptWorkspaceLauncher.exe`. V1 intentionally does not include an installer,
auto-update mechanism, or startup registration. A Start-menu or Startup-folder
shortcut can be created manually if desired.

## Automated tests

```powershell
dotnet run --project launcher\PromptLauncher.Tests\PromptLauncher.Tests.csproj --configuration Release
node --test tests\prompt-core.test.js tests\extension-mvp.test.js
```

The launcher tests cover schema/import behavior, versioned and legacy formats,
variable substitution, search/category behavior, favorite and shortcut
persistence, paste success, and clipboard/focus fallbacks.

## Manual ChatGPT desktop acceptance test

1. Start `PromptWorkspaceLauncher.exe`; verify its tray icon appears.
2. Open the native ChatGPT app, start a new chat, and click in the composer.
3. Press `Ctrl+Shift+P`; verify the launcher appears without changing ChatGPT's
   draft or sending anything.
4. Search for `Paste Session State`, expand/collapse `Moving Sessions`, select
   the prompt, and enter a distinctive value in `State Block`.
5. Verify the completed preview contains the value and no unresolved required
   placeholder.
6. Select **Insert**. Verify ChatGPT regains focus, the completed prompt appears
   at the existing caret, and the message is **not sent**.
7. Move the caret into the middle of an existing draft and repeat with a prompt
   having no variables. Verify insertion occurs at the caret and is not sent.
8. Reopen the launcher, toggle a favorite, exit from the tray, restart, and
   verify the favorite persists and sorts first.
9. Export the library; import a website or extension legacy/version-1 JSON
   backup; verify IDs, categories, descriptions, text, and pinned state remain.
10. Select **Shortcut**, record a different modified shortcut, restart, and
    verify only the new shortcut opens the launcher.
11. For fallback validation, open the launcher from its tray icon after the
    original target has closed, then select **Insert**. Verify the launcher says
    the prompt was copied and manual `Ctrl+V` works.

Repeat steps 2-7 in VS Code, Notepad, and a browser text field.

## Known limitations

- Standard Windows integrity isolation prevents a normally launched process
  from injecting input into an elevated administrator application. Copy-only
  remains available; the launcher should not be elevated merely to bypass this.
- Some applications or remote-desktop/security tools block synthetic paste or
  clipboard access. The launcher reports the fallback but cannot prove that a
  target editor accepted the paste after Windows accepted the key events.
- Clipboard contents are intentionally replaced and left as the completed
  prompt so the fallback remains usable. V1 does not restore prior clipboard
  contents.
- The selected target is the window focused when the launcher opens. Opening
  from the tray may select the taskbar/shell rather than the intended editor;
  the global shortcut is the reliable insertion workflow.
- Import merges only. Existing IDs are preserved and incoming conflicts are
  skipped, matching the extension behavior.
- There is no automatic website/extension sync, installer, auto-update, or
  start-with-Windows setting in V1.
