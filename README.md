# Gemini Model & Effort Enforcer (Chrome Extension)

Chrome Extension (Manifest V3) that automatically selects your preferred model (e.g. **4 Argon**, **3.1 Pro**, **3.8 Flash**, **3.5 Flash-Lite**) and thinking effort level (e.g. **Hoch / High**, **Mittel / Medium**, **Niedrig / Low**) on [gemini.google.com](https://gemini.google.com).

## Features

- **Free-Text & Quick-Select Popup:** Click the extension icon in Chrome to enter any model name/substring and thinking effort level as free text, or use the one-click preset chips.
- **Instant Live Apply:** Changing settings in the popup immediately updates the active `gemini.google.com` tab without reloading.
- **Stealth Menu Switching:** Automatically selects the configured model and effort level in the background without visible menu flickering.
- **Enable / Disable Toggle:** Quickly pause or resume automatic selection from the popup.

## Installation

### From Releases (Recommended)
1. Download the latest `gemini-model-picker-chrome.zip` from the [Releases](https://github.com/fo0/gemini-model-picker-chrome/releases) page (or from the GitHub Actions workflow artifacts).
2. Extract the `.zip` archive into a folder on your computer.
3. Open Chrome and navigate to `chrome://extensions/`.
4. Enable **Developer mode** (*Entwicklermodus*) in the top-right corner.
5. Click **Load unpacked** (*Entpackte Erweiterung laden*) and select the extracted folder.

### From Source
1. Clone this repository:
   ```bash
   git clone https://github.com/fo0/gemini-model-picker-chrome.git
   ```
2. Open `chrome://extensions/`, enable **Developer mode**, click **Load unpacked**, and select the cloned repository directory.
