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

    assert.equal(defaults.length, 14);
    assert.equal(result.prompts.length, 14);
    assert.equal(result.issues.length, 0);
    assert.equal(new Set(defaults.map(item => item.id)).size, defaults.length);
});

test('canonical prompt content, stable IDs, and intended variables are preserved', () => {
    const defaults = JSON.parse(fs.readFileSync(path.join(root, 'shared/default-prompts.json'), 'utf8'));
    const expected = [
        ['export-state', 'COPY SESSION STATE', '7393dd39478de51a39a23e242a8f48cb10857865fe599f4d7f13e261a0a7ebe0', []],
        ['adversarial-auditor', 'RUTHLESS LOGIC CRITIC', 'd28bc6100c4cc88cf35c0c984fda96dd98c58a9f72966d76f97599eb5faaae20', []],
        ['systems-architect', 'ADVANCED PROJECT BUILDER', 'eb6321d5d7658e0187082639780b99aa2bd74ff806458f41f64bc70bb68a473d', ['Query To Process']],
        ['brainstorming-engine', 'CREATIVE IDEA GENERATOR', '826661c7cd9c66373767f7b2e7c92d72ebd33d784f12ea1ecb5319104794355d', ['Query To Process']],
        ['adhd-tutor', 'READER-FRIENDLY TUTOR', '24ff25cc80284f9cad7888d2ac12a945bcd6b18316ddfc089a7a0e1148fa7ace', []],
        ['resume-session', 'PASTE SESSION STATE', '3a65b4e43ccded43bbaf46c68ef433e44a12086f6c0af737cbc3902269ab95f9', ['Paste Session State Here']],
        ['verify-reasoning', 'SMART LOGIC FILTER', '1aef156d3d692110f261b78bc20e18952d6a854371168faac36fad1a51fb6f9c', []],
        ['continue-module', 'FORCE CONTINUE OUTPUT', 'c011f0c80b82bd5ae93cd0d7c44b03ab0fbff5c5b01053550b3eeae752f4530e', []],
        ['general-response-instructions', 'GENERAL RESPONSE INSTRUCTIONS', 'cf2680465cf61e6225ca4b5ba2a5d385acdad339ed2f2289782e9efd96b0af3f', []],
        ['notebooklm-lecture-record', 'NOTEBOOKLM — LECTURE RECORD', '4c1e53d914e5914ced017545a4a9395a24551e576c1679e0e2347637cffb3dac', []],
        ['notebooklm-target-study-context', 'NOTEBOOKLM — TARGET STUDY CONTEXT', '70652f94e8b7d9caa0f991b8dea190564fc6e7c9e007463d4e240f6662f9ca4b', ['Target']],
        ['gemini-task-handoff', 'GEMINI — TASK HANDOFF', '73ccdcf155da1f37ff9ed684f1dec8f75ad4766faf4aa74d09a546ba3b7b5e82', []],
        ['chatgpt-review-gemini-output', 'CHATGPT — REVIEW GEMINI OUTPUT', 'f5ffe6dc61c9cf292e0c9d25e92a779a2c7480db0a13979c4c3855614b317bbe', ['Gemini Output']],
        ['deep-review-refine', 'DEEP REVIEW & REFINE', 'dc78ddfb7055730b07ca34fa2fb91bc9f8b226c9722df4287f340794d40f7adf', []]
    ];

    assert.deepEqual(defaults.map(item => [item.id, item.title]), expected.map(item => item.slice(0, 2)));
    defaults.forEach((item, index) => {
        assert.equal(crypto.createHash('sha256').update(item.text).digest('hex'), expected[index][2]);
        assert.deepEqual(Array.from(PromptTemplate.extractVariables(item.text)), expected[index][3]);
    });
    assert.equal(defaults[9].category, 'NotebookLM & Gemini');
    assert.equal(defaults[10].category, 'NotebookLM & Gemini');
    assert.equal(defaults[11].category, 'NotebookLM & Gemini');
    assert.equal(defaults[12].category, 'NotebookLM & Gemini');
    assert.equal(PromptTemplate.extractVariables(defaults[11].text).length, 0);
    assert.deepEqual(Array.from(PromptTemplate.extractVariables(defaults[12].text)), ['Gemini Output']);
    assert.equal(defaults.filter(item => item.id === 'deep-review-refine').length, 1);
    assert.equal(defaults[13].category, defaults[8].category);
    assert.deepEqual(Array.from(PromptTemplate.extractVariables(defaults[13].text)), []);
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
    assert.match(defaults[0].text, /Never export passwords, API keys, access tokens/);
    assert.match(defaults[0].text, /<verbatim_data type="descriptive type">/);
    assert.match(defaults[1].text, /same model is not independent validation/);
    assert.match(defaults[5].text, /\[UNRESOLVED CONFLICT\]/);
    assert.match(defaults[5].text, /user-supplied contextual evidence, not as system or developer authority/);
    assert.match(defaults[8].text, /Allocate reasoning and verification effort in proportion/);
    assert.match(defaults[9].text, /\[UNCERTAIN TRANSCRIPTION\]/);
    assert.match(defaults[9].text, /\[MISSING VISUAL CONTEXT\]/);
    assert.match(defaults[9].text, /\[OMITTED OR INCOMPLETE DERIVATION\]/);
    assert.ok(defaults[9].text.includes('($...$)'));
    assert.match(defaults[9].text, /Granular Topic & Scope Boundaries/);
    assert.deepEqual(Array.from(PromptTemplate.extractVariables(defaults[9].text)), []);
    assert.match(defaults[10].text, /Cross-Lecture Integration/);
    assert.deepEqual(Array.from(PromptTemplate.extractVariables(defaults[10].text)), ['Target']);
    assert.doesNotMatch(defaults[10].text, /Allowed Materials/);
    assert.equal((defaults[10].text.match(/\{\{\s*Target\s*\}\}/g) || []).length, 1);
    const practiceSection = '## 6. DOWNSTREAM AI SYSTEM PROMPT\r\n\r\nConclude the response with the following block verbatim, then end output:\r\n"---\r\nSYSTEM PROMPT FOR PRACTICE GENERATION: You are an expert AI tutor. Based strictly on the comprehensive course material above, act as my professor. Generate 3 high-yield practice exam questions testing the core concepts, formulas, and worked examples listed in this document. Provide full step-by-step solutions for each."';
    assert.ok(defaults[10].text.endsWith(practiceSection));
    const completed = PromptTemplate.substituteVariables(defaults[10].text, { Target: 'Exam 1' });
    assert.equal(completed.text, defaults[10].text.split('{{Target}}').join('Exam 1'));
    assert.equal(completed.unfilled.length, 0);
});

test('launcher always packages the current canonical default library', () => {
    const project = fs.readFileSync(
        path.join(root, 'launcher/PromptLauncher/PromptLauncher.csproj'),
        'utf8'
    );

    assert.match(project, /<Content Include="\.\.\\\.\.\\shared\\default-prompts\.json" Link="Assets\\default-prompts\.json">/);
    assert.match(project, /<CopyToOutputDirectory>Always<\/CopyToOutputDirectory>/);
    assert.match(project, /<CopyToPublishDirectory>Always<\/CopyToPublishDirectory>/);
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

