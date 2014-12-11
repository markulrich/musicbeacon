var FileListView = (function() {
  'use strict';

  var template =
    '<h3>Available files</h3>' +
    '<ul class="file-list"></ul>';

  function FileListView(id) {
    this.id = id;
    $(id).append(_.template(template)());
  }

  FileListView.prototype = {
    put: function(title, status) {
      var fileId = title + Date.now();
      var fileView = new FileView(fileId, this.getListElement, title, status);
    },

    remove: function(fileId) {
      $(this.get(fileId)).remove();
    },

    get: function(fileId) {
      return $(this.getListElement()).find("#" + fileId);
    },

    mark: function(fileId, status) {
      this.get(fileId).mark(status);
    },

    select: function(fileId) {
      var selected = this.selected();
      if (!_.empty(selected)) {
        $(selected).each(function(e) {
          $(e).toggleClass("selected", false);
        });
      }

      $(this.get(fileId)).toggleClass("selected");
    },

    selected: function() {
      return $(this.getListElement()).find(".selected");
    },

    getDOMElement: function() {
      return document.getElementById(this.id);
    },

    getListElement: function() {
      return $(this.getDOMElement).find(".file-list")[0];
    }
  };

  return FileListView;
})();
