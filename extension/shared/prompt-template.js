(function (global) {
    'use strict';

    const PLACEHOLDER_PATTERN = /\{\{([^}]*)\}\}/g;

    function analyzeVariables(text) {
        const variables = [];
        const emptyPlaceholders = [];
        const seen = new Set();
        let match;

        PLACEHOLDER_PATTERN.lastIndex = 0;
        while ((match = PLACEHOLDER_PATTERN.exec(String(text))) !== null) {
            const name = match[1].trim();

            if (!name) {
                emptyPlaceholders.push(match[0]);
                continue;
            }

            if (!seen.has(name)) {
                seen.add(name);
                variables.push(name);
            }
        }

        return { variables, emptyPlaceholders };
    }

    function extractVariables(text) {
        return analyzeVariables(text).variables;
    }

    function substituteVariables(text, values) {
        const source = String(text);
        const normalizedValues = values && typeof values === 'object' ? values : {};
        const unfilled = new Set();

        PLACEHOLDER_PATTERN.lastIndex = 0;
        const result = source.replace(PLACEHOLDER_PATTERN, (placeholder, rawName) => {
            const name = rawName.trim();

            if (!name) {
                return placeholder;
            }

            const value = normalizedValues[name];
            if (typeof value !== 'string' || !value.trim()) {
                unfilled.add(name);
                return placeholder;
            }

            return value.trim();
        });

        return { text: result, unfilled: Array.from(unfilled) };
    }

    global.PromptTemplate = Object.freeze({
        analyzeVariables,
        extractVariables,
        substituteVariables
    });
})(window);
