var UserListView = (function() {
  'use strict';

  var template =
    '<h3>Active users</h3>' +
    '<ul class="user-list"></ul>';

  function UserListView(id) {
    $(id).append(_.template(template)());
  }

  UserListView.prototype = {
    put: function(name, status) {
      var userId = "user-" + name.split(" ").join("") + Date.now();
      new UserView(userId, this.getDOMElement(), name, status);
      return userId;
    },

    remove: function(userId) {
      $(this.get(userId)).remove();
    },

    get: function(userId) {
      return $(this.getDOMElement()).find("#" + userId);
    },

    mark: function(userId, status) {
      this.get(userId).mark(status);
    },

    getDOMElement: function() {
      return document.getElementById(this.id);
    },

    getListElement: function() {
      return $(this.getDOMElement).find(".file-list")[0];
    }
  };

  return UserListView;
})();
