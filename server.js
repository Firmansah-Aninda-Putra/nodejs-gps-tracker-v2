// server.js
// Enhanced Server-side code for Ambulance GPS Tracker

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Initialize application
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuration
const CONFIG = {
  CLEANUP_INTERVAL: 60000, // 1 minute
  LOCATION_HISTORY_MAX: 50,
  INACTIVE_THRESHOLD: 120000, // 2 minutes
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
};

// In-memory database for simplicity
// In a production environment, use a proper database like MongoDB
const users = [
  { id: 1, username: 'admin', password: hashPassword('admin123'), role: 'admin' },
  { id: 2, username: 'superadmin', password: hashPassword('super123'), role: 'admin' }
];

// Store ambulances with enhanced data
const ambulances = {};
const sessions = {};
const statistics = {
  totalUpdates: 0,
  totalDistance: 0,
  startTime: new Date()
};

// Simple password hashing
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Ensure placeholder images and directories exist
function ensurePlaceholderImages() {
  const imgDir = path.join(__dirname, 'public', 'images');
  const cssDir = path.join(__dirname, 'public', 'css');
  const jsDir = path.join(__dirname, 'public', 'js');
  
  // Create directories if they don't exist
  [imgDir, cssDir, jsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  // Create a placeholder for the PPID logo (green-themed)
  const ppidPlaceholder = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="#2e7d32"/>
      <text x="100" y="100" font-family="Arial" font-size="24" fill="white" text-anchor="middle" dominant-baseline="middle">PPID LOGO</text>
      <text x="100" y="130" font-family="Arial" font-size="14" fill="white" text-anchor="middle" dominant-baseline="middle">Pejabat Pengelola Informasi dan Dokumentasi</text>
    </svg>
  `;
  
  // Create a placeholder for the Madiun City image (green-themed)
  const madiunPlaceholder = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
      <rect width="800" height="400" fill="#f5f5f5"/>
      <rect x="50" y="150" width="150" height="150" fill="#2e7d32"/>
      <rect x="220" y="100" width="100" height="200" fill="#4caf50"/>
      <rect x="340" y="180" width="120" height="120" fill="#66bb6a"/>
      <rect x="480" y="120" width="80" height="180" fill="#81c784"/>
      <rect x="580" y="80" width="170" height="220" fill="#a5d6a7"/>
      <text x="400" y="350" font-family="Arial" font-size="24" fill="#2e7d32" text-anchor="middle">Kota Madiun</text>
    </svg>
  `;

  fs.writeFileSync(path.join(imgDir, 'ppid.jpg'), Buffer.from(ppidPlaceholder));
  fs.writeFileSync(path.join(imgDir, 'kota-madiun.jpeg'), Buffer.from(madiunPlaceholder));
}

// Generate a session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Calculate distance between two GPS points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c; // distance in meters
}

// Validate location data
function validateLocation(location) {
  if (!location) return false;
  if (isNaN(location.lat) || isNaN(location.lng)) return false;
  if (location.lat < -90 || location.lat > 90) return false;
  if (location.lng < -180 || location.lng > 180) return false;
  return true;
}

// Filter outliers and smooth GPS data
function filterLocationData(newLocation, history = []) {
  // If no history, just return the new location
  if (history.length === 0) return newLocation;
  
  const lastLocation = history[history.length - 1];
  
  // Calculate distance between last location and new location
  const distance = calculateDistance(
    lastLocation.lat, lastLocation.lng,
    newLocation.lat, newLocation.lng
  );
  
  // If distance is too large (> 200m within a few seconds), it might be an error
  if (distance > 200 && 
      (new Date(newLocation.timestamp) - new Date(lastLocation.timestamp)) < 5000) {
    // Return smoothed location instead
    return {
      ...newLocation,
      lat: lastLocation.lat + (newLocation.lat - lastLocation.lat) * 0.3,
      lng: lastLocation.lng + (newLocation.lng - lastLocation.lng) * 0.3,
      filtered: true
    };
  }
  
  return newLocation;
}

