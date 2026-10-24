# AGENTS.md

Technical notes and DOM learnings for AI coding agents working on this repository.

## Project Overview

This repository contains a Chrome Extension (Manifest V3) that automatically selects a user-configured Gemini model and thinking effort level on `https://gemini.google.com/*`.

### Files
- `manifest.json` — Manifest V3 configuration (`storage` permission, popup action, content script on `https://gemini.google.com/*`).
- `content.js` — Content script that observes the Gemini UI and enforces the selected model and thinking effort.
- `popup.html` / `popup.js` — Extension popup UI with free-text inputs and quick-select chips stored in `chrome.storage.local`.
- `.github/workflows/release.yml` — GitHub Actions pipeline that packages the extension as a single `gemini-model-picker-chrome.zip` artifact and creates a GitHub Release on every push to `main`.

## Gemini DOM Learnings (`gemini.google.com`)

1. **Mode Picker Button (`button[data-test-id="bard-mode-menu-button"]`):**
   - Located inside `<bard-mode-switcher>`.
   - Displays the currently selected model in `.picker-primary-text` (e.g. `Argon`, `Flash-Lite`, `3.1 Pro`) and the thinking effort in `.picker-secondary-text` (e.g. `Hoch` / `High`, `Mittel` / `Medium`).
   - **Important:** When thinking effort is set to `Niedrig` (`Low`), `.picker-secondary-text` is empty (`""`). To prevent infinite re-enforcement loops when `Niedrig` is selected (or when a model does not support thinking effort), `content.js` tracks `lastVerifiedSignature` after applying the setting.

2. **Menu & Submenu Architecture (`<gem-menu>` instead of `.cdk-overlay-container`):**
   - Gemini no longer renders the mode switcher items inside the global `.cdk-overlay-container`.
   - Instead, clicking `button[data-test-id="bard-mode-menu-button"]` sets `aria-expanded="true"` and mounts `<gem-menu data-test-id="gem-mode-menu" role="menu">` inside `<bard-mode-switcher>`.
   - While `aria-expanded="false"`, `<gem-menu>` is not in the DOM (`querySelectorAll('gem-menu-item').length === 0`).
   - Once the main menu is opened (`aria-expanded="true"`), **both** the main model items (`gem-menu-item[data-mode-id]`) and the thinking effort submenu items (`<div popover="manual" class="cdk-overlay-popover">...<div class="submenu-container"><gem-menu>...`) are mounted in the DOM simultaneously.
   - Each item is a `<gem-menu-item role="menuitem">` with its title inside `.label` and its active state indicated by the `.selected` class.

3. **Stealth Menu Switching:**
   - During automated clicks, `content.js` injects a temporary `<style id="argon-high-stealth">` targeting `bard-mode-switcher gem-menu, bard-mode-switcher .cdk-overlay-popover, .cdk-overlay-container` with `opacity: 0 !important; pointer-events: none !important;` so the user never sees the menu flash.
   - If the user opens the menu manually (`picker.getAttribute('aria-expanded') === 'true'`), `content.js` does not interfere.

## Security & Privacy Guidelines

- This is a **public repository**. Never commit personal paths, local machine identifiers, session tokens, account IDs, or private URLs.
- Keep all selectors generic and language-resilient (supporting both German and English UI labels such as `Hoch`/`High`, `Mittel`/`Medium`, `Niedrig`/`Low`).
