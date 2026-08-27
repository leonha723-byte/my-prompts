# Browser extension MVP v1

## Scope

`extension/` is a dependency-free Chrome/Edge Manifest V3 prompt launcher. It
searches a local prompt library, collects `{{Variable}}` values, previews the
completed prompt, and inserts it into the active editor. It never submits.

The MVP targets ChatGPT, Google AI Studio, and generic editable fields through
one generic insertion engine. No site-specific adapter is included because the
generic path has not yet demonstrated a target-specific failure.

## Architecture

```text
extension/
  manifest.json              Manifest V3 action and keyboard command
  popup.html                 Launcher UI
  popup.css                  Self-contained popup styling
  popup.js                   UI state, variables, import/export, insert/copy
  library.js                 Storage, search, sort, and merge operations
  insertion.js               Injected generic editor insertion function
  shared/                    Checked copies of the website prompt core/data
```

The extension directory must be independently loadable, so browser-packaged
code cannot import files above its root. Tests require every `extension/shared/`
file to exactly match its canonical website counterpart and fail on drift.

There is no service worker. The reserved `_execute_action` command opens the
toolbar popup directly, which is smaller and more reliable than maintaining a
background process solely for keyboard launching.

## Permissions

| Permission | Purpose |
|---|---|
| `activeTab` | Grants temporary access only after the user opens the launcher. |
| `scripting` | Runs the insertion function in the current tab after **Insert**. |
| `storage` | Persists the extension prompt library and pinned state locally. |

There are no host permissions and no `<all_urls>`. The extension has no backend,
remote code, accounts, OAuth, analytics, or network transmission.

## Popup workflow

1. Load the canonical eight defaults on first run.
2. Search title, description, category, and prompt content.
3. Filter by category; pinned prompts sort first, followed by title.
4. Select a prompt and render normalized variable inputs.
5. Update a text-only completed preview as values change.
6. Block Insert/Copy while required variables remain unfilled.
7. Insert into the active page or copy as a fallback.

All user-controlled values are rendered through DOM text APIs. No prompt values
or IDs are interpolated into executable code or `innerHTML`.

## Storage and compatibility

- Storage key: `promptLibraryV1` in `chrome.storage.local`.
- Records retain `id`, `title`, `category`, `description`, `text`, and `pinned`.
- Legacy website bare arrays and version-1 envelopes are accepted.
- Invalid records are skipped by the shared validator.
- Existing-ID conflicts keep the extension record and report the skipped count.
- Exports use the same version-1 envelope as the website.
- Website and extension sync is manual import/export only.

## Generic insertion

The injected function:

1. Prefers the currently focused visible editor.
2. Otherwise scores visible textarea, text/search input, and contenteditable
   candidates using editor semantics and viewport position.
3. Inserts at the selection/caret when available.
4. Uses the native value setter plus a bubbling `input` event for controlled
   textarea/input implementations.
5. Uses `execCommand('insertText')` for contenteditable undo/event compatibility,
   with a Range fallback.
6. Returns a structured result to the popup.

It never invokes `submit`, `requestSubmit`, Send buttons, keyboard Enter, or an
equivalent action. If no supported editor is available or page injection is
blocked, the completed prompt is copied instead.

## Installation and use

See the repository `README.md` for exact Chrome and Edge unpacked-install steps,
import instructions, shortcut configuration, and manual ChatGPT/AI Studio tests.

## Acceptance checklist

- [x] Manifest V3 package with no host permissions
- [x] Toolbar popup and `_execute_action` shortcut
- [x] Eight-default initialization and `chrome.storage.local` persistence
- [x] Search, categories, pinned-first sorting, and pin persistence
- [x] Variable extraction, missing-value warning, and completed preview
- [x] Legacy/versioned import and versioned export
- [x] Textarea, text-input, and contenteditable insertion
- [x] Bubbling input notification for modern controlled inputs
- [x] Clipboard fallback
- [x] No automatic submission path
- [x] Automated manifest/core/storage/import/insertion/security tests
- [x] HTTP browser fixture smoke test with zero console errors
- [ ] Manual unpacked-popup verification in current Chrome and Edge
- [ ] Manual live ChatGPT and Google AI Studio verification

## Known limitations

- The browser popup closes when focus leaves it; variable inputs are intentionally
  session-local and are not restored after closing.
- Generic editor scoring may choose the wrong field on pages containing several
  visible editors. Focus the target composer before opening the launcher.
- Browser-internal pages, extension stores, and other restricted URLs block
  script injection; Copy fallback is used.
- Clipboard APIs can be restricted by browser policy. The popup also attempts a
  user-gesture `execCommand('copy')` fallback.
- ChatGPT and AI Studio DOM changes may eventually require thin adapters, but
  adapters should be added only after a reproducible generic failure.
- The default keyboard shortcut can conflict with browser/OS commands and may
  need reassignment on the browser's extension-shortcuts page.

## Next stages

1. Complete the two manual acceptance items above.
2. Add a site adapter only for a documented failing editor behavior.
3. Add extension icons and store metadata after behavior stabilizes.
4. Consider an explicit website-extension messaging bridge only after file-based
   synchronization proves insufficient.

