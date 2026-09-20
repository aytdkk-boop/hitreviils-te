// modal.js — окно активации, проверка ключа, ID
(function() {
  'use strict';

  // ⚠️ ЗАМЕНИТЕ НА СВОЙ ДОМЕН
  const API_URL = 'https://bot-1789760003-5226-lilos457.bothost.tech';

  const modalOverlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('modal');
  const keyInput = document.getElementById('keyInput');
  const activateBtn = document.getElementById('activateBtn');
  const errorMsg = document.getElementById('errorMsg');
  const mainContent = document.getElementById('mainContent');

  let isKeyCorrect = false;
  let lastCheckedKey = '';
  let isChecking = false;

  // ===== ПОКАЗ / СКРЫТИЕ КНОПОК ИНТЕРФЕЙСА =====
  function showUIButtons() {
    document.querySelectorAll('.bottom-btn').forEach(function(btn) {
      btn.classList.add('visible');
      btn.style.opacity = '';
      btn.style.pointerEvents = '';
    });
  }

  function hideUIButtons() {
    document.querySelectorAll('.bottom-btn').forEach(function(btn) {
      btn.classList.remove('visible');
      btn.style.opacity = '';
      btn.style.pointerEvents = '';
    });
  }

  // ===== ГЕНЕРАЦИЯ 6-ЗНАЧНОГО ID =====
  function generateSiteId() {
    let id = '';
    for (let i = 0; i < 6; i++) {
      id += Math.floor(Math.random() * 10).toString();
    }
    return id;
  }

  function getOrCreateSiteId() {
    try {
      let id = localStorage.getItem('hitrevil_site_id');
      if (!id || id.length !== 6) {
        id = generateSiteId();
        localStorage.setItem('hitrevil_site_id', id);
      }
      return id;
    } catch (e) {
      return generateSiteId();
    }
  }

  // ===== ПРОВЕРКА КЛЮЧА ЧЕРЕЗ API =====
  async function checkKeyOnServer(key) {
    try {
      isChecking = true;
      const siteId = getOrCreateSiteId();
      const response = await fetch(API_URL + '/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim(), site_id: siteId })
      });
      return await response.json();
    } catch (err) {
      console.error('Ошибка проверки ключа:', err);
      return { valid: false, reason: 'network_error' };
    } finally {
      isChecking = false;
    }
  }

  // ===== ОБРАБОТКА ВВОДА КЛЮЧА =====
  keyInput.addEventListener('input', async function() {
    const value = this.value.trim();
    errorMsg.classList.remove('show');

    if (value.length < 16) {
      this.classList.remove('correct', 'wrong');
      activateBtn.classList.remove('visible');
      isKeyCorrect = false;
      return;
    }

    if (value === lastCheckedKey || isChecking) return;
    lastCheckedKey = value;

    const result = await checkKeyOnServer(value);

    if (result.valid) {
      isKeyCorrect = true;
      this.classList.remove('wrong');
      this.classList.add('correct');
      activateBtn.classList.add('visible');
      errorMsg.classList.remove('show');

      try {
        localStorage.setItem('hitrevil_pending_key', value);
        localStorage.setItem('hitrevil_pending_expires', result.expires_at || '');
      } catch (e) {}
    } else if (result.reason === 'already_used' && result.site_id) {
      try {
        localStorage.setItem('hitrevil_activated', 'true');
        localStorage.setItem('hitrevil_site_id', result.site_id);
        localStorage.setItem('hitrevil_key', value);
        if (result.expires_at) {
          localStorage.setItem('hitrevil_key_expires', result.expires_at);
        }
      } catch (e) {}

      isKeyCorrect = false;
      this.classList.remove('wrong');
      this.classList.add('correct');
      activateBtn.classList.remove('visible');
      errorMsg.classList.remove('show');

      setTimeout(function() {
        modal.classList.add('fade-out');
        modalOverlay.classList.add('hidden');
        setTimeout(function() {
          showUIButtons();
          mainContent.classList.add('active');
          if (window.onSiteActivated) window.onSiteActivated();
          startExpiryWatcher();
        }, 300);
      }, 400);
    } else {
      isKeyCorrect = false;
      this.classList.remove('correct');
      activateBtn.classList.remove('visible');
      this.classList.add('wrong');

      if (result.reason === 'already_used') {
        errorMsg.textContent = 'Этот ключ уже был активирован';
      } else if (result.reason === 'expired') {
        errorMsg.textContent = 'Срок действия ключа истёк';
      } else if (result.reason === 'not_found') {
        errorMsg.textContent = 'Неверный ключ доступа';
      } else {
        errorMsg.textContent = 'Ошибка проверки. Попробуйте снова';
      }
      errorMsg.classList.add('show');
    }
  });

  // ===== АКТИВАЦИЯ =====
  activateBtn.addEventListener('click', function() {
    if (!isKeyCorrect) return;

    try {
      localStorage.setItem('hitrevil_activated', 'true');
      localStorage.setItem('hitrevil_activated_at', new Date().toISOString());
      localStorage.setItem('hitrevil_key', keyInput.value.trim());

      const pendingExpires = localStorage.getItem('hitrevil_pending_expires');
      if (pendingExpires) {
        localStorage.setItem('hitrevil_key_expires', pendingExpires);
      }
      localStorage.removeItem('hitrevil_pending_key');
      localStorage.removeItem('hitrevil_pending_expires');
    } catch (e) {}

    modal.classList.add('fade-out');
    modalOverlay.classList.add('hidden');
    setTimeout(function() {
      showUIButtons();
      mainContent.classList.add('active');
      if (window.onSiteActivated) window.onSiteActivated();
      startExpiryWatcher();
    }, 300);
  });

  // ===== ПРОВЕРКА АКТИВАЦИИ ЧЕРЕЗ API ПРИ ЗАХОДЕ =====
  async function checkActivationOnStart() {
    let localActivated = false;
    let localKey = '';
    let siteId = '';

    try {
      localActivated = localStorage.getItem('hitrevil_activated') === 'true';
      localKey = localStorage.getItem('hitrevil_key') || '';
      siteId = localStorage.getItem('hitrevil_site_id') || '';
    } catch (e) {}

    if (!localActivated || !localKey) return false;

    try {
      const response = await fetch(API_URL + '/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: localKey, site_id: siteId })
      });
      const result = await response.json();

      if (result.valid || result.reason === 'already_used') {
        if (result.expires_at) {
          try {
            localStorage.setItem('hitrevil_key_expires', result.expires_at);
          } catch (e) {}
        }
        return true;
      }

      try {
        localStorage.removeItem('hitrevil_activated');
        localStorage.removeItem('hitrevil_key');
        localStorage.removeItem('hitrevil_key_expires');
      } catch (e) {}

      if (window.hideKeyCard) window.hideKeyCard();
      return false;
    } catch (err) {
      return localActivated;
    }
  }

  // ===== АВТОПЕРЕЗАГРУЗКА ЗА 2 МИНУТЫ ДО ИСТЕЧЕНИЯ =====
  let expiryWatcherStarted = false;

  function startExpiryWatcher() {
    if (expiryWatcherStarted) return;
    expiryWatcherStarted = true;

    setInterval(function() {
      let activated = false;
      let expiresAt = '';

      try {
        activated = localStorage.getItem('hitrevil_activated') === 'true';
        expiresAt = localStorage.getItem('hitrevil_key_expires') || '';
      } catch (e) {}

      if (!activated || !expiresAt) return;

      try {
        let s = String(expiresAt).trim();
        let normalized = s.replace(' ', 'T');
        if (!normalized.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(normalized)) {
          normalized += 'Z';
        }
        const expiry = new Date(normalized);
        if (isNaN(expiry.getTime())) return;

        const TWO_MINUTES = 2 * 60 * 1000;
        const now = Date.now();

        if (now >= (expiry.getTime() - TWO_MINUTES)) {
          try {
            localStorage.removeItem('hitrevil_activated');
            localStorage.removeItem('hitrevil_key');
            localStorage.removeItem('hitrevil_key_expires');
            localStorage.removeItem('hitrevil_activated_at');
            localStorage.removeItem('hitrevil_pending_key');
            localStorage.removeItem('hitrevil_pending_expires');
          } catch (e) {}
          location.reload();
        }
      } catch (e) {}
    }, 15000);
  }

  // ===== ЭКСПОРТ В ГЛОБАЛЬНУЮ ОБЛАСТЬ =====
  window.API_URL = API_URL;
  window.getOrCreateSiteId = getOrCreateSiteId;
  window.isKeyActivated = checkActivationOnStart;
  window.showUIButtons = showUIButtons;
  window.hideUIButtons = hideUIButtons;
  window.startExpiryWatcher = startExpiryWatcher;

  // ===== ЗАДЕРЖКА ПРИ ЗАХОДЕ =====
  async function bootWithDelay() {
    let localActivated = false;
    try {
      localActivated = localStorage.getItem('hitrevil_activated') === 'true';
    } catch (e) {}

    if (localActivated) {
      modalOverlay.classList.add('hidden');
    }

    const activationPromise = checkActivationOnStart();

    const [isActive] = await Promise.all([
      activationPromise,
      new Promise(r => setTimeout(r, 3000))
    ]);

    if (isActive) {
      showUIButtons();
      mainContent.classList.add('active');
      if (window.onSiteActivated) window.onSiteActivated();
      startExpiryWatcher();
    } else {
      hideUIButtons();
      modalOverlay.classList.remove('hidden');
      modal.classList.remove('fade-out');
      activateBtn.classList.remove('visible');
      keyInput.value = '';
      keyInput.classList.remove('correct', 'wrong');
      errorMsg.classList.remove('show');
      lastCheckedKey = '';
      isKeyCorrect = false;
    }
  }

  setTimeout(bootWithDelay, 100);

})();