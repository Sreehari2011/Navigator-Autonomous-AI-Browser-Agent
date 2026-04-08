import logging
import os

try:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(current_dir)
    lib_path = os.path.join(project_root, '..', 'lib')
    JS_SCRIPT_PATH = os.path.join(lib_path, 'dom_discovery.js')

    if not os.path.exists(JS_SCRIPT_PATH):
        JS_SCRIPT_PATH = os.path.join(project_root, 'lib', 'dom_discovery.js')

    with open(JS_SCRIPT_PATH, 'r') as f:
        DOM_DISCOVERY_SCRIPT = f.read()
except Exception as e:
    logging.error(f"CRITICAL: Could not load dom_discovery.js. Fallback will fail. Error: {e}")
    DOM_DISCOVERY_SCRIPT = "() => ({ elements: [], page_text: [] })"

async def get_accessibility_tree(page):
    """
    Hybrid Perception Engine:
    Prioritizes Playwright's native Accessibility Tree for semantic accuracy.
    Falls back to a custom JS DOM scan if the native tree is empty or sparse,
    ensuring robustness on pages with non-standard HTML.
    """
    # 1. Native Accessibility Tree (High Precision / Semantic State)
    native_elements = []
    try:
        await page.wait_for_selector('body', timeout=2000)
        snapshot = await page.accessibility.snapshot(interesting_only=True)
        if snapshot:
            native_elements = _process_native_tree(snapshot)
    except Exception as e:
        logging.warning(f"Native AXTree snapshot failed: {e}. Relying on fallback.")

    # 2. Running the JS DOM Scan as a fallback/comparison
    dom_scan_elements = []
    try:
        data = await page.evaluate(DOM_DISCOVERY_SCRIPT)
        dom_scan_elements = data.get('elements', [])
    except Exception as e:
        logging.error(f"Fallback JS DOM discovery script failed: {e}")

    logging.info(f"PERCEPTION: Native AXTree found {len(native_elements)} elements. | JS DOM Scan found {len(dom_scan_elements)} elements.")

    # 3. Decision Logic
    if len(native_elements) > 5:
        logging.info("✅ Using Native AXTree as primary source.")
        return native_elements
    elif len(dom_scan_elements) > 0:
        logging.info("✅ Native AXTree was sparse. Using JS DOM Scan (Fallback) as primary source.")
        return dom_scan_elements
    else:
        logging.warning("⚠️ Both perception methods returned empty results. The agent may be blind to page elements.")
        return []


def _process_native_tree(snapshot):
    """Flattens Playwright's recursive accessibility tree into a linear list."""
    flat_tree = []

    def traverse(node):
        role = node.get("role", "generic")
        name = node.get("name", "").strip()

        # Filter out non-interactive or uninteresting roles
        if role in ["generic", "paragraph", "img", "statictext", "list"]:
             for child in node.get("children", []):
                traverse(child)
             return

        state_parts = []
        if node.get("checked") is True: state_parts.append("CHECKED")
        if node.get("expanded") is True: state_parts.append("EXPANDED")
        if node.get("disabled") is True: state_parts.append("DISABLED")

        is_interactive = role in [
            "button", "checkbox", "combobox", "link", "menuitem",
            "radio", "searchbox", "switch", "tab", "textbox", "listbox", "option", "treeitem"
        ]

        # Only add elements that are interactive and have a name
        if is_interactive and name:
            flat_tree.append({
                "role": role,
                "name": name,
                "state": ", ".join(state_parts),
            })

        for child in node.get("children", []):
            traverse(child)

    if snapshot:
        traverse(snapshot)
    return flat_tree