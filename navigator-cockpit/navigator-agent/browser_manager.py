import logging
import asyncio
from playwright.async_api import async_playwright

class BrowserManager:
    """Manages Playwright browser lifecycle with network interception"""
    
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self.client = None
        self.ui_client = None

    async def start(self, headless=True):
        """Starts the Playwright browser and creates a context."""
        logging.info("Initializing Playwright browser...")
        self.playwright = await async_playwright().start()
        
        launch_args = [
            "--start-maximized", 
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--exclude-switches=enable-automation"
        ]
        
        self.browser = await self.playwright.chromium.launch(
            headless=headless,
            args=launch_args
        )
        
        self.context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            ignore_https_errors=True,
            java_script_enabled=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        
        
        self.page = await self.context.new_page()
        logging.info("Browser started successfully")
        return self.page
    
    def start_tracing(self, ui_client):
        """Starts a background task to stream browser view to UI."""
        self.ui_client = ui_client
        asyncio.create_task(self._init_cdp_screencast())
        
    async def _init_cdp_screencast(self):
        """Initializes the CDP session and starts the screencast."""
        try:
            # 1. Create a raw CDP session with the page
            self.client = await self.context.new_cdp_session(self.page)
            
            # 2. Define the frame handler
            async def on_screencast_frame(event):
                try:
                    data = event.get("data")
                    session_id = event.get("sessionId")
                    
                    # Send to UI asynchronously
                    if self.ui_client:
                        asyncio.create_task(self.ui_client.send_screenshot(data))
                    
                    # Acknowledge the frame to Chrome
                    if self.client:
                        await self.client.send("Page.screencastFrameAck", {"sessionId": session_id})
                        
                except Exception as e:
                    logging.error(f"Frame handling error: {e}")

            # 3. Hook up the listener
            self.client.on("Page.screencastFrame", on_screencast_frame)

            # 4. Start the Screencast
            await self.client.send("Page.startScreencast", {
                "format": "jpeg",
                "quality": 60,
                "maxWidth": 1024, 
                "everyNthFrame": 1 
            })
            
            logging.info("CDP High-Performance Screencast Active")
            
        except Exception as e:
            logging.error(f"Failed to start CDP Screencast: {e}")

    async def stop(self):
        """Closes the browser and cleans up CDP connections."""
        logging.info("Stopping browser...")
        if self.client:
            try:
                await self.client.send("Page.stopScreencast")
                await self.client.detach()
            except Exception as e:
                logging.warning(f"Error detaching CDP: {e}")
        if self.page:
            await self.page.close()
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()