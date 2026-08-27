(function (global) {
    'use strict';

    const STORAGE_KEY = 'promptLibraryV1';

    async function loadLibrary(storageArea, defaultsLoader) {
        const stored = await storageArea.get(STORAGE_KEY);
        const existing = stored[STORAGE_KEY];

        if (Array.isArray(existing)) {
            const normalized = global.PromptSchema.normalizePromptCollection(existing);
            if (normalized.prompts.length || existing.length === 0) {
                if (normalized.issues.length) await saveLibrary(storageArea, normalized.prompts);
                return { prompts: normalized.prompts, issues: normalized.issues, source: 'storage' };
            }
        }

        const defaults = await defaultsLoader();
        const normalized = global.PromptSchema.normalizePromptCollection(defaults);
        if (normalized.issues.length) throw new Error('Bundled default prompts failed validation.');

        await saveLibrary(storageArea, normalized.prompts);
        return { prompts: normalized.prompts, issues: [], source: 'defaults' };
    }

    async function saveLibrary(storageArea, prompts) {
        const normalized = global.PromptSchema.normalizePromptCollection(prompts);
        if (normalized.issues.length) throw new Error('Cannot save an invalid prompt library.');
        await storageArea.set({ [STORAGE_KEY]: normalized.prompts });
        return normalized.prompts;
    }

    function filterPrompts(prompts, query, category) {
        const normalizedQuery = String(query || '').trim().toLowerCase();
        const selectedCategory = category || 'All';

        return prompts
            .filter(prompt => {
                const categoryMatches = selectedCategory === 'All' || prompt.category === selectedCategory;
                const haystack = [prompt.title, prompt.description, prompt.category, prompt.text]
                    .join('\n')
                    .toLowerCase();
                return categoryMatches && (!normalizedQuery || haystack.includes(normalizedQuery));
            })
            .slice()
            .sort((left, right) => {
                if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
                return left.title.localeCompare(right.title);
            });
    }

    function importLibrary(text, existingPrompts) {
        const imported = global.PromptTransfer.parseImportText(text);
        if (imported.fatalError) return imported;

        const merged = global.PromptTransfer.mergePromptCollections(existingPrompts, imported.prompts);
        return { ...imported, ...merged };
    }

    global.ExtensionLibrary = Object.freeze({
        STORAGE_KEY,
        loadLibrary,
        saveLibrary,
        filterPrompts,
        importLibrary
    });
})(window);

