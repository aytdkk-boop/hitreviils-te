// panel.js — экран "Панель управления" + статистика ключей HITREVIL
(function() {
  'use strict';

  const burgerBtn     = document.getElementById('burgerBtn');
  const mainContent   = document.getElementById('mainContent');
  const panelScreen   = document.getElementById('panelScreen');
  const panelBackBtn  = document.getElementById('panelBackBtn');
  const usersCard     = document.getElementById('usersCard');
  const activeCount   = document.getElementById('activeCount');
  const inactiveCount = document.getElementById('inactiveCount');

  // Если страница без панели — молча выходим
  if (!panelScreen) return;

  let panelOpen = false;
  let refreshTimer = null;

  // ===== ОТКРЫТИЕ ПАНЕЛИ =====
  function openPanel() {
    if (panelOpen) return;
    panelOpen = true;

    // Плавно скрываем главную
    mainContent.classList.remove('active');

    setTimeout(function() {
      panelScreen.classList.add('active');

      // Контейнер плавно выезжает после появления экрана
      setTimeout(function() {
        usersCard.classList.add('visible');
      }, 120);

      // Подгружаем статистику сразу и обновляем каждые 15 сек
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

  // Закрытие по Escape
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
