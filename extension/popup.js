(function () {
    'use strict';

    const state = {
        prompts: [],
        selectedId: null,
        query: '',
        category: 'All',
        values: {},
        expandedCategories: new Set()
    };

    const elements = {};

    document.addEventListener('DOMContentLoaded', initialize);

    async function initialize() {
        Object.assign(elements, {
            search: document.getElementById('searchInput'),
            category: document.getElementById('categorySelect'),
            list: document.getElementById('promptList'),
            empty: document.getElementById('emptyState'),
            detail: document.getElementById('promptDetail'),
            detailCategory: document.getElementById('detailCategory'),
            detailTitle: document.getElementById('detailTitle'),
            detailDescription: document.getElementById('detailDescription'),
            variables: document.getElementById('variableFields'),
            preview: document.getElementById('promptPreview'),
            warning: document.getElementById('missingWarning'),
            pin: document.getElementById('pinButton'),
            insert: document.getElementById('insertButton'),
            copy: document.getElementById('copyButton'),
            importFile: document.getElementById('importFile'),
            export: document.getElementById('exportButton'),
            count: document.getElementById('libraryCount'),
            status: document.getElementById('status')
        });

        bindEvents();

        try {
            const loaded = await ExtensionLibrary.loadLibrary(chrome.storage.local, async () => {
                const response = await fetch('shared/default-prompts.json');
                if (!response.ok) throw new Error(`Unable to load defaults (${response.status}).`);
                return response.json();
            });
            state.prompts = loaded.prompts;
            ExtensionLibrary.categoryPaths(state.prompts).forEach(path => state.expandedCategories.add(path));
            renderCategories();
            renderLibrary();
            setStatus(loaded.source === 'defaults' ? 'Default prompt library loaded.' : 'Prompt library loaded.', 'success');
        } catch (error) {
            setStatus(error.message, 'error');
        }
    }

    function bindEvents() {
        elements.search.addEventListener('input', event => {
            state.query = event.target.value;
            renderLibrary();
        });
        elements.category.addEventListener('change', event => {
            state.category = event.target.value;
            renderLibrary();
        });
        elements.pin.addEventListener('click', toggleSelectedPin);
        elements.insert.addEventListener('click', insertSelectedPrompt);
        elements.copy.addEventListener('click', copySelectedPrompt);
        elements.importFile.addEventListener('change', importFile);
        elements.export.addEventListener('click', exportLibrary);
    }

    function renderCategories() {
        const categories = Array.from(new Set(state.prompts.map(prompt => prompt.category))).sort();
        elements.category.replaceChildren();
        ['All', ...categories].forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category === 'All' ? 'All categories' : category;
            elements.category.appendChild(option);
        });
        elements.category.value = state.category;
    }

    function renderLibrary() {
        const visible = ExtensionLibrary.filterPrompts(state.prompts, state.query, state.category);
        elements.list.replaceChildren();
        elements.empty.hidden = visible.length > 0;
        elements.count.textContent = `${state.prompts.length} prompts`;

        const favorites = visible.filter(prompt => prompt.pinned);
        if (favorites.length) {
            const section = document.createElement('section');
            section.className = 'tree-section favorites';
            section.setAttribute('aria-label', 'Favorites');
            const heading = document.createElement('div');
            heading.className = 'tree-section-heading';
            heading.textContent = '★ Favorites';
            section.appendChild(heading);
            favorites.forEach(prompt => section.appendChild(createPromptButton(prompt, 1)));
            elements.list.appendChild(section);
        }

        const tree = ExtensionLibrary.buildCategoryTree(visible);
        tree.forEach(node => elements.list.appendChild(renderCategoryNode(node, 0)));

        if (state.selectedId && !state.prompts.some(prompt => prompt.id === state.selectedId)) {
            state.selectedId = null;
            elements.detail.hidden = true;
        }
    }

    function renderCategoryNode(node, depth) {
        const section = document.createElement('section');
        section.className = 'tree-node';
        const expanded = ExtensionLibrary.isCategoryExpanded(
            node.path,
            state.expandedCategories,
            state.query
        );
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'tree-toggle';
        toggle.style.setProperty('--tree-depth', depth);
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.title = expanded ? `Collapse ${node.path}` : `Expand ${node.path}`;

        const disclosure = document.createElement('span');
        disclosure.className = 'disclosure';
        disclosure.textContent = expanded ? '▾' : '▸';
        const folder = document.createElement('span');
        folder.className = 'folder';
        folder.textContent = '▰';
        const label = document.createElement('span');
        label.className = 'tree-label';
        label.textContent = node.name;
        const count = document.createElement('span');
        count.className = 'tree-count';
        count.textContent = String(countNodePrompts(node));
        toggle.append(disclosure, folder, label, count);
        toggle.addEventListener('click', () => {
            if (state.expandedCategories.has(node.path)) {
                state.expandedCategories.delete(node.path);
            } else {
                state.expandedCategories.add(node.path);
            }
            renderLibrary();
        });
        section.appendChild(toggle);

        if (expanded) {
            const children = document.createElement('div');
            children.className = 'tree-children';
            node.prompts.forEach(prompt => children.appendChild(createPromptButton(prompt, depth + 1)));
            node.children.forEach(child => children.appendChild(renderCategoryNode(child, depth + 1)));
            section.appendChild(children);
        }
        return section;
    }

    function countNodePrompts(node) {
        return node.prompts.length + node.children.reduce(
            (total, child) => total + countNodePrompts(child),
            0
        );
    }

    function createPromptButton(prompt, depth) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `prompt-item${prompt.id === state.selectedId ? ' selected' : ''}`;
        button.style.setProperty('--tree-depth', depth);
        button.title = prompt.description || prompt.title;
        button.addEventListener('click', () => selectPrompt(prompt.id));

        if (prompt.pinned) {
            const star = document.createElement('span');
            star.className = 'star';
            star.textContent = '★';
            star.setAttribute('aria-label', 'Pinned');
            button.appendChild(star);
        }
        button.appendChild(document.createTextNode(prompt.title));
        return button;
    }

    function selectPrompt(id) {
        state.selectedId = id;
        state.values = {};
        renderLibrary();
        renderDetail();
    }

    function selectedPrompt() {
        return state.prompts.find(prompt => prompt.id === state.selectedId) || null;
    }

    function renderDetail() {
        const prompt = selectedPrompt();
        elements.detail.hidden = !prompt;
        if (!prompt) return;

        elements.detailCategory.textContent = prompt.category;
        elements.detailTitle.textContent = prompt.title;
        elements.detailDescription.textContent = prompt.description;
        elements.pin.textContent = prompt.pinned ? '★' : '☆';
        elements.pin.title = prompt.pinned ? 'Unpin selected prompt' : 'Pin selected prompt';
        elements.pin.setAttribute('aria-label', elements.pin.title);

        elements.variables.replaceChildren();
        PromptTemplate.extractVariables(prompt.text).forEach(variable => {
            const row = document.createElement('div');
            row.className = 'variable-row';
            const label = document.createElement('label');
            const input = document.createElement('textarea');
            const inputId = `variable-${elements.variables.childElementCount}`;
            label.htmlFor = inputId;
            label.textContent = variable;
            input.id = inputId;
            input.value = state.values[variable] || '';
            input.placeholder = `Enter ${variable}...`;
            input.addEventListener('input', event => {
                state.values[variable] = event.target.value;
                renderCompletion();
            });
            row.append(label, input);
            elements.variables.appendChild(row);
        });
        renderCompletion();
    }

    function completion() {
        const prompt = selectedPrompt();
        return prompt ? PromptTemplate.substituteVariables(prompt.text, state.values) : { text: '', unfilled: [] };
    }

    function renderCompletion() {
        const completed = completion();
        elements.preview.textContent = completed.text;
        elements.warning.hidden = completed.unfilled.length === 0;
        elements.warning.textContent = completed.unfilled.length
            ? `Missing: ${completed.unfilled.join(', ')}`
            : '';
    }

    function requireCompletedPrompt() {
        const prompt = selectedPrompt();
        if (!prompt) {
            setStatus('Select a prompt first.', 'warning');
            return null;
        }
        const completed = completion();
        if (completed.unfilled.length) {
            setStatus(`Fill in: ${completed.unfilled.join(', ')}.`, 'warning');
            return null;
        }
        return completed.text;
    }

    async function toggleSelectedPin() {
        const prompt = selectedPrompt();
        if (!prompt) return setStatus('Select a prompt first.', 'warning');
        const pinned = !prompt.pinned;
        try {
            state.prompts = await ExtensionLibrary.setPromptPinned(
                chrome.storage.local,
                state.prompts,
                prompt.id,
                pinned
            );
            renderLibrary();
            renderDetail();
            setStatus(pinned ? 'Prompt pinned.' : 'Prompt unpinned.', 'success');
        } catch (error) {
            setStatus('Unable to save the favorite. Try again.', 'error');
        }
    }

    async function insertSelectedPrompt() {
        const text = requireCompletedPrompt();
        if (text === null) return;

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !Number.isInteger(tab.id)) throw new Error('No active tab is available.');
            const [execution] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: PromptInsertion.insertPromptIntoPage,
                args: [text]
            });
            const result = execution && execution.result;
            if (!result || !result.ok) {
                await copyText(text);
                setStatus(`${result?.reason || 'Insertion failed'} Copied instead.`, 'warning');
                return;
            }
            setStatus(`Inserted into ${result.method}.`, 'success');
        } catch (error) {
            await copyText(text);
            setStatus('This page blocked insertion. Copied instead.', 'warning');
        }
    }

    async function copySelectedPrompt() {
        const text = requireCompletedPrompt();
        if (text === null) return;
        const copied = await copyText(text);
        setStatus(copied ? 'Completed prompt copied.' : 'Clipboard access was blocked.', copied ? 'success' : 'error');
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            const area = document.createElement('textarea');
            area.value = text;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            const copied = document.execCommand('copy');
            area.remove();
            return copied;
        }
    }

    async function importFile(event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;

        try {
            const result = ExtensionLibrary.importLibrary(await file.text(), state.prompts);
            if (result.fatalError) throw new Error(result.fatalError);
            state.prompts = await ExtensionLibrary.saveLibrary(chrome.storage.local, result.prompts);
            ExtensionLibrary.categoryPaths(state.prompts).forEach(path => state.expandedCategories.add(path));
            renderCategories();
            renderLibrary();
            const details = [];
            if (result.issues.length) details.push(`${result.issues.length} malformed skipped`);
            if (result.conflicts.length) details.push(`${result.conflicts.length} existing IDs skipped`);
            setStatus(`Imported ${result.added.length} prompts${details.length ? `; ${details.join(', ')}` : ''}.`, details.length ? 'warning' : 'success');
        } catch (error) {
            setStatus(error.message, 'error');
        }
    }

    function exportLibrary() {
        try {
            const envelope = PromptTransfer.createExportEnvelope(state.prompts);
            const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'prompt_workspace_extension_backup.json';
            link.click();
            URL.revokeObjectURL(url);
            setStatus('Prompt library exported.', 'success');
        } catch (error) {
            setStatus(error.message, 'error');
        }
    }

    function setStatus(message, type) {
        elements.status.textContent = message;
        elements.status.className = `status ${type || ''}`;
    }
})();



