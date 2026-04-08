(function() {
    // --- 1. CLEANUP PHASE ---
    document.querySelectorAll('[data-pe-uid]').forEach(el => {
        el.removeAttribute('data-pe-uid');
    });

    const interactiveItems = [];
    const textBlocks = [];
    const seenElements = new Set();
    const usedUIDs = new Set();
    let uidCounter = 0;

    // --- UTILS ---
    function isVisible(el) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               style.opacity !== '0' &&
               rect.width > 5 && rect.height > 5;
    }

    function getAccName(el) {
        const tagName = el.tagName.toLowerCase();

        if (tagName === 'mat-select') {
            const formField = el.closest('mat-form-field');
            if (formField) {
                const label = formField.querySelector('mat-label')?.innerText;
                const value = el.querySelector('.mat-select-value-text')?.innerText;

                if (label && value) {
                    return `${label.trim()}: ${value.trim()}`;
                }
                if (label) {
                    return label.trim();
                }
            }
        }
        let name = el.getAttribute('aria-label') ||
               el.getAttribute('name') ||
               el.getAttribute('title') ||
               el.getAttribute('placeholder') ||
               el.querySelector('.mat-select-value-text')?.innerText ||
               el.innerText?.trim().slice(0, 100) ||
               "Unnamed Element";
        if (!name && el.tagName.toLowerCase() === 'mat-select') {
            const val = el.querySelector('.mat-select-value-text')?.innerText;
            return val ? val : "Dropdown";
        }
        return name;
    }

    function getElementState(el) {
        const state = [];
        const isChecked = el.checked ||
                          el.getAttribute('aria-checked') === 'true' ||
                          el.getAttribute('aria-selected') === 'true' ||
                          el.classList.contains('mat-checkbox-checked') ||
                          el.classList.contains('mat-radio-checked') ||
                          el.classList.contains('mat-selected');

        if (isChecked) state.push("CHECKED");
        if (el.getAttribute('aria-expanded') === 'true') state.push("EXPANDED");
        if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled')) state.push("DISABLED");
        if (el.value && el.value.length > 0 && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
            state.push("HAS_TEXT");
        }
        return state.join(", ");
    }

    function isDescendantOfInteractive(el) {
        let parent = el.parentElement;
        while (parent) {
            if (seenElements.has(parent)) {
                return true;
            }
            parent = parent.parentElement;
        }
        return false;
    }

    function isInteractive(el) {
        if (el.disabled === true || el.getAttribute('aria-disabled') === 'true') return false;
        if (el.classList.contains('disabled') || el.classList.contains('mat-select-disabled')) return false;

        const tagName = el.tagName.toLowerCase();
        const role = el.getAttribute('role');
        const style = window.getComputedStyle(el);
        const hasPointer = style.cursor === 'pointer';

        if (['button', 'a', 'input', 'select', 'textarea', 'details', 'summary'].includes(tagName)) return true;
        if (['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'listbox', 'combobox', 'option'].includes(role)) return true;
        if (tagName.startsWith('mat-')) return true;
        if (hasPointer) {
             if (el.className.includes && (el.className.includes('btn') || el.className.includes('button'))) return true;
            return true;
        }
        return false;
    }

    function assignUniqueUID(el) {
        let uid;
        do {
            uid = `pe-${uidCounter++}`;
        } while (usedUIDs.has(uid));
        el.setAttribute('data-pe-uid', uid);
        usedUIDs.add(uid);
        return uid;
    }

    // --- PASS 1: IDENTIFY INTERACTIVE ELEMENTS ---
    document.querySelectorAll('*').forEach(el => {
        const tagName = el.tagName.toLowerCase();
        if (['html', 'head', 'script', 'style', 'meta', 'link', 'noscript', 'br', 'hr', 'ul'].includes(tagName)) return;
        if (!isVisible(el)) return;

        if (isInteractive(el)) {
            if (isDescendantOfInteractive(el)) return;

            const isNativeAtomic = ['button', 'a', 'input', 'select', 'textarea'].includes(tagName);
            const isCustomComponent = tagName.startsWith('mat-');
            if (tagName === 'mat-select') {
            } else if (!isNativeAtomic && !isCustomComponent) {
                if (el.querySelector('button, input, select, a, [role="button"], textarea')) {
                     return;
                }
            }

            const uid = assignUniqueUID(el);
            seenElements.add(el);
            const stateStr = getElementState(el);

            interactiveItems.push({
                uid: uid,
                role: el.getAttribute('role') || el.tagName.toLowerCase(),
                name: getAccName(el),
                selector: `[data-pe-uid="${uid}"]`,
                state: stateStr,
            });
        }
    });

    // --- PASS 2: CAPTURE REMAINING TEXT (CONTEXT TEXT) ---
    function traverseForText(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (text.length > 5) {
                const parent = node.parentElement;
                if (parent && isVisible(parent) && !parent.hasAttribute('data-pe-uid')) {
                    let ancestor = parent;
                    let isInsideInteractive = false;
                    while(ancestor) {
                        if (ancestor.hasAttribute && ancestor.hasAttribute('data-pe-uid')) {
                            isInsideInteractive = true;
                            break;
                        }
                        ancestor = ancestor.parentElement;
                    }

                    if (!isInsideInteractive) {
                        textBlocks.push(text);
                    }
                }
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (['script', 'style'].includes(node.tagName.toLowerCase())) return;
            node.childNodes.forEach(child => traverseForText(child));
        }
    }

    traverseForText(document.body);

    return {
        url: window.location.href,
        title: document.title,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        elements: interactiveItems,
        page_text: [...new Set(textBlocks)]
    };
})();