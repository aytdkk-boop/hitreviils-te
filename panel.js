// panel.js — админ-панель HITREVIL: активность, список пользователей, профиль
(function() {
  'use strict';

  // ===== ЭЛЕМЕНТЫ =====
  const burgerBtn     = document.getElementById('burgerBtn');
  const mainContent   = document.getElementById('mainContent');

  const panelScreen   = document.getElementById('panelScreen');
  const panelBackBtn  = document.getElementById('panelBackBtn');
  const usersCard     = document.getElementById('usersCard');
  const activeCount   = document.getElementById('activeCount');
  const inactiveCount = document.getElementById('inactiveCount');

  const usersListCard      = document.getElementById('usersListCard');
  const totalUsersCount    = document.getElementById('totalUsersCount');

  const usersScreen        = document.getElementById('usersScreen');
  const usersBackBtn       = document.getElementById('usersBackBtn');
  const usersScreenList    = document.getElementById('usersScreenList');
  const usersLoadMoreBtn   = document.getElementById('usersLoadMoreBtn');

  // Профиль пользователя
  const userScreen         = document.getElementById('userScreen');
  const userBackBtn        = document.getElementById('userBackBtn');
  const userScreenId       = document.getElementById('userScreenId');
  const userKeyCard        = document.getElementById('userKeyCard');
  const userKeyField       = document.getElementById('userKeyField');
  const userKeyExpires     = document.getElementById('userKeyExpires');
  const userRevokeBtn      = document.getElementById('userRevokeBtn');
  const userGrantBtn       = document.getElementById('userGrantBtn');

  // Тумблеры
  const userCameraToggle     = document.getElementById('userCameraToggle');
  const userKeyDeleteToggle  = document.getElementById('userKeyDeleteToggle');
  const userAutosaveToggle   = document.getElementById('userAutosaveToggle');
  const userThemeToggle      = document.getElementById('userThemeToggle');

  // Модалки
  const userRevokeOverlay  = document.getElementById('userRevokeOverlay');
  const userRevokeYesBtn   = document.getElementById('userRevokeYesBtn');
  const userRevokeNoBtn    = document.getElementById('userRevokeNoBtn');

  const userGrantOverlay   = document.getElementById('userGrantOverlay');
  const userGrantCancelBtn = document.getElementById('userGrantCancelBtn');

  if (!panelScreen) return;

  // ===== СОСТОЯНИЕ =====
  let panelOpen = false;
  let usersScreenOpen = false;
  let userScreenOpen = false;
  let refreshTimer = null;
  let statusesTimer = null;

  let isAdmin = false;

  let usersOffset = 0;
  const USERS_LIMIT = 20;
  let usersTotalWithKey = 0;
  let usersLoading = false;

  let currentUserTid = null;
  let currentUserData = null;

  // Флаг: сейчас применяем состояние тумблеров (чтобы не срабатывал change)
  let applyingToggles = false;

  // ===== ПРОВЕРКА ПРАВ =====
  async function checkAdmin() {
    if (!window.API_URL) return false;
    const key = localStorage.getItem('hitrevil_key') || '';
    if (!key) return false;

    try {
      const resp = await fetch(window.API_URL + '/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key })
      });
      if (!resp.ok) return false;
      const data = await resp.json();
      return !!data.is_admin;
    } catch (err) {
      console.warn('Не удалось проверить права:', err);
      return false;
    }
  }

  async function setupBurgerVisibility() {
    if (!burgerBtn) return;
    burgerBtn.style.display = 'none';
    isAdmin = await checkAdmin();
    if (isAdmin) burgerBtn.style.display = '';
  }

  window.addEventListener('load', function() {
    const activated = localStorage.getItem('hitrevil_activated') === 'true';
    if (activated) setupBurgerVisibility();
  });

  const origOnSiteActivated = window.onSiteActivated;
  window.onSiteActivated = function() {
    if (typeof origOnSiteActivated === 'function') origOnSiteActivated();
    setupBurgerVisibility();
  };

  // ===== ПАНЕЛЬ УПРАВЛЕНИЯ =====
  function openPanel() {
    if (!isAdmin || panelOpen) return;
    panelOpen = true;

    mainContent.classList.remove('active');

    setTimeout(function() {
      panelScreen.classList.add('active');
      setTimeout(function() {
        usersCard.classList.add('visible');
        usersListCard.classList.add('visible');
      }, 120);

      loadStats();
      refreshTimer = setInterval(loadStats, 15000);
    }, 250);
  }

  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;

    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }

    usersCard.classList.remove('visible');
    usersListCard.classList.remove('visible');
    panelScreen.classList.remove('active');

    setTimeout(function() {
      mainContent.classList.add('active');
    }, 300);
  }

  if (burgerBtn) burgerBtn.addEventListener('click', openPanel);
  if (panelBackBtn) panelBackBtn.addEventListener('click', closePanel);

  // ===== СТАТИСТИКА =====
  async function loadStats() {
    if (!window.API_URL) return;
    const key    = localStorage.getItem('hitrevil_key') || '';
    const siteId = localStorage.getItem('hitrevil_site_id') || '';
    if (!key) return;

    try {
      const resp = await fetch(window.API_URL + '/api/admin/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key, site_id: siteId })
      });
      if (!resp.ok) return;
      const data = await resp.json();

      activeCount.textContent   = Number(data.active_keys   ?? 0);
      inactiveCount.textContent = Number(data.inactive_keys ?? 0);
      if (data.total_users != null) {
        totalUsersCount.textContent = Number(data.total_users);
      }
    } catch (err) {
      console.warn('Не удалось получить статистику:', err);
    }
  }

  // ===== ЭКРАН СПИСКА ПОЛЬЗОВАТЕЛЕЙ =====
  if (usersListCard) usersListCard.addEventListener('click', openUsersScreen);
  if (usersBackBtn) usersBackBtn.addEventListener('click', closeUsersScreen);
  if (usersLoadMoreBtn) usersLoadMoreBtn.addEventListener('click', loadMoreUsers);

  function openUsersScreen() {
    if (!isAdmin || usersScreenOpen) return;
    usersScreenOpen = true;

    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    usersCard.classList.remove('visible');
    usersListCard.classList.remove('visible');
    panelScreen.classList.remove('active');

    setTimeout(function() {
      usersScreen.classList.add('active');

      usersOffset = 0;
      usersTotalWithKey = 0;
      usersScreenList.innerHTML = '';
      usersLoadMoreBtn.classList.remove('visible');

      loadUsersChunk();

      if (statusesTimer) clearInterval(statusesTimer);
      statusesTimer = setInterval(refreshStatuses, 15000);
    }, 350);
  }

  function closeUsersScreen() {
    if (!usersScreenOpen) return;
    usersScreenOpen = false;

    if (statusesTimer) { clearInterval(statusesTimer); statusesTimer = null; }

    usersScreen.classList.remove('active');

    setTimeout(function() {
      panelScreen.classList.add('active');
      setTimeout(function() {
        usersCard.classList.add('visible');
        usersListCard.classList.add('visible');
      }, 120);

      loadStats();
      if (!refreshTimer) refreshTimer = setInterval(loadStats, 15000);
    }, 300);
  }

  async function loadUsersChunk() {
    if (usersLoading) return;
    usersLoading = true;
    usersLoadMoreBtn.disabled = true;

    const key    = localStorage.getItem('hitrevil_key') || '';
    const siteId = localStorage.getItem('hitrevil_site_id') || '';

    try {
      const resp = await fetch(window.API_URL + '/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: key,
          site_id: siteId,
          limit: USERS_LIMIT,
          offset: usersOffset
        })
      });
      if (!resp.ok) { usersLoading = false; usersLoadMoreBtn.disabled = false; return; }

      const data = await resp.json();
      usersTotalWithKey = Number(data.total_with_key || 0);

      const users = Array.isArray(data.users) ? data.users : [];
      users.forEach(function(u, idx) {
        const el = createUserItem(u);
        usersScreenList.appendChild(el);
        setTimeout(function() { el.classList.add('visible'); }, 60 * idx + 30);
      });

      usersOffset += users.length;

      if (usersOffset < usersTotalWithKey && users.length > 0) {
        usersLoadMoreBtn.classList.add('visible');
      } else {
        usersLoadMoreBtn.classList.remove('visible');
      }
    } catch (err) {
      console.warn('Ошибка загрузки пользователей:', err);
    } finally {
      usersLoading = false;
      usersLoadMoreBtn.disabled = false;
    }
  }

  function loadMoreUsers() { loadUsersChunk(); }

  function createUserItem(u) {
    const item = document.createElement('div');
    item.className = 'user-item';
    item.dataset.telegramId = String(u.telegram_id);

    const dateEl = document.createElement('div');
    dateEl.className = 'user-item-date';
    dateEl.textContent = formatUserDate(u.activated_at);

    const idEl = document.createElement('div');
    idEl.className = 'user-item-id';
    idEl.textContent = u.site_id ? ('ID - ' + u.site_id) : '';

    const statusEl = document.createElement('span');
    statusEl.className = 'user-item-status blink';
    statusEl.textContent = u.is_active ? '🟢' : '🔴';

    item.appendChild(dateEl);
    if (u.site_id) item.appendChild(idEl);
    item.appendChild(statusEl);

    item.addEventListener('click', function() {
      openUserProfile(u.telegram_id);
    });

    return item;
  }

  // ===== ОБНОВЛЕНИЕ СТАТУСОВ =====
  async function refreshStatuses() {
    if (!window.API_URL || !usersScreenOpen) return;

    const items = usersScreenList.querySelectorAll('.user-item');
    if (!items.length) return;

    const ids = [];
    items.forEach(function(el) {
      const id = parseInt(el.dataset.telegramId, 10);
      if (!isNaN(id)) ids.push(id);
    });
    if (!ids.length) return;

    const key    = localStorage.getItem('hitrevil_key') || '';
    const siteId = localStorage.getItem('hitrevil_site_id') || '';

    try {
      const resp = await fetch(window.API_URL + '/api/admin/users/statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key, site_id: siteId, telegram_ids: ids })
      });
      if (!resp.ok) return;

      const data = await resp.json();
      const statuses = data.statuses || {};

      items.forEach(function(el) {
        const id = parseInt(el.dataset.telegramId, 10);
        if (isNaN(id)) return;

        const active = !!statuses[id] || statuses[String(id)] === true;
        const statusEl = el.querySelector('.user-item-status');
        if (!statusEl) return;

        const newEmoji = active ? '🟢' : '🔴';
        if (statusEl.textContent !== newEmoji) statusEl.textContent = newEmoji;
      });
    } catch (err) {
      console.warn('Не удалось обновить статусы:', err);
    }
  }

  // ===== ЭКРАН ПРОФИЛЯ ПОЛЬЗОВАТЕЛЯ =====
  if (userBackBtn) userBackBtn.addEventListener('click', closeUserProfile);
  if (userRevokeBtn) userRevokeBtn.addEventListener('click', showRevokeModal);
  if (userGrantBtn) userGrantBtn.addEventListener('click', showGrantModal);

  // Обработчики тумблеров
  if (userCameraToggle)    userCameraToggle.addEventListener('change', onCameraToggle);
  if (userKeyDeleteToggle) userKeyDeleteToggle.addEventListener('change', onKeyDeleteToggle);
  if (userAutosaveToggle)  userAutosaveToggle.addEventListener('change', onAutosaveToggle);
  if (userThemeToggle)     userThemeToggle.addEventListener('change', onThemeToggle);

  // Модалки
  if (userRevokeYesBtn) userRevokeYesBtn.addEventListener('click', confirmRevoke);
  if (userRevokeNoBtn) userRevokeNoBtn.addEventListener('click', function() {
    userRevokeOverlay.classList.remove('active');
  });
  if (userGrantCancelBtn) userGrantCancelBtn.addEventListener('click', function() {
    userGrantOverlay.classList.remove('active');
  });

  if (userGrantOverlay) {
    userGrantOverlay.querySelectorAll('.duration-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        confirmGrant(btn.dataset.duration);
      });
    });
  }

  async function openUserProfile(telegramId) {
    if (!isAdmin || userScreenOpen) return;
    userScreenOpen = true;
    currentUserTid = telegramId;

    if (statusesTimer) { clearInterval(statusesTimer); statusesTimer = null; }
    usersScreen.classList.remove('active');

    setTimeout(function() {
      userScreen.classList.add('active');
      loadUserProfile(telegramId);
    }, 300);
  }

  function closeUserProfile() {
    if (!userScreenOpen) return;
    userScreenOpen = false;
    currentUserTid = null;
    currentUserData = null;

    userScreen.classList.remove('active');
    userKeyCard.classList.remove('visible');

    setTimeout(function() {
      usersScreen.classList.add('active');
      usersOffset = 0;
      usersTotalWithKey = 0;
      usersScreenList.innerHTML = '';
      usersLoadMoreBtn.classList.remove('visible');
      loadUsersChunk();

      if (statusesTimer) clearInterval(statusesTimer);
      statusesTimer = setInterval(refreshStatuses, 15000);
    }, 300);
  }

  async function loadUserProfile(telegramId) {
    const key    = localStorage.getItem('hitrevil_key') || '';
    const siteId = localStorage.getItem('hitrevil_site_id') || '';

    try {
      const resp = await fetch(window.API_URL + '/api/admin/user/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: key,
          site_id: siteId,
          telegram_id: telegramId
        })
      });
      if (!resp.ok) return;

      const data = await resp.json();
      currentUserData = data;
      renderUserProfile(data);
    } catch (err) {
      console.warn('Ошибка загрузки профиля:', err);
    }
  }

  function renderUserProfile(data) {
    userScreenId.textContent = data.site_id || '—';

    const keyTitle = userKeyCard.querySelector('.user-key-card-title');
    const keyExpiresWrap = userKeyCard.querySelector('.user-key-expires');

    if (data.key && data.is_active) {
      if (keyTitle) keyTitle.style.display = '';
      if (keyExpiresWrap) keyExpiresWrap.style.display = '';

      userKeyField.style.display = '';
      userKeyField.textContent = data.key;
      userKeyExpires.textContent = formatExpires(data.expires_at);

      userRevokeBtn.style.display = '';
      userGrantBtn.style.display = 'none';
    } else {
      if (keyTitle) keyTitle.style.display = 'none';
      if (keyExpiresWrap) keyExpiresWrap.style.display = 'none';

      userKeyField.style.display = 'none';
      userKeyField.textContent = '';

      userRevokeBtn.style.display = 'none';
      userGrantBtn.style.display = '';
    }

    // Применяем состояние тумблеров (без вызова change)
    applyingToggles = true;

    if (userCameraToggle)    userCameraToggle.checked    = !!data.camera_enabled;
    if (userKeyDeleteToggle) userKeyDeleteToggle.checked = !!data.key_delete_disabled;
    if (userAutosaveToggle)  userAutosaveToggle.checked  = !!data.autosave_disabled;
    if (userThemeToggle)     userThemeToggle.checked     = !!data.theme_disabled;

    setTimeout(function() { applyingToggles = false; }, 50);

    setTimeout(function() {
      userKeyCard.classList.add('visible');
      const cameraCards = document.querySelectorAll('.user-camera-card');
      cameraCards.forEach(function(c) { c.classList.add('visible'); });
    }, 80);
  }

  function formatExpires(raw) {
    if (!raw) return '—';
    try {
      let s = String(raw).trim();
      let normalized = s.replace(' ', 'T');
      if (!normalized.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(normalized)) normalized += 'Z';
      const dt = new Date(normalized);
      if (isNaN(dt.getTime())) return raw;

      const pad = n => n < 10 ? '0' + n : '' + n;
      const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда',
                    'Четверг', 'Пятница', 'Суббота'];

      return pad(dt.getDate()) + '.' + pad(dt.getMonth() + 1) + '.' + dt.getFullYear() +
             ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes()) +
             ' ' + days[dt.getDay()];
    } catch (e) {
      return raw;
    }
  }

  // ===== ОБРАБОТЧИКИ ТУМБЛЕРОВ =====
  async function sendToggle(control, enabled) {
    if (!currentUserTid) return true;

    const key    = localStorage.getItem('hitrevil_key') || '';
    const siteId = localStorage.getItem('hitrevil_site_id') || '';

    try {
      const resp = await fetch(window.API_URL + '/api/admin/user/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: key,
          site_id: siteId,
          telegram_id: currentUserTid,
          control: control,
          enabled: enabled
        })
      });
      return resp.ok;
    } catch (err) {
      console.warn('Ошибка тумблера:', err);
      return false;
    }
  }

  async function onCameraToggle() {
    if (applyingToggles) return;
    const enabled = userCameraToggle.checked;

    // Отдельный эндпоинт для камеры (сделан ранее)
    const key    = localStorage.getItem('hitrevil_key') || '';
    const siteId = localStorage.getItem('hitrevil_site_id') || '';

    try {
      const resp = await fetch(window.API_URL + '/api/admin/user/camera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: key,
          site_id: siteId,
          telegram_id: currentUserTid,
          enabled: enabled
        })
      });
      if (!resp.ok) userCameraToggle.checked = !enabled;
    } catch (err) {
      userCameraToggle.checked = !enabled;
    }
  }

  async function onKeyDeleteToggle() {
    if (applyingToggles) return;
    const enabled = userKeyDeleteToggle.checked;
    const ok = await sendToggle('key_delete', enabled);
    if (!ok) userKeyDeleteToggle.checked = !enabled;
  }

  async function onAutosaveToggle() {
    if (applyingToggles) return;
    const enabled = userAutosaveToggle.checked;
    const ok = await sendToggle('autosave', enabled);
    if (!ok) userAutosaveToggle.checked = !enabled;
  }

  async function onThemeToggle() {
    if (applyingToggles) return;
    const enabled = userThemeToggle.checked;
    const ok = await sendToggle('theme', enabled);
    if (!ok) userThemeToggle.checked = !enabled;
  }

  // ===== ОТЗЫВ КЛЮЧА =====
  function showRevokeModal() {
    userRevokeOverlay.classList.add('active');
  }

  async function confirmRevoke() {
    userRevokeOverlay.classList.remove('active');
    if (!currentUserTid) return;

    const key    = localStorage.getItem('hitrevil_key') || '';
    const siteId = localStorage.getItem('hitrevil_site_id') || '';

    try {
      const resp = await fetch(window.API_URL + '/api/admin/user/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: key,
          site_id: siteId,
          telegram_id: currentUserTid
        })
      });
      if (!resp.ok) return;

      const keyTitle = userKeyCard.querySelector('.user-key-card-title');
      const keyExpiresWrap = userKeyCard.querySelector('.user-key-expires');

      if (keyTitle) keyTitle.style.display = 'none';
      if (keyExpiresWrap) keyExpiresWrap.style.display = 'none';

      userKeyField.style.display = 'none';
      userKeyField.textContent = '';

      fadeSwapKeyButtons('grant');
    } catch (err) {
      console.warn('Ошибка отзыва ключа:', err);
    }
  }

  // ===== ВЫДАЧА КЛЮЧА =====
  function showGrantModal() {
    userGrantOverlay.classList.add('active');
  }

  async function confirmGrant(duration) {
    userGrantOverlay.classList.remove('active');
    if (!currentUserTid) return;

    const key    = localStorage.getItem('hitrevil_key') || '';
    const siteId = localStorage.getItem('hitrevil_site_id') || '';

    try {
      const resp = await fetch(window.API_URL + '/api/admin/user/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: key,
          site_id: siteId,
          telegram_id: currentUserTid,
          duration: duration
        })
      });
      if (!resp.ok) return;

      await loadUserProfile(currentUserTid);
      fadeSwapKeyButtons('revoke');
    } catch (err) {
      console.warn('Ошибка выдачи ключа:', err);
    }
  }

  function fadeSwapKeyButtons(target) {
    const from = target === 'grant' ? userRevokeBtn : userGrantBtn;
    const to   = target === 'grant' ? userGrantBtn : userRevokeBtn;

    if (!from || !to) return;

    to.style.display = 'none';
    from.classList.add('fading');

    setTimeout(function() {
      from.style.display = 'none';
      from.classList.remove('fading');
      to.style.display = '';
    }, 350);
  }

  // ===== ФОРМАТ ДАТЫ =====
  function formatUserDate(raw) {
    if (!raw) return '—';

    try {
      let s = String(raw).trim();
      let normalized = s.replace(' ', 'T');
      if (!normalized.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(normalized)) normalized += 'Z';
      const dt = new Date(normalized);
      if (isNaN(dt.getTime())) return raw;

      const pad = n => n < 10 ? '0' + n : '' + n;
      const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда',
                    'Четверг', 'Пятница', 'Суббота'];

      return pad(dt.getDate()) + '.' + pad(dt.getMonth() + 1) + '.' + dt.getFullYear() +
             ' - ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes()) +
             ' ' + days[dt.getDay()];
    } catch (e) {
      return raw;
    }
  }

  // ===== ESCAPE =====
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;

    if (userGrantOverlay.classList.contains('active')) { userGrantOverlay.classList.remove('active'); return; }
    if (userRevokeOverlay.classList.contains('active')) { userRevokeOverlay.classList.remove('active'); return; }
    if (userScreenOpen) { closeUserProfile(); return; }
    if (usersScreenOpen) { closeUsersScreen(); return; }
    if (panelOpen) { closePanel(); return; }
  });

  // ===== ЭКСПОРТ =====
  window.refreshAdminPanelStats = loadStats;

})();
