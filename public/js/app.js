// public/js/app.js
// Global variables
const socket = io();
let map, userLocation, watchId = null, currentUser = null;
let markers = {}, paths = {}, isTracking = false;
let selectedAmbulanceId = null, autoFocus = true;
let ambulanceData = {}, locationUpdateInterval, mapInitialized = false;
let heatLayer = null, heatmapPoints = [];
let trafficLayer = null;

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
  const welcomeSection = document.getElementById('welcomeSection');
  const loginSection   = document.getElementById('loginSection');
  const adminPanel     = document.getElementById('adminPanel');
  const mapSection     = document.getElementById('mapSection');
  const loginBtn       = document.getElementById('loginBtn');
  const startTrackingBtn= document.getElementById('startTrackingBtn');
  const stopTrackingBtn = document.getElementById('stopTrackingBtn');
  const logoutBtn      = document.getElementById('logoutBtn');
  const backToLoginBtn = document.getElementById('backToLoginBtn');
  const startBtn       = document.getElementById('startBtn');
  const loginAdminBtn  = document.getElementById('loginAdminBtn');
  const adminInfo      = document.getElementById('adminInfo');
  const statusMessage  = document.getElementById('statusMessage');
  const ambulanceList  = document.getElementById('ambulanceList');
  const autoFocusCheckbox = document.getElementById('autoFocus');
  const backToHomeBtn  = document.getElementById('backToHomeBtn');
  const showTrafficCheckbox = document.getElementById('showTraffic');
  const showHeatmapCheckbox = document.getElementById('showHeatmap');
  const routeOptimizationCheckbox = document.getElementById('routeOptimization');

 // public/js/app.js
// … kode sebelumnya tetap …

function initMap() {
  if (mapInitialized) return;
  const madiunCoordinates = [-7.6298, 111.5300];
  map = L.map('map', {
    center: madiunCoordinates,
    zoom: 13,
    zoomControl: false // custom zoom controls di‐add nanti
  });
  
  // — GANTI BASE LAYER KE OSM STANDARD UNTUK POI/LANDMARK —  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  // 2.1 OpenStreetMap Standard (default)
  const osmStandard = L.tileLayer.provider('OpenStreetMap.Mapnik');  // :contentReference[oaicite:2]{index=2} :contentReference[oaicite:3]{index=3}

  // 2.2 Stamen Terrain (hillshade + vegetasi)
  const stamenTerrain = L.tileLayer.provider('Stamen.Terrain');      // :contentReference[oaicite:4]{index=4}

  // 2.3 OpenTopoMap (kontur topografi, jalur hiking)
  const openTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenTopoMap contributors',
    maxZoom: 17
  });                                                               // :contentReference[oaicite:5]{index=5}

  // 2.4 Thunderforest Landscape (vegetasi, POI alam)
  const thunderLandscape = L.tileLayer(
    'https://{s}.tile.thunderforest.com/landscape/{z}/{x}/{y}.png?apikey=YOUR_API_KEY', {
      attribution: '&copy; Thunderforest, OpenStreetMap contributors',
      maxZoom: 22
    }
  ); 

  // layer lalu lintas (tetap sama seperti semula)
  trafficLayer = L.tileLayer('https://tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.7,
    attribution: '© OpenStreetMap contributors, Traffic data'
  });

  // heatmap awal (tidak berubah)
  heatLayer = L.heatLayer([], {
    radius: 25,
    blur: 15,
    maxZoom: 17,
    gradient: {0.4: '#4caf50', 0.65: '#cddc39', 1: '#f44336'}
  });

  // custom controls (zoom, center, hospital, emergency) — tetap seperti semula
  const customControl = L.control({ position: 'topright' });
  customControl.onAdd = () => {
    const div = L.DomUtil.create('div', 'custom-map-control');
    div.innerHTML = `
      <button id="zoomInBtn" class="map-control-btn" title="Zoom In">+</button>
      <button id="zoomOutBtn" class="map-control-btn" title="Zoom Out">-</button>
      <button id="centerMapBtn" class="map-control-btn" title="Center Map"><i class="fas fa-crosshairs"></i></button>
      <button id="findHospitalsBtn" class="map-control-btn" title="Find Hospitals"><i class="fas fa-hospital"></i></button>
      <button id="emergencyBtn" class="map-control-btn emergency-btn" title="Emergency Alert"><i class="fas fa-exclamation-triangle"></i></button>
    `;
    return div;
  };
  customControl.addTo(map);

  // scale control
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

  // marker rumah sakit simulasi (tetap sama)
  const hospitals = [
    {name: "RSUD Soedono", lat: -7.6286, lng: 111.5317},
    {name: "RS Siti Aisyah", lat: -7.6330, lng: 111.5251},
    {name: "RSIA Aura Syifa", lat: -7.6469, lng: 111.5311}
  ];
  // … kode penambahan marker hospital seperti semula …

  // listener custom control (zoom, center, dll.) seperti semula …
  
  mapInitialized = true;
}

