(() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    modelText: 'Argon',
    effortText: 'Hoch'
  };

  const PICKER_SELECTOR = [
    'button[data-test-id="bard-mode-menu-button"]',
    'bard-mode-switcher button[aria-haspopup="true"]',
    'bard-mode-switcher button.input-area-switch'
  ].join(', ');

  const MENU_ITEM_SELECTOR = [
    'gem-menu-item[role="menuitem"]',
    'bard-mode-switcher gem-menu-item',
    '[data-test-id="gem-mode-menu"] gem-menu-item',
    '.cdk-overlay-popover gem-menu-item',
    '.cdk-overlay-container [role="menuitem"]',
    '.cdk-overlay-container [role="menuitemradio"]'
  ].join(', ');

  let settings = { ...DEFAULT_SETTINGS };
  let isRunning = false;
  let retryCount = 0;
  let debounceTimer = null;
  let lastVerifiedSignature = '';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildMatcher(rawText, exactWord = false) {
    const cleaned = (rawText || '').trim();
    if (!cleaned) return null;

    // Unterstütze gängige Deutsch/Englisch-Synonyme für Denkaufwand automatisch
    if (/^(hoch|high)$/i.test(cleaned)) {
      return exactWord ? /^(hoch|high)\b/i : /\b(hoch|high)\b/i;
    }
    if (/^(mittel|medium)$/i.test(cleaned)) {
      return exactWord ? /^(mittel|medium)\b/i : /\b(mittel|medium)\b/i;
    }
    if (/^(niedrig|low)$/i.test(cleaned)) {
      return exactWord ? /^(niedrig|low)\b/i : /\b(niedrig|low)\b/i;
    }

    const pattern = escapeRegex(cleaned).replace(/\s+/g, '\\s+');
    return new RegExp(pattern, 'i');
  }

  function getPickerButton() {
    return document.querySelector(PICKER_SELECTOR);
  }

  function getPickerState(picker) {
    if (!picker) {
      return {
        modelMatches: false,
        effortMatches: false,
        signature: ''
      };
    }

    const primary = (picker.querySelector('.picker-primary-text')?.textContent || '').replace(/\u00a0/g, ' ').trim();
    const secondary = (picker.querySelector('.picker-secondary-text')?.textContent || '').replace(/\u00a0/g, ' ').trim();
    const ariaLabel = (picker.getAttribute('aria-label') || '').replace(/\u00a0/g, ' ').trim();
    const fullText = (picker.innerText || picker.textContent || '').replace(/\u00a0/g, ' ').trim();

    const modelRegex = buildMatcher(settings.modelText, false);
    const effortRegex = buildMatcher(settings.effortText, false);

    const modelMatches = !modelRegex || modelRegex.test(primary) || modelRegex.test(ariaLabel) || modelRegex.test(fullText);

    let effortMatches = false;
    if (!effortRegex) {
      effortMatches = true;
    } else if (effortRegex.test(secondary) || effortRegex.test(ariaLabel)) {
      effortMatches = true;
    }

    const signature = [
      location.pathname,
      settings.modelText.toLowerCase(),
      settings.effortText.toLowerCase(),
      primary,
      secondary,
      ariaLabel
    ].join('|');

    return {
      modelMatches,
      effortMatches,
      primary,
      secondary,
      ariaLabel,
      signature
    };
  }

  function findMenuItemByMatcher(regex, onlyModelOptions = false) {
    if (!regex) return null;
    const items = Array.from(document.querySelectorAll(MENU_ITEM_SELECTOR));
    return items.find((el) => {
      const isModelOption =
        el.hasAttribute('data-mode-id') || Boolean(el.getAttribute('data-test-id')?.startsWith('bard-mode-option'));
      if (onlyModelOptions && !isModelOption) return false;
      if (!onlyModelOptions && isModelOption && el !== items[0]) {
        // Für Effort-Einträge bevorzugen wir Nicht-Modell-Optionen, falls onlyModelOptions === false
      }
      const labelEl = el.querySelector('.label');
      const text = (labelEl ? labelEl.textContent : el.innerText || el.textContent || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return regex.test(text);
    });
  }

  function findEffortMenuItem(regex) {
    if (!regex) return null;
    const items = Array.from(document.querySelectorAll(MENU_ITEM_SELECTOR));
    return items.find((el) => {
      const isModelOption =
        el.hasAttribute('data-mode-id') || Boolean(el.getAttribute('data-test-id')?.startsWith('bard-mode-option'));
      if (isModelOption || el.getAttribute('value') === 'thinking_level') return false;
      const labelEl = el.querySelector('.label');
      const text = (labelEl ? labelEl.textContent : el.innerText || el.textContent || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return regex.test(text);
    });
  }

  async function waitForItem(finderFn, timeout = 1400) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const item = finderFn();
      if (item) return item;
      await sleep(30);
    }
    return null;
  }

  function setStealthOverlay(enabled) {
    let style = document.getElementById('argon-high-stealth');
    if (enabled) {
      if (!style) {
        style = document.createElement('style');
        style.id = 'argon-high-stealth';
        style.textContent = `
          bard-mode-switcher gem-menu,
          bard-mode-switcher .cdk-overlay-popover,
          .cdk-overlay-container {
            opacity: 0 !important;
            pointer-events: none !important;
          }
        `;
        document.head.appendChild(style);
      }
    } else if (style) {
      style.remove();
    }
  }

  async function ensureMenuOpen(picker) {
    if (!picker) return false;
    if (picker.getAttribute('aria-expanded') !== 'true') {
      picker.click();
    }
    const start = Date.now();
    while (Date.now() - start < 1200) {
      if (document.querySelectorAll(MENU_ITEM_SELECTOR).length > 0) {
        return true;
      }
      await sleep(25);
    }
    return false;
  }

  async function closeMenuIfOpen() {
    const picker = getPickerButton();
    if (picker && picker.getAttribute('aria-expanded') === 'true') {
      picker.click();
      await sleep(50);
    }
    const editor = document.querySelector('.ql-editor[contenteditable="true"], rich-textarea [contenteditable="true"]');
    if (editor) editor.focus();
  }

  async function enforceTargetSettings() {
    if (isRunning || !settings.enabled) return;
    if (!settings.modelText && !settings.effortText) return;

    const picker = getPickerButton();
    if (!picker || picker.getAttribute('aria-disabled') === 'true') return;

    // Nicht eingreifen, solange der Nutzer das Menü selbst geöffnet hat
    if (picker.getAttribute('aria-expanded') === 'true') return;

    const state = getPickerState(picker);
    if (state.modelMatches && (state.effortMatches || state.signature === lastVerifiedSignature)) {
      retryCount = 0;
      return;
    }

    isRunning = true;
    setStealthOverlay(true);

    try {
      const modelRegex = buildMatcher(settings.modelText, false);
      const effortRegex = buildMatcher(settings.effortText, true);

      // 1. Gewünschtes Modell auswählen, falls noch nicht aktiv
      if (modelRegex && !state.modelMatches) {
        const opened = await ensureMenuOpen(picker);
        if (!opened) return;

        const modelItem =
          (await waitForItem(() => findMenuItemByMatcher(modelRegex, true), 1200)) ||
          (await waitForItem(() => findMenuItemByMatcher(modelRegex, false), 400));

        if (modelItem) {
          if (!modelItem.classList.contains('selected')) {
            modelItem.click();
            await sleep(180);
          }
        } else {
          await closeMenuIfOpen();
          lastVerifiedSignature = getPickerState(getPickerButton()).signature;
          return;
        }
      }

      // 2. Gewünschten Denkaufwand auswählen, falls angegeben und noch nicht aktiv
      const currentPicker = getPickerButton();
      if (!currentPicker) return;

      const afterModelState = getPickerState(currentPicker);
      if (effortRegex && !afterModelState.effortMatches) {
        const opened = await ensureMenuOpen(currentPicker);
        if (opened) {
          let effortItem = await waitForItem(() => findEffortMenuItem(effortRegex), 500);
          if (!effortItem) {
            const effortTrigger =
              document.querySelector('gem-menu-item[value="thinking_level"]') ||
              (await waitForItem(() => findMenuItemByMatcher(/^(denkaufwand|thinking effort|denkstufe|thinking level)$/i, false), 400));
            if (effortTrigger) {
              effortTrigger.click();
              await sleep(120);
              effortItem = await waitForItem(() => findEffortMenuItem(effortRegex), 600);
            }
          }
          if (effortItem && !effortItem.classList.contains('selected')) {
            effortItem.click();
            await sleep(150);
          }
        }
      }

      await closeMenuIfOpen();

      const finalPicker = getPickerButton();
      if (finalPicker) {
        lastVerifiedSignature = getPickerState(finalPicker).signature;
      }
    } finally {
      setStealthOverlay(false);
      isRunning = false;

      const finalPicker = getPickerButton();
      const finalState = getPickerState(finalPicker);
      if (
        finalPicker &&
        (!finalState.modelMatches || (!finalState.effortMatches && finalState.signature !== lastVerifiedSignature)) &&
        retryCount < 4
      ) {
        retryCount++;
        scheduleCheck(250);
      } else {
        retryCount = 0;
      }
    }
  }

  function scheduleCheck(delay = 120) {
    if (!settings.enabled) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      enforceTargetSettings();
    }, delay);
  }

  function loadSettingsAndRun() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
        settings = {
          enabled: items.enabled ?? DEFAULT_SETTINGS.enabled,
          modelText: (items.modelText ?? DEFAULT_SETTINGS.modelText).trim(),
          effortText: (items.effortText ?? DEFAULT_SETTINGS.effortText).trim()
        };
        lastVerifiedSignature = '';
        retryCount = 0;
        scheduleCheck(50);
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.enabled) settings.enabled = Boolean(changes.enabled.newValue);
        if (changes.modelText) settings.modelText = (changes.modelText.newValue || '').trim();
        if (changes.effortText) settings.effortText = (changes.effortText.newValue || '').trim();
        lastVerifiedSignature = '';
        retryCount = 0;
        scheduleCheck(50);
      });
    } else {
      scheduleCheck(50);
    }
  }

  // Reagiere auf "Neuer Chat"-Klicks oder Navigation
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target.closest(
        'a[href*="/app"], [data-test-id="new-chat-button"], [data-test-id="expanded-button"], [aria-label*="Neuer Chat"], [aria-label*="New chat"]'
      );
      if (target) {
        lastVerifiedSignature = '';
        retryCount = 0;
        scheduleCheck(250);
      }
    },
    true
  );

  // Überwache DOM-Änderungen
  const observer = new MutationObserver(() => {
    if (isRunning || !settings.enabled) return;
    const picker = getPickerButton();
    if (!picker || picker.getAttribute('aria-expanded') === 'true') return;

    const state = getPickerState(picker);
    if (!state.modelMatches || (!state.effortMatches && state.signature !== lastVerifiedSignature)) {
      scheduleCheck(100);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  loadSettingsAndRun();
})();
