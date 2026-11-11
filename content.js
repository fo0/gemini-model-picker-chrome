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
    'bard-mode-switcher gem-menu-item',
    '[data-test-id="gem-mode-menu"] gem-menu-item',
    '.cdk-overlay-popover gem-menu-item',
    'gem-menu-item[role="menuitemradio"]',
    'gem-menu-item[role="menuitem"]',
    '.cdk-overlay-container [role="menuitem"]',
    '.cdk-overlay-container [role="menuitemradio"]'
  ].join(', ');

  let settings = { ...DEFAULT_SETTINGS };
  let isRunning = false;
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

    const modelMatches =
      !modelRegex || modelRegex.test(primary) || modelRegex.test(ariaLabel) || modelRegex.test(fullText);

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
      fullText,
      ariaLabel
    ].join('|');

    return {
      modelMatches,
      effortMatches,
      primary,
      secondary,
      ariaLabel,
      fullText,
      signature
    };
  }

  function getItemSearchText(el) {
    const label = el.querySelector('.label')?.textContent || '';
    const sublabel = el.querySelector('.sublabel')?.textContent || '';
    const modeId = el.getAttribute('data-mode-id') || '';
    const testId = el.getAttribute('data-test-id') || '';
    const fallback = el.innerText || el.textContent || '';
    return [label, sublabel, modeId, testId, fallback]
      .join(' ')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isModelOptionElement(el) {
    if (el.getAttribute('data-test-id') === 'mode-picker-sign-in-button') return false;
    return (
      el.hasAttribute('data-mode-id') ||
      Boolean(el.getAttribute('data-test-id')?.startsWith('bard-mode-option'))
    );
  }

  function isItemSelected(el) {
    if (!el) return false;
    return (
      el.classList.contains('selected') ||
      el.getAttribute('aria-checked') === 'true' ||
      Boolean(el.querySelector('.selected, [fonticon="check"], [data-mat-icon-name="check"]'))
    );
  }

  function isItemDisabled(el) {
    if (!el) return true;
    return (
      el.getAttribute('aria-disabled') === 'true' ||
      el.classList.contains('disabled') ||
      Boolean(el.querySelector('.disabled, [fonticon="lock"], [data-mat-icon-name="lock"]'))
    );
  }

  function findModelMenuItem(regex) {
    if (!regex) return null;
    const items = Array.from(document.querySelectorAll(MENU_ITEM_SELECTOR));
    return (
      items.find((el) => isModelOptionElement(el) && regex.test(getItemSearchText(el))) ||
      items.find(
        (el) =>
          el.getAttribute('value') !== 'thinking_level' &&
          el.getAttribute('data-test-id') !== 'mode-picker-sign-in-button' &&
          regex.test(getItemSearchText(el))
      ) ||
      null
    );
  }

  function findEffortMenuItem(regex) {
    if (!regex) return null;
    const items = Array.from(document.querySelectorAll(MENU_ITEM_SELECTOR));
    return (
      items.find((el) => {
        if (isModelOptionElement(el)) return false;
        if (el.getAttribute('value') === 'thinking_level') return false;
        if (el.getAttribute('data-test-id') === 'mode-picker-sign-in-button') return false;
        const label = (el.querySelector('.label')?.textContent || '').replace(/\u00a0/g, ' ').trim();
        const sublabel = (el.querySelector('.sublabel')?.textContent || '').replace(/\u00a0/g, ' ').trim();
        const combined = `${label} ${sublabel}`.trim() || (el.innerText || el.textContent || '').trim();
        return regex.test(label) || regex.test(sublabel) || regex.test(combined);
      }) || null
    );
  }

  async function waitForItem(finderFn, timeout = 1000) {
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
          bard-mode-switcher gem-popover,
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
    while (Date.now() - start < 1000) {
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
      await sleep(60);
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
    if ((state.modelMatches && state.effortMatches) || state.signature === lastVerifiedSignature) {
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

        const modelItem = await waitForItem(() => findModelMenuItem(modelRegex), 800);
        if (modelItem && !isItemDisabled(modelItem)) {
          if (!isItemSelected(modelItem)) {
            modelItem.click();
            await sleep(200);
          }
        }
      }

      // 2. Gewünschten Denkaufwand auswählen, falls angegeben und noch nicht aktiv
      const currentPicker = getPickerButton();
      if (currentPicker && effortRegex) {
        const afterModelState = getPickerState(currentPicker);
        if (!afterModelState.effortMatches) {
          const opened = await ensureMenuOpen(currentPicker);
          if (opened) {
            let effortItem = await waitForItem(() => findEffortMenuItem(effortRegex), 350);
            if (!effortItem) {
              const effortTrigger =
                document.querySelector('gem-menu-item[value="thinking_level"]') ||
                Array.from(document.querySelectorAll(MENU_ITEM_SELECTOR)).find((el) =>
                  /^(denkaufwand|thinking effort|denkstufe|thinking level)$/i.test(
                    (el.querySelector('.label')?.textContent || '').trim()
                  )
                );
              if (effortTrigger && !isItemDisabled(effortTrigger)) {
                effortTrigger.click();
                await sleep(120);
                effortItem = await waitForItem(() => findEffortMenuItem(effortRegex), 400);
              }
            }
            if (effortItem && !isItemDisabled(effortItem) && !isItemSelected(effortItem)) {
              effortItem.click();
              await sleep(150);
            }
          }
        }
      }

      await closeMenuIfOpen();
    } finally {
      setStealthOverlay(false);
      // Nach Abschluss den aktuellen Button-Zustand als verifiziert speichern,
      // damit es niemals zu einer Endlosschleife (Auf-/Zu-Toggeln) kommt.
      const finalPicker = getPickerButton();
      if (finalPicker) {
        lastVerifiedSignature = getPickerState(finalPicker).signature;
      }
      isRunning = false;
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
        scheduleCheck(50);
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.enabled) settings.enabled = Boolean(changes.enabled.newValue);
        if (changes.modelText) settings.modelText = (changes.modelText.newValue || '').trim();
        if (changes.effortText) settings.effortText = (changes.effortText.newValue || '').trim();
        lastVerifiedSignature = '';
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
    if (state.signature === lastVerifiedSignature) return;

    if (!state.modelMatches || !state.effortMatches) {
      scheduleCheck(120);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  loadSettingsAndRun();
})();
