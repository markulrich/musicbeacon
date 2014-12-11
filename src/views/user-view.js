var UserView = (function() {
  'use strict';

  var VALID_STATUSES = ['connected', 'disconnected'];
  var template =
    '<div id="<%= id %>" class="user" status="<%= status %>">'+
    '   <div class="status"></div>' +
    '   <p class="username"><%= name %></p>' +
    '   <canvas class="progress" width="36" height="36"></canvas>' +
    '</div>';

  function checkStatus(status) {
      if (typeof status === "string" &&
          _.contains(VALID_STATUSES, status)) return;

      throw new Error("Status passed to mark must be in: " +
                      JSON.stringify(VALID_STATUSES));
  }

  function UserView(id, parent, name, status) {
    checkStatus(status);
    this.id = id;
    $(parent).append(_.template(template)({
      id: id,
      name: name,
      status: status
    }));
  }

  UserView.prototype = {
    mark: function(status) {
      checkStatus(status);
      $(this.getDOMElement).attr("status", status);
    },
    getDOMElement: function() {
      return document.getElementById(this.id);
    }
  };

  return UserView;
})();
