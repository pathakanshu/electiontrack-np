# /// script
# dependencies = [
#   "playwright",
#   "aiohttp",
# ]
# ///

import asyncio
import json
import os
import re
from pathlib import Path

import aiohttp
from playwright.async_api import async_playwright

# Configuration
URL = "https://app.hamropatro.com/election/parties"
PROJECT_ROOT = Path(__file__).parent.parent
CACHE_DIR = PROJECT_ROOT / "public/cache/symbols"
MAPPING_FILE = PROJECT_ROOT / "public/cache/2082/symbols.json"


async def download_image(session, url, path):
    try:
        async with session.get(url) as response:
            if response.status == 200:
                content = await response.read()
                with open(path, "wb") as f:
                    f.write(content)
                return True
    except Exception as e:
        print(f"Error downloading {url}: {e}")
    return False


async def main():
    print(f"Launching browser to scrape {URL}...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False
        )  # Headless=False to see what's happening if needed
        page = await browser.new_page()

        # Go to page and wait for network idle to ensure dynamic content loads
        await page.goto(URL, wait_until="networkidle")

        # Wait a bit more for client-side hydration
        await page.wait_for_timeout(3000)

        # Heuristic extraction: Look for grid items or lists containing images and text
        # Adjust selectors based on inspection of the rendered page
        print("Extracting party data...")

        # This script evaluates in the browser context to find party/symbol pairs
        extracted_data = await page.evaluate("""() => {
            const results = [];

            // Common container selectors for grid items (adjust if structure is known)
            // Looking for generic structure: an image followed/preceded by text in a container
            const allElements = document.querySelectorAll('div, li, a');

            allElements.forEach(el => {
                // Check if element is likely a card (has distinct border/shadow or specific classes - heuristic)
                const style = window.getComputedStyle(el);
                if (el.tagName === 'DIV' && (style.boxShadow !== 'none' || style.borderWidth !== '0px')) {
                    const img = el.querySelector('img');
                    const textEl = el.innerText;

                    if (img && img.src && textEl) {
                        // Clean up text
                        const lines = textEl.split('\\n').map(s => s.trim()).filter(s => s.length > 0);
                        if (lines.length > 0) {
                            // Assume the longest line or first line is the party name
                            const name = lines[0];
                            if (name.length > 2 && name.length < 100) {
                                results.push({ name: name, src: img.src });
                            }
                        }
                    }
                }
            });

            // Deduplicate by name
            const unique = {};
            results.forEach(r => unique[r.name] = r.src);
            return Object.entries(unique).map(([k, v]) => ({ name: k, src: v }));
        }""")

        print(f"Found {len(extracted_data)} potential candidates.")

        if len(extracted_data) == 0:
            print("No data found. The page structure might be different than expected.")
            print("Dumping page content for inspection...")
            # Optional: save page content to debug
            # with open("debug_page.html", "w") as f: f.write(await page.content())

        await browser.close()

        # Load existing mapping
        existing_symbols = []
        if MAPPING_FILE.exists():
            with open(MAPPING_FILE, "r") as f:
                existing_symbols = json.load(f)

        # Build lookup maps
        name_to_id = {s["symbolName"]: s["symbolId"] for s in existing_symbols}
        # Determine next available ID (start from 3000 to avoid conflicts with official IDs)
        existing_ids = [s["symbolId"] for s in existing_symbols]
        next_id = 3000
        if existing_ids:
            max_id = max(existing_ids)
            if max_id >= 3000:
                next_id = max_id + 1

        # Ensure cache directory exists
        os.makedirs(CACHE_DIR, exist_ok=True)

        async with aiohttp.ClientSession() as session:
            for item in extracted_data:
                name = item["name"]
                src = item["src"]

                # Filter out likely UI garbage
                if "Hamro Patro" in name or "Login" in name or "Menu" in name:
                    continue

                symbol_id = name_to_id.get(name)

                if not symbol_id:
                    print(f"➕ New party: {name} -> ID {next_id}")
                    symbol_id = next_id
                    name_to_id[name] = symbol_id
                    existing_symbols.append({"symbolId": symbol_id, "symbolName": name})
                    next_id += 1
                else:
                    print(f"🔄 Updating: {name} -> ID {symbol_id}")

                # Download image
                # We force .jpg extension as that's what the app expects
                target_path = CACHE_DIR / f"{symbol_id}.jpg"

                success = await download_image(session, src, target_path)
                if success:
                    print(f"   ✅ Saved to {target_path}")
                else:
                    print(f"   ❌ Failed to download {src}")

        # Save updated mapping
        with open(MAPPING_FILE, "w") as f:
            json.dump(existing_symbols, f, indent=2, ensure_ascii=False)

        print(
            f"\nDone. Updated {MAPPING_FILE} with {len(existing_symbols)} total symbols."
        )


if __name__ == "__main__":
    if not os.path.exists("node_modules"):
        print("Note: You might need to install playwright browsers first:")
        print("uv run playwright install chromium")

    asyncio.run(main())
