var changeTimespan;

// ✅ Deutsche Zeitzone & Datumsformat (DD.MM.YYYY HH:MM:SS)
function formatGermanDateTime(date) {
  return date.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

$(document).ready(function() {

  var components = {};

  $('#jobprinter').click(function(){
    $('#jobprinter').text("Printer");
    $('#jobprinter').data("printer","");
    console.log("asd 2");
    $(this).parent().find('a.dropdown-item').each(function() {
      var $item = $(this);
      console.log("asd");
      if ($item.data("events") == undefined) {
        $item.click(function(ev) {
          var $this = $(this);
          $('#jobprinter').text($this.text());
          $('#jobprinter').data("printer",$this.data("id"));
          console.log("Klappt");
        });
      }
    });
  });

  $('#gzpl').change(function(){
    if($('#jobprinter').data("printer")){
      $.ajax({
        url: "/rest/preview",
        type: 'post',
        contentType: 'application/json',
        data: JSON.stringify({
          printer: $('#jobprinter').data("printer"),
          label: $('#jobModal').data("job").label_id,
          zpl: $('#gzpl').val()
        }),
        dataType: 'json',
        success: function(data) {
          $("#imgContainer").find("img").attr("src","data:image/png;base64, "+data.img);
        },
        error: function(data) {
          toastr.error(JSON.stringify(data),'preview failed')
        }
      });
    }else {
      toastr.error("printer required");
    }
  });

  $('#reprint').click(function(){
    if($('#jobprinter').data("printer")){
      $.ajax({
        url: "/rest/reprint/"+$('#jobModal').data("job")._id,
        type: 'post',
        contentType: 'application/json',
        data: JSON.stringify({
          printer: $('#jobprinter').data("printer"),
          zpl: $('#gzpl').val()
        }),
        dataType: 'json',
        success: function(data) {
          toastr.info("reprint done");
        },
        error: function(data) {
          toastr.error(JSON.stringify(data),'reprint failed')
        }
      });
    }else {
      toastr.error("printer required");
    }
  });

  changeTimespan = function(hours) {
    var now = new Date();
    $.getJSON("/rest/jobs", function(data) {
      var result = [];
      $.each(data, function(index, job) {
        var jobDate = new Date(job.date);
        var delta = Math.abs(now - jobDate) / 1000 / 60 / 60;
        if (delta <= hours) {
          result.push(job);
        }
      });

      if (components['#table']) {
        components['#table'].destroy();
      }

      $tbody = $("#table").find("tbody");
      $tbody.html("");

      result.forEach(function(job) {
        var timeStamp = new Date(job.date);
        var jobId = (typeof job.job_id !== "undefined" && job.job_id !== null && job.job_id !== "") ? job.job_id : "-";
        
        // ✅ RFID Status Badge
        var rfidBadge = "";
        if (job.has_rfid === true) {
          if (job.rfid_success === true) {
            rfidBadge = '<span class="badge badge-success"><i class="fas fa-check"></i> Success</span>';
          } else if (job.rfid_success === false) {
            var errorTitle = job.rfid_error ? 'title="' + job.rfid_error + '"' : '';
            rfidBadge = '<span class="badge badge-danger" ' + errorTitle + '><i class="fas fa-times"></i> Failed</span>';
          } else {
            rfidBadge = '<span class="badge badge-warning"><i class="fas fa-question"></i> Unknown</span>';
          }
        } else {
          rfidBadge = '<span class="badge badge-secondary">N/A</span>';
        }
        
        $row = $('<tr><td>' + job.printer_name + '</td><td>' + job.label_name + '</td><td>' + jobId + '</td><td data-order="' + timeStamp.getTime() + '">' + formatGermanDateTime(timeStamp) + '</td><td>' + rfidBadge + '</td><td>' + (typeof job.error !== "undefined" ? (JSON.stringify(job.error)) : "") + '</td><td><div class="btn-group" role="group"><button class="btn btn-secondary review"><i class="fas fa-fw fa-search"></i></button><button class="btn btn-primary print"><i class="fas fa-fw fa-print"></i></button></div></td></tr>');
        $row.data("job", job);
        $row.find('.print').click(function() {
          $.ajax({
            url: "/rest/reprint/" + job._id,
            type: 'post',
            contentType: 'application/json',
            dataType: 'json',
            success: function(data) {
              if (data.failed == false)
                toastr.info('reprint was send');
              else
                toastr.error(data.error, 'reprint failed');
            },
            error: function(data) {
              toastr.error('reprint failed')
            }
          });
        });

        $row.find('.review').click(function() {

          // ✅ RFID Status Alert anzeigen
          var $rfidAlert = $('#rfidAlert');
          if (job.has_rfid === true) {
            if (job.rfid_success === true) {
              $rfidAlert.html('<div class="alert alert-success" role="alert"><i class="fas fa-check-circle"></i> <strong>RFID Success!</strong> Tag wurde erfolgreich codiert.</div>');
              $rfidAlert.show();
            } else if (job.rfid_success === false) {
              var errorMsg = job.rfid_error || 'Unknown error';
              $rfidAlert.html('<div class="alert alert-danger" role="alert"><i class="fas fa-exclamation-triangle"></i> <strong>RFID Failed!</strong> ' + errorMsg + '</div>');
              $rfidAlert.show();
            } else {
              $rfidAlert.html('<div class="alert alert-warning" role="alert"><i class="fas fa-question-circle"></i> <strong>RFID Status Unknown</strong></div>');
              $rfidAlert.show();
            }
          } else {
            $rfidAlert.hide();
          }

          $.ajax({
            url: "/rest/preview",
            type: 'post',
            contentType: 'application/json',
            data: JSON.stringify({
              printer: job.printer_id,
              label: job.label_id,
              zpl: job.zpl
            }),
            dataType: 'json',
            success: function(data) {
              $("#imgContainer").find("img").attr("src","data:image/png;base64, "+data.img);
            },
            error: function(data) {
              $("#imgContainer").find("img").attr("src","");
              toastr.error(JSON.stringify(data),'preview failed')
            }
          });

          $('#data').val(JSON.stringify(job.data, null, 2));
          $('#zpl').val(job.label_zpl);
          $('#gzpl').val(job.zpl);
          $('#json').val(JSON.stringify(job, null, 2));

          if($('#jobprinter').parent().find('.dropdown-item[data-id="'+job.printer_id+'"]').length > 0){
            var text = $('#jobprinter').parent().find('.dropdown-item[data-id="'+job.printer_id+'"]').text();
            $('#jobprinter').text(text);
            $('#jobprinter').data("printer",job.printer_id);
          }else{
            $('#jobprinter').text("Printer");
            $('#jobprinter').data("printer","");
          }

          $('#jobModal').data("job", job);
          if(jobId !== "-" ){
            $('#jobModalLabel').text('Job ' + jobId);
          } else {
            $('#jobModalLabel').text('Job');
          }
          $('#jobModal').modal();
        });
        $tbody.append($row);
      });

      //
      components['#table'] = $('#table').DataTable({
        "lengthMenu": [
          [10, 25, 50, -1],
          [10, 25, 50, "All"]
        ],
        "order": [[ 3, "desc" ]]  // Date column (0-indexed: Printer=0, Label=1, JobID=2, Date=3)
      });

    });
  };

  changeTimespan(parseInt($('#timespan').data("time")));
});
