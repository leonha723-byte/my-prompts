# Browser extension MVP

## Goal

Provide a fast prompt launcher for Chrome and Edge that searches the same prompt
library, collects template variables, and inserts or copies the completed prompt.
The website remains the full prompt manager; the MVP does not add accounts,
cloud synchronization, or automatic submission.

## Architecture

Use a Manifest V3 extension under a future `extension/` directory:

```text
extension/
  manifest.json
  popup.html
  popup.css
  popup.js
  service-worker.js
  insertion.js
  adapters/
    chatgpt.js
    claude.js
    ai-studio.js
    generic.js
```

Copy or package the existing dependency-free files from `shared/` into the
extension artifact. `prompt-schema.js`, `prompt-template.js`, and
`prompt-transfer.js` remain the common data contract; avoid duplicating their
logic in popup code.

## Manifest permissions

Start with only:

```json
{
  "permissions": ["activeTab", "scripting", "storage", "commands"]
}
```

`activeTab` limits page access to an explicit user invocation. Do not request
`<all_urls>`, clipboard-read, browsing-history, or remote-code permissions.
Writing through the active page and offering a normal copy fallback are enough
for the MVP.

## Popup and library UI

The toolbar popup and keyboard command should open the same compact interface:

1. Search title, description, category, and prompt text.
2. Filter by category and show pinned prompts first.
3. Select a prompt and render fields for its normalized `{{variables}}`.
4. Warn about unfilled variables.
5. Offer **Insert** and **Copy** actions.

Editing remains on the website in the first release. The popup may support
pinning because that is local presentation state, but it should not duplicate
the website's create/edit/delete UI yet.

## Storage and migration

- Store the extension library in `chrome.storage.local`, not page
  `localStorage`.
- Seed it from canonical `shared/default-prompts.json` on first run.
- Persist the schema version separately from UI preferences.
- Import both legacy bare arrays and version-1 envelopes through
  `PromptTransfer.parseImportText`.
- Export the same versioned envelope as the website.
- Preserve prompt IDs so website and extension backups round-trip cleanly.
- When bundled defaults change, apply the website's ID-based migration policy
  while preserving extension pin state and user-created prompts.

A later release may add an explicit externally-connectable website bridge, but
the MVP should synchronize through import/export files only. This avoids a
fixed extension-ID contract and cross-origin messaging complexity.

## Insertion strategy

Run insertion only after the user presses **Insert**:

1. Use a small hostname adapter for ChatGPT, Claude, or Gemini AI Studio.
2. Fall back to the currently focused visible `textarea`, text input, or
   `contenteditable` element.
3. Set the value at the current selection and dispatch input events expected by
   controlled editors.
4. If insertion fails, copy the rendered prompt and show a clear message.

Adapters should use semantic editor properties and minimal selectors. They must
not click Send or submit a form automatically.

## Security boundaries

- Treat prompt files and stored prompts as untrusted data.
- Validate every import before storage and render text with DOM APIs or escaped
  text nodes.
- Never interpolate prompt IDs or content into executable JavaScript.
- Keep all code packaged with the extension; Manifest V3 forbids remote code.
- Do not read page content beyond locating the target editor.
- Do not transmit prompts, variables, browsing data, or page content to a
  server.
- The website's client-side admin passcode is a UI lock, not authentication and
  should not be copied into the extension.

## MVP acceptance criteria

- Installs unpacked in current Chrome and Edge.
- Opens by toolbar button and configured keyboard shortcut.
- Loads all canonical defaults and preserves imported/user prompts after restart.
- Search, category filtering, pin ordering, variables, import, and export match
  website behavior.
- Inserts into verified ChatGPT, Claude, and AI Studio composers.
- Inserts into a generic textarea and contenteditable test page.
- Falls back to Copy without losing the rendered prompt.
- Never auto-submits and requests no broad host access.
- Malformed imports, duplicate IDs, empty variables, and unfilled variables are
  handled consistently with the shared tests.

## Staged implementation

1. Scaffold the Manifest V3 popup and load the shared library from
   `chrome.storage.local`.
2. Implement search, categories, pins, variable rendering, and copy.
3. Implement generic focused-element insertion and event dispatch.
4. Add and regression-test the three thin site adapters.
5. Add legacy/versioned import and versioned export.
6. Test unpacked builds in Chrome and Edge, document known editor limitations,
   then prepare store assets and privacy disclosures.

Do not add cloud sync or a website messaging bridge until the file-based MVP is
stable and its permission model has been reviewed.

