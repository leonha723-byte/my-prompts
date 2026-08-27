(function (global) {
    'use strict';

    const CURRENT_SCHEMA_VERSION = 1;

    function parseImportText(text) {
        let parsed;

        try {
            parsed = JSON.parse(text);
        } catch (error) {
            return { prompts: [], issues: [], fatalError: 'The selected file is not valid JSON.' };
        }

        let records;
        let format;

        if (Array.isArray(parsed)) {
            records = parsed;
            format = 'legacy-array';
        } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.prompts)) {
            if (parsed.schemaVersion !== CURRENT_SCHEMA_VERSION) {
                return {
                    prompts: [],
                    issues: [],
                    fatalError: `Unsupported backup schema version: ${String(parsed.schemaVersion)}.`
                };
            }
            records = parsed.prompts;
            format = 'versioned-envelope';
        } else {
            return {
                prompts: [],
                issues: [],
                fatalError: 'Backup must be a prompt array or a supported versioned envelope.'
            };
        }

        const normalized = global.PromptSchema.normalizePromptCollection(records);
        return {
            prompts: normalized.prompts,
            issues: normalized.issues,
            fatalError: null,
            format
        };
    }

    function mergePromptCollections(existingPrompts, importedPrompts) {
        const existingIds = new Set(existingPrompts.map(prompt => prompt.id));
        const added = [];
        const conflicts = [];

        importedPrompts.forEach(prompt => {
            if (existingIds.has(prompt.id)) {
                conflicts.push(prompt.id);
                return;
            }
            existingIds.add(prompt.id);
            added.push(prompt);
        });

        return {
            prompts: existingPrompts.concat(added),
            added,
            conflicts
        };
    }

    function createExportEnvelope(prompts) {
        const normalized = global.PromptSchema.normalizePromptCollection(prompts);

        if (normalized.issues.length) {
            throw new Error('Cannot export a prompt library containing invalid or duplicate records.');
        }

        return {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            prompts: normalized.prompts
        };
    }

    global.PromptTransfer = Object.freeze({
        CURRENT_SCHEMA_VERSION,
        parseImportText,
        mergePromptCollections,
        createExportEnvelope
    });
})(window);
