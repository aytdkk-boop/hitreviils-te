// modal.js — окно активации, проверка ключа, ID, слежение за истечением
(function() {
  'use strict';

  // ⚠️ ЗАМЕНИТЕ НА СВОЙ ДОМЕН
  const API_URL = 'bot-1792023605-8815-lilos457.bothost.tech';

  const modalOverlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('modal');
  const keyInput = document.getElementById('keyInput');
  const activateBtn = document.getElementById('activateBtn');
  const errorMsg = document.getElementById('errorMsg');
  const mainContent = document.getElementById('mainContent');

  let isKeyCorrect = false;
  let lastCheckedKey = '';
  let isChecking = false;

  let globalOffActive = false;

  // ===== ПОКАЗ / СКРЫТИЕ КНОПОК ИНТЕРФЕЙСА =====
  function showUIButtons() {
    document.querySelectorAll('.nav-btn').forEach(function(btn) {
      btn.classList.add('visible');
      btn.style.opacity = '';
      btn.style.pointerEvents = '';
    });
  }

  function hideUIButtons() {
    document.querySelectorAll('.nav-btn').forEach(function(btn) {
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

  // ===== ПРОВЕРКА КЛЮЧА ЧЕРЕЗ API (активация) =====
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
      // ===== НОВЫЙ КЛЮЧ =====
      isKeyCorrect = true;
      this.classList.remove('wrong');
      this.classList.add('correct');
      activateBtn.classList.add('visible');
      errorMsg.classList.remove('show');

      try {
        localStorage.setItem('hitrevil_pending_key', value);
        localStorage.setItem('hitrevil_pending_expires', result.expires_at || '');
      } catch (e) {}

    } else if (result.reason === 'already_used') {
      // ===== КЛЮЧ УЖЕ АКТИВИРОВАН =====
      // Проверяем: тот же это site_id или другое устройство?
      let currentSiteId = '';
      try {
        currentSiteId = localStorage.getItem('hitrevil_site_id') || '';
      } catch (e) {}

      const serverSiteId = result.site_id || '';

      // === ЧУЖОЕ УСТРОЙСТВО → ключ уже используется ===
      if (serverSiteId && currentSiteId && serverSiteId !== currentSiteId) {
        isKeyCorrect = false;
        this.classList.remove('correct');
        this.classList.add('wrong');
        activateBtn.classList.remove('visible');
        errorMsg.textContent = 'Ключ уже используется';
        errorMsg.classList.add('show');
        return;
      }

      // === ТО ЖЕ УСТРОЙСТВО → восстанавливаем доступ ===
      try {
        localStorage.setItem('hitrevil_activated', 'true');
        if (serverSiteId) {
          localStorage.setItem('hitrevil_site_id', serverSiteId);
        }
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
          startKeyCheck();
        }, 300);
      }, 400);

    } else {
      // ===== ОШИБКА =====
      isKeyCorrect = false;
      this.classList.remove('correct');
      activateBtn.classList.remove('visible');
      this.classList.add('wrong');

      if (result.reason === 'expired') {
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
      startKeyCheck();
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

  // ===== ПЕРЕЗАГРУЗКА В МОМЕНТ ИСТЕЧЕНИЯ КЛЮЧА =====
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

        const now = Date.now();

        if (now >= expiry.getTime()) {
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
    }, 5000);
  }

  // ===== ПЕРИОДИЧЕСКАЯ ПРОВЕРКА КЛЮЧА НА СЕРВЕРЕ =====
let keyCheckInterval = null;

function startKeyCheck() {
  if (keyCheckInterval) return;

  keyCheckInterval = setInterval(async function() {
    if (document.hidden) return;

    let activated = false;
    let localKey = '';
    let siteId = '';

    try {
      activated = localStorage.getItem('hitrevil_activated') === 'true';
      localKey = localStorage.getItem('hitrevil_key') || '';
      siteId = localStorage.getItem('hitrevil_site_id') || '';
    } catch (e) {}

    if (!activated || !localKey) return;

    try {
      const response = await fetch(API_URL + '/api/check', {
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
        return;
      }

      try {
        localStorage.removeItem('hitrevil_activated');
        localStorage.removeItem('hitrevil_key');
        localStorage.removeItem('hitrevil_key_expires');
        localStorage.removeItem('hitrevil_activated_at');
      } catch (e) {}

      location.reload();
    } catch (err) {}
  }, 5000);
}

// ===== ПРОВЕРКА ГЛОБАЛЬНОГО ЗАПУСКА =====
  async function checkGlobalLaunch() {
    if (!window.API_URL) return;

    // Проверяем, админ ли это
    let admin = false;
    let me = null;
    const key = localStorage.getItem('hitrevil_key') || '';
    if (key) {
      try {
        const resp = await fetch(API_URL + '/api/me', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: key })
        });
        if (resp.ok) {
          me = await resp.json();
          admin = !!me.is_admin;
        }
      } catch (e) {}
    }

    // ===== АДМИН: никогда не показываем заглушку =====
    if (admin) {
      hideGlobalOff();

      const activated = localStorage.getItem('hitrevil_activated') === 'true';
      if (activated) {
        showUIButtons();
        mainContent.classList.add('active');
        if (window.onSiteActivated) window.onSiteActivated();
      } else {
        hideUIButtons();
        modalOverlay.classList.remove('hidden');
        modal.classList.remove('fade-out');
      }
      return;
    }

    // ===== ОБЫЧНЫЙ ПОЛЬЗОВАТЕЛЬ =====
    // Решает персональный флаг me.access_disabled.
    // Если у Пети персонально запрещено — заглушка.
    // Если разрешено — работает, даже если глобально всё выключено.
    try {
      if (me && me.access_disabled === true) {
        showGlobalOff();
        return;
      }

      hideGlobalOff();
    } catch (err) {}
  }

