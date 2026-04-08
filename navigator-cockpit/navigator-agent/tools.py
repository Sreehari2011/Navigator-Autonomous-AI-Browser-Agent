import logging
import asyncio
import os
import re

async def navigate_to_url(page, url):
    try:
        sanitized_url = url.strip().strip('"').strip("'")
        if not sanitized_url.startswith("http"):
            sanitized_url = f"https://{sanitized_url}"
        logging.info(f"🔨 TOOL: Navigate | URL: {sanitized_url}")
        await page.goto(sanitized_url, wait_until="networkidle", timeout=30000)
        return f"Successfully navigated to {sanitized_url}"
    except Exception as e:
        return f"Error navigating to {url}: {e}"

async def click_element(page, target_data):
    try:
        role = target_data.get("role")
        name = target_data.get("name")
        logging.info(f"🔨 TOOL: Click | Role: {role}, Name: {name}")
        
        locator = page.get_by_role(role, name=name).first
        if await locator.count() == 0:
            locator = page.get_by_text(name, exact=False).first
            
        if await locator.count() > 0:
            await locator.click(timeout=5000)
            return f"Clicked element '{name}'"
        return f"Error: Element '{name}' not found"
    except Exception as e:
        return f"Click Error: {e}"

async def type_element(page, target_data):
    try:
        role = target_data.get("role")
        name = target_data.get("name")
        value = target_data.get("value", "")
        logging.info(f"🔨 TOOL: Type | Name: {name}, Value: {value}")
        
        locator = page.get_by_role(role, name=name).first
        if await locator.count() == 0:
            locator = page.get_by_text(name, exact=False).first
            
        if await locator.count() > 0:
            await locator.fill(value, timeout=5000)
            await page.keyboard.press("Enter")
            return f"Typed '{value}' into '{name}' and pressed Enter"
        return f"Error: Input '{name}' not found"
    except Exception as e:
        return f"Type Error: {e}"

async def extract_content(page, target_data):
    """
    Extracts text. Smartly targets main content if no specific element is provided.
    """
    try:
        role = target_data.get("role")
        name = target_data.get("name")
        
        # --- SMART WHOLE PAGE EXTRACTION ---
        if not role and not name:
            logging.info("🔨 TOOL: Extract | Target: Smart Page Scan")
            
            content = ""
            for selector in ["main", "article", "#content", "#main", "body"]:
                try:
                    if await page.locator(selector).count() > 0:
                        content = await page.inner_text(selector)
                        if len(content) > 200:
                            logging.info(f"   -> Extracted from <{selector}>")
                            break
                except: continue
            
            if not content:
                content = await page.inner_text("body")

            # 2. Clean up the text (remove excessive whitespace)
            clean_text = re.sub(r'\n\s*\n', '\n\n', content.strip())
            
            # 3. Return a large chunk (e.g., 20k chars) to the LLM
            preview = clean_text[:200].replace('\n', ' ')
            logging.info(f"✅ Extracted {len(clean_text)} chars. Preview: {preview}...")
            
            return f"PAGE CONTENT:\n{clean_text[:20000]}" 
            
        # --- SPECIFIC ELEMENT EXTRACTION ---
        logging.info(f"🔨 TOOL: Extract | Name: {name}")
        locator = page.get_by_role(role, name=name).first
        if await locator.count() == 0:
            locator = page.get_by_text(name, exact=False).first
            
        if await locator.count() > 0:
            text = await locator.inner_text()
            return f"EXTRACTED FROM '{name}': {text}"
        return f"Error: Element '{name}' not found"

    except Exception as e:
        return f"Extract Error: {e}"

async def hover_element(page, target_data):
    try:
        name = target_data.get("name")
        role = target_data.get("role")
        logging.info(f"🔨 TOOL: Hover | Name: {name}")
        locator = page.get_by_role(role, name=name).first
        if await locator.count() > 0:
            await locator.hover()
            return f"Hovered over '{name}'"
        return f"Error: Element '{name}' not found"
    except Exception as e:
        return f"Hover Error: {e}"

async def scroll_page(page, direction="down"):
    try:
        logging.info(f"🔨 TOOL: Scroll | {direction}")
        if direction == "down": await page.evaluate("window.scrollBy(0, window.innerHeight)")
        elif direction == "up": await page.evaluate("window.scrollBy(0, -window.innerHeight)")
        elif direction == "top": await page.evaluate("window.scrollTo(0, 0)")
        elif direction == "bottom": await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        return f"Scrolled {direction}"
    except Exception as e:
        return f"Scroll Error: {e}"

async def press_key(page, key="Enter"):
    try:
        logging.info(f"🔨 TOOL: Press Key | {key}")
        await page.keyboard.press(key)
        return f"Pressed key '{key}'"
    except Exception as e:
        return f"Key Error: {e}"

async def go_back(page, _=None):
    try:
        logging.info("🔨 TOOL: Go Back")
        await page.go_back()
        return "Navigated back"
    except Exception as e:
        return f"Go Back Error: {e}"

async def refresh_page(page, _=None):
    try:
        logging.info("🔨 TOOL: Refresh")
        await page.reload()
        return "Page refreshed"
    except Exception as e:
        return f"Refresh Error: {e}"

async def select_option(page, target_data):
    try:
        name = target_data.get("name")
        value = target_data.get("value")
        logging.info(f"🔨 TOOL: Select | Name: {name}, Value: {value}")
        
        locator = page.get_by_role("combobox", name=name).first
        if await locator.count() == 0:
             locator = page.get_by_text(name, exact=False).first

        if await locator.count() > 0:
            await locator.select_option(label=value)
            return f"Selected '{value}' in '{name}'"
        return f"Error: Dropdown '{name}' not found"
    except Exception as e:
        return f"Select Error: {e}"

async def file_upload(page, target_data):
    try:
        name = target_data.get("name")
        path = target_data.get("value")
        logging.info(f"🔨 TOOL: Upload | Name: {name}, Path: {path}")
        
        if not os.path.exists(path):
            return f"Error: File {path} not found locally."

        locator = page.get_by_role("button", name=name).first
        if await locator.count() == 0:
             locator = page.get_by_text(name, exact=False).first

        if await locator.count() > 0:
            async with page.expect_file_chooser() as fc_info:
                await locator.click()
            file_chooser = await fc_info.value
            await file_chooser.set_files(path)
            return f"Uploaded file to '{name}'"
        return f"Error: Upload element '{name}' not found"
    except Exception as e:
        return f"Upload Error: {e}"

async def execute_script(page, script):
    try:
        logging.info("🔨 TOOL: Execute JS")
        res = await page.evaluate(script)
        return f"JS Result: {res}"
    except Exception as e:
        return f"JS Error: {e}"
    
async def get_url(page, _=None):
    """Returns the current active URL of the browser."""
    try:
        url = page.url
        logging.info(f"🔨 TOOL: Get URL | {url}")
        return f"Current URL: {url}"
    except Exception as e:
        return f"Error getting URL: {e}"