const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function createLibraryContext() {
    const context = vm.createContext({ window: {} });
    for (const file of [
        'extension/shared/prompt-schema.js',
        'extension/shared/prompt-template.js',
        'extension/shared/prompt-transfer.js',
        'extension/library.js'
    ]) {
        vm.runInContext(read(file), context, { filename: file });
    }
    return context.window;
}

function prompt(overrides = {}) {
    return {
        id: 'one',
        title: 'One',
        category: 'Testing',
        description: 'Description',
        text: 'Hello {{Name}}',
        pinned: false,
        ...overrides
    };
}

function fakeStorage(initial = {}) {
    const values = { ...initial };
    return {
        values,
        async get(key) { return { [key]: values[key] }; },
        async set(update) { Object.assign(values, JSON.parse(JSON.stringify(update))); }
    };
}

test('manifest is a minimal Manifest V3 action with a keyboard launcher', () => {
    const manifest = JSON.parse(read('extension/manifest.json'));

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.action.default_popup, 'popup.html');
    assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'scripting', 'storage']);
    assert.ok(manifest.commands._execute_action);
    assert.equal(manifest.host_permissions, undefined);
    assert.doesNotMatch(JSON.stringify(manifest), /<all_urls>/);
});

test('extension package references only present local popup resources', () => {
    const popup = read('extension/popup.html');
    const references = Array.from(
        popup.matchAll(/(?:src|href)="([^"]+)"/g),
        match => match[1]
    );

    assert.ok(references.length > 0);
    for (const reference of references) {
        assert.doesNotMatch(reference, /^(?:https?:)?\/\//);
        assert.equal(fs.existsSync(path.join(root, 'extension', reference)), true, `${reference} is missing`);
    }
});

test('extension shared files exactly match website shared files', () => {
    for (const file of [
        'default-prompts.json',
        'prompt-schema.js',
        'prompt-template.js',
        'prompt-transfer.js'
    ]) {
        assert.equal(read(`extension/shared/${file}`), read(`shared/${file}`), `${file} has drifted`);
    }
});

test('library initializes defaults in chrome.storage.local', async () => {
    const { ExtensionLibrary } = createLibraryContext();
    const storage = fakeStorage();
    const defaults = JSON.parse(read('extension/shared/default-prompts.json'));
    const result = await ExtensionLibrary.loadLibrary(storage, async () => defaults);

    assert.equal(result.source, 'defaults');
    assert.equal(result.prompts.length, 11);
    assert.equal(storage.values.promptLibraryV1.length, 11);
});

test('library reloads stored prompts and prioritizes pinned search results', async () => {
    const { ExtensionLibrary } = createLibraryContext();
    const stored = [
        prompt({ id: 'a', title: 'Alpha prompt' }),
        prompt({ id: 'b', title: 'Beta prompt', pinned: true })
    ];
    const storage = fakeStorage({ promptLibraryV1: stored });
    const loaded = await ExtensionLibrary.loadLibrary(storage, async () => []);
    const filtered = ExtensionLibrary.filterPrompts(loaded.prompts, 'prompt', 'Testing');

    assert.equal(loaded.source, 'storage');
    assert.deepEqual(Array.from(filtered, item => item.id), ['b', 'a']);
});

test('pin updates are persisted transactionally without mutating the current library', async () => {
    const { ExtensionLibrary } = createLibraryContext();
    const prompts = [prompt()];
    const storage = fakeStorage({ promptLibraryV1: prompts });
    const updated = await ExtensionLibrary.setPromptPinned(storage, prompts, 'one', true);

    assert.equal(prompts[0].pinned, false);
    assert.equal(updated[0].pinned, true);
    assert.equal(storage.values.promptLibraryV1[0].pinned, true);

    const failingStorage = {
        async set() { throw new Error('quota'); }
    };
    await assert.rejects(
        ExtensionLibrary.setPromptPinned(failingStorage, prompts, 'one', true),
        /quota/
    );
    assert.equal(prompts[0].pinned, false);
});

test('library groups prompts into sorted category paths with nested-category support', () => {
    const { ExtensionLibrary } = createLibraryContext();
    const tree = ExtensionLibrary.buildCategoryTree([
        prompt({ id: 'ee', title: 'Circuits', category: 'Learning/EE' }),
        prompt({ id: 'math', title: 'Algebra', category: 'Learning/Math' }),
        prompt({ id: 'work', title: 'Review', category: 'Work' })
    ]);

    assert.deepEqual(Array.from(tree, node => node.name), ['Learning', 'Work']);
    assert.equal(tree[0].path, 'Learning');
    assert.deepEqual(Array.from(tree[0].children, node => node.path), ['Learning/EE', 'Learning/Math']);
    assert.equal(tree[0].children[0].prompts[0].id, 'ee');
    assert.deepEqual(Array.from(ExtensionLibrary.categoryPaths([
        prompt({ category: 'Learning/EE' }),
        prompt({ id: 'two', category: 'Work' })
    ])), ['Learning', 'Learning/EE', 'Work']);
});

test('category expansion state is respected except while searching', () => {
    const { ExtensionLibrary } = createLibraryContext();
    const expanded = new Set(['Work']);

    assert.equal(ExtensionLibrary.isCategoryExpanded('Work', expanded, ''), true);
    assert.equal(ExtensionLibrary.isCategoryExpanded('Learning', expanded, ''), false);
    assert.equal(ExtensionLibrary.isCategoryExpanded('Learning', expanded, 'circuit'), true);
    assert.equal(ExtensionLibrary.isCategoryExpanded('Learning', expanded, '   '), false);
});

