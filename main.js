// main.js — камера, лента фото, геолокация, IndexedDB
(function() {
  'use strict';

  const mainContent = document.getElementById('mainContent');
  const openCameraBtn = document.getElementById('openCameraBtn');
  const cameraScreen = document.getElementById('cameraScreen');
  const cameraVideo = document.getElementById('cameraVideo');
  const shutterBtn = document.getElementById('shutterBtn');
  const cameraBackBtn = document.getElementById('cameraBackBtn');
  const cameraThumbBtn = document.getElementById('cameraThumbBtn');
  const cameraThumbImg = document.getElementById('cameraThumbImg');
  const flashlightBtn = document.getElementById('flashlightBtn');
  const photoGallery = document.getElementById('photoGallery');

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
  const closeBtn = document.getElementById('closeBtn');

  let cameraStream = null;
  let selectedPhotoElement = null;
  let isCapturing = false;
  let flashlightOn = false;
  let lastPhotoDataURL = '';

  let currentLocation = {
    address: '',
    coords: '',
    lat: null,
    lon: null,
    resolved: false
  };

  // ===== РАБОТА С IndexedDB =====
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
        request.onsuccess = function(event) {
          db = event.target.result;
          resolve(db);
        };
        request.onerror = function(event) {
          reject(event.target.error);
        };
      } catch (e) {
        reject(e);
      }
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

  function getAllPhotosFromDB() {
    return new Promise(function(resolve, reject) {
      if (!db) { resolve([]); return; }
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const request = store.getAll();
      request.onsuccess = function() { resolve(request.result || []); };
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

  // ===== КНОПКА КАМЕРЫ =====
  openCameraBtn.addEventListener('click', function() {
    if (currentLocation.resolved) {
      openCamera();
      return;
    }
    geoStatus.textContent = 'Нажмите «Разрешить» для определения';
    geoOverlay.classList.add('active');
  });

  // ===== РАЗРЕШЕНИЕ ГЕОЛОКАЦИИ =====
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
      lat: coords.lat,
      lon: coords.lon,
      resolved: true
    };

    geoAllowBtn.disabled = false;
    geoCancelBtn.disabled = false;
    geoOverlay.classList.remove('active');
    openCamera();
  });

  geoCancelBtn.addEventListener('click', function() {
    geoOverlay.classList.remove('active');
  });

  geoOverlay.addEventListener('click', function(e) {
    if (e.target === geoOverlay) {
      geoOverlay.classList.remove('active');
    }
  });

  function getCoordsWithRetries(maxSeconds, intervalMs) {
    return new Promise(function(resolve) {
      const startTime = Date.now();
      let lastError = 'timeout';

      function tryOnce() {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        if (elapsed >= maxSeconds) {
          resolve({ lat: null, lon: null, error: lastError });
          return;
        }

        navigator.geolocation.getCurrentPosition(
          function(position) {
            const lat = position.coords.latitude.toFixed(5);
            const lon = position.coords.longitude.toFixed(5);
            resolve({ lat: lat, lon: lon, error: null });
          },
          function(error) {
            if (error.code === error.PERMISSION_DENIED) {
              resolve({ lat: null, lon: null, error: 'denied' });
              return;
            }
            lastError = error.message;
            if (error.code === error.POSITION_UNAVAILABLE ||
                error.code === error.TIMEOUT) {
              setTimeout(tryOnce, intervalMs);
            } else {
              resolve({ lat: null, lon: null, error: error.message });
            }
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      }
      tryOnce();
    });
  }

  async function getCoordsByIP() {
    try {
      const services = [
        'https://ipapi.co/json/',
        'https://ipwho.is/',
        'https://ipinfo.io/json'
      ];
      for (let i = 0; i < services.length; i++) {
        try {
          const response = await fetch(services[i], {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'omit'
          });
          if (!response.ok) continue;
          const data = await response.json();
          const lat = data.latitude || data.lat;
          const lon = data.longitude || data.lon;
          if (lat && lon) {
            return {
              lat: parseFloat(lat).toFixed(5),
              lon: parseFloat(lon).toFixed(5)
            };
          }
        } catch (e) {}
      }
    } catch (err) {}
    return { lat: null, lon: null };
  }

  async function reverseGeocode(lat, lon) {
    try {
      const nominatimUrl = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' +
                           encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon) +
                           '&accept-language=ru&zoom=18';
      try {
        const response = await fetch(nominatimUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
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
                       encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lon) +
                       '&localityLanguage=ru';
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
    } catch (err) {
      return '';
    }
  }

  function showLocationOnPage(address, coords) {
    locationAddress.textContent = address || '';
    locationCoords.textContent = coords || '';
    if (address || coords) {
      locationBlock.classList.add('visible');
    } else {
      locationBlock.classList.remove('visible');
    }
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

    const isSecure = location.protocol === 'https:' ||
                     location.hostname === 'localhost' ||
                     location.hostname === '127.0.0.1';
    if (!isSecure) return;

    showLocationLoading();

    const coordsPromise = getCoordsWithRetries(15, 3000);

    const [coords] = await Promise.all([
      coordsPromise,
      new Promise(r => setTimeout(r, 5000))
    ]);

    let finalCoords = coords;

    if (!finalCoords || finalCoords.lat === null) {
      finalCoords = await getCoordsByIP();
    }

    if (!finalCoords || finalCoords.lat === null) {
      hideLocationLoading();
      locationBlock.classList.remove('visible');
      return;
    }

    const address = await reverseGeocode(finalCoords.lat, finalCoords.lon);

    currentLocation = {
      address: address || 'Адрес не определён',
      coords: finalCoords.lat + ', ' + finalCoords.lon,
      lat: finalCoords.lat,
      lon: finalCoords.lon,
      resolved: true
    };

    hideLocationLoading();
    showLocationOnPage(currentLocation.address, currentLocation.coords);

    try {
      localStorage.setItem('hitrevil_last_coords',
        finalCoords.lat + ',' + finalCoords.lon);
    } catch (e) {}
  }

  async function checkLocationChange() {
    if (!currentLocation.resolved) return;

    try {
      const position = await new Promise(function(resolve, reject) {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 60000
        });
      });

      const newLat = position.coords.latitude.toFixed(5);
      const newLon = position.coords.longitude.toFixed(5);

      const latDiff = Math.abs(parseFloat(newLat) - parseFloat(currentLocation.lat || 0));
      const lonDiff = Math.abs(parseFloat(newLon) - parseFloat(currentLocation.lon || 0));

      if (latDiff > 0.001 || lonDiff > 0.001) {
        await refreshLocation(newLat, newLon);
      }
    } catch (e) {}
  }

  async function refreshLocation(newLat, newLon) {
    showLocationLoading();

    const addressPromise = reverseGeocode(newLat, newLon);

    const [address] = await Promise.all([
      addressPromise,
      new Promise(r => setTimeout(r, 5000))
    ]);

    currentLocation = {
      address: address || 'Адрес не определён',
      coords: newLat + ', ' + newLon,
      lat: newLat,
      lon: newLon,
      resolved: true
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
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      cameraVideo.srcObject = cameraStream;
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

  // ===== ФОНАРЬ =====
  flashlightBtn.addEventListener('click', async function() {
    if (!cameraStream) return;

    try {
      const track = cameraStream.getVideoTracks()[0];
      if (!track) return;

      const capabilities = track.getCapabilities ? track.getCapabilities() : {};

      if (!capabilities.torch) {
        console.warn('Фонарь не поддерживается устройством');
        return;
      }

      flashlightOn = !flashlightOn;

      await track.applyConstraints({
        advanced: [{ torch: flashlightOn }]
      });

      if (flashlightOn) {
        flashlightBtn.classList.add('active');
      } else {
        flashlightBtn.classList.remove('active');
      }
    } catch (err) {
      console.warn('Ошибка управления фонарём:', err);
      flashlightOn = false;
      flashlightBtn.classList.remove('active');
    }
  });

  // ===== КНОПКА "НАЗАД" =====
  cameraBackBtn.addEventListener('click', async function() {
    try {
      if (cameraStream && flashlightOn) {
        const track = cameraStream.getVideoTracks()[0];
        if (track) {
          await track.applyConstraints({ advanced: [{ torch: false }] });
        }
      }
    } catch (e) {}
    flashlightOn = false;
    flashlightBtn.classList.remove('active');

    await closeCameraAndReturnToSite();
  });

  // ===== МИНИАТЮРА (клик по последнему фото) =====
  cameraThumbBtn.addEventListener('click', function() {
    if (!lastPhotoDataURL) return;

    const fakeItem = document.createElement('div');
    fakeItem.className = 'photo-item';
    const img = document.createElement('img');
    img.src = lastPhotoDataURL;
    fakeItem.appendChild(img);
    openActionModal(fakeItem);
  });

  // ===== ЗАТВОР (без затемнения) =====
  shutterBtn.addEventListener('click', async function() {
    if (!cameraStream || isCapturing) return;
    isCapturing = true;
    shutterBtn.disabled = true;

    const video = cameraVideo;

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

    if (window.autoSaveEnabled) {
      await savePhotoWithCoords(photoDataURL, currentLocation);
    }

    await addPhotoToGallery(photoDataURL, currentLocation);

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

      if (location && (location.coords || location.address)) {
        drawCoordsOverlay(ctx, canvas, location);
      }

      const filename = 'HITREVIL_' + getTimestamp() + '.jpg';

      canvas.toBlob(function(blob) {
        if (!blob) {
          downloadDataURL(canvas.toDataURL('image/jpeg', 0.92), filename);
          return;
        }
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
    const W = canvas.width;
    const H = canvas.height;
    const baseSize = Math.max(W, H);
    const fontSize = Math.round(baseSize * 0.022);
    const padding = Math.round(baseSize * 0.018);
    const lineGap = Math.round(fontSize * 0.35);
    const borderRadius = Math.round(fontSize * 0.6);
    const margin = Math.round(baseSize * 0.02);

    const lines = [];
    if (location.address && location.address !== 'Адрес не определён') {
      const wrapped = wrapText(location.address, 32);
      wrapped.forEach(function(line) { lines.push(line); });
    }
    if (location.coords) lines.push(location.coords);
    if (lines.length === 0) return;

    ctx.font = '600 ' + fontSize + 'px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.textBaseline = 'top';

    let maxLineWidth = 0;
    lines.forEach(function(line) {
      const w = ctx.measureText(line).width;
      if (w > maxLineWidth) maxLineWidth = w;
    });

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
      if ((current + ' ' + word).trim().length <= maxChars) {
        current = (current + ' ' + word).trim();
      } else {
        if (current) lines.push(current);
        current = word;
      }
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
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
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
    const pad = function(n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           '_' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds());
  }

  // ===== ЗАКРЫТИЕ КАМЕРЫ И ВОЗВРАТ НА САЙТ =====
  async function closeCameraAndReturnToSite() {
    cameraScreen.classList.remove('active');

    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }

    if (cameraVideo) {
      try {
        cameraVideo.pause();
        cameraVideo.srcObject = null;
        cameraVideo.removeAttribute('src');
        cameraVideo.load();
      } catch (e) {}
    }

    document.body.classList.remove('fade-out');
    document.body.classList.add('fade-in');
    mainContent.classList.add('active');
  }

  async function addPhotoToGallery(dataURL, location, existingId) {
    let photoId = existingId;

    if (photoId === undefined || photoId === null) {
      try {
        photoId = await savePhotoToDB(
          dataURL,
          location ? location.coords : '',
          location ? location.address : ''
        );
      } catch (e) {
        console.warn('Не удалось сохранить фото в БД:', e);
        photoId = null;
      }
    }

    const item = document.createElement('div');
    item.className = 'photo-item';
    if (photoId !== null && photoId !== undefined) {
      item.dataset.photoId = String(photoId);
    }

    const img = document.createElement('img');
    img.src = dataURL;
    img.alt = 'Фото HITREVIL';
    item.appendChild(img);

    if (location && location.coords) {
      const coordsEl = document.createElement('div');
      coordsEl.className = 'photo-coords';
      coordsEl.textContent = location.coords;
      item.appendChild(coordsEl);
    }

    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let gestureHandled = false;

    item.addEventListener('touchstart', function(e) {
      if (e.touches.length === 1) {
        touchStartTime = Date.now();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        gestureHandled = false;
      } else {
        gestureHandled = true;
      }
    }, { passive: true });

    item.addEventListener('touchend', function(e) {
      if (gestureHandled) {
        gestureHandled = false;
        return;
      }
      if (e.changedTouches.length > 0) {
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const dx = Math.abs(endX - touchStartX);
        const dy = Math.abs(endY - touchStartY);
        const duration = Date.now() - touchStartTime;
        if (dx < 10 && dy < 10 && duration < 350) {
          e.preventDefault();
          openActionModal(item);
        }
      }
    }, { passive: false });

    item.addEventListener('click', function(e) {
      if (gestureHandled) return;
      openActionModal(item);
    });

    photoGallery.appendChild(item);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        item.classList.add('visible');
      });
    });
  }

  async function loadPhotosFromDB() {
    try {
      const photos = await getAllPhotosFromDB();
      for (const photo of photos) {
        const location = {
          coords: photo.coords || '',
          address: photo.address || ''
        };
        await addPhotoToGallery(photo.dataURL, location, photo.id);
      }
    } catch (e) {
      console.warn('Не удалось загрузить фото из БД:', e);
    }
  }

  function openActionModal(photoElement) {
    selectedPhotoElement = photoElement;
    actionOverlay.classList.add('active');
    mainContent.classList.add('blurred');
  }

  function closeActionModal() {
    actionOverlay.classList.remove('active');
    mainContent.classList.remove('blurred');
  }

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
        if (photoToRemove.parentNode) {
          photoToRemove.parentNode.removeChild(photoToRemove);
        }
        if (!isNaN(photoId)) {
          try {
            await deletePhotoFromDB(photoId);
          } catch (e) {
            console.warn('Не удалось удалить фото из БД:', e);
          }
        }
      }, 500);
    }, 300);

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

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const confirmOverlay = document.getElementById('confirmOverlay');
      const settingsPage = document.getElementById('settingsPage');

      if (confirmOverlay && confirmOverlay.classList.contains('active')) {
        confirmOverlay.classList.remove('active');
        return;
      }
      if (settingsPage && settingsPage.classList.contains('active')) {
        const backBtn = document.getElementById('settingsBackBtn');
        if (backBtn) backBtn.click();
        return;
      }
      if (geoOverlay.classList.contains('active')) {
        geoOverlay.classList.remove('active');
        return;
      }
      if (actionOverlay.classList.contains('active')) {
        closeActionModal();
        selectedPhotoElement = null;
        return;
      }
      if (cameraScreen.classList.contains('active') && !isCapturing) {
        cameraBackBtn.click();
      }
    }
  });

  document.addEventListener('gesturestart', function(e) {
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', function(e) {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });

  window.loadPhotosFromDB = loadPhotosFromDB;

  window.onSiteActivated = function() {
    if (window.updateSiteIdDisplay) window.updateSiteIdDisplay();
    if (window.updateKeyCardFromStorage) window.updateKeyCardFromStorage();
    loadPhotosFromDB();
    setTimeout(autoDetectLocation, 500);
  };

  (async function() {
    try {
      await openPhotoDB();
    } catch (e) {
      console.warn('IndexedDB недоступен:', e);
    }
  })();

  setInterval(checkLocationChange, 60000);

})();