// … kode selanjutnya tetap …

  
  // Show notifications with enhanced styling
  function showNotification(message, type='info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `<i class="notification-icon fas ${getNotificationIcon(type)}"></i> ${message}`;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => document.body.removeChild(notification), 300);
    }, 3000);
  }
  
  function getNotificationIcon(type) {
    switch(type) {
      case 'success': return 'fa-check-circle';
      case 'error': return 'fa-exclamation-circle';
      case 'warning': return 'fa-exclamation-triangle';
      default: return 'fa-info-circle';
    }
  }

  // Login with improved validation
  function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    if (!username || !password) {
      showNotification('Please enter both username and password', 'error');
      return;
    }
    showNotification('Authenticating...', 'info');
    socket.emit('login', { username, password });
  }

  // Enhanced tracking with better accuracy
  function startTracking() {
    if (!navigator.geolocation) {
      statusMessage.textContent = 'Geolocation is not supported by your browser';
      showNotification('Geolocation is not supported by your browser', 'error');
      return;
    }
    statusMessage.textContent = 'Initializing GPS tracking...';
    showNotification('Initializing GPS tracking...', 'info');
    
    // High precision tracking settings
    const geoOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    };
    
    // First get a high-accuracy position fix
    navigator.geolocation.getCurrentPosition(position => {
      const initialLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed || 0,
        heading: position.coords.heading || 0,
        timestamp: new Date().toISOString(),
        altitude: position.coords.altitude || null,
        altitudeAccuracy: position.coords.altitudeAccuracy || null
      };
      
      // Start continuous tracking with watchPosition
      watchId = navigator.geolocation.watchPosition(position => {
        // Apply Kalman filtering for smoother position data
        const filteredLocation = kalmanFilterPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed || 0,
          heading: position.coords.heading || 0,
          timestamp: new Date().toISOString(),
          altitude: position.coords.altitude || null,
          altitudeAccuracy: position.coords.altitudeAccuracy || null
        });
        
        isTracking = true;
        startTrackingBtn.style.display = 'none';
        stopTrackingBtn.style.display = 'block';
        statusMessage.textContent = `GPS tracking active. Accuracy: ${Math.round(filteredLocation.accuracy)}m`;
        
        // Add to heatmap data
        addHeatmapPoint(filteredLocation.lat, filteredLocation.lng);
        
        socket.emit('updateLocation', {
          userId: currentUser.id,
          username: currentUser.username,
          location: filteredLocation
        });
      }, error => {
        console.error('Error getting location:', error);
        showNotification('Error: ' + getLocationErrorMessage(error), 'error');
        statusMessage.textContent = 'Error: ' + getLocationErrorMessage(error);
      }, geoOptions);
      
      // Backup interval for constant updates
      locationUpdateInterval = setInterval(() => {
        if (isTracking) {
          navigator.geolocation.getCurrentPosition(pos => {
            const filteredLocation = kalmanFilterPosition({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              speed: pos.coords.speed || 0,
              heading: pos.coords.heading || 0,
              timestamp: new Date().toISOString(),
              altitude: pos.coords.altitude || null,
              altitudeAccuracy: pos.coords.altitudeAccuracy || null
            });
            
            socket.emit('updateLocation', {
              userId: currentUser.id,
              username: currentUser.username,
              location: filteredLocation
            });
          }, null, geoOptions);
        }
      }, 3000);
      
    }, error => {
      console.error('Error getting initial location:', error);
      showNotification('Error: ' + getLocationErrorMessage(error), 'error');
      statusMessage.textContent = 'Error: ' + getLocationErrorMessage(error);
    }, geoOptions);
  }
  
  // Better geolocation error messages
  function getLocationErrorMessage(error) {
    switch(error.code) {
      case error.PERMISSION_DENIED:
        return "Location access denied. Please enable location services for this site.";
      case error.POSITION_UNAVAILABLE:
        return "Location information is unavailable. Check your device's GPS.";
      case error.TIMEOUT:
        return "Location request timed out. Please try again.";
      case error.UNKNOWN_ERROR:
        return "An unknown error occurred while getting location.";
      default:
        return "Location error: " + error.message;
    }
  }
  
  // Simple Kalman filter for smoother location tracking
  let lastPosition = null;
  let lastVariance = 100; // Start with high uncertainty
  
  function kalmanFilterPosition(rawPosition) {
    // If this is the first measurement, just use it directly
    if (!lastPosition) {
      lastPosition = {...rawPosition};
      lastVariance = rawPosition.accuracy * rawPosition.accuracy;
      return rawPosition;
    }
    
    // Calculate time difference since last measurement
    const timeDiff = (new Date(rawPosition.timestamp) - new Date(lastPosition.timestamp)) / 1000;
    
    // Process variance - increases with time to model uncertainty in position over time
    const processVariance = Math.min(1.0, timeDiff) * 10;
    
    // Predicted position - just use the last position as prediction
    const predictedLat = lastPosition.lat;
    const predictedLng = lastPosition.lng;
    
    // Predicted variance - grows with process noise
    const predictedVariance = lastVariance + processVariance;
    
    // Measurement variance - based on reported accuracy
    const measurementVariance = rawPosition.accuracy * rawPosition.accuracy;
    
    // Kalman gain - how much to trust the measurement vs prediction
    const gain = predictedVariance / (predictedVariance + measurementVariance);
    
    // Updated position - weighted average of prediction and measurement
    const filteredPosition = {
      ...rawPosition,
      lat: predictedLat + gain * (rawPosition.lat - predictedLat),
      lng: predictedLng + gain * (rawPosition.lng - predictedLng),
      // Reduce the reported accuracy value based on our filtering
      accuracy: Math.sqrt((1 - gain) * predictedVariance)
    };
    
    // Save for next iteration
    lastPosition = {...filteredPosition};
    lastVariance = (1 - gain) * predictedVariance;
    
    return filteredPosition;
  }

  function stopTracking() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      isTracking = false;
      startTrackingBtn.style.display = 'block';
      stopTrackingBtn.style.display = 'none';
      statusMessage.textContent = 'GPS tracking stopped';
      showNotification('GPS tracking stopped', 'warning');
      if (locationUpdateInterval) clearInterval(locationUpdateInterval);
      socket.emit('stopTracking', {
        userId: currentUser.id,
        username: currentUser.username
      });
    }
  }

  // Add heatmap functionality
  function addHeatmapPoint(lat, lng) {
    if (lat && lng) {
      heatmapPoints.push([lat, lng, 0.5]); // lat, lng, intensity
      if (heatmapPoints.length > 100) {
        heatmapPoints.shift(); // Keep maximum 100 points
      }
      
      if (showHeatmapCheckbox && showHeatmapCheckbox.checked) {
        updateHeatmap();
      }
    }
  }
  
  function updateHeatmap() {
    if (map && heatLayer) {
      map.removeLayer(heatLayer);
      heatLayer = L.heatLayer(heatmapPoints, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        gradient: {0.4: '#4caf50', 0.65: '#cddc39', 1: '#f44336'}
      }).addTo(map);
    }
  }
  
  // Show nearby hospitals (simulated)
  function showNearbyHospitals() {
    showNotification('Finding nearby hospitals...', 'info');
    // This would normally be an API call, but we're simulating
    setTimeout(() => {
      showNotification('Found 3 nearby hospitals', 'success');
      map.setZoom(14);
    }, 1000);
  }
  
  // Emergency alert functionality
  function triggerEmergencyAlert() {
    const confirmAlert = confirm("Trigger emergency alert to all units?");
    if (confirmAlert) {
      showNotification('EMERGENCY ALERT SENT TO ALL UNITS!', 'error');
      socket.emit('emergencyAlert', {
        userId: currentUser?.id || 'guest',
        username: currentUser?.username || 'Guest User',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Calculate optimal route (simulation)
  function calculateOptimalRoute(destLat, destLng) {
    if (!currentUser) {
      showNotification('Please login to use routing features', 'warning');
      return;
    }
    
    showNotification('Calculating optimal route...', 'info');
    
    // In a real app, this would call a routing API
    // Here we'll simulate with a straight line
    if (selectedAmbulanceId && ambulanceData[selectedAmbulanceId]) {
      const srcLat = ambulanceData[selectedAmbulanceId].location.lat;
      const srcLng = ambulanceData[selectedAmbulanceId].location.lng;
      
      // Remove previous route if exists
      if (window.optimalRoute) {
        map.removeLayer(window.optimalRoute);
      }
      
      // Create new route
      window.optimalRoute = L.polyline(
        [[srcLat, srcLng], [destLat, destLng]], 
        {color: '#4caf50', weight: 5, opacity: 0.7, dashArray: '10, 10'}
      ).addTo(map);
      
      // Fit map to show the whole route
      map.fitBounds(window.optimalRoute.getBounds(), {padding: [50, 50]});
      
      // Show route details
      const distance = calculateDistance(srcLat, srcLng, destLat, destLng);
      const time = Math.round(distance / 50 * 60); // Assuming 50 kmh average speed
      
      showNotification(`Route: ${distance.toFixed(1)} km, Est. time: ${time} min`, 'success');
    } else {
      showNotification('Select an ambulance first to calculate route', 'warning');
    }
  }
  
  function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Helpers for ambulance status with improved detection
  function isAmbulanceMoving(id) {
    const amb = ambulanceData[id];
    // Check speed directly if available and above threshold (2 km/h)
    if (amb.location.speed && amb.location.speed > 0.56) return true;
    
    // If we have location history, analyze movement pattern
    if (amb.locationHistory && amb.locationHistory.length >= 2) {
      const latest = amb.location;
      const prev = amb.locationHistory[amb.locationHistory.length - 1];
      const dt = (new Date(latest.timestamp) - new Date(prev.timestamp)) / 1000;
      
      if (dt > 0) {
        const R = 6371e3;
        const φ1 = prev.lat * Math.PI/180;
        const φ2 = latest.lat * Math.PI/180;
        const Δφ = (latest.lat-prev.lat)*Math.PI/180;
        const Δλ = (latest.lng-prev.lng)*Math.PI/180;
        const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
        const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const dist = R*c;
        
        // Calculate speed in m/s, consider moving if > 2 km/h (0.56 m/s)
        const calculatedSpeed = dist/dt;
        return calculatedSpeed > 0.56;
      }
    }
    return false;
  }

  function drawAmbulancePath(id) {
    if (!map || !ambulanceData[id]?.locationHistory?.length) return;
    if (paths[id]) map.removeLayer(paths[id]);
    
    const pts = [];
    if (ambulanceData[id].locationHistory.length > 0) {
      // Add all history points
      ambulanceData[id].locationHistory.forEach(loc => {
        pts.push([loc.lat, loc.lng]);
      });
    }
    
    // Add current position
    pts.push([ambulanceData[id].location.lat, ambulanceData[id].location.lng]);
    
    // Use gradient color for path to show direction
    if (pts.length >= 2) {
      paths[id] = L.polyline(pts, { 
        color: '#4caf50', 
        weight: 4, 
        opacity: 0.7,
        lineJoin: 'round'
      }).addTo(map);
      
      // Add direction arrow
      const arrowPatterns = [
        {offset: '25%', repeat: '50px', symbol: '➤'}
      ];
      
      L.polylineDecorator(paths[id], {
        patterns: [
          {offset: '10%', repeat: 100, symbol: L.Symbol.arrowHead({
            pixelSize: 15, polygon: false, pathOptions: {stroke: true, color: '#4caf50', weight: 3}
          })}
        ]
      }).addTo(map);
    }
  }

  function updateMarker(id, data) {
    if (!ambulanceData[id]) {
      ambulanceData[id] = { ...data, locationHistory: [] };
    } else {
      const last = ambulanceData[id].location;
      if (last.lat !== data.location.lat || last.lng !== data.location.lng) {
        ambulanceData[id].locationHistory.push({ ...last });
        if (ambulanceData[id].locationHistory.length > 30) ambulanceData[id].locationHistory.shift();
      }
      ambulanceData[id].location = data.location;
    }
    
    if (map) {
      const moving = isAmbulanceMoving(id);
      const color = moving ? 'green' : 'orange';
      
      // Enhanced ambulance icon
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div class="marker-content marker-${color}">
                <i class="fas fa-ambulance"></i>
                <div class="pulse"></div>
                ${moving ? '<div class="movement-indicator"></div>' : ''}
               </div>`,
        iconSize: [44, 44], 
        iconAnchor: [22, 22]
      });
      
      const speed = data.location.speed ? (data.location.speed*3.6).toFixed(1) : 'N/A';
      const status = moving ? 'Moving' : 'Stationary';
      const accuracy = data.location.accuracy ? `±${Math.round(data.location.accuracy)}m` : '';

      const popupContent = `
        <div class="custom-popup">
          <h3>${data.username}</h3>
          <p><strong>Status:</strong> <span class="status-${moving?'moving':'active'}">${status}</span></p>
          <p><strong>Speed:</strong> ${speed} km/h</p>
          <p><strong>Accuracy:</strong> ${accuracy}</p>
          <p><strong>Last Update:</strong> ${new Date(data.location.timestamp).toLocaleTimeString()}</p>
          <div class="popup-actions">
            <button class="popup-btn focus-btn" data-id="${id}">Focus</button>
            <button class="popup-btn route-btn" data-id="${id}">Route</button>
          </div>
        </div>`;

      if (!markers[id]) {
        markers[id] = L.marker([data.location.lat, data.location.lng], { icon }).addTo(map);
        markers[id].bindPopup(popupContent);
        
        // Add a circle to show accuracy radius
        markers[id].accuracyCircle = L.circle([data.location.lat, data.location.lng], {
          radius: data.location.accuracy || 10,
          color: '#4caf50',
          fillColor: '#4caf50',
          fillOpacity: 0.1,
          weight: 1
        }).addTo(map);
      } else {
        markers[id].setIcon(icon);
        markers[id].setLatLng([data.location.lat, data.location.lng]);
        markers[id].getPopup().setContent(popupContent);
        
        // Update accuracy circle
        if (markers[id].accuracyCircle) {
          markers[id].accuracyCircle.setLatLng([data.location.lat, data.location.lng]);
          markers[id].accuracyCircle.setRadius(data.location.accuracy || 10);
        }
      }

      // Add popup open event listener
      markers[id].on('popupopen', () => {
        setTimeout(() => {
          document.querySelectorAll('.focus-btn').forEach(btn => {
            btn.addEventListener('click', () => focusOnAmbulance(id));
          });
          document.querySelectorAll('.route-btn').forEach(btn => {
            btn.addEventListener('click', () => showRouteOptions(id));
          });
        }, 100);
      });

      drawAmbulancePath(id);

      if ((id === selectedAmbulanceId || Object.keys(markers).length === 1) && autoFocus) {
        map.setView([data.location.lat, data.location.lng], map.getZoom());
      }
    }
  }
  
  // Show routing options
  function showRouteOptions(id) {
    if (!ambulanceData[id]) return;
    
    const amb = ambulanceData[id];
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <span class="close-btn">&times;</span>
        <h2>Route Options for ${amb.username}</h2>
        <div class="hospital-list">
          <div class="hospital-item" data-lat="-7.6286" data-lng="111.5317">
            <h3>RSUD Soedono</h3>
            <p>Distance: calculating...</p>
            <button class="route-to-btn">Route Here</button>
          </div>
          <div class="hospital-item" data-lat="-7.6330" data-lng="111.5251">
            <h3>RS Siti Aisyah</h3>
            <p>Distance: calculating...</p>
            <button class="route-to-btn">Route Here</button>
          </div>
          <div class="hospital-item" data-lat="-7.6469" data-lng="111.5311">
            <h3>RSIA Aura Syifa</h3>
            <p>Distance: calculating...</p>
            <button class="route-to-btn">Route Here</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Calculate distances
    const items = modal.querySelectorAll('.hospital-item');
    items.forEach(item => {
      const destLat = parseFloat(item.dataset.lat);
      const destLng = parseFloat(item.dataset.lng);
      const distance = calculateDistance(
        amb.location.lat, 
        amb.location.lng,
        destLat,
        destLng
      );
      
      item.querySelector('p').textContent = `Distance: ${distance.toFixed(1)} km`;
      
      item.querySelector('.route-to-btn').addEventListener('click', () => {
        calculateOptimalRoute(destLat, destLng);
        modal.style.display = 'none';
      });
    });
    
    modal.querySelector('.close-btn').addEventListener('click', () => {
      modal.style.display = 'none';
    });
    
    window.addEventListener('click', (event) => {
      if (event.target === modal) {
        modal.style.display = 'none';
      }
    });
  }

  function removeMarker(id) {
    if (markers[id]) { 
      map.removeLayer(markers[id]); 
      if (markers[id].accuracyCircle) {
        map.removeLayer(markers[id].accuracyCircle);
      }
      delete markers[id]; 
    }
    if (paths[id]) { map.removeLayer(paths[id]); delete paths[id]; }
    delete ambulanceData[id];
    if (selectedAmbulanceId === id) selectedAmbulanceId = null;
  }

  function updateAmbulanceList(ambs) {
    ambulanceList.innerHTML = '<h3 class="ambulance-list-title">Active Ambulances</h3>';
    if (!Object.keys(ambs).length) {
      ambulanceList.innerHTML += '<p class="no-ambulances">No active ambulances at the moment</p>';
      return;
    }
    
    // Sort ambulances by status (moving first, then active, then inactive)
    const sortedAmbs = Object.entries(ambs).sort((a, b) => {
      const aMoving = isAmbulanceMoving(a[0]) ? 0 : 1;
      const bMoving = isAmbulanceMoving(b[0]) ? 0 : 1;
      return aMoving - bMoving;
    });
    
    sortedAmbs.forEach(([id, amb]) => {
      const lastUpdate = new Date(amb.location.timestamp);
      const now = new Date();
      const diff = (now - lastUpdate) / 1000;
      
     let cls = 'status-active', txt = 'Active (Stationary)', ico = '⬤';
      if (diff > 30) { 
        cls = 'status-inactive'; 
        txt = 'Inactive'; 
        ico = '⊗';
      } else if (isAmbulanceMoving(id)) {
        cls = 'status-moving';
        txt = 'Moving';
        ico = '➤';
      }
      
      const speed = amb.location.speed ? (amb.location.speed * 3.6).toFixed(1) : 'N/A';
      
      // Battery level simulation
      const batteryLevel = Math.floor(70 + Math.random() * 30);
      
      const item = document.createElement('div');
      item.className = `ambulance-item ${selectedAmbulanceId === id ? 'selected' : ''}`;
      item.dataset.id = id;
      item.innerHTML = `
        <div class="ambulance-info">
          <h4 class="ambulance-name">${amb.username} <span class="${cls}">${ico} ${txt}</span></h4>
          <div class="ambulance-details">
            <span><i class="fas fa-tachometer-alt"></i> ${speed} km/h</span>
            <div class="battery-indicator">
              <i class="fas fa-battery-three-quarters"></i>
              <div class="battery-level">
                <div class="battery-fill" style="width: ${batteryLevel}%;"></div>
              </div>
            </div>
          </div>
          ${cls === 'status-moving' ? `
            <div class="eta-display">
              <i class="fas fa-clock"></i> ETA: ${Math.floor(5 + Math.random() * 10)} min
            </div>` : ''}
        </div>
        <div class="ambulance-actions">
          <button class="action-btn focus-btn" data-id="${id}">
            <i class="fas fa-crosshairs"></i>
          </button>  
        </div>
      `;
      
      ambulanceList.appendChild(item);
      
      // Add event listener to focus on ambulance when clicked
      item.querySelector('.focus-btn').addEventListener('click', () => focusOnAmbulance(id));
      
      // Make entire item clickable to select ambulance
      item.addEventListener('click', () => {
        focusOnAmbulance(id);
      });
    });
  }
  
  function focusOnAmbulance(id) {
    if (!ambulanceData[id]) return;
    
    // Remove selected class from previously selected
    if (selectedAmbulanceId && document.querySelector(`.ambulance-item[data-id="${selectedAmbulanceId}"]`)) {
      document.querySelector(`.ambulance-item[data-id="${selectedAmbulanceId}"]`).classList.remove('selected');
    }
    
    // Add selected class to currently selected
    if (document.querySelector(`.ambulance-item[data-id="${id}"]`)) {
      document.querySelector(`.ambulance-item[data-id="${id}"]`).classList.add('selected');
    }
    
    selectedAmbulanceId = id;
    
    // Focus map on selected ambulance
    if (map && ambulanceData[id]) {
      map.setView([ambulanceData[id].location.lat, ambulanceData[id].location.lng], 15);
      if (markers[id]) {
        markers[id].openPopup();
      }
      showNotification(`Focusing on ambulance: ${ambulanceData[id].username}`, 'info');
    }
  }

  // Initialize app events
  function setupEventListeners() {
    // Login button events
    if (loginBtn) {
      loginBtn.addEventListener('click', login);
    }
    if (loginAdminBtn) {
      loginAdminBtn.addEventListener('click', () => {
        welcomeSection.style.display = 'none';
        loginSection.style.display = 'block';
      });
    }
    if (backToHomeBtn) {
      backToHomeBtn.addEventListener('click', () => {
        loginSection.style.display = 'none';
        welcomeSection.style.display = 'block';
      });
    }
    
    // Admin panel events
    if (startTrackingBtn) {
      startTrackingBtn.addEventListener('click', startTracking);
    }
    if (stopTrackingBtn) {
      stopTrackingBtn.addEventListener('click', stopTracking);
    }
    if (backToLoginBtn) {
      backToLoginBtn.addEventListener('click', () => {
        mapSection.style.display = 'none';
        adminPanel.style.display = 'block';
      });
    }
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        currentUser = null;
        stopTracking();
        adminPanel.style.display = 'none';
        welcomeSection.style.display = 'block';
      });
    }
    
    // Auto focus event
    if (autoFocusCheckbox) {
      autoFocusCheckbox.addEventListener('change', () => {
        autoFocus = autoFocusCheckbox.checked;
      });
    }
    
    // Map controls events
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        welcomeSection.style.display = 'none';
        mapSection.style.display = 'block';
        if (!mapInitialized) {
          initMap();
          socket.emit('getAmbulances');
        }
      });
    }
    
    if (showTrafficCheckbox) {
      showTrafficCheckbox.addEventListener('change', () => {
        if (showTrafficCheckbox.checked) {
          trafficLayer.addTo(map);
          showNotification('Traffic data enabled', 'info');
        } else {
          map.removeLayer(trafficLayer);
          showNotification('Traffic data disabled', 'info');
        }
      });
    }
    
    if (showHeatmapCheckbox) {
      showHeatmapCheckbox.addEventListener('change', () => {
        if (showHeatmapCheckbox.checked) {
          updateHeatmap();
          showNotification('Incident heatmap enabled', 'info');
        } else {
          if (map && heatLayer) {
            map.removeLayer(heatLayer);
            showNotification('Incident heatmap disabled', 'info');
          }
        }
      });
    }
    
    // Add custom buttons for view map
    if (document.getElementById('viewMapBtn')) {
      document.getElementById('viewMapBtn').addEventListener('click', () => {
        adminPanel.style.display = 'none';
        mapSection.style.display = 'block';
        if (!mapInitialized) {
          initMap();
          socket.emit('getAmbulances');
        }
      });
    }
  }

  // Socket.io event listeners
  socket.on('loginResponse', (data) => {
    if (data.success) {
      currentUser = data.user;
      loginSection.style.display = 'none';
      adminPanel.style.display = 'block';
      adminInfo.textContent = `Welcome, ${currentUser.username}! You are logged in as ${currentUser.role}.`;
      showNotification(`Login successful as ${currentUser.username}`, 'success');
    } else {
      showNotification('Login failed: ' + data.message, 'error');
    }
  });

  socket.on('ambulancesUpdate', (ambs) => {
    // Update ambulance markers
    for (const id in ambs) {
      updateMarker(id, ambs[id]);
    }
    // Remove markers that are no longer active
    for (const id in markers) {
      if (!ambs[id]) {
        removeMarker(id);
      }
    }
    // Update ambulance list
    updateAmbulanceList(ambs);
  });

  socket.on('ambulanceRemoved', (id) => {
    removeMarker(id);
  });
  
  socket.on('emergencyAlert', (data) => {
    // Play alert sound
    const alertSound = new Audio('/sounds/emergency.mp3');
    alertSound.play().catch(e => console.log('Audio play failed:', e));
    
    showNotification(`EMERGENCY ALERT from ${data.username}!`, 'error');
    
    // Flash the map in emergency color
    const mapElement = document.getElementById('map');
    if (mapElement) {
      mapElement.classList.add('emergency-flash');
      setTimeout(() => mapElement.classList.remove('emergency-flash'), 3000);
    }
  });

  // Add weather simulation (updates every 5 minutes)
  function simulateWeather() {
    const weatherTypes = [
      { icon: 'fa-sun', text: 'Clear, 28°C' },
      { icon: 'fa-cloud', text: 'Partly Cloudy, 24°C' },
      { icon: 'fa-cloud-rain', text: 'Light Rain, 22°C' },
      { icon: 'fa-cloud-sun', text: 'Mostly Sunny, 26°C' }
    ];
    
    const weatherContainer = document.createElement('div');
    weatherContainer.className = 'weather-indicator';
    
    const randomWeather = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
    
    weatherContainer.innerHTML = `
      <i class="fas ${randomWeather.icon} weather-icon"></i>
      <div class="weather-info">
        <strong>Current Weather:</strong> ${randomWeather.text}
      </div>
    `;
    
    // Find controls-section to append weather
    const controlsSection = document.querySelector('.controls-section');
    if (controlsSection) {
      // Remove existing weather indicator if present
      const existingWeather = document.querySelector('.weather-indicator');
      if (existingWeather) {
        existingWeather.remove();
      }
      
      controlsSection.appendChild(weatherContainer);
    }
  }
  
  // Add analytics panel
  function addAnalyticsPanel() {
    const analyticsPanel = document.createElement('div');
    analyticsPanel.className = 'analytics-panel';
    analyticsPanel.innerHTML = `
      <h3 class="analytics-title">Emergency Response Analytics</h3>
      <div class="analytics-grid">
        <div class="analytics-card">
          <h3>Average Response Time</h3>
          <div class="value">8.2 <span class="unit">min</span></div>
        </div>
        <div class="analytics-card">
          <h3>Ambulances Active</h3>
          <div class="value" id="active-ambulances">0</div>
        </div>
        <div class="analytics-card">
          <h3>Calls Today</h3>
          <div class="value">${Math.floor(10 + Math.random() * 15)}</div>
        </div>
        <div class="analytics-card">
          <h3>Avg Speed</h3>
          <div class="value">${Math.floor(30 + Math.random() * 20)} <span class="unit">km/h</span></div>
        </div>
      </div>
    `;
    
    const mapContainer = document.querySelector('.map-container');
    if (mapContainer) {
      // Insert after map but before ambulanceList
      const ambulanceList = document.getElementById('ambulanceList');
      if (ambulanceList) {
        mapContainer.insertBefore(analyticsPanel, ambulanceList);
      } else {
        mapContainer.appendChild(analyticsPanel);
      }
    }
    
    // Update active ambulances count
    function updateActiveAmbulances() {
      const activeElement = document.getElementById('active-ambulances');
      if (activeElement) {
        activeElement.textContent = Object.keys(ambulanceData).length;
      }
    }
    
    // Set interval to update analytics
    setInterval(updateActiveAmbulances, 3000);
  }

  // Initialize application
  setupEventListeners();
  setInterval(simulateWeather, 300000); // 5 minutes
  
  // Add analytics after a small delay
  setTimeout(addAnalyticsPanel, 2000);
});
        