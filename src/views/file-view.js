var FileView = (function() {
  'use strict';

  var VALID_STATUSES = ['pinned', 'cached', 'remote'];
  var template =
    '<div id="#<%= id %>" class="file" status="<%= status %>">'+
    '   <div class="status"></div>' +
    '   <p class="title"><%= title %></p>' +
    '   <canvas class="progress" width="36" height="36"></canvas>' +
    '</div>';

  function checkStatus(status) {
      if (typeof status === "string" &&
          _.contains(VALID_STATUSES, status)) return;

      throw new Error("Status passed to mark must be in: " +
                      JSON.stringify(VALID_STATUSES));
  }

  function FileView(id, parent, title, status) {
    this.id = id;
    $(parent).append(_.template(template)({
      id: id,
      name: name,
      status: status
    }));

  }

  FileView.prototype = {
    mark: function(status) {
      checkStatus(status);
      $(this.getDOMElement).attr("status", status);
    },

    getDOMElement: function() {
      return document.getElementById(this.id);
    }
  };

  return FileView;
})();