function showGlobalOff() {
    if (globalOffActive) return;
    globalOffActive = true;

    // Показываем окошко ВМЕСТО формы активации
    modalOverlay.classList.add('hidden');
    modal.classList.add('fade-out');

    // Скрываем главную страницу
    const mc = document.getElementById('mainContent');
    if (mc) mc.classList.remove('active');

    let overlay = document.getElementById('globalOffActivationOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'globalOffActivationOverlay';
      overlay.className = 'global-off-overlay';
      overlay.innerHTML = `
        <div class="global-off-modal">
          <div class="global-off-text">HITREVIL - временно недоступен.</div>
          <div class="global-off-subtext">Зайдите через несколько минут!</div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    requestAnimationFrame(function() {
      overlay.classList.add('active');
    });
}

  function hideGlobalOff() {
    if (!globalOffActive) return;
    globalOffActive = false;

    const overlay = document.getElementById('globalOffActivationOverlay');
    if (overlay) overlay.classList.remove('active');

    // Возвращаем форму активации, если пользователь ещё не активирован
    let activated = false;
    try {
      activated = localStorage.getItem('hitrevil_activated') === 'true';
    } catch (e) {}

    if (!activated) {
      modalOverlay.classList.remove('hidden');
      modal.classList.remove('fade-out');
    } else {
      // Пользователь активирован — показываем главную
      const mc = document.getElementById('mainContent');
      if (mc) mc.classList.add('active');
    }
  }

  function hideAccessDenied() {
    const overlay = document.getElementById('accessDeniedOverlay');
    if (overlay) overlay.classList.remove('active');
  }

// ===== АВТО-ПОДХВАТ ВЫДАННОГО КЛЮЧА =====
let autoKeyCheckInterval = null;

function startAutoKeyCheck() {
  if (autoKeyCheckInterval) return;

  autoKeyCheckInterval = setInterval(async function() {
    if (document.hidden) return;

    let activated = false;
    try {
      activated = localStorage.getItem('hitrevil_activated') === 'true';
    } catch (e) {}
    if (activated) return;

    let siteId = '';
    try {
      siteId = localStorage.getItem('hitrevil_site_id') || '';
    } catch (e) {}

    if (!siteId) return;

    try {
      const resp = await fetch(API_URL + '/api/check-auto-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: siteId })
      });
      if (!resp.ok) return;

      const data = await resp.json();
      if (!data.has_key || !data.key) return;

      const newKey = String(data.key).trim();

      try {
        localStorage.setItem('hitrevil_activated', 'true');
        localStorage.setItem('hitrevil_activated_at', new Date().toISOString());
        localStorage.setItem('hitrevil_key', newKey);
        if (data.expires_at) {
          localStorage.setItem('hitrevil_key_expires', data.expires_at);
        }
      } catch (e) {}

      modal.classList.add('fade-out');
      modalOverlay.classList.add('hidden');

      setTimeout(function() {
        showUIButtons();
        mainContent.classList.add('active');
        if (window.onSiteActivated) window.onSiteActivated();
        startExpiryWatcher();
        startKeyCheck();

        if (autoKeyCheckInterval) {
          clearInterval(autoKeyCheckInterval);
          autoKeyCheckInterval = null;
        }
      }, 300);
    } catch (err) {}
  }, 4000);
}

  // ===== ЭКСПОРТ В ГЛОБАЛЬНУЮ ОБЛАСТЬ =====
  window.API_URL = API_URL;
  window.getOrCreateSiteId = getOrCreateSiteId;
  window.isKeyActivated = checkActivationOnStart;
  window.showUIButtons = showUIButtons;
  window.hideUIButtons = hideUIButtons;
  window.startExpiryWatcher = startExpiryWatcher;
  window.startKeyCheck = startKeyCheck;

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
      new Promise(r => setTimeout(r, 2000))
    ]);

    if (isActive) {
      // ===== ПРОВЕРКА ПЕРЕД ПОКАЗОМ ГЛАВНОЙ =====
      await checkGlobalLaunch();

      const overlay = document.getElementById('globalOffActivationOverlay');
      const isBlocked = overlay && overlay.classList.contains('active');

      if (!isBlocked) {
        showUIButtons();
        mainContent.classList.add('active');
        if (window.onSiteActivated) window.onSiteActivated();
        startExpiryWatcher();
        startKeyCheck();
      }
      
      // Таймер globalOffTimer убран — отслеживание изменений
      // делает main.js → checkGlobalSettings (каждые 5 сек).
    } else {
      // Нет ключа — проверяем глобальный запуск
      await checkGlobalLaunch();

      const overlay = document.getElementById('globalOffActivationOverlay');
      const isBlocked = overlay && overlay.classList.contains('active');

      if (!isBlocked) {
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

      startAutoKeyCheck();
    }
  }

  setTimeout(bootWithDelay, 100);

})();
