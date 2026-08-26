(function (global) {
    'use strict';

    const REQUIRED_STRING_FIELDS = ['id', 'title', 'category', 'text'];

    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function normalizePrompt(record) {
        const errors = [];

        if (!isPlainObject(record)) {
            return { prompt: null, errors: ['Prompt must be an object.'] };
        }

        const prompt = {
            id: typeof record.id === 'string' ? record.id.trim() : '',
            title: typeof record.title === 'string' ? record.title.trim() : '',
            category: typeof record.category === 'string' ? record.category.trim() : '',
            description: typeof record.description === 'string' ? record.description.trim() : '',
            text: typeof record.text === 'string' ? record.text.trim() : '',
            pinned: record.pinned === true
        };

        REQUIRED_STRING_FIELDS.forEach(field => {
            if (!prompt[field]) {
                errors.push(`Missing or invalid required field: ${field}.`);
            }
        });

        if (record.description !== undefined && typeof record.description !== 'string') {
            errors.push('Invalid optional field: description must be a string.');
        }

        if (record.pinned !== undefined && typeof record.pinned !== 'boolean') {
            errors.push('Invalid optional field: pinned must be a boolean.');
        }

        return { prompt: errors.length ? null : prompt, errors };
    }

    function normalizePromptCollection(records) {
        if (!Array.isArray(records)) {
            return {
                prompts: [],
                issues: [{ index: null, id: null, errors: ['Prompt collection must be an array.'] }]
            };
        }

        const prompts = [];
        const issues = [];
        const seenIds = new Set();

        records.forEach((record, index) => {
            const result = normalizePrompt(record);
            const candidateId = isPlainObject(record) && typeof record.id === 'string'
                ? record.id.trim()
                : null;

            if (!result.prompt) {
                issues.push({ index, id: candidateId, errors: result.errors });
                return;
            }

            if (seenIds.has(result.prompt.id)) {
                issues.push({
                    index,
                    id: result.prompt.id,
                    errors: [`Duplicate prompt ID: ${result.prompt.id}.`]
                });
                return;
            }

            seenIds.add(result.prompt.id);
            prompts.push(result.prompt);
        });

        return { prompts, issues };
    }

    global.PromptSchema = Object.freeze({
        normalizePrompt,
        normalizePromptCollection
    });
})(window);
