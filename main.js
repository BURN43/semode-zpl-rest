var fs = require('fs');
var path = require('path');
var request = require('request');

// config stuff
const ConfigHandler = require('./lib/config.js');
const config = ConfigHandler.getConfig();

// mustache
var Mustache = require('mustache');

// express
var express = require('express')
var favicon = require('serve-favicon')
var session = require('express-session')
var cors = require('cors')
var basicAuth = require('express-basic-auth')  // NEU
// express stuff
var rest = express()

//cors
rest.use(cors())

// ejs
rest.set('view engine', 'ejs');
rest.use(express.static(__dirname + '/html'));
rest.use(favicon(path.join(__dirname, 'html', 'favicon.ico')))

//may edit session secret
// Session config
rest.use(session({
  secret: config.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 36000000
  }
}))

// JSON
rest.use(express.json());

// API Key Middleware f�r Print-Endpunkte
function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  // API Key pr�fen (falls konfiguriert)
  if (config.api_key && apiKey !== config.api_key) {
    console.log('[AUTH] Invalid or missing API key from:', req.ip);
    return res.status(401).json({ error: 'Unauthorized - Invalid API Key' });
  }
  
  next();
}

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

// Basic Auth auf alle Routen anwenden (außer /rest/*)
rest.use(protectDashboard);




// datastorage stuff
if (!fs.existsSync(__dirname + '/db')) {
  fs.mkdirSync(__dirname + '/db');
}

// data storage
var db = require('diskdb');
db.connect(__dirname + '/db', ['label', 'printer', 'jobs']);

// websocket
var WebSocketServer = require('websocket').server;
var http = require('http');

// socket for sending data to the printer
const Net = require('net');

// Main
rest.get('/', function(req, res) {
  var data = {};
  data.config = config;
  data.timespan = req.session.timespan ? req.session.timespan : 24;
  res.render('index', data);
});

// set timespan for index
rest.post('/rest/timespan/(:timespan)', function(req, res) {
  if (!req.params.timespan) {
    return res.status(400).send('no timespan was given');
  }
  req.session.timespan = req.params.timespan;
  res.json({})
});

// Printer
rest.get('/printer', function(req, res) {
  var data = {};
  data.config = config;
  res.render('printer', data);
});

// Label
rest.get('/label', function(req, res) {
  var data = {};
  data.config = config;
  res.render('label', data);
});

// reprint
rest.get('/reprint', function(req, res) {
  var data = {};
  data.config = config;
  data.timespan = req.session.timespan ? req.session.timespan : 24;
  res.render('reprint', data);
});

// rest section
rest.get('/rest/printer', function(req, res) {
  res.json(db.printer.find())
});

rest.get('/rest/label', function(req, res) {
  res.json(db.label.find())
});

// get single label by id
rest.get('/rest/label/(:id)', function(req, res) {
  if (!req.params.id) {
    return res.status(400).send('no id was given');
  }
  var label = db.label.findOne({ _id: req.params.id });
  if (!label) {
    return res.status(404).send('label not found');
  }
  res.json(label);
});

rest.get('/rest/jobs', function(req, res) {
  res.json(db.jobs.find())
});

// delete job
rest.delete('/rest/jobs/(:id)', function(req, res) {
  if (!req.params.id) {
    return res.status(400).send('no id was given');
  }
  var response = db.jobs.remove({
    _id: req.params.id
  });
  res.json(response);
});

// preview zpl code
rest.post('/rest/preview', function(req, res) {
  var response = {};
  if (!req.body.printer) {
    return res.status(400).send('no printer id was given');
  }
  if (!req.body.label) {
    return res.status(400).send('no label id was given');
  }

  var printer = db.printer.findOne({
    _id: req.body.printer
  });
  if (!printer) {
    return res.status(400).send('given printer id ('+req.body.printer+') was not valid');
  }
  var label = db.label.findOne({
    _id: req.body.label
  });
  if (!label) {
    return res.status(400).send('given label id ('+req.body.label+') was not valid');
  }

  if (!printer.density) {
    return res.status(400).send('in this printer no density is defined');
  }

  if (!label.width) {
    return res.status(400).send('in this label no width is defined');
  }

  if (!label.height) {
    return res.status(400).send('in this label no height is defined');
  }

  getPreview(res,req,printer,label, (req.body.zpl?req.body.zpl:label.zpl));

});

