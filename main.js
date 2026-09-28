// main.js — камера, лента, геолокация, IndexedDB + редактор фото
(function() {
  'use strict';

  const mainContent = document.getElementById('mainContent');
  const openCameraBtn = document.getElementById('openCameraBtn');
  const cameraScreen = document.getElementById('cameraScreen');
  const shutterBtn = document.getElementById('shutterBtn');
  const cameraBackBtn = document.getElementById('cameraBackBtn');
  const cameraThumbBtn = document.getElementById('cameraThumbBtn');
  const cameraThumbImg = document.getElementById('cameraThumbImg');
  const flashlightBtn = document.getElementById('flashlightBtn');

  const containersGallery = document.getElementById('containersGallery');
  const dayScreen = document.getElementById('dayScreen');
  const dayBackBtn = document.getElementById('dayBackBtn');
  const dayGallery = document.getElementById('dayGallery');
  const dayGalleryContainer = document.getElementById('dayGalleryContainer');
  const deleteDayOverlay = document.getElementById('deleteDayOverlay');
  const deleteDayYesBtn = document.getElementById('deleteDayYesBtn');
  const deleteDayNoBtn = document.getElementById('deleteDayNoBtn');

  const selectBar = document.getElementById('selectBar');
  const selectCancelBtn = document.getElementById('selectCancelBtn');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const selectDeleteBtn = document.getElementById('selectDeleteBtn');
  const selectCount = document.getElementById('selectCount');

  const deletePhotosOverlay = document.getElementById('deletePhotosOverlay');
  const deletePhotosConfirmBtn = document.getElementById('deletePhotosConfirmBtn');
  const deletePhotosCloseBtn = document.getElementById('deletePhotosCloseBtn');

  const geoOverlay = document.getElementById('geoOverlay');
  const geoAllowBtn = document.getElementById('geoAllowBtn');
  const geoCancelBtn = document.getElementById('geoCancelBtn');
  const geoStatus = document.getElementById('geoStatus');

  const locationBlock = document.getElementById('locationBlock');
  const locationAddress = document.getElementById('locationAddress');
  const locationCoords = document.getElementById('locationCoords');
  const locationLoading = document.getElementById('locationLoading');

  const actionOverlay = document.getElementById('actionOverlay');
  const deleteBtn = document.getElementById('deleteBtn');
  const saveBtn = document.getElementById('saveBtn');
  const editBtn = document.getElementById('editBtn');
  const closeBtn = document.getElementById('closeBtn');

  const editorScreen = document.getElementById('editorScreen');
  const editorCanvas = document.getElementById('editorCanvas');
  const editorCancelBtn = document.getElementById('editorCancelBtn');
  const editorSaveBtn = document.getElementById('editorSaveBtn');
  const editorBackBtn = document.getElementById('editorBackBtn');
  const colorStrip = document.getElementById('colorStrip');
  const editorColorBtn = document.getElementById('editorColorBtn');
  const editorColorPreview = document.getElementById('editorColorPreview');
  const editorBottomBar = document.getElementById('editorBottomBar');
  const toolPointerBtn = document.getElementById('toolPointerBtn');
  const toolDotBtn = document.getElementById('toolDotBtn');
  const toolTextBtn = document.getElementById('toolTextBtn');
  const textInputOverlay = document.getElementById('textInputOverlay');
  const textInputField = document.getElementById('textInputField');
  const textInputCancelBtn = document.getElementById('textInputCancelBtn');
  const textInputOkBtn = document.getElementById('textInputOkBtn');

  let cameraStream = null;
  let selectedPhotoElement = null;
  let isCapturing = false;
  let flashlightOn = false;
  let lastPhotoDataURL = '';
  let currentDayKey = null;
  let selectedDayKey = null;
  let isSelectionMode = false;
  let selectedPhotos = new Set();

  let currentLocation = {
    address: '',
    coords: '',
    lat: null,
    lon: null,
    resolved: false
  };

  // ===== IndexedDB =====
  const DB_NAME = 'hitrevil_photos';
  const DB_STORE = 'photos';
  let db = null;

  function openPhotoDB() {
    return new Promise(function(resolve, reject) {
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = function(event) {
          const database = event.target.result;
          if (!database.objectStoreNames.contains(DB_STORE)) {
            database.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true });
          }
        };
        request.onsuccess = function(event) { db = event.target.result; resolve(db); };
        request.onerror = function(event) { reject(event.target.error); };
      } catch (e) { reject(e); }
    });
  }

  function savePhotoToDB(dataURL, coords, address) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject('DB not open'); return; }
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      const request = store.add({
        dataURL: dataURL,
        coords: coords || '',
        address: address || '',
        createdAt: Date.now()
      });
      request.onsuccess = function() { resolve(request.result); };
      request.onerror = function() { reject(request.error); };
    });
  }

  function getPhotoFromDB(id) {
    return new Promise(function(resolve, reject) {
      if (!db) { resolve(null); return; }
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const request = store.get(id);
      request.onsuccess = function() { resolve(request.result || null); };
      request.onerror = function() { reject(request.error); };
    });
  }

  function updatePhotoInDB(photo) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject('DB not open'); return; }
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      const request = store.put(photo);
      request.onsuccess = function() { resolve(); };
      request.onerror = function() { reject(request.error); };
    });
  }

  function deletePhotoFromDB(id) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject('DB not open'); return; }
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      const request = store.delete(id);
      request.onsuccess = function() { resolve(); };
      request.onerror = function() { reject(request.error); };
    });
  }

  // ===== ДНИ =====
  function getDayKey(date) {
    const d = date || new Date();
    const pad = n => n < 10 ? '0' + n : '' + n;
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function formatDayTitle(timestamp) {
    const d = new Date(timestamp);
    const pad = n => n < 10 ? '0' + n : '' + n;
    const dateStr = pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
    const timeStr = pad(d.getHours()) + ':' + pad(d.getMinutes());
    const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    return dateStr + ' - ' + timeStr + ' ' + days[d.getDay()];
  }

  function getPhotosGroupedByDays() {
    return new Promise(function(resolve) {
      if (!db) { resolve([]); return; }
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const request = store.getAll();
      request.onsuccess = function() {
        const photos = request.result || [];
        const groups = {};
        photos.forEach(function(photo) {
          const dayKey = getDayKey(new Date(photo.createdAt));
          if (!groups[dayKey]) groups[dayKey] = [];
          groups[dayKey].push(photo);
        });
        const sortedDays = Object.keys(groups).sort((a, b) => b.localeCompare(a));
        const result = sortedDays.map(function(dayKey) {
          const dayPhotos = groups[dayKey].sort((a, b) => b.createdAt - a.createdAt);
          return {
            dayKey: dayKey,
            photos: dayPhotos,
            count: dayPhotos.length,
            firstTimestamp: dayPhotos[dayPhotos.length - 1].createdAt,
            lastTimestamp: dayPhotos[0].createdAt
          };
        });
        resolve(result);
      };
      request.onerror = function() { resolve([]); };
    });
  }

  async function rebuildContainersGallery() {
    const days = await getPhotosGroupedByDays();
    containersGallery.innerHTML = '';
    if (days.length === 0) return;
    days.forEach(function(day) {
      const container = createDayContainer(day);
      containersGallery.appendChild(container);
      requestAnimationFrame(() => requestAnimationFrame(() => container.classList.add('visible')));
    });
  }

  function createDayContainer(day) {
    const container = document.createElement('div');
    container.className = 'day-container';
    container.dataset.dayKey = day.dayKey;

    const info = document.createElement('div');
    info.className = 'day-container-info';

    const dateEl = document.createElement('div');
    dateEl.className = 'day-container-date';
    dateEl.textContent = formatDayTitle(day.firstTimestamp);

    const countEl = document.createElement('div');
    countEl.className = 'day-container-count';
    countEl.textContent = day.count + ' ' + declOfNum(day.count, ['фото', 'фото', 'фото']);

    info.appendChild(dateEl);
    info.appendChild(countEl);

    const menuBtn = document.createElement('button');
    menuBtn.className = 'day-container-menu';
    menuBtn.setAttribute('aria-label', 'Меню');
    menuBtn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>';

    function handleMenuTap(e) {
      e.stopPropagation();
      e.preventDefault();
      openDeleteDayModal(day.dayKey);
    }
    menuBtn.addEventListener('click', handleMenuTap);
    menuBtn.addEventListener('touchend', handleMenuTap, { passive: false });

    container.appendChild(info);
    container.appendChild(menuBtn);
    container.addEventListener('click', () => openDayScreen(day.dayKey));
    return container;
  }

  function declOfNum(n, titles) {
    return titles[(n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2];
  }

  async function openDayScreen(dayKey) {
    currentDayKey = dayKey;
    isSelectionMode = false;
    selectedPhotos.clear();

    const days = await getPhotosGroupedByDays();
    const day = days.find(d => d.dayKey === dayKey);
    if (!day) return;

    dayGallery.innerHTML = '';
    for (const photo of day.photos) {
      const item = createPhotoItem(photo);
      dayGallery.appendChild(item);
      requestAnimationFrame(() => requestAnimationFrame(() => item.classList.add('visible')));
    }
    selectBar.classList.remove('active');
    dayScreen.classList.add('active');
  }

  function createPhotoItem(photo) {
    const item = document.createElement('div');
    item.className = 'photo-item';
    item.dataset.photoId = String(photo.id);

    const img = document.createElement('img');
    img.src = photo.dataURL;
    img.alt = 'Фото HITREVIL';
    item.appendChild(img);

    if (photo.coords) {
      const coordsEl = document.createElement('div');
      coordsEl.className = 'photo-coords';
      coordsEl.textContent = photo.coords;
      item.appendChild(coordsEl);
    }

    const check = document.createElement('div');
    check.className = 'photo-check';
    check.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="4 12 10 18 20 6"/></svg>';
    item.appendChild(check);

    let longPressTimer = null;
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let isLongPress = false;
    let gestureHandled = false;

    item.addEventListener('touchstart', function(e) {
      if (e.touches.length === 1) {
        touchStartTime = Date.now();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isLongPress = false;
        gestureHandled = false;
        longPressTimer = setTimeout(function() {
          isLongPress = true;
          if (!isSelectionMode) enterSelectionMode();
          togglePhotoSelection(item);
          if (navigator.vibrate) navigator.vibrate(30);
        }, 600);
      } else {
        gestureHandled = true;
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      }
    }, { passive: true });

    item.addEventListener('touchmove', function(e) {
      if (longPressTimer && e.touches.length > 0) {
        const dx = Math.abs(e.touches[0].clientX - touchStartX);
        const dy = Math.abs(e.touches[0].clientY - touchStartY);
        if (dx > 10 || dy > 10) { clearTimeout(longPressTimer); longPressTimer = null; }
      }
    }, { passive: true });

    item.addEventListener('touchend', function(e) {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      if (gestureHandled) { gestureHandled = false; return; }
      if (isLongPress) { isLongPress = false; return; }
      if (e.changedTouches.length > 0) {
        const dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
        const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
        const duration = Date.now() - touchStartTime;
        if (dx < 10 && dy < 10 && duration < 600) {
          e.preventDefault();
          if (isSelectionMode) togglePhotoSelection(item);
          else openActionModal(item);
        }
      }
    }, { passive: false });

    item.addEventListener('click', function() {
      if (gestureHandled || isLongPress) return;
      if (isSelectionMode) togglePhotoSelection(item);
      else openActionModal(item);
    });

    let mouseLongPressTimer = null;
    item.addEventListener('mousedown', function() {
      mouseLongPressTimer = setTimeout(function() {
        if (!isSelectionMode) enterSelectionMode();
        togglePhotoSelection(item);
      }, 600);
    });
    item.addEventListener('mouseup', function() {
      if (mouseLongPressTimer) { clearTimeout(mouseLongPressTimer); mouseLongPressTimer = null; }
    });
    item.addEventListener('mouseleave', function() {
      if (mouseLongPressTimer) { clearTimeout(mouseLongPressTimer); mouseLongPressTimer = null; }
    });

    return item;
  }

  function enterSelectionMode() { isSelectionMode = true; selectBar.classList.add('active'); }
  function exitSelectionMode() {
    isSelectionMode = false;
    selectedPhotos.clear();
    selectBar.classList.remove('active');
    dayGallery.querySelectorAll('.photo-item').forEach(i => i.classList.remove('selected'));
    updateSelectCount();
  }
  function togglePhotoSelection(item) {
    const photoId = parseInt(item.dataset.photoId, 10);
    if (isNaN(photoId)) return;
    if (selectedPhotos.has(photoId)) {
      selectedPhotos.delete(photoId);
      item.classList.remove('selected');
    } else {
      selectedPhotos.add(photoId);
      item.classList.add('selected');
    }
    updateSelectCount();
    if (selectedPhotos.size === 0 && isSelectionMode) exitSelectionMode();
  }
  function updateSelectCount() { selectCount.textContent = selectedPhotos.size; }

  function closeDayScreen() {
    exitSelectionMode();
    dayScreen.classList.remove('active');
    mainContent.classList.add('active');
    currentDayKey = null;
  }

  function openDeleteDayModal(dayKey) {
    selectedDayKey = dayKey;
    deleteDayOverlay.classList.add('active');
  }
  function closeDeleteDayModal() {
    deleteDayOverlay.classList.remove('active');
    selectedDayKey = null;
  }

  // ===== КАМЕРА =====
  openCameraBtn.addEventListener('click', function() {
    if (currentLocation.resolved) { openCamera(); return; }
    geoStatus.textContent = 'Нажмите «Разрешить» для определения';
    geoOverlay.classList.add('active');
  });

  geoAllowBtn.addEventListener('click', async function() {
    geoAllowBtn.disabled = true;
    geoCancelBtn.disabled = true;
    geoStatus.textContent = 'Запрашиваем разрешение...';
    await new Promise(r => setTimeout(r, 300));
    if (!navigator.geolocation) {
      geoStatus.textContent = 'Геолокация не поддерживается устройством';
      geoAllowBtn.disabled = false;
      geoCancelBtn.disabled = false;
      return;
    }
    geoStatus.textContent = 'Определяем местоположение...';
    const coords = await getCoordsWithRetries(30, 3000);
    if (coords.lat === null) {
      const ipCoords = await getCoordsByIP();
      if (ipCoords.lat === null) {
        geoStatus.textContent = 'Не удалось определить';
        geoAllowBtn.disabled = false;
        geoCancelBtn.disabled = false;
        return;
      }
      coords.lat = ipCoords.lat;
      coords.lon = ipCoords.lon;
    }
    geoStatus.textContent = 'Определяем адрес...';
    const address = await reverseGeocode(coords.lat, coords.lon);
    currentLocation = {
      address: address || 'Адрес не определён',
      coords: coords.lat + ', ' + coords.lon,
      lat: coords.lat, lon: coords.lon, resolved: true
    };
    geoAllowBtn.disabled = false;
    geoCancelBtn.disabled = false;
    geoOverlay.classList.remove('active');
    openCamera();
  });

  geoCancelBtn.addEventListener('click', function() { geoOverlay.classList.remove('active'); });
  geoOverlay.addEventListener('click', function(e) {
    if (e.target === geoOverlay) geoOverlay.classList.remove('active');
  });

  function getCoordsWithRetries(maxSeconds, intervalMs) {
    return new Promise(function(resolve) {
      const startTime = Date.now();
      let lastError = 'timeout';
      function tryOnce() {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        if (elapsed >= maxSeconds) { resolve({ lat: null, lon: null, error: lastError }); return; }
        navigator.geolocation.getCurrentPosition(
          function(position) {
            resolve({
              lat: position.coords.latitude.toFixed(5),
              lon: position.coords.longitude.toFixed(5),
              error: null
            });
          },
          function(error) {
            if (error.code === error.PERMISSION_DENIED) { resolve({ lat: null, lon: null, error: 'denied' }); return; }
            lastError = error.message;
            if (error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT) setTimeout(tryOnce, intervalMs);
            else resolve({ lat: null, lon: null, error: error.message });
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      }
      tryOnce();
    });
  }

  async function getCoordsByIP() {
    try {
      const services = ['https://ipapi.co/json/', 'https://ipwho.is/', 'https://ipinfo.io/json'];
      for (let i = 0; i < services.length; i++) {
        try {
          const response = await fetch(services[i], { method: 'GET', headers: { 'Accept': 'application/json' }, credentials: 'omit' });
          if (!response.ok) continue;
          const data = await response.json();
          const lat = data.latitude || data.lat;
          const lon = data.longitude || data.lon;
          if (lat && lon) return { lat: parseFloat(lat).toFixed(5), lon: parseFloat(lon).toFixed(5) };
        } catch (e) {}
      }
    } catch (err) {}
    return { lat: null, lon: null };
  }

  async function reverseGeocode(lat, lon) {
    try {
      const nominatimUrl = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' +
        encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon) + '&accept-language=ru&zoom=18';
      try {
        const response = await fetch(nominatimUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (response.ok) {
          const data = await response.json();
          const addr = data.address || {};
          const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
          const road = addr.road || addr.pedestrian || addr.footway || addr.street || '';
          const house = addr.house_number || '';
          const parts = [];
          if (city) parts.push(city);
          if (road) parts.push(road);
          if (house) parts.push('д. ' + house);
          let result = parts.join(', ');
          if (!result && data.display_name) result = data.display_name;
          if (result) return result;
        }
      } catch (e) {}
      try {
        const bdcUrl = 'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' +
          encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lon) + '&localityLanguage=ru';
        const response = await fetch(bdcUrl);
        if (response.ok) {
          const data = await response.json();
          const city = data.city || data.locality || data.principalSubdivision || '';
          const road = data.street || '';
          const house = data.houseNumber || '';
          const parts = [];
          if (city) parts.push(city);
          if (road) parts.push(road);
          if (house) parts.push('д. ' + house);
          const result = parts.join(', ');
          if (result) return result;
        }
      } catch (e) {}
      return '';
    } catch (err) { return ''; }
  }

  function showLocationOnPage(address, coords) {
    locationAddress.textContent = address || '';
    locationCoords.textContent = coords || '';
    if (address || coords) locationBlock.classList.add('visible');
    else locationBlock.classList.remove('visible');
  }
  function showLocationLoading() {
    if (!locationLoading) return;
    locationLoading.classList.add('visible');
    locationBlock.classList.add('visible');
    locationAddress.style.opacity = '0';
    locationCoords.style.opacity = '0';
  }
  function hideLocationLoading() {
    if (!locationLoading) return;
    locationLoading.classList.remove('visible');
    locationAddress.style.opacity = '1';
    locationCoords.style.opacity = '1';
  }

  async function autoDetectLocation() {
    if (!navigator.geolocation) return;
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) return;
    showLocationLoading();
    const coordsPromise = getCoordsWithRetries(15, 3000);
    const [coords] = await Promise.all([coordsPromise, new Promise(r => setTimeout(r, 5000))]);
    let finalCoords = coords;
    if (!finalCoords || finalCoords.lat === null) finalCoords = await getCoordsByIP();
    if (!finalCoords || finalCoords.lat === null) { hideLocationLoading(); locationBlock.classList.remove('visible'); return; }
    const address = await reverseGeocode(finalCoords.lat, finalCoords.lon);
    currentLocation = {
      address: address || 'Адрес не определён',
      coords: finalCoords.lat + ', ' + finalCoords.lon,
      lat: finalCoords.lat, lon: finalCoords.lon, resolved: true
    };
    hideLocationLoading();
    showLocationOnPage(currentLocation.address, currentLocation.coords);
    try { localStorage.setItem('hitrevil_last_coords', finalCoords.lat + ',' + finalCoords.lon); } catch (e) {}
  }

  async function checkLocationChange() {
    if (!currentLocation.resolved) return;
    try {
      const position = await new Promise(function(resolve, reject) {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
      });
      const newLat = position.coords.latitude.toFixed(5);
      const newLon = position.coords.longitude.toFixed(5);
      const latDiff = Math.abs(parseFloat(newLat) - parseFloat(currentLocation.lat || 0));
      const lonDiff = Math.abs(parseFloat(newLon) - parseFloat(currentLocation.lon || 0));
      if (latDiff > 0.001 || lonDiff > 0.001) await refreshLocation(newLat, newLon);
    } catch (e) {}
  }

  async function refreshLocation(newLat, newLon) {
    showLocationLoading();
    const [address] = await Promise.all([reverseGeocode(newLat, newLon), new Promise(r => setTimeout(r, 5000))]);
    currentLocation = {
      address: address || 'Адрес не определён',
      coords: newLat + ', ' + newLon,
      lat: newLat, lon: newLon, resolved: true
    };
    hideLocationLoading();
    showLocationOnPage(currentLocation.address, currentLocation.coords);
  }

  // ===== ОТКРЫТИЕ КАМЕРЫ =====
  async function openCamera() {
    document.body.classList.add('fade-out');
    await new Promise(r => setTimeout(r, 500));
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: false
      });
      const oldVideo = document.getElementById('cameraVideo');
      if (oldVideo && oldVideo.parentNode) oldVideo.parentNode.removeChild(oldVideo);
      const video = document.createElement('video');
      video.id = 'cameraVideo';
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.setAttribute('playsinline', '');
      video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;';
      cameraScreen.insertBefore(video, cameraScreen.firstChild);
      video.srcObject = cameraStream;
      cameraScreen.classList.add('active');
      document.body.classList.remove('fade-out');
      flashlightOn = false;
      flashlightBtn.classList.remove('active');
      lastPhotoDataURL = '';
      cameraThumbImg.classList.remove('visible');
      cameraThumbImg.src = '';
    } catch (err) {
      console.error('Ошибка доступа к камере:', err);
      alert('Не удалось получить доступ к камере. Проверьте разрешения.');
      document.body.classList.remove('fade-out');
    }
  }

  flashlightBtn.addEventListener('click', async function() {
    if (!cameraStream) return;
    try {
      const track = cameraStream.getVideoTracks()[0];
      if (!track) return;
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      if (!capabilities.torch) return;
      flashlightOn = !flashlightOn;
      await track.applyConstraints({ advanced: [{ torch: flashlightOn }] });
      if (flashlightOn) flashlightBtn.classList.add('active');
      else flashlightBtn.classList.remove('active');
    } catch (err) {
      flashlightOn = false;
      flashlightBtn.classList.remove('active');
    }
  });

  cameraBackBtn.addEventListener('click', async function() {
    try {
      if (cameraStream && flashlightOn) {
        const track = cameraStream.getVideoTracks()[0];
        if (track) await track.applyConstraints({ advanced: [{ torch: false }] });
      }
    } catch (e) {}
    flashlightOn = false;
    flashlightBtn.classList.remove('active');
    await closeCameraAndReturnToSite();
  });

  cameraThumbBtn.addEventListener('click', function() {
    if (!lastPhotoDataURL) return;
    const fakeItem = document.createElement('div');
    fakeItem.className = 'photo-item';
    const img = document.createElement('img');
    img.src = lastPhotoDataURL;
    fakeItem.appendChild(img);
    openActionModal(fakeItem);
  });

  shutterBtn.addEventListener('click', async function() {
    if (!cameraStream || isCapturing) return;
    isCapturing = true;
    shutterBtn.disabled = true;
    const video = document.getElementById('cameraVideo');
    if (!video) { isCapturing = false; shutterBtn.disabled = false; return; }
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth || 1280;
    tempCanvas.height = video.videoHeight || 720;
    const tempCtx = tempCanvas.getContext('2d');
    await new Promise(r => requestAnimationFrame(r));
    tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
    const photoDataURL = tempCanvas.toDataURL('image/jpeg', 0.9);
    lastPhotoDataURL = photoDataURL;
    cameraThumbImg.src = photoDataURL;
    cameraThumbImg.classList.add('visible');
    if (window.autoSaveEnabled) await savePhotoWithCoords(photoDataURL, currentLocation);
    try {
      await savePhotoToDB(photoDataURL, currentLocation ? currentLocation.coords : '', currentLocation ? currentLocation.address : '');
    } catch (e) { console.warn('Не удалось сохранить фото в БД:', e); }
    await rebuildContainersGallery();
    isCapturing = false;
    shutterBtn.disabled = false;
  });

  async function savePhotoWithCoords(dataURL, location) {
    try {
      const img = await loadImage(dataURL);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      if (location && (location.coords || location.address)) drawCoordsOverlay(ctx, canvas, location);
      const filename = 'HITREVIL_' + getTimestamp() + '.jpg';
      canvas.toBlob(function(blob) {
        if (!blob) { downloadDataURL(canvas.toDataURL('image/jpeg', 0.92), filename); return; }
        downloadBlob(blob, filename);
      }, 'image/jpeg', 0.92);
    } catch (err) {
      downloadDataURL(dataURL, 'HITREVIL_' + getTimestamp() + '.jpg');
    }
  }

  function loadImage(src) {
    return new Promise(function(resolve, reject) {
      const img = new Image();
      img.onload = function() { resolve(img); };
      img.onerror = function(err) { reject(err); };
      img.src = src;
    });
  }

  function drawCoordsOverlay(ctx, canvas, location) {
    const W = canvas.width, H = canvas.height;
    const baseSize = Math.max(W, H);
    const fontSize = Math.round(baseSize * 0.022);
    const padding = Math.round(baseSize * 0.018);
    const lineGap = Math.round(fontSize * 0.35);
    const borderRadius = Math.round(fontSize * 0.6);
    const margin = Math.round(baseSize * 0.02);
    const lines = [];
    if (location.address && location.address !== 'Адрес не определён') {
      wrapText(location.address, 32).forEach(l => lines.push(l));
    }
    if (location.coords) lines.push(location.coords);
    if (lines.length === 0) return;
    ctx.font = '600 ' + fontSize + 'px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    let maxLineWidth = 0;
    lines.forEach(l => { const w = ctx.measureText(l).width; if (w > maxLineWidth) maxLineWidth = w; });
    const plateW = maxLineWidth + padding * 2;
    const lineHeight = fontSize + lineGap;
    const plateH = lines.length * lineHeight + padding * 2 - lineGap;
    const plateX = W - plateW - margin;
    const plateY = H - plateH - margin;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, plateX, plateY, plateW, plateH, borderRadius);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = Math.max(1, Math.round(baseSize * 0.0012));
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = Math.round(fontSize * 0.3);
    lines.forEach(function(line, i) {
      const y = plateY + padding + i * lineHeight;
      if (i === lines.length - 1 && location.coords && lines.length > 1) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.font = '400 ' + Math.round(fontSize * 0.85) + 'px "Segoe UI", Roboto, system-ui, sans-serif';
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 ' + fontSize + 'px "Segoe UI", Roboto, system-ui, sans-serif';
      }
      ctx.fillText(line, plateX + padding, y);
    });
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function wrapText(text, maxChars) {
    const words = text.split(' ');
    const lines = [];
    let current = '';
    words.forEach(function(word) {
      if ((current + ' ' + word).trim().length <= maxChars) current = (current + ' ' + word).trim();
      else { if (current) lines.push(current); current = word; }
    });
    if (current) lines.push(current);
    return lines;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadDataURL(dataURL, filename) {
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function getTimestamp() {
    const d = new Date();
    const pad = n => n < 10 ? '0' + n : '' + n;
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           '_' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds());
  }

  async function closeCameraAndReturnToSite() {
    cameraScreen.classList.remove('active');
    if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; }
    const video = document.getElementById('cameraVideo');
    if (video) {
      try { video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load(); } catch (e) {}
      if (video.parentNode) video.parentNode.removeChild(video);
    }
    document.body.classList.remove('fade-out');
    document.body.classList.add('fade-in');
    mainContent.classList.add('active');
  }

  async function loadPhotosFromDB() { await rebuildContainersGallery(); }

  function openActionModal(photoElement) {
    selectedPhotoElement = photoElement;
    if (window.autoSaveEnabled) saveBtn.classList.add('hidden');
    else saveBtn.classList.remove('hidden');
    actionOverlay.classList.add('active');
    mainContent.classList.add('blurred');
  }

  function closeActionModal() {
    actionOverlay.classList.remove('active');
    mainContent.classList.remove('blurred');
  }

  // ===== УДАЛЕНИЕ / СОХРАНЕНИЕ =====
  deleteBtn.addEventListener('click', function() {
    if (!selectedPhotoElement) return;
    const photoToRemove = selectedPhotoElement;
    const photoIdRaw = photoToRemove.dataset.photoId;
    const photoId = photoIdRaw ? parseInt(photoIdRaw, 10) : NaN;
    actionOverlay.classList.remove('active');
    mainContent.classList.remove('blurred');
    setTimeout(function() {
      photoToRemove.classList.add('removing');
      setTimeout(async function() {
        if (photoToRemove.parentNode) photoToRemove.parentNode.removeChild(photoToRemove);
        if (!isNaN(photoId)) {
          try { await deletePhotoFromDB(photoId); } catch (e) {}
          await rebuildContainersGallery();
          if (currentDayKey && dayGallery.children.length === 0) closeDayScreen();
        }
      }, 500);
    }, 300);
    selectedPhotoElement = null;
  });

  saveBtn.addEventListener('click', async function() {
    if (!selectedPhotoElement) return;
    const img = selectedPhotoElement.querySelector('img');
    if (!img || !img.src) { closeActionModal(); selectedPhotoElement = null; return; }
    const dataURL = img.src;
    closeActionModal();
    await new Promise(r => setTimeout(r, 300));
    try {
      const coordsEl = selectedPhotoElement.querySelector('.photo-coords');
      const coords = coordsEl ? coordsEl.textContent : '';
      await savePhotoWithCoords(dataURL, { coords: coords, address: '' });
    } catch (e) {}
    selectedPhotoElement = null;
  });

  closeBtn.addEventListener('click', function() {
    closeActionModal();
    selectedPhotoElement = null;
  });

  actionOverlay.addEventListener('click', function(e) {
    if (e.target === actionOverlay) {
      closeActionModal();
      selectedPhotoElement = null;
    }
  });

  // ===== РЕДАКТОР =====
  let editorState = {
    photoId: null,
    originalDataURL: '',
    baseImage: null,
    canvasW: 0,
    canvasH: 0,
    coverScale: 1,
    coverOffsetX: 0,
    coverOffsetY: 0,
    activeTool: null,
    activeColor: '#ffffff',
    shapes: [],
    draggingShape: null,
    dragStartAngle: 0,
    dragShapeAngle: 0
  };

  editBtn.addEventListener('click', function() {
    if (!selectedPhotoElement) return;
    const img = selectedPhotoElement.querySelector('img');
    if (!img || !img.src) return;
    const photoIdRaw = selectedPhotoElement.dataset.photoId;
    const photoId = photoIdRaw ? parseInt(photoIdRaw, 10) : null;
    const dataURL = img.src;
    closeActionModal();
    setTimeout(() => openEditor(photoId, dataURL), 250);
    selectedPhotoElement = null;
  });

  function computeCoverGeometry(img) {
    const canvasW = window.innerWidth;
    const canvasH = window.innerHeight;
    const scale = Math.max(canvasW / img.naturalWidth, canvasH / img.naturalHeight);
    const drawnW = img.naturalWidth * scale;
    const drawnH = img.naturalHeight * scale;
    const offsetX = (canvasW - drawnW) / 2;
    const offsetY = (canvasH - drawnH) / 2;
    return { canvasW, canvasH, scale, offsetX, offsetY };
  }

  async function openEditor(photoId, dataURL) {
    editorState.photoId = photoId;
    editorState.originalDataURL = dataURL;
    editorState.shapes = [];
    editorState.activeTool = null;
    editorState.activeColor = '#ffffff';
    editorState.draggingShape = null;

    const img = await loadImage(dataURL);
    editorState.baseImage = img;

    const geo = computeCoverGeometry(img);
    editorState.canvasW = geo.canvasW;
    editorState.canvasH = geo.canvasH;
    editorState.coverScale = geo.scale;
    editorState.coverOffsetX = geo.offsetX;
    editorState.coverOffsetY = geo.offsetY;

    editorCanvas.width = geo.canvasW;
    editorCanvas.height = geo.canvasH;
    editorCanvas.style.width = geo.canvasW + 'px';
    editorCanvas.style.height = geo.canvasH + 'px';

    redrawEditor();

    document.querySelectorAll('.editor-tool-btn').forEach(b => b.classList.remove('active'));
    colorStrip.classList.remove('active');
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    const whiteSwatch = colorStrip.querySelector('[data-color="#ffffff"]');
    if (whiteSwatch) whiteSwatch.classList.add('active');
    if (editorColorPreview) editorColorPreview.style.background = editorState.activeColor;

    editorScreen.classList.add('active');
  }

  function redrawEditor() {
    const ctx = editorCanvas.getContext('2d');
    ctx.clearRect(0, 0, editorState.canvasW, editorState.canvasH);

    const img = editorState.baseImage;
    const s = editorState.coverScale;
    ctx.drawImage(
      img,
      0, 0, img.naturalWidth, img.naturalHeight,
      editorState.coverOffsetX, editorState.coverOffsetY,
      img.naturalWidth * s, img.naturalHeight * s
    );

    editorState.shapes.forEach(shape => drawShape(ctx, shape));
  }

  function drawShape(ctx, shape) {
    if (shape.type === 'dot') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(shape.x, shape.y, getUnit() * 0.025, 0, Math.PI * 2);
      ctx.fillStyle = shape.color;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = getUnit() * 0.015;
      ctx.fill();
      ctx.restore();
    } else if (shape.type === 'text') {
      const fs = Math.max(14, Math.round(getUnit() * 0.05));
      ctx.save();
      ctx.font = '700 ' + fs + 'px "Segoe UI", Roboto, system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.lineWidth = Math.max(2, fs * 0.12);
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(shape.text, shape.x, shape.y);
      ctx.fillStyle = shape.color;
      ctx.fillText(shape.text, shape.x, shape.y);
      ctx.restore();
    } else if (shape.type === 'pointer') {
      drawPointer(ctx, shape);
    }
  }

  // ===== Стрелка-курсор =====
  // Носик — на точке тапа. От носика идут две линии назад — форма ">".
  // Хвост — линия вниз (или по углу). Круг управления — снизу экрана.
  function drawPointer(ctx, shape) {
    const unit = getUnit();
    const stickLen = unit * 0.29;    // длина хвоста
    const shaftWidth = unit * 0.014; // толщина линий
    const headW = unit * 0.075;      // ширина наконечника ">" (раствор)
    const headH = unit * 0.095;      // глубина наконечника ">" (от носика назад)

    const tipX = shape.x;
    const tipY = shape.y;
    const tailAngle = shape.angle;

    // 1) ХВОСТ — линия от носика вниз (по углу)
    const gap = unit * 0.012;
    const lineStartX = tipX + Math.cos(tailAngle) * gap;
    const lineStartY = tipY + Math.sin(tailAngle) * gap;
    const tailX = tipX + Math.cos(tailAngle) * stickLen;
    const tailY = tipY + Math.sin(tailAngle) * stickLen;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = shaftWidth;
    ctx.strokeStyle = shape.color;
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = unit * 0.012;
    ctx.beginPath();
    ctx.moveTo(lineStartX, lineStartY);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();
    ctx.restore();

    // 2) НАКОНЕЧНИК ">" — две линии, сходящиеся в носике (БЕЗ ЗАЛИВКИ!)
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = shaftWidth * 1.4;
    ctx.strokeStyle = shape.color;
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = unit * 0.012;

    // Основание наконечника — на расстоянии headH от носика
    const baseCenterX = tipX + Math.cos(tailAngle) * headH;
    const baseCenterY = tipY + Math.sin(tailAngle) * headH;

    // Перпендикуляр к направлению хвоста
    const perpX = -Math.sin(tailAngle);
    const perpY = Math.cos(tailAngle);

    // Левая и правая точки основания
    const leftX = baseCenterX + perpX * headW * 0.5;
    const leftY = baseCenterY + perpY * headW * 0.5;
    const rightX = baseCenterX - perpX * headW * 0.5;
    const rightY = baseCenterY - perpY * headW * 0.5;

    // Рисуем ">" — линия от левой точки к носику, потом к правой точке
    ctx.beginPath();
    ctx.moveTo(leftX, leftY);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(rightX, rightY);
    ctx.stroke();
    // ВАЖНО: НЕТ ctx.closePath(), НЕТ ctx.fill() — только stroke
    ctx.restore();

    // 3) КРУГ УПРАВЛЕНИЯ — снизу, над нижним контейнером
    const ctrlRadius = unit * 0.13;
    const ctrlCenterX = shape.ctrlX != null ? shape.ctrlX : editorState.canvasW / 2;
    const ctrlCenterY = shape.ctrlY != null ? shape.ctrlY : editorState.canvasH - unit * 0.35;

    ctx.save();
    ctx.beginPath();
    ctx.arc(ctrlCenterX, ctrlCenterY, ctrlRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.lineWidth = Math.max(2, unit * 0.005);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();

    const dotR = unit * 0.016;
    const dotX = ctrlCenterX + Math.cos(tailAngle) * (ctrlRadius * 0.75);
    const dotY = ctrlCenterY + Math.sin(tailAngle) * (ctrlRadius * 0.75);
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = shape.color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(ctrlCenterX, ctrlCenterY, dotR * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.restore();
  }

  function getUnit() {
    return Math.min(editorState.canvasW, editorState.canvasH);
  }

  function setActiveTool(tool) {
    editorState.activeTool = tool;
    document.querySelectorAll('.editor-tool-btn').forEach(b => b.classList.remove('active'));
    if (tool === 'pointer') toolPointerBtn.classList.add('active');
    if (tool === 'dot') toolDotBtn.classList.add('active');
    if (tool === 'text') toolTextBtn.classList.add('active');
  }

  toolPointerBtn.addEventListener('click', () => setActiveTool('pointer'));
  toolDotBtn.addEventListener('click', () => setActiveTool('dot'));
  toolTextBtn.addEventListener('click', () => {
    setActiveTool('text');
    openTextDialog();
  });

  // ===== Кнопка цвета — лента над кнопкой =====
  editorColorBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    const isOpen = colorStrip.classList.contains('active');
    if (isOpen) {
      colorStrip.classList.remove('active');
      return;
    }
    positionColorStripAboveButton();
    requestAnimationFrame(() => colorStrip.classList.add('active'));
  });

  function positionColorStripAboveButton() {
    if (!editorColorBtn || !editorBottomBar) return;

    const btnRect = editorColorBtn.getBoundingClientRect();

    colorStrip.style.transform = 'none';
    colorStrip.style.left = '0px';
    colorStrip.style.bottom = '0px';
    colorStrip.style.visibility = 'hidden';
    colorStrip.style.opacity = '0';
    colorStrip.style.display = 'flex';
    const stripRect = colorStrip.getBoundingClientRect();
    const stripW = stripRect.width || 72;
    const stripH = stripRect.height || 200;

    const left = btnRect.left + btnRect.width / 2 - stripW / 2;

    const barRect = editorBottomBar.getBoundingClientRect();
    const bottom = window.innerHeight - barRect.top + 12;

    colorStrip.style.left = Math.max(8, Math.min(left, window.innerWidth - stripW - 8)) + 'px';
    colorStrip.style.bottom = bottom + 'px';
    colorStrip.style.transform = '';
    colorStrip.style.visibility = '';
    colorStrip.style.opacity = '';
  }

  colorStrip.querySelectorAll('.color-swatch').forEach(function(sw) {
    sw.addEventListener('click', function() {
      editorState.activeColor = sw.dataset.color;
      colorStrip.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      if (editorColorPreview) editorColorPreview.style.background = editorState.activeColor;
      colorStrip.classList.remove('active');
    });
  });

  let pendingTextPos = null;

  function openTextDialog() {
    textInputField.value = '';
    textInputOverlay.classList.add('active');
    setTimeout(() => textInputField.focus(), 200);
  }
  function closeTextDialog() {
    textInputOverlay.classList.remove('active');
    pendingTextPos = null;
  }

  textInputCancelBtn.addEventListener('click', closeTextDialog);
  textInputOkBtn.addEventListener('click', function() {
    const text = textInputField.value.trim();
    if (!text) { closeTextDialog(); return; }
    const pos = pendingTextPos || { x: editorState.canvasW / 2, y: editorState.canvasH / 2 };
    editorState.shapes.push({
      type: 'text',
      x: pos.x,
      y: pos.y,
      text: text,
      color: editorState.activeColor
    });
    redrawEditor();
    closeTextDialog();
  });
  textInputOverlay.addEventListener('click', function(e) {
    if (e.target === textInputOverlay) closeTextDialog();
  });

  function canvasCoordsFromEvent(e) {
    const rect = editorCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (editorCanvas.width / rect.width),
      y: (clientY - rect.top) * (editorCanvas.height / rect.height)
    };
  }

  function findPointerControlAt(x, y) {
    const unit = getUnit();
    const ctrlRadius = unit * 0.13;
    for (let i = editorState.shapes.length - 1; i >= 0; i--) {
      const s = editorState.shapes[i];
      if (s.type !== 'pointer') continue;
      const ctrlX = s.ctrlX != null ? s.ctrlX : editorState.canvasW / 2;
      const ctrlY = s.ctrlY != null ? s.ctrlY : editorState.canvasH - unit * 0.35;
      const dx = x - ctrlX, dy = y - ctrlY;
      if (Math.sqrt(dx * dx + dy * dy) <= ctrlRadius) return { shape: s, ctrlX, ctrlY };
    }
    return null;
  }

  editorCanvas.addEventListener('touchstart', handlePointerDown, { passive: false });
  editorCanvas.addEventListener('mousedown', handlePointerDown);

  function handlePointerDown(e) {
    const { x, y } = canvasCoordsFromEvent(e);
    const tool = editorState.activeTool;

    if (tool === 'pointer') {
      const ctrlHit = findPointerControlAt(x, y);
      if (ctrlHit) {
        editorState.draggingShape = ctrlHit.shape;
        editorState.dragStartAngle = Math.atan2(y - ctrlHit.ctrlY, x - ctrlHit.ctrlX);
        editorState.dragShapeAngle = ctrlHit.shape.angle;
        e.preventDefault();
        return;
      }
    }

    if (tool === 'dot') {
      editorState.shapes.push({ type: 'dot', x: x, y: y, color: editorState.activeColor });
      redrawEditor();
      e.preventDefault();
    } else if (tool === 'pointer') {
      editorState.shapes.push({
        type: 'pointer',
        x: x, y: y,
        angle: Math.PI / 2,
        color: editorState.activeColor,
        ctrlX: editorState.canvasW / 2,
        ctrlY: editorState.canvasH - getUnit() * 0.35
      });
      redrawEditor();
      e.preventDefault();
    } else if (tool === 'text') {
      pendingTextPos = { x: x, y: y };
      openTextDialog();
      e.preventDefault();
    }
  }

  editorCanvas.addEventListener('touchmove', handlePointerMove, { passive: false });
  editorCanvas.addEventListener('mousemove', handlePointerMove);

  function handlePointerMove(e) {
    if (!editorState.draggingShape) return;
    const { x, y } = canvasCoordsFromEvent(e);
    const s = editorState.draggingShape;
    const ctrlX = s.ctrlX != null ? s.ctrlX : editorState.canvasW / 2;
    const ctrlY = s.ctrlY != null ? s.ctrlY : editorState.canvasH - getUnit() * 0.35;
    const cur = Math.atan2(y - ctrlY, x - ctrlX);
    s.angle = editorState.dragShapeAngle + (cur - editorState.dragStartAngle);
    redrawEditor();
    e.preventDefault();
  }

  editorCanvas.addEventListener('touchend', handlePointerUp, { passive: false });
  editorCanvas.addEventListener('mouseup', handlePointerUp);
  editorCanvas.addEventListener('mouseleave', handlePointerUp);

  function handlePointerUp() {
    if (editorState.draggingShape) editorState.draggingShape = null;
  }

  editorCanvas.addEventListener('click', function() {
    if (colorStrip.classList.contains('active')) colorStrip.classList.remove('active');
  });

  editorCancelBtn.addEventListener('click', function() {
    editorState.shapes = [];
    redrawEditor();
    colorStrip.classList.remove('active');
  });

  editorSaveBtn.addEventListener('click', async function() {
    const outURL = editorCanvas.toDataURL('image/jpeg', 0.92);
    try {
      await savePhotoWithCoords(outURL, { coords: '', address: '' });
      console.log('✅ Фото сохранено на устройство');
    } catch (e) {
      console.warn('Ошибка сохранения на устройство:', e);
    }
  });

  editorBackBtn.addEventListener('click', async function() {
    await closeEditorAndReturn();
  });

  async function closeEditorAndReturn() {
    editorScreen.classList.remove('active');
    colorStrip.classList.remove('active');
    editorState.shapes = [];
    editorState.draggingShape = null;
    editorState.activeTool = null;
    await new Promise(r => setTimeout(r, 350));
    if (currentDayKey) dayScreen.classList.add('active');
    else mainContent.classList.add('active');
  }

  document.addEventListener('click', function(e) {
    if (!colorStrip.classList.contains('active')) return;
    if (colorStrip.contains(e.target)) return;
    if (e.target.closest && e.target.closest('#editorColorBtn')) return;
    if (e.target === editorCanvas) return;
    colorStrip.classList.remove('active');
  });

  window.addEventListener('resize', function() {
    if (colorStrip.classList.contains('active')) positionColorStripAboveButton();
  });

  // ===== ПАНЕЛЬ ВЫБОРА =====
  function handleSelectCancel(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    exitSelectionMode();
  }
  selectCancelBtn.addEventListener('click', handleSelectCancel);
  selectCancelBtn.addEventListener('touchend', handleSelectCancel, { passive: false });

  function handleSelectAll(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    const items = dayGallery.querySelectorAll('.photo-item');
    const allSelected = selectedPhotos.size === items.length && items.length > 0;
    if (allSelected) {
      selectedPhotos.clear();
      items.forEach(item => item.classList.remove('selected'));
    } else {
      items.forEach(function(item) {
        const photoId = parseInt(item.dataset.photoId, 10);
        if (!isNaN(photoId)) {
          selectedPhotos.add(photoId);
          item.classList.add('selected');
        }
      });
    }
    updateSelectCount();
  }
  selectAllBtn.addEventListener('click', handleSelectAll);
  selectAllBtn.addEventListener('touchend', handleSelectAll, { passive: false });

  function handleSelectDelete(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    if (selectedPhotos.size === 0) return;
    deletePhotosOverlay.classList.add('active');
  }
  selectDeleteBtn.addEventListener('click', handleSelectDelete);
  selectDeleteBtn.addEventListener('touchend', handleSelectDelete, { passive: false });

  dayBackBtn.addEventListener('click', function() {
    closeDayScreen();
  });

  // ===== УДАЛЕНИЕ КОНТЕЙНЕРА — ДА =====
  deleteDayYesBtn.addEventListener('click', async function() {
    if (!selectedDayKey) return;
    const dayKeyToDelete = selectedDayKey;
    deleteDayOverlay.classList.remove('active');

    const containerEl = containersGallery.querySelector(
      '.day-container[data-day-key="' + dayKeyToDelete + '"]'
    );

    const deleteFromDB = (async function() {
      try {
        const tx = db.transaction(DB_STORE, 'readwrite');
        const store = tx.objectStore(DB_STORE);
        const request = store.getAll();

        return await new Promise(function(resolve) {
          request.onsuccess = function() {
            const photos = request.result || [];
            const tx2 = db.transaction(DB_STORE, 'readwrite');
            const store2 = tx2.objectStore(DB_STORE);
            photos.forEach(function(photo) {
              if (getDayKey(new Date(photo.createdAt)) === dayKeyToDelete) {
                store2.delete(photo.id);
              }
            });
            tx2.oncomplete = function() { resolve(); };
            tx2.onerror = function() { resolve(); };
          };
          request.onerror = function() { resolve(); };
        });
      } catch (e) {
        console.warn('Ошибка удаления контейнера:', e);
      }
    })();

    if (containerEl) {
      containerEl.classList.add('removing');
      await new Promise(r => setTimeout(r, 500));
      if (containerEl.parentNode) containerEl.parentNode.removeChild(containerEl);
    }

    await deleteFromDB;
    await rebuildContainersGallery();
    selectedDayKey = null;
  });

  deleteDayNoBtn.addEventListener('click', function() {
    deleteDayOverlay.classList.remove('active');
    mainContent.classList.add('active');
    selectedDayKey = null;
  });

  deleteDayOverlay.addEventListener('click', function(e) {
    if (e.target === deleteDayOverlay) {
      deleteDayOverlay.classList.remove('active');
      selectedDayKey = null;
    }
  });

  deletePhotosCloseBtn.addEventListener('click', function() {
    deletePhotosOverlay.classList.remove('active');
  });
  deletePhotosOverlay.addEventListener('click', function(e) {
    if (e.target === deletePhotosOverlay) deletePhotosOverlay.classList.remove('active');
  });
  deletePhotosConfirmBtn.addEventListener('click', async function() {
    if (selectedPhotos.size === 0) {
      deletePhotosOverlay.classList.remove('active');
      return;
    }
    deletePhotosOverlay.classList.remove('active');
    const idsToDelete = Array.from(selectedPhotos);
    const dayKeyToRefresh = currentDayKey;
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      idsToDelete.forEach(function(id) { store.delete(id); });
      tx.oncomplete = async function() {
        await rebuildContainersGallery();
        const days = await getPhotosGroupedByDays();
        const day = days.find(d => d.dayKey === dayKeyToRefresh);
        if (day && day.photos.length > 0) {
          exitSelectionMode();
          await openDayScreen(dayKeyToRefresh);
        } else {
          exitSelectionMode();
          closeDayScreen();
          mainContent.classList.add('active');
        }
      };
    } catch (e) {
      exitSelectionMode();
      closeDayScreen();
      mainContent.classList.add('active');
    }
  });

  // ===== ESCAPE =====
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const confirmOverlay = document.getElementById('confirmOverlay');
      const settingsPage = document.getElementById('settingsPage');

      if (textInputOverlay.classList.contains('active')) { closeTextDialog(); return; }
      if (colorStrip.classList.contains('active')) { colorStrip.classList.remove('active'); return; }
      if (editorScreen.classList.contains('active')) { editorBackBtn.click(); return; }
      if (deletePhotosOverlay.classList.contains('active')) { deletePhotosOverlay.classList.remove('active'); return; }
      if (deleteDayOverlay.classList.contains('active')) { closeDeleteDayModal(); return; }
      if (confirmOverlay && confirmOverlay.classList.contains('active')) { confirmOverlay.classList.remove('active'); return; }
      if (settingsPage && settingsPage.classList.contains('active')) {
        const backBtn = document.getElementById('settingsBackBtn');
        if (backBtn) backBtn.click();
        return;
      }
      if (dayScreen.classList.contains('active')) {
        if (isSelectionMode) exitSelectionMode();
        else closeDayScreen();
        return;
      }
      if (geoOverlay.classList.contains('active')) { geoOverlay.classList.remove('active'); return; }
      if (actionOverlay.classList.contains('active')) { closeActionModal(); selectedPhotoElement = null; return; }
      if (cameraScreen.classList.contains('active') && !isCapturing) cameraBackBtn.click();
    }
  });

  document.addEventListener('gesturestart', function(e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', function(e) {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  window.loadPhotosFromDB = loadPhotosFromDB;

  window.onSiteActivated = function() {
    if (window.updateSiteIdDisplay) window.updateSiteIdDisplay();
    if (window.updateKeyCardFromStorage) window.updateKeyCardFromStorage();
    loadPhotosFromDB();
    setTimeout(autoDetectLocation, 500);
  };

  (async function() {
    try { await openPhotoDB(); } catch (e) { console.warn('IndexedDB недоступен:', e); }
  })();

  setInterval(checkLocationChange, 60000);

})();