// Initialize server
function initialize() {
  ensurePlaceholderImages();
  console.log('Server initialized with placeholders');
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoints
app.get('/api/statistics', (req, res) => {
  const runtimeMs = new Date() - statistics.startTime;
  const runtimeHours = Math.floor(runtimeMs / 3600000);
  const runtimeMinutes = Math.floor((runtimeMs % 3600000) / 60000);
  
  res.json({
    ...statistics,
    activeAmbulances: Object.keys(ambulances).length,
    runtime: `${runtimeHours}h ${runtimeMinutes}m`,
    serverTime: new Date().toISOString()
  });
});

// Socket connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  let currentUser = null;
  let sessionToken = null;

  // Login handling
  socket.on('login', (data) => {
    const { username, password } = data;
    const hashedPassword = hashPassword(password);
    
    const user = users.find(u => u.username === username && u.password === hashedPassword);
    
    if (user) {
      // Generate a session token
      sessionToken = generateSessionToken();
      currentUser = { ...user, password: undefined }; // Don't send password back
      
      // Store session
      sessions[sessionToken] = {
        user: currentUser,
        expires: new Date(Date.now() + CONFIG.SESSION_TIMEOUT),
        socketId: socket.id
      };
      
      socket.emit('loginResponse', { 
        success: true, 
        user: currentUser,
        token: sessionToken 
      });
      
      console.log(`User logged in: ${username}`);
    } else {
      socket.emit('loginResponse', { 
        success: false, 
        message: 'Invalid username or password' 
      });
      
      console.log(`Failed login attempt for: ${username}`);
    }
  });

  // Session authentication
  socket.on('authenticate', (data) => {
    const { token } = data;
    const session = sessions[token];
    
    if (session && new Date() < session.expires) {
      currentUser = session.user;
      sessionToken = token;
      session.socketId = socket.id; // Update socket ID
      
      socket.emit('authenticationResponse', {
        success: true,
        user: currentUser
      });
      
      console.log(`User authenticated via token: ${currentUser.username}`);
    } else {
      socket.emit('authenticationResponse', {
        success: false,
        message: 'Invalid or expired session'
      });
      
      if (session) {
        delete sessions[token];
        console.log('Expired session removed');
      }
    }
  });

  // Location update handling with improved accuracy
  socket.on('updateLocation', (data) => {
    // Validate user and location
    if (!currentUser) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }
    
    if (!validateLocation(data.location)) {
      socket.emit('error', { message: 'Invalid location data' });
      return;
    }

    const userId = currentUser.id;
    statistics.totalUpdates++;
    
    // Initialize ambulance record if it doesn't exist
    if (!ambulances[userId]) {
      ambulances[userId] = {
        userId,
        username: currentUser.username,
        location: data.location,
        locationHistory: [],
        filtered: false,
        startTime: new Date().toISOString(),
        totalDistance: 0,
        maxSpeed: 0,
        lastEmergencyStatus: false
      };
    } else {
      // Calculate distance if we have previous location
      if (ambulances[userId].location) {
        const distance = calculateDistance(
          ambulances[userId].location.lat, ambulances[userId].location.lng,
          data.location.lat, data.location.lng
        );
        
        // Update statistics
        ambulances[userId].totalDistance += distance;
        statistics.totalDistance += distance;
        
        // Track max speed
        const speed = data.location.speed || 0;
        if (speed > ambulances[userId].maxSpeed) {
          ambulances[userId].maxSpeed = speed;
        }
      }
      
      // Filter and smooth the location data
      const filteredLocation = filterLocationData(
        data.location, 
        ambulances[userId].locationHistory
      );
      
      // Add previous location to history
      ambulances[userId].locationHistory.push({...ambulances[userId].location});
      
      // Trim history if needed
      if (ambulances[userId].locationHistory.length > CONFIG.LOCATION_HISTORY_MAX) {
        ambulances[userId].locationHistory.shift();
      }
      
      // Update current location
      ambulances[userId].location = filteredLocation;
      ambulances[userId].lastUpdate = new Date().toISOString();
    }

    // Update emergency status if provided
    if (data.emergencyStatus !== undefined) {
      // If emergency status changed to true, notify all clients
      if (data.emergencyStatus && !ambulances[userId].lastEmergencyStatus) {
        io.emit('emergencyAlert', {
          userId,
          username: currentUser.username,
          location: ambulances[userId].location,
          timestamp: new Date().toISOString()
        });
      }
      ambulances[userId].lastEmergencyStatus = data.emergencyStatus;
    }

    // Broadcast updated ambulances to all connected clients
    io.emit('ambulancesUpdate', ambulances);
    
    // Send acknowledgment back to the client
    socket.emit('locationUpdateAck', {
      received: true,
      timestamp: new Date().toISOString(),
      filtered: ambulances[userId].location.filtered || false
    });
  });

  // Stop tracking
  socket.on('stopTracking', (data) => {
    if (!currentUser) return;
    
    const userId = currentUser.id;
    if (ambulances[userId]) {
      // Save tracking data to statistics before removing
      const trackingDuration = new Date() - new Date(ambulances[userId].startTime);
      console.log(`Ambulance ${userId} stopped tracking. Total distance: ${ambulances[userId].totalDistance.toFixed(2)}m, Duration: ${Math.floor(trackingDuration/60000)}m`);
      
      // Remove from active ambulances
      delete ambulances[userId];
      
      // Notify clients
      io.emit('ambulanceRemoved', userId);
      io.emit('ambulancesUpdate', ambulances);
      
      socket.emit('trackingStopped', {
        success: true,
        stats: {
          duration: trackingDuration,
          distance: ambulances[userId]?.totalDistance || 0,
          maxSpeed: ambulances[userId]?.maxSpeed || 0
        }
      });
    }
  });

  // Get all ambulances
  socket.on('getAmbulances', () => {
    socket.emit('ambulancesUpdate', ambulances);
  });

  // Logout
  socket.on('logout', () => {
    if (sessionToken && sessions[sessionToken]) {
      delete sessions[sessionToken];
      console.log(`User logged out: ${currentUser?.username}`);
    }
    currentUser = null;
    sessionToken = null;
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Clean up session if exists
    const sessionKey = Object.keys(sessions).find(key => sessions[key].socketId === socket.id);
    if (sessionKey) {
      console.log(`Session ended for user: ${sessions[sessionKey].user.username}`);
      delete sessions[sessionKey];
    }
  });
});