rest.get('/rest/preview', function(req, res) {
  var response = {};
  if (!req.query.printer) {
    return res.status(400).send('no printer id was given');
  }
  if (!req.query.label) {
    return res.status(400).send('no label id was given');
  }

  var printer = db.printer.findOne({
    _id: req.query.printer
  });
  if (!printer) {
    return res.status(400).send('given printer id was not valid');
  }
  var label = db.label.findOne({
    _id: req.query.label
  });
  if (!label) {
    return res.status(400).send('given label id was not valid');
  }

  if (!printer.density) {
    return res.status(400).send('in this printer no density is defined');
  }

  if (!label.width) {
    return res.status(400).send('in this label no width is defined');
  }

  if (!label.height) {
    return res.status(400).send('in this label no height is defined');
  }

  getPreview(res,req,printer,label,(req.query.zpl?req.query.zpl:label.zpl));

});

function getPreview(res,req,printer,label,zpl){
  var options = {
    encoding: null,
    formData: {
      file: zpl
    },
    url: 'http://api.labelary.com/v1/printers/'+printer.density+'/labels/'+label.width+'x'+label.height+'/0/' // adjust print density (8dpmm), label width (4 inches), label height (6 inches), and label index (0) as necessary
  };

  request.post(options, function(err, resp, body) {
    if (err) {
      console.log((new Date()), err);
      res.json(err);
    }else{
      res.json({"img":new Buffer(body).toString('base64')});
    }
  });
}

// actuall reprint
rest.post('/rest/reprint/(:id)', function(req, res) {
  var response = {};
  if (!req.params.id) {
    return res.status(400).send('no job id was given');
  }

  var job = db.jobs.findOne({
    _id: req.params.id
  });

  if (!job) {
    return res.status(400).send('given job id was not valid');
  }

  if(req.body.printer){
    var printer = db.printer.findOne({
      _id: req.body.printer
    });
    if (!printer) {
      return res.status(400).send('given printer id was not valid');
    }
    job.printer_id = printer._id;
    job.printer_name = printer.name;
    job.printer_address = printer.address;
    job.printer_ip = printer.address.split(':')[0];
    job.printer_port = parseInt(printer.address.split(':')[1]);
  }

  if(req.body.zpl){
    job.zpl = req.body.zpl;
  }

  var old_id = job._id;
  delete job._id;
  job.date = new Date();
  job.reprint = true;
  job.previous_id = old_id;

  console.log((new Date()) + ' reprint job received', job);

  executeRequest(job, function(ret) {
    job = ret;
    db.jobs.save(job);

    var broadcast = {};
    broadcast.source = "job";
    broadcast.data = job;
    broadcastMsg(broadcast);

    res.json(job)
  });
});

// actuall print
// Direct ZPL print (ohne Label-ID)
rest.post('/rest/print-direct', requireApiKey, function(req, res) {
  if (!req.body.printer) {
    return res.status(400).send('no printer id was given');
  }
  if (!req.body.zpl) {
    return res.status(400).send('no zpl was given');
  }

  var printer = db.printer.findOne({
    _id: req.body.printer
  });
  if (!printer) {
    return res.status(400).send('given printer id was not valid');
  }

  var job = {};
  job.date = new Date();
  job.printer_id = printer._id;
  job.printer_name = printer.name;
  job.printer_address = printer.address;
  job.printer_ip = printer.address.split(':')[0];
  job.printer_port = parseInt(printer.address.split(':')[1]);
  job.label_name = 'Direct ZPL';
  job.zpl = req.body.zpl;
  job.job_id = typeof req.body.job_id !== 'undefined' ? req.body.job_id : null;

  console.log((new Date()) + ' direct print job received', job);

  executeRequest(job, function(ret) {
    job = ret;
    db.jobs.save(job);

    var broadcast = {};
    broadcast.source = "job";
    broadcast.data = job;
    broadcastMsg(broadcast);

    res.json(job)
  });
});

