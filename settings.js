// settings.js — настройки, ID, контейнер с ключом, автосохранение
(function() {
  'use strict';

  const settingsToggle = document.getElementById('settingsToggle');
  const settingsPage = document.getElementById('settingsPage');
  const settingsBackBtn = document.getElementById('settingsBackBtn');
  const autoSaveToggle = document.getElementById('autoSaveToggle');
  const siteIdValue = document.getElementById('siteIdValue');
  const mainContent = document.getElementById('mainContent');
  const modalOverlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('modal');

  const keyCard = document.getElementById('keyCard');
  const keyCardField = document.getElementById('keyCardField');
  const keyCardExpires = document.getElementById('keyCardExpires');
  const keyCardDeleteBtn = document.getElementById('keyCardDeleteBtn');

  const confirmOverlay = document.getElementById('confirmOverlay');
  const confirmYesBtn = document.getElementById('confirmYesBtn');
  const confirmNoBtn = document.getElementById('confirmNoBtn');

  const keyInput = document.getElementById('keyInput');
  const activateBtn = document.getElementById('activateBtn');
  const errorMsg = document.getElementById('errorMsg');

  let autoSaveEnabled = false;

  // ===== ЗАГРУЗКА СОХРАНЁННЫХ НАСТРОЕК =====
  try {
    const saved = localStorage.getItem('hitrevil_autosave');
    if (saved === 'true') {
      autoSaveEnabled = true;
      autoSaveToggle.checked = true;
    }
  } catch (e) {}

  // ===== ФОРМАТИРОВАНИЕ ДАТЫ =====
  function formatDateTime(isoStr) {
    try {
      let s = String(isoStr).trim();

      if (s.includes('T') && (s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s))) {
        const dt = new Date(s);
        if (!isNaN(dt.getTime())) return formatLocal(dt);
      }

      let normalized = s.replace(' ', 'T');
      if (!normalized.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(normalized)) {
        normalized += 'Z';
      }
      const dt = new Date(normalized);
      if (isNaN(dt.getTime())) return isoStr;
      return formatLocal(dt);
    } catch (e) {
      return isoStr;
    }
  }

  function formatLocal(dt) {
    const pad = n => n < 10 ? '0' + n : '' + n;
    return pad(dt.getDate()) + '.' + pad(dt.getMonth() + 1) + '.' + dt.getFullYear() +
           ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
  }

  // ===== ОБНОВЛЕНИЕ ID =====
  function updateSiteIdDisplay() {
    try {
      const id = localStorage.getItem('hitrevil_site_id');
      if (id && siteIdValue) {
        siteIdValue.textContent = id;
      } else if (siteIdValue) {
        siteIdValue.textContent = '—';
      }
    } catch (e) {}
  }

  // ===== ПОКАЗ КОНТЕЙНЕРА С КЛЮЧОМ =====
  function showKeyCard(key, expiresAt) {
    if (!keyCard) return;
    keyCardField.textContent = key || '—';
    if (expiresAt) {
      keyCardExpires.textContent = formatDateTime(expiresAt);
    } else {
      keyCardExpires.textContent = '—';
    }
    keyCard.classList.remove('hidden');
  }

  function hideKeyCard() {
    if (!keyCard) return;
    keyCard.classList.add('hidden');
  }

  function updateKeyCardFromStorage() {
    try {
      const activated = localStorage.getItem('hitrevil_activated') === 'true';
      const key = localStorage.getItem('hitrevil_key') || '';
      const expiresAt = localStorage.getItem('hitrevil_key_expires') || '';

      if (activated && key) {
        showKeyCard(key, expiresAt);
      } else {
        hideKeyCard();
      }
    } catch (e) {
      hideKeyCard();
    }
  }

  // ===== ОТКРЫТИЕ НАСТРОЕК =====
  settingsToggle.addEventListener('click', function() {
    mainContent.classList.remove('active');
    settingsToggle.style.opacity = '0';
    settingsToggle.style.pointerEvents = 'none';
    setTimeout(function() {
      settingsPage.classList.add('active');
      updateSiteIdDisplay();
      updateKeyCardFromStorage();
    }, 200);
  });

  // ===== ЗАКРЫТИЕ НАСТРОЕК =====
  settingsBackBtn.addEventListener('click', function() {
    settingsPage.classList.remove('active');
    setTimeout(function() {
      mainContent.classList.add('active');
      settingsToggle.style.opacity = '';
      settingsToggle.style.pointerEvents = '';
    }, 300);
  });

  // ===== ПОЛЗУНОК АВТОСОХРАНЕНИЯ =====
  autoSaveToggle.addEventListener('change', function() {
    autoSaveEnabled = this.checked;
    try {
      localStorage.setItem('hitrevil_autosave', autoSaveEnabled ? 'true' : 'false');
    } catch (e) {}
    window.autoSaveEnabled = autoSaveEnabled;
  });

  window.autoSaveEnabled = autoSaveEnabled;

  // ===== УДАЛЕНИЕ КЛЮЧА =====
  keyCardDeleteBtn.addEventListener('click', function() {
    confirmOverlay.classList.add('active');
  });

  confirmNoBtn.addEventListener('click', function() {
    confirmOverlay.classList.remove('active');
  });

  confirmYesBtn.addEventListener('click', async function() {
    confirmOverlay.classList.remove('active');

    setTimeout(function() {
      hideKeyCard();
    }, 100);

    setTimeout(async function() {
      // ⚠️ ВАЖНО: ЧИТАЕМ ключ ДО очистки localStorage
      const key = localStorage.getItem('hitrevil_key') || '';

      // Отправляем уведомление об удалении ключа на API
      if (key && window.API_URL) {
        try {
          const response = await fetch(window.API_URL + '/api/notify_deleted', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key })
          });
          const result = await response.json();
          console.log('📤 Уведомление об удалении:', result);
        } catch (e) {
          console.warn('Не удалось отправить уведомление:', e);
        }
      }

      // ⚠️ ТОЛЬКО ПОСЛЕ отправки — очищаем localStorage
      try {
        localStorage.removeItem('hitrevil_activated');
        localStorage.removeItem('hitrevil_key');
        localStorage.removeItem('hitrevil_key_expires');
        localStorage.removeItem('hitrevil_activated_at');
        localStorage.removeItem('hitrevil_pending_key');
        localStorage.removeItem('hitrevil_pending_expires');
      } catch (e) {}

      // Перезагружаем страницу — после перезагрузки покажется окно активации
      location.reload();
    }, 500);
  });

  // ===== ЭКСПОРТ В ГЛОБАЛЬНУЮ ОБЛАСТЬ =====
  window.updateSiteIdDisplay = updateSiteIdDisplay;
  window.hideKeyCard = hideKeyCard;
  window.updateKeyCardFromStorage = updateKeyCardFromStorage;
  window.formatDateTime = formatDateTime;

  updateKeyCardFromStorage();

})();