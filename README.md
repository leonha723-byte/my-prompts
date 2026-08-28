# Prompt Workspace

A static, dependency-free prompt library. Prompt data and reusable validation,
templating, and transfer logic live in `shared/`; `index.html` contains the UI.

## Local preview

The site loads `shared/default-prompts.json`, so serve it over HTTP instead of
opening `index.html` through `file://`.

From the repository root on Windows:

```powershell
py -m http.server 8000 --bind 127.0.0.1
```

If `py` is unavailable, use `python` or `python3` with the same arguments. Then
open [http://127.0.0.1:8000/](http://127.0.0.1:8000/). Stop the server with
`Ctrl+C`.

## Automated tests

Node.js 18 or newer is recommended. No package installation is required.

```powershell
node --test tests/prompt-core.test.js
```

The tests cover prompt normalization, malformed and duplicate records,
placeholder handling, import/export compatibility, merge conflicts, and the
canonical default-prompt file.

To include the browser-extension MVP tests:

```powershell
node --test tests/prompt-core.test.js tests/extension-mvp.test.js
```

## Data compatibility

- Existing bare-array JSON backups remain importable.
- New exports use a versioned envelope containing `schemaVersion`, `exportedAt`,
  and `prompts`.
- Existing prompt IDs and the `localStorage["prompts"]` library remain compatible.

## Browser extension MVP

The unpacked Chrome/Edge extension is in `extension/`. It stores its own prompt
library in `chrome.storage.local`; there is no automatic website sync.

### Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this repository's `extension` directory.
5. Pin **Prompt Workspace Launcher** to the toolbar if desired.

### Load in Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this repository's `extension` directory.
5. Pin **Prompt Workspace Launcher** to the toolbar if desired.

Open the launcher from its toolbar button or press `Ctrl+Shift+P` on Windows/
Linux and `Command+Shift+P` on macOS. Browser-reserved shortcuts can be reviewed
or reassigned at `chrome://extensions/shortcuts` or `edge://extensions/shortcuts`.

### Import an existing website library

1. On the website, select **Export Backup**.
2. Open the extension popup.
3. Select **Import** and choose the downloaded JSON file.

Both legacy bare-array backups and version-1 envelopes are accepted. Existing
IDs are retained; ID conflicts keep the extension's existing prompt.

### Manual ChatGPT and AI Studio check

1. Open a new chat and click in the message/prompt composer.
2. Open the launcher, select a prompt, and fill every displayed variable.
3. Confirm the completed preview is correct.
4. Select **Insert**.
5. Verify the text appears at the caret and is **not** submitted.
6. If insertion is blocked, verify the popup reports that it copied the prompt,
   then paste it manually.

Repeat in ChatGPT and Google AI Studio. See `docs/extension-mvp.md` for the full
architecture, security boundaries, acceptance checklist, and known limitations.

## Windows desktop launcher MVP

The Windows launcher is in `launcher/`. It is a lightweight native WPF app that
uses the same prompt schema, variable rules, and version-1/legacy JSON formats as
the website and extension. It registers a configurable global shortcut, keeps a
searchable nested-category library in local storage, and inserts through a
clipboard plus focus-and-`Ctrl+V` strategy. It never sends Enter.

Build and run on Windows with the .NET 10 SDK:

```powershell
dotnet build launcher\PromptLauncher.sln --configuration Release
dotnet run --project launcher\PromptLauncher\PromptLauncher.csproj --configuration Release
```

Run its dependency-free automated tests:

```powershell
dotnet run --project launcher\PromptLauncher.Tests\PromptLauncher.Tests.csproj --configuration Release
```

See `docs/windows-launcher-mvp.md` for architecture, publishing instructions,
permissions, insertion behavior, manual ChatGPT acceptance tests, and known
limitations.


