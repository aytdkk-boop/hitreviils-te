// panel.js — экран "Панель управления" + статистика ключей HITREVIL
// Бургер показывается только администраторам (проверка через /api/me)
(function() {
  'use strict';

  const burgerBtn     = document.getElementById('burgerBtn');
  const mainContent   = document.getElementById('mainContent');
  const panelScreen   = document.getElementById('panelScreen');
  const panelBackBtn  = document.getElementById('panelBackBtn');
  const usersCard     = document.getElementById('usersCard');
  const activeCount   = document.getElementById('activeCount');
  const inactiveCount = document.getElementById('inactiveCount');

  if (!panelScreen) return;

  let panelOpen = false;
  let refreshTimer = null;
  let isAdmin = false;

  // ===== ПРОВЕРКА ПРАВ ЧЕРЕЗ СЕРВЕР =====
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

  // ===== ПОКАЗ / СКРЫТИЕ БУРГЕРА ПО ПРАВАМ =====
  async function setupBurgerVisibility() {
    if (!burgerBtn) return;

    // По умолчанию прячем — чтобы не «моргал» до проверки
    burgerBtn.style.display = 'none';

    isAdmin = await checkAdmin();

    if (isAdmin) {
      burgerBtn.style.display = '';
    }
  }

  // Проверка при загрузке, если пользователь уже активирован
  window.addEventListener('load', function() {
    const activated = localStorage.getItem('hitrevil_activated') === 'true';
    if (activated) setupBurgerVisibility();
  });

  // Перехватываем onSiteActivated, чтобы проверять права после активации ключа
  const origOnSiteActivated = window.onSiteActivated;
  window.onSiteActivated = function() {
    if (typeof origOnSiteActivated === 'function') origOnSiteActivated();
    setupBurgerVisibility();
  };

  // ===== ОТКРЫТИЕ ПАНЕЛИ =====
  function openPanel() {
    if (!isAdmin) return;          // защита: открыть может только админ
    if (panelOpen) return;
    panelOpen = true;

    mainContent.classList.remove('active');

    setTimeout(function() {
      panelScreen.classList.add('active');

      setTimeout(function() {
        usersCard.classList.add('visible');
      }, 120);

      loadStats();
      refreshTimer = setInterval(loadStats, 15000);
    }, 250);
  }

  // ===== ЗАКРЫТИЕ ПАНЕЛИ =====
  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;

    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }

    usersCard.classList.remove('visible');
    panelScreen.classList.remove('active');

    setTimeout(function() {
      mainContent.classList.add('active');
    }, 300);
  }

  // ===== ОБРАБОТЧИКИ =====
  if (burgerBtn) {
    burgerBtn.addEventListener('click', openPanel);
  }

  if (panelBackBtn) {
    panelBackBtn.addEventListener('click', closePanel);
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && panelOpen) closePanel();
  });

  // ===== ЗАГРУЗКА СТАТИСТИКИ =====
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
    } catch (err) {
      console.warn('Не удалось получить статистику:', err);
    }
  }

  // Экспорт на случай внешнего вызова
  window.refreshAdminPanelStats = loadStats;

})();
