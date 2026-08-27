(function (global) {
    'use strict';

    function insertPromptIntoPage(text) {
        function isVisible(element) {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        }

        function isTextInput(element) {
            return element instanceof HTMLTextAreaElement ||
                (element instanceof HTMLInputElement && ['text', 'search'].includes(element.type));
        }

        function editableRoot(element) {
            if (!element) return null;
            if (isTextInput(element)) return element;
            if (element.isContentEditable) return element;
            return element.closest ? element.closest('[contenteditable]:not([contenteditable="false"])') : null;
        }

        function score(element) {
            const rect = element.getBoundingClientRect();
            const attributes = [
                element.getAttribute('aria-label'),
                element.getAttribute('placeholder'),
                element.getAttribute('data-placeholder'),
                element.getAttribute('name'),
                element.id,
                element.getAttribute('role')
            ].filter(Boolean).join(' ').toLowerCase();
            let value = rect.bottom / Math.max(window.innerHeight, 1);
            if (element instanceof HTMLTextAreaElement) value += 3;
            if (element.isContentEditable) value += 2;
            if (/message|prompt|chat|ask|composer/.test(attributes)) value += 4;
            return value;
        }

        function findEditor() {
            const focused = editableRoot(document.activeElement);
            if (focused && isVisible(focused) && !focused.disabled && !focused.readOnly) return focused;

            const candidates = Array.from(document.querySelectorAll(
                'textarea, input:not([type]), input[type="text"], input[type="search"], [contenteditable]'
            )).filter(element =>
                (isTextInput(element) || element.isContentEditable) &&
                isVisible(element) &&
                !element.disabled &&
                !element.readOnly
            );

            candidates.sort((left, right) => score(right) - score(left));
            return candidates[0] || null;
        }

        function setNativeValue(element, value) {
            let prototype = element;
            while (prototype) {
                const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
                if (descriptor && descriptor.set) {
                    descriptor.set.call(element, value);
                    return;
                }
                prototype = Object.getPrototypeOf(prototype);
            }
            element.value = value;
        }

        function dispatchInput(element, data) {
            let event;
            try {
                event = new InputEvent('input', { bubbles: true, inputType: 'insertText', data });
            } catch (error) {
                event = new Event('input', { bubbles: true });
            }
            element.dispatchEvent(event);
        }

        const editor = findEditor();
        if (!editor) return { ok: false, reason: 'No visible editable field was found.' };

        editor.focus();

        if (isTextInput(editor)) {
            const current = editor.value || '';
            const start = Number.isInteger(editor.selectionStart) ? editor.selectionStart : current.length;
            const end = Number.isInteger(editor.selectionEnd) ? editor.selectionEnd : start;
            const next = current.slice(0, start) + text + current.slice(end);
            setNativeValue(editor, next);
            if (editor.setSelectionRange) editor.setSelectionRange(start + text.length, start + text.length);
            dispatchInput(editor, text);
            return { ok: true, method: editor instanceof HTMLTextAreaElement ? 'textarea' : 'input' };
        }

        const selection = window.getSelection();
        if (!selection) return { ok: false, reason: 'The page selection API is unavailable.' };

        if (!selection.rangeCount || !editor.contains(selection.anchorNode)) {
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }

        let inserted = false;
        try {
            inserted = document.execCommand('insertText', false, text);
        } catch (error) {
            inserted = false;
        }

        if (!inserted) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            const node = document.createTextNode(text);
            range.insertNode(node);
            range.setStartAfter(node);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            dispatchInput(editor, text);
        }

        return { ok: true, method: 'contenteditable' };
    }

    global.PromptInsertion = Object.freeze({ insertPromptIntoPage });
})(window);