rest.post('/rest/print', requireApiKey, function(req, res) {
  var response = {};
  if (!req.body.printer) {
    return res.status(400).send('no printer id was given');
  }
  if (!req.body.label) {
    return res.status(400).send('no label id was given');
  }

  var printer = db.printer.findOne({
    _id: req.body.printer
  });
  if (!printer) {
    return res.status(400).send('given printer id was not valid');
  }
  var label = db.label.findOne({
    _id: req.body.label
  });
  if (!label) {
    return res.status(400).send('given label id was not valid');
  }

  var job = {};
  job.date = new Date();
  job.printer_id = printer._id;
  job.printer_name = printer.name;
  job.printer_address = printer.address;
  job.printer_ip = printer.address.split(':')[0];
  job.printer_port = parseInt(printer.address.split(':')[1]);
  job.label_id = label._id;
  job.label_name = label.name;
  job.label_zpl = label.zpl;
  job.data = req.body.data;
  job.job_id = typeof req.body.job_id !== 'undefined' ? req.body.job_id : null;


  job.zpl = label.zpl;
  for (key in job.data) {
    job.zpl = job.zpl.replace("${" + key + "}", job.data[key])
  }

  var mustache_reg = /{{(.*)}}/gm;
  if (mustache_reg.exec(job.zpl)) {
    job.mustache = true;
    job.zpl = Mustache.render(job.zpl, job.data);
  } else {
    job.mustache = false;
  }

  console.log((new Date()) + ' print job received', job);

  executeRequest(job, function(ret) {
    job = ret;
    db.jobs.save(job);

    var broadcast = {};
    broadcast.source = "job";
    broadcast.data = job;
    broadcastMsg(broadcast);

    res.json(job)
  });
});

