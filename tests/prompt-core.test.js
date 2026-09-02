const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window: {} });

for (const file of [
    'shared/prompt-schema.js',
    'shared/prompt-template.js',
    'shared/prompt-transfer.js'
]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

const { PromptSchema, PromptTemplate, PromptTransfer } = context.window;

function prompt(overrides = {}) {
    return {
        id: 'prompt-1',
        title: 'Prompt One',
        category: 'Testing',
        description: 'Description',
        text: 'Hello {{Name}}',
        pinned: false,
        ...overrides
    };
}

test('schema normalizes supported prompt fields', () => {
    const result = PromptSchema.normalizePrompt(prompt({
        id: '  prompt-1  ',
        title: '  Prompt One  ',
        category: '  Testing  ',
        description: '  Description  ',
        text: '  Hello  ',
        pinned: true
    }));

    assert.deepEqual(JSON.parse(JSON.stringify(result.prompt)), {
        id: 'prompt-1',
        title: 'Prompt One',
        category: 'Testing',
        description: 'Description',
        text: 'Hello',
        pinned: true
    });
    assert.equal(result.errors.length, 0);
});

test('schema rejects malformed, missing-ID, duplicate, and empty-placeholder records', () => {
    const result = PromptSchema.normalizePromptCollection([
        prompt(),
        null,
        prompt({ id: '   ' }),
        prompt({ id: 'prompt-1', title: 'Duplicate' }),
        prompt({ id: 'empty-variable', text: 'Bad {{   }} placeholder' }),
        prompt({ id: 'bad-pinned', pinned: 'yes' })
    ]);

    assert.equal(result.prompts.length, 1);
    assert.equal(result.issues.length, 5);
    assert.match(result.issues[1].errors.join(' '), /required field: id/);
    assert.match(result.issues[2].errors.join(' '), /Duplicate prompt ID/);
    assert.match(result.issues[3].errors.join(' '), /Variable names cannot be empty/);
});

test('placeholder extraction trims whitespace and deduplicates equivalent names', () => {
    const analysis = PromptTemplate.analyzeVariables(
        '{{ Name }} / {{Name}} / {{ Topic }} / {{Topic}} / {{   }}'
    );

    assert.deepEqual(Array.from(analysis.variables), ['Name', 'Topic']);
    assert.deepEqual(Array.from(analysis.emptyPlaceholders), ['{{   }}']);
    assert.deepEqual(Array.from(PromptTemplate.extractVariables('{{ A }} {{A}}')), ['A']);
});

test('substitution replaces equivalent placeholders and preserves unfilled variables', () => {
    const result = PromptTemplate.substituteVariables(
        'Hello {{ Name }} and {{Name}}; topic={{ Topic }}; missing={{Missing}}',
        { Name: ' Ada ', Topic: 'Testing' }
    );

    assert.equal(result.text, 'Hello Ada and Ada; topic=Testing; missing={{Missing}}');
    assert.deepEqual(Array.from(result.unfilled), ['Missing']);
});

test('legacy bare-array imports remain supported', () => {
    const result = PromptTransfer.parseImportText(JSON.stringify([prompt()]));

    assert.equal(result.fatalError, null);
    assert.equal(result.format, 'legacy-array');
    assert.equal(result.prompts.length, 1);
});

test('versioned envelopes export and import successfully', () => {
    const envelope = PromptTransfer.createExportEnvelope([prompt()]);
    const imported = PromptTransfer.parseImportText(JSON.stringify(envelope));

    assert.equal(envelope.schemaVersion, 1);
    assert.ok(!Number.isNaN(Date.parse(envelope.exportedAt)));
    assert.equal(imported.format, 'versioned-envelope');
    assert.equal(imported.prompts.length, 1);
});

test('unsupported envelopes and invalid JSON fail safely', () => {
    assert.match(PromptTransfer.parseImportText('{').fatalError, /not valid JSON/);
    assert.match(
        PromptTransfer.parseImportText(JSON.stringify({ schemaVersion: 99, prompts: [] })).fatalError,
        /Unsupported backup schema version/
    );
});

test('merge keeps existing records and reports ID conflicts', () => {
    const existing = [prompt()];
    const imported = [prompt({ title: 'Replacement' }), prompt({ id: 'prompt-2' })];
    const result = PromptTransfer.mergePromptCollections(existing, imported);

    assert.equal(result.prompts.length, 2);
    assert.equal(result.prompts[0].title, 'Prompt One');
    assert.deepEqual(Array.from(result.conflicts), ['prompt-1']);
    assert.deepEqual(Array.from(result.added, item => item.id), ['prompt-2']);
});

test('default prompt JSON is valid, normalized, and has unique IDs', () => {
    const defaults = JSON.parse(fs.readFileSync(path.join(root, 'shared/default-prompts.json'), 'utf8'));
    const result = PromptSchema.normalizePromptCollection(defaults);

    assert.equal(defaults.length, 11);
    assert.equal(result.prompts.length, 11);
    assert.equal(result.issues.length, 0);
    assert.equal(new Set(defaults.map(item => item.id)).size, defaults.length);
});

test('canonical prompt content, stable IDs, and intended variables are preserved', () => {
    const defaults = JSON.parse(fs.readFileSync(path.join(root, 'shared/default-prompts.json'), 'utf8'));
    const expected = [
        ['export-state', 'COPY SESSION STATE', '6deaba29cda72986b726255d25c8add51bbc76ce7362616bc841fc132ea6592d', []],
        ['adversarial-auditor', 'RUTHLESS LOGIC CRITIC', '17289a723644836c34947ecf3db7b5e0e8113a84267e6f1c62d91b681e4147b4', []],
        ['systems-architect', 'ADVANCED PROJECT BUILDER', '81b94562eb7671bc35e35afeedc045727d76aae13037148b71edeb957bbedfc9', ['Query To Process']],
        ['brainstorming-engine', 'CREATIVE IDEA GENERATOR', 'ae75269d84de675125589384bdb8f2889279ef61754b010169895f93bc69b4e7', ['Query To Process']],
        ['adhd-tutor', 'READER-FRIENDLY TUTOR', '697fb3556f6a73352e647af65e45c8c2b35b124ad5fee38887367f323b5a25d9', []],
        ['resume-session', 'PASTE SESSION STATE', '367348470f6a054ddc0f3b3c5b80731d58c6425296347e502e7b3c01dcd69fc4', ['Paste Session State Here']],
        ['verify-reasoning', 'SMART LOGIC FILTER', '829f92bea9440f8614c06fd39b11960d6e7b83bf4239c03224a33f6d330b1f0f', []],
        ['continue-module', 'FORCE CONTINUE OUTPUT', 'a10a435c6ec3c9292efcfade9e3923bdc885cd288497ebd25fd4164570db1e36', []],
        ['general-response-instructions', 'GENERAL RESPONSE INSTRUCTIONS', '88248e7ed4bd8909fa20677fecdcee54f9ee7375146c2695cf0b4a49a231961c', []],
        ['notebooklm-lecture-record', 'NOTEBOOKLM — LECTURE RECORD', 'cef6df81a69deb3fbe70d8a044f960aa5526ecfb284c9e134a8975ac01bd3dc1', []],
        ['notebooklm-target-study-context', 'NOTEBOOKLM — TARGET STUDY CONTEXT', '5ba9d97a1a648d1db6d952f43f1dc6a9cf80e4075d7ba7e27f47311d08e8a10f', ['Target']]
    ];

    assert.deepEqual(defaults.map(item => [item.id, item.title]), expected.map(item => item.slice(0, 2)));
    defaults.forEach((item, index) => {
        assert.equal(crypto.createHash('sha256').update(item.text).digest('hex'), expected[index][2]);
        assert.deepEqual(Array.from(PromptTemplate.extractVariables(item.text)), expected[index][3]);
    });
});

test('canonical long-form prompts survive versioned export and import unchanged', () => {
    const defaults = JSON.parse(fs.readFileSync(path.join(root, 'shared/default-prompts.json'), 'utf8'));
    const envelope = PromptTransfer.createExportEnvelope(defaults);
    const imported = PromptTransfer.parseImportText(JSON.stringify(envelope));

    assert.equal(imported.fatalError, null);
    assert.equal(imported.prompts.length, defaults.length);
    assert.deepEqual(
        JSON.parse(JSON.stringify(imported.prompts)),
        defaults
    );
    assert.match(defaults[0].text, /<verbatim_data type="\.\.\.\">/);
    assert.match(defaults[5].text, /\[UNRESOLVED CONFLICT\]/);
    assert.match(defaults[9].text, /\[UNCERTAIN TRANSCRIPTION\]/);
    assert.match(defaults[9].text, /\[MISSING VISUAL CONTEXT\]/);
});

test('index defines ID encoding and delegates prompt actions without inline IDs', () => {
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const encoderPosition = index.indexOf('function encodeDomKey(value)');
    const rendererPosition = index.indexOf('function generateCardHtml(p)');

    assert.ok(encoderPosition >= 0, 'encodeDomKey must be defined');
    assert.ok(encoderPosition < rendererPosition, 'encodeDomKey must be defined before rendering');
    assert.match(index, /data-prompt-action="copy" data-prompt-id="\$\{safeId\}"/);
    assert.doesNotMatch(index, /onclick="[^"]*decodeURIComponent/);
});

