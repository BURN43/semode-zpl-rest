// ==============================================
// DASHBOARD AUTH PATCH für zpl-rest/main.js
// ==============================================
// Diese Code-Snippets in main.js einfügen:

// 1. Nach Zeile 16 (nach var cors = require('cors')) hinzufügen:
var basicAuth = require('express-basic-auth')

// 2. Nach Zeile 54 (nach der requireApiKey Funktion) hinzufügen:

// Basic Auth Middleware für Dashboard (nicht für API!)
const dashboardAuth = basicAuth({
  users: { 
    [config.dashboard_username || 'admin']: config.dashboard_password || 'changeme'
  },
  challenge: true,
  realm: 'zpl-rest Dashboard',
  unauthorizedResponse: (req) => {
    return 'Unauthorized - Invalid credentials'
  }
});

// Middleware um zu checken ob Route geschützt werden soll
function protectDashboard(req, res, next) {
  // API-Endpunkte NICHT schützen
  if (req.path.startsWith('/rest/')) {
    return next();
  }
  // Dashboard mit Basic Auth schützen (falls konfiguriert)
  if (config.dashboard_password) {
    return dashboardAuth(req, res, next);
  }
  // Falls kein Password gesetzt = kein Schutz
  next();
}

// 3. Nach Zeile 41 (nach rest.use(express.json());) hinzufügen:
rest.use(protectDashboard);

// ==============================================
// FERTIG! Dann npm install express-basic-auth
// und zpl-rest neu starten
// ==============================================