function executeRequest(job, callback) {
  var client = new Net.Socket();
  
  // ✅ Detect if ZPL contains RFID commands
  var hasRFID = job.zpl.includes('^RS') || job.zpl.includes('^RFW') || job.zpl.includes('^RB');
  var printerResponseBuffer = '';
  var responseTimeout = null;

  client.setTimeout(5000, function() {
    console.error((new Date()) + " " + "connection timed out");
    job.failed = true;
    job.error = "connection timed out";
    if (hasRFID) {
      job.rfid_success = false;
      job.rfid_error = "Connection timeout";
    }
    callback(job);
    client.destroy();
  });

  client.connect({
    port: job.printer_port,
    host: job.printer_ip
  }, function() {
    console.log(new Date() + " connected to printer, sending ZPL...");
    client.write(job.zpl);
    job.failed = false;
    
    // ✅ If RFID: Wait for printer response (with timeout)
    if (hasRFID) {
      console.log(new Date() + " RFID detected, waiting for printer feedback...");
      job.has_rfid = true;
      job.rfid_success = null; // Unknown until we get feedback
      
      // Wait 3 seconds for RFID feedback, then callback
      responseTimeout = setTimeout(function() {
        // ⚠️ Timeout = Drucker antwortet nicht ODER kein RFID-Modul!
        if (job.rfid_success === null) {
          console.warn(new Date() + " RFID TIMEOUT - Drucker hat kein RFID-Modul oder Tag nicht erkannt");
          job.rfid_success = false;  // RFID war nicht erfolgreich
          job.rfid_error = "RFID timeout - Drucker hat kein RFID-Modul oder Tag nicht erkannt";
          // ✅ ABER: Print war trotzdem erfolgreich! Nur RFID fehlt!
          // job.failed bleibt false (wurde bereits in connect gesetzt)
          console.log(new Date() + " Print erfolgreich, ABER RFID fehlgeschlagen");
        }
        callback(job);
        client.destroy();
      }, 3000);
      
    } else {
      // No RFID: callback immediately
      console.log(new Date() + " No RFID detected, immediate callback");
      job.has_rfid = false;
      job.rfid_success = null; // N/A for non-RFID labels
      callback(job);
      client.destroy();
    }
  });

  client.on('error', function(err) {
    console.error((new Date()) + " " + err);
    job.failed = true;
    job.error = err;
    if (hasRFID) {
      job.rfid_success = false;
      job.rfid_error = err.toString();
    }
    if (responseTimeout) clearTimeout(responseTimeout);
    callback(job);
    client.destroy();
  });

  client.on('data', function(chunk) {
    printerResponseBuffer += chunk.toString();
    job.printer_data = printerResponseBuffer;
    console.log(new Date() + " received data from printer:", chunk.toString());
    
    // ✅ Parse RFID response if applicable
    if (hasRFID) {
      // Check for RFID errors (Zebra sends alerts for RFID failures)
      // Common RFID error codes: RFID TAG NOT FOUND, RFID WRITE ERROR, etc.
      var hasRFIDError = 
        printerResponseBuffer.includes('RFID') && 
        (printerResponseBuffer.includes('ERROR') || 
         printerResponseBuffer.includes('FAIL') ||
         printerResponseBuffer.includes('NOT FOUND') ||
         printerResponseBuffer.includes('TIMEOUT'));
      
      if (hasRFIDError) {
        console.error(new Date() + " RFID ERROR detected in printer response!");
        job.rfid_success = false;
        job.rfid_error = printerResponseBuffer.trim();
        job.failed = true;
        job.error = "RFID encoding failed";
        
        // Clear timeout and callback immediately
        if (responseTimeout) clearTimeout(responseTimeout);
        callback(job);
        client.destroy();
      } else {
        // Check if we got a positive response (e.g., tag written successfully)
        // Some printers send confirmation messages
        var hasRFIDSuccess = 
          printerResponseBuffer.includes('RFID') && 
          printerResponseBuffer.includes('SUCCESS');
        
        if (hasRFIDSuccess) {
          console.log(new Date() + " RFID SUCCESS confirmed by printer!");
          job.rfid_success = true;
          
          // Clear timeout and callback immediately
          if (responseTimeout) clearTimeout(responseTimeout);
          callback(job);
          client.destroy();
        } else if (printerResponseBuffer.length > 0) {
          // ✅ Drucker hat geantwortet, aber kein expliziter Success oder Error
          // Zebra Drucker antworten normalerweise nur bei Errors!
          // Wenn Response da ist und kein Error → wahrscheinlich OK
          console.log(new Date() + " RFID: Drucker antwortet, kein Error erkannt - vermutlich OK");
          job.rfid_success = true;
          
          // Clear timeout and callback immediately
          if (responseTimeout) clearTimeout(responseTimeout);
          callback(job);
          client.destroy();
        }
        // Otherwise: wait for timeout (will be treated as failure)
      }
    }
  });

  client.on('end', function() {
    console.log(new Date() + " printer connection ended");
  });
}

// create or update printer
rest.post('/rest/printer', function(req, res) {
  var address = req.body.address;

  if (!address || address == "" || address.split(":").length != 2 || parseInt(address.split(":")[1]) == NaN) {
    return res.status(400).send('address is not valid');
  }
  var response;
  var broadcast = {};
  broadcast.source = "printer";
  if (req.body._id) {
    broadcast.action = "update";
    response = db.printer.update({
      _id: req.body._id
    }, req.body, {
      upsert: true
    });
  } else {
    broadcast.action = "create";
    response = db.printer.save(req.body);
  }
  broadcast.data = response;
  broadcastMsg(broadcast);
  res.json(response)
});

