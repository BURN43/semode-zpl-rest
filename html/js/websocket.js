$(function() {
  // if user is running mozilla then use it's built-in WebSocket
  window.WebSocket = window.WebSocket || window.MozWebSocket;

  // Auto-detect protocol (wss:// for HTTPS, ws:// for HTTP)
  var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Use same port as current page (WebSocket runs on same server now)
  var wsUrl = protocol + '//' + location.hostname + ':' + location.port;
  console.log("Connecting to WebSocket:", wsUrl);
  
  var connection = new WebSocket(wsUrl);

  connection.onopen = function() {
    console.log("WebSocket connected");
  };

  connection.onerror = function(error) {
    console.error(error);
  };

  connection.onmessage = function(message) {
    try {
      var json = JSON.parse(message.data);
      console.log("Websocket send:", json);
      if (json.action == "create" || json.action == "delete") {
        if (json.source == "printer") {
          if (typeof updatePrinterDropdown === "function") {
            updatePrinterDropdown();
          }
        }
        if (json.source == "label") {
          if (typeof updateLabelDropdown === "function") {
            updateLabelDropdown();
          }
        }
        if (json.source == "job") {
          if (typeof updateStatistics === "function") {
            updateStatistics();
          }
        }
      }

    } catch (e) {
      console.error('This doesn\'t look like a valid JSON: ',
        message.data);
      return;
    }
    // handle incoming message
  };
});
