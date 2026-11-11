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
   - Displays the currently selected model in `.picker-primary-text` (or directly inside `[data-test-id="logo-pill-label-container"]` when no secondary thinking level is active) and the thinking effort in `.picker-secondary-text` (e.g. `Hoch` / `High`, `Mittel` / `Medium`).
   - **Important:** When thinking effort is set to `Niedrig` (`Low`), or when the button label displays a task category (such as `Code und Analyse`) instead of the model code name (`4 Argon`), `content.js` tracks `lastVerifiedSignature` after verifying/applying the setting so it never enters an infinite open/close loop.

2. **Menu & Submenu Architecture (`<gem-menu>` instead of `.cdk-overlay-container`):**
   - Clicking `button[data-test-id="bard-mode-menu-button"]` sets `aria-expanded="true"` and mounts `<gem-menu data-test-id="gem-mode-menu" role="menu">` inside `<bard-mode-switcher>` (within `.cdk-overlay-popover`).
   - While `aria-expanded="false"`, `<gem-menu>` is not in the DOM (`querySelectorAll('gem-menu-item').length === 0`).
   - Model items use `<gem-menu-item role="menuitemradio">` (or `role="menuitem"`), where:
     - `.label` contains the task description (e.g. `Code und Analyse`, `Sehr komplexe Aufgaben`, `Vielseitige Unterstützung`, `Schnellinfo`).
     - `.sublabel` contains the actual model name (e.g. `4 Argon`, `4 Carbon`, `3.6 Flash`, `3.5 Flash-Lite`).
     - `data-mode-id` / `data-test-id` also carries identifiers such as `data-mode-id="argon"` and `data-test-id="bard-mode-option-argon"`.
   - Therefore, model matching **must** inspect `.label`, `.sublabel`, `data-mode-id`, and `data-test-id` together rather than `.label` alone.
   - Active state is indicated by `.selected`, `aria-checked="true"`, or a child check icon (`[fonticon="check"]`). Disabled/locked items have `aria-disabled="true"` or a lock icon (`[fonticon="lock"]`).

3. **Stealth Menu Switching:**
   - During automated clicks, `content.js` injects a temporary `<style id="argon-high-stealth">` targeting `bard-mode-switcher gem-menu, bard-mode-switcher gem-popover, bard-mode-switcher .cdk-overlay-popover, .cdk-overlay-container` with `opacity: 0 !important; pointer-events: none !important;` so the user never sees the menu flash.
   - If the user opens the menu manually (`picker.getAttribute('aria-expanded') === 'true'`), `content.js` does not interfere.

## Security & Privacy Guidelines

- This is a **public repository**. Never commit personal paths, local machine identifiers, session tokens, account IDs, or private URLs.
- Keep all selectors generic and language-resilient (supporting both German and English UI labels such as `Hoch`/`High`, `Mittel`/`Medium`, `Niedrig`/`Low`).
