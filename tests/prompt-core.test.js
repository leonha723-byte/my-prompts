const assert = require('node:assert/strict');
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

    assert.equal(defaults.length, 8);
    assert.equal(result.prompts.length, 8);
    assert.equal(result.issues.length, 0);
    assert.equal(new Set(defaults.map(item => item.id)).size, defaults.length);
});