test('search reveals matching grouped prompts and favorites remain prioritized', () => {
    const { ExtensionLibrary } = createLibraryContext();
    const prompts = [
        prompt({ id: 'ordinary', title: 'Circuit Notes', category: 'Learning/EE' }),
        prompt({ id: 'favorite', title: 'Circuit Tutor', category: 'Learning/EE', pinned: true }),
        prompt({ id: 'other', title: 'Meeting Notes', category: 'Work' })
    ];
    const matches = ExtensionLibrary.filterPrompts(prompts, 'circuit', 'All');
    const tree = ExtensionLibrary.buildCategoryTree(matches);

    assert.deepEqual(Array.from(matches, item => item.id), ['favorite', 'ordinary']);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].path, 'Learning');
    assert.equal(tree[0].children[0].path, 'Learning/EE');
    assert.deepEqual(Array.from(matches.filter(item => item.pinned), item => item.id), ['favorite']);
});

test('extension imports legacy and versioned backups while preserving conflicts', () => {
    const { ExtensionLibrary, PromptTransfer } = createLibraryContext();
    const existing = [prompt()];
    const incoming = [prompt({ title: 'Replacement' }), prompt({ id: 'two', title: 'Two' })];

    const legacy = ExtensionLibrary.importLibrary(JSON.stringify(incoming), existing);
    const versioned = ExtensionLibrary.importLibrary(
        JSON.stringify(PromptTransfer.createExportEnvelope(incoming)),
        existing
    );

    for (const result of [legacy, versioned]) {
        assert.equal(result.fatalError, null);
        assert.deepEqual(Array.from(result.conflicts), ['one']);
        assert.deepEqual(Array.from(result.added, item => item.id), ['two']);
        assert.equal(result.prompts[0].title, 'One');
    }
});

function createInsertionContext(editorType) {
    class FakeBase {
        constructor() {
            this.disabled = false;
            this.readOnly = false;
            this.events = [];
            this.attributes = {};
            this.isContentEditable = false;
        }
        focus() { document.activeElement = this; }
        getBoundingClientRect() { return { width: 300, height: 80, bottom: 700 }; }
        getAttribute(name) { return this.attributes[name] || null; }
        dispatchEvent(event) { this.events.push(event.type); return true; }
        closest() { return null; }
        contains(node) { return node === this; }
    }
    class FakeTextArea extends FakeBase {
        constructor() { super(); this._value = ''; this.selectionStart = 0; this.selectionEnd = 0; }
        get value() { return this._value; }
        set value(value) { this._value = value; }
        setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    }
    class FakeInput extends FakeBase {
        constructor() {
            super();
            this._value = '';
            this.selectionStart = 0;
            this.selectionEnd = 0;
            this.type = 'text';
        }
        get value() { return this._value; }
        set value(value) { this._value = value; }
        setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    }
    class FakeEditable extends FakeBase {
        constructor() { super(); this.isContentEditable = true; this.textContent = ''; }
    }

    const editor = editorType === 'textarea'
        ? new FakeTextArea()
        : editorType === 'input'
            ? new FakeInput()
            : new FakeEditable();

    const selection = {
        rangeCount: 1,
        anchorNode: editor,
        getRangeAt() { return {}; },
        removeAllRanges() {},
        addRange() {}
    };
    const document = {
        activeElement: editor,
        querySelectorAll() { return [editor]; },
        execCommand(command, unused, text) {
            if (editor.isContentEditable && command === 'insertText') {
                editor.textContent += text;
                return true;
            }
            return false;
        }
    };
    const window = {
        innerHeight: 800,
        getComputedStyle() { return { display: 'block', visibility: 'visible' }; },
        getSelection() { return selection; }
    };
    const context = vm.createContext({
        window,
        document,
        HTMLTextAreaElement: FakeTextArea,
        HTMLInputElement: FakeInput,
        InputEvent: class { constructor(type) { this.type = type; } },
        Event: class { constructor(type) { this.type = type; } },
        Object,
        Array,
        Number
    });
    window.window = window;
    vm.runInContext(read('extension/insertion.js'), context, { filename: 'extension/insertion.js' });
    return { api: window.PromptInsertion, document, editor };
}

test('generic insertion updates textarea at the selection and dispatches input', () => {
    const environment = createInsertionContext('textarea');
    const editor = environment.editor;
    editor.value = 'Say world';
    editor.selectionStart = 4;
    editor.selectionEnd = 4;

    const result = environment.api.insertPromptIntoPage('hello ');
    assert.equal(result.ok, true);
    assert.equal(result.method, 'textarea');
    assert.equal(editor.value, 'Say hello world');
    assert.deepEqual(editor.events, ['input']);
});

test('generic insertion supports text input and contenteditable without submitting', () => {
    const inputEnvironment = createInsertionContext('input');
    const input = inputEnvironment.editor;
    input.value = 'A';
    input.selectionStart = 1;
    input.selectionEnd = 1;
    assert.equal(inputEnvironment.api.insertPromptIntoPage('B').method, 'input');
    assert.equal(input.value, 'AB');

    const editableEnvironment = createInsertionContext('contenteditable');
    const editable = editableEnvironment.editor;
    assert.equal(editableEnvironment.api.insertPromptIntoPage('content').method, 'contenteditable');
    assert.equal(editable.textContent, 'content');
    assert.doesNotMatch(read('extension/insertion.js'), /\.submit\(|requestSubmit|\.click\(/);
});

test('popup scripts parse and render user values through DOM APIs', () => {
    for (const file of ['extension/library.js', 'extension/insertion.js', 'extension/popup.js']) {
        assert.doesNotThrow(() => new vm.Script(read(file), { filename: file }));
    }
    assert.doesNotMatch(read('extension/popup.js'), /innerHTML\s*=/);
});