// create or update label
rest.post('/rest/label', function(req, res) {
  var response;
  var broadcast = {};
  broadcast.source = "label";
  if (req.body._id) {
    broadcast.action = "update";
    response = db.label.update({
      _id: req.body._id
    }, req.body, {
      upsert: true
    });
  } else {
    broadcast.action = "create";
    if (!req.body.zpl) req.body.zpl = "^XA\n\n^XZ"
    response = db.label.save(req.body);
  }
  broadcast.data = response;
  broadcastMsg(broadcast);
  res.json(response)
});

// update label
rest.put('/rest/label/(:id)', function(req, res) {
  if (!req.params.id) {
    return res.status(400).send('no id was given');
  }
  
  var updateData = {
    name: req.body.name,
    zpl: req.body.zpl
  };
  
  if (req.body.width) updateData.width = req.body.width;
  if (req.body.height) updateData.height = req.body.height;
  
  var response = db.label.update({
    _id: req.params.id
  }, updateData);
  
  var broadcast = {};
  broadcast.source = "label";
  broadcast.action = "update";
  broadcast.data = response;
  broadcastMsg(broadcast);
  
  res.json(response);
});

// update printer
rest.put('/rest/printer/(:id)', function(req, res) {
  if (!req.params.id) {
    return res.status(400).send('no id was given');
  }
  
  var address = req.body.address;
  if (!address || address == "" || address.split(":").length != 2 || parseInt(address.split(":")[1]) == NaN) {
    return res.status(400).send('address is not valid');
  }
  
  // Update printer with new data
  var updateData = {
    name: req.body.name,
    address: req.body.address,
    density: parseInt(req.body.density) || 12  // Convert to integer, default to 12
  };
  
  // Add optional fields if provided
  if (req.body.width) updateData.width = parseInt(req.body.width);
  if (req.body.height) updateData.height = parseInt(req.body.height);
  
  var response = db.printer.update({
    _id: req.params.id
  }, updateData);
  
  var broadcast = {};
  broadcast.source = "printer";
  broadcast.action = "update";
  broadcast.data = response;
  broadcastMsg(broadcast);
  
  res.json(response);
});

// delete printer
rest.delete('/rest/printer/(:id)', function(req, res) {
  if (!req.params.id) {
    return res.status(400).send('no id was given');
  }
  var broadcast = {};
  broadcast.source = "printer";
  broadcast.action = "delete";
  var response = db.printer.remove({
    _id: req.params.id
  });
  broadcast.data = response;
  broadcastMsg(broadcast);
  res.json(response);
});

// delete label
rest.delete('/rest/label/(:id)', function(req, res) {
  if (!req.params.id) {
    return res.status(400).send('no id was given');
  }
  var broadcast = {};
  broadcast.source = "label";
  broadcast.action = "delete";
  var response = db.label.remove({
    _id: req.params.id
  });
  broadcast.data = response;
  broadcastMsg(broadcast);
  res.json(response);
});

// Create HTTP server for Express + WebSocket
var http = require('http');
var expressServer = http.createServer(rest);

// Starting REST & WebSocket on SAME port
if (config.public) {
  expressServer.listen(config.port, function() {
    console.log((new Date()) + " REST & WebSocket listening on port %d in public mode", config.port);
  });
} else {
  expressServer.listen(config.port, 'localhost', function() {
    console.log((new Date()) + " REST & WebSocket listening on port %d in localhost mode", config.port);
  });
}

// WebSocket on same HTTP server as Express
wsServer = new WebSocketServer({
  httpServer: expressServer
});

var websockt_clients = [];

// WebSocket server
wsServer.on('request', function(request) {
  console.log((new Date()) + ' Connection from origin ' + request.origin + '.');
  var connection = request.accept(null, request.origin);
  var index = websockt_clients.push(connection) - 1;

  console.log((new Date()) + ' Connection accepted.');
  connection.on('message', function(message) {});

  connection.on('close', function(connection) {
    console.log((new Date()) + " Peer " + connection.remoteAddress + " disconnected.");
    websockt_clients.splice(index, 1);
  });
});

function broadcastMsg(json) {
  for (var i = 0; i < websockt_clients.length; i++) {
    websockt_clients[i].sendUTF(JSON.stringify(json));
  }
}
