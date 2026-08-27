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

## Data compatibility

- Existing bare-array JSON backups remain importable.
- New exports use a versioned envelope containing `schemaVersion`, `exportedAt`,
  and `prompts`.
- Existing prompt IDs and the `localStorage["prompts"]` library remain compatible.