// Cleanup inactive ambulances regularly
function cleanupInactiveAmbulances() {
  const now = new Date();
  let hasChanges = false;
  
  for (const id in ambulances) {
    const lastUpdate = new Date(ambulances[id].location.timestamp);
    const diffMs = now - lastUpdate;
    
    if (diffMs > CONFIG.INACTIVE_THRESHOLD) {
      console.log(`Removing inactive ambulance: ${id}, Last update: ${Math.floor(diffMs/1000)}s ago`);
      delete ambulances[id];
      hasChanges = true;
    }
  }
  
  // Only broadcast if changes were made
  if (hasChanges) {
    io.emit('ambulancesUpdate', ambulances);
  }
}

// Cleanup expired sessions
function cleanupExpiredSessions() {
  const now = new Date();
  let expiredCount = 0;
  
  for (const token in sessions) {
    if (now > sessions[token].expires) {
      delete sessions[token];
      expiredCount++;
    }
  }
  
  if (expiredCount > 0) {
    console.log(`Cleaned up ${expiredCount} expired sessions`);
  }
}

// Start cleanup intervals
setInterval(cleanupInactiveAmbulances, CONFIG.CLEANUP_INTERVAL);
setInterval(cleanupExpiredSessions, CONFIG.CLEANUP_INTERVAL * 5);

// Initialize and start the server
initialize();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
  statistics.startTime = new Date();
});