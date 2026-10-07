// panel.js — админ-панель HITREVIL: активность + список пользователей
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

  if (!panelScreen) return;

  // ===== СОСТОЯНИЕ =====
  let panelOpen = false;
let usersScreenOpen = false;
let refreshTimer = null;
let statusesTimer = null;

let isAdmin = false;
  // Список пользователей (для пагинации)
  let usersOffset = 0;
  const USERS_LIMIT = 20;
  let usersTotalWithKey = 0;
  let usersLoading = false;

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

    if (isAdmin) {
      burgerBtn.style.display = '';
    }
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

  // ===== СТАТИСТИКА "АКТИВНОСТЬ" =====
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
      if (!resp.ok) {
        console.warn('Статистика недоступна:', resp.status);
        return;
      }

      const data = await resp.json();
      activeCount.textContent   = Number(data.active_keys   ?? 0);
      inactiveCount.textContent = Number(data.inactive_keys ?? 0);

      // Обновляем "Всего N" на контейнере "Пользователи"
      if (data.total_users != null) {
        totalUsersCount.textContent = Number(data.total_users);
      }
    } catch (err) {
      console.warn('Не удалось получить статистику:', err);
    }
  }

  // ===== ЭКРАН СПИСКА ПОЛЬЗОВАТЕЛЕЙ =====

  if (usersListCard) {
    usersListCard.addEventListener('click', openUsersScreen);
  }
  if (usersBackBtn) {
    usersBackBtn.addEventListener('click', closeUsersScreen);
  }
  if (usersLoadMoreBtn) {
    usersLoadMoreBtn.addEventListener('click', loadMoreUsers);
  }

  function openUsersScreen() {
    if (!isAdmin || usersScreenOpen) return;
    usersScreenOpen = true;

    // Плавно скрываем панель
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    usersCard.classList.remove('visible');
    usersListCard.classList.remove('visible');
    panelScreen.classList.remove('active');

   setTimeout(function() {
     usersScreen.classList.add('active');

     // Первая загрузка — с нуля
     usersOffset = 0;
     usersTotalWithKey = 0;
     usersScreenList.innerHTML = '';
     usersLoadMoreBtn.classList.remove('visible');

     loadUsersChunk();

    // Авто-обновление статусов каждые 15 секунд
    if (statusesTimer) clearInterval(statusesTimer);
    statusesTimer = setInterval(refreshStatuses, 15000);
  }, 350);
  }

  function closeUsersScreen() {
    if (!usersScreenOpen) return;
    usersScreenOpen = false;

    if (statusesTimer) {
      clearInterval(statusesTimer);
      statusesTimer = null;
    }

    usersScreen.classList.remove('active');

    setTimeout(function() {
      // Возвращаемся на панель управления
      panelScreen.classList.add('active');
      setTimeout(function() {
        usersCard.classList.add('visible');
        usersListCard.classList.add('visible');
      }, 120);

      // Возобновляем авто-обновление статистики
      loadStats();
      if (!refreshTimer) refreshTimer = setInterval(loadStats, 15000);
    }, 300);
  }

  // ===== ЗАГРУЗКА СПИСКА ПОЛЬЗОВАТЕЛЕЙ =====

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

      if (!resp.ok) {
        console.warn('Список пользователей недоступен:', resp.status);
        usersLoading = false;
        usersLoadMoreBtn.disabled = false;
        return;
      }

      const data = await resp.json();
      usersTotalWithKey = Number(data.total_with_key || 0);

      const users = Array.isArray(data.users) ? data.users : [];
      users.forEach(function(u, idx) {
        const el = createUserItem(u);
        usersScreenList.appendChild(el);

        // Плавное появление с задержкой по индексу
        setTimeout(function() {
          el.classList.add('visible');
        }, 60 * idx + 30);
      });

      usersOffset += users.length;

      // Показываем "Показать ещё" если есть ещё
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

  function loadMoreUsers() {
    loadUsersChunk();
  }

  // ===== СОЗДАНИЕ КАРТОЧКИ ПОЛЬЗОВАТЕЛЯ =====
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

    return item;
  }

  // ===== ФОРМАТ ДАТЫ =====
  // "2026-10-07 14:32:00" → "07.10.2026 - 14:32 Понедельник"
  function formatUserDate(raw) {
    if (!raw) return '—';

    try {
      let s = String(raw).trim();
      let normalized = s.replace(' ', 'T');
      if (!normalized.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(normalized)) {
        normalized += 'Z';
      }
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
    if (usersScreenOpen) { closeUsersScreen(); return; }
    if (panelOpen) { closePanel(); return; }
  });

    // ===== ОБНОВЛЕНИЕ ТОЛЬКО СТАТУСОВ =====
  async function refreshStatuses() {
    if (!window.API_URL || !usersScreenOpen) return;

    // Собираем все telegram_id, которые сейчас видны в списке
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
        body: JSON.stringify({
          key: key,
          site_id: siteId,
          telegram_ids: ids
        })
      });

      if (!resp.ok) return;

      const data = await resp.json();
      const statuses = data.statuses || {};

      // Обновляем эмодзи у каждой карточки на месте
      items.forEach(function(el) {
        const id = parseInt(el.dataset.telegramId, 10);
        if (isNaN(id)) return;

        const active = !!statuses[id] || statuses[String(id)] === true;
        const statusEl = el.querySelector('.user-item-status');
        if (!statusEl) return;

        const newEmoji = active ? '🟢' : '🔴';
        if (statusEl.textContent !== newEmoji) {
          statusEl.textContent = newEmoji;
        }
      });
    } catch (err) {
      console.warn('Не удалось обновить статусы:', err);
    }
  }

  // ===== ЭКСПОРТ =====
  window.refreshAdminPanelStats = loadStats;

})();
