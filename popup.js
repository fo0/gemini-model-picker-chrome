const DEFAULT_SETTINGS = {
  enabled: true,
  modelText: 'Argon',
  effortText: 'Hoch'
};

const enabledEl = document.getElementById('enabled');
const modelInput = document.getElementById('modelText');
const effortInput = document.getElementById('effortText');
const statusEl = document.getElementById('status');

let statusTimeout = null;
let saveDebounce = null;

function showSavedStatus() {
  statusEl.classList.add('visible');
  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    statusEl.classList.remove('visible');
  }, 1400);
}

function saveSettings() {
  const settings = {
    enabled: enabledEl.checked,
    modelText: modelInput.value.trim(),
    effortText: effortInput.value.trim()
  };
  chrome.storage.local.set(settings, () => {
    showSavedStatus();
  });
}

function scheduleSave() {
  if (saveDebounce) clearTimeout(saveDebounce);
  saveDebounce = setTimeout(saveSettings, 200);
}

chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
  enabledEl.checked = Boolean(items.enabled);
  modelInput.value = items.modelText ?? DEFAULT_SETTINGS.modelText;
  effortInput.value = items.effortText ?? DEFAULT_SETTINGS.effortText;
});

enabledEl.addEventListener('change', saveSettings);
modelInput.addEventListener('input', scheduleSave);
effortInput.addEventListener('input', scheduleSave);

document.querySelectorAll('#modelChips .chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    modelInput.value = btn.dataset.value || '';
    saveSettings();
  });
});

document.querySelectorAll('#effortChips .chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    effortInput.value = btn.dataset.value || '';
    saveSettings();
  });
});
