/**
 * FileStore stores files locally for playback, and also responds to queries about
 * files in the local cache.
 *
 * Keys are generated as client.uuid + "-" + <autoinc counter>
 * e.g. "Quiet Dog-5"
 */

function FileEntry(key, name, type, buffer, element) {
  this.key = key;
  this.name = name;
  this.type = type;
  this.buffer = buffer;
  this.element = element;
  this.lastModified = null;
  this.touch(); // For eviction
}

FileEntry.prototype = {
  touch: function() {
    this.lastModified = new Date().getTime(); // Appropriate to use local time
  }
}

function FileStore(uuid, fileList, template) {
  this.uuid = uuid;

  // UI elements
  this.fileList = fileList;
  this.template = template;

  this.counter = 0;
  this.kvstore = {};
}

FileStore.prototype = {
  generateKey: function() {
    return this.uuid + "-" + this.counter++;
  },

  hasKey: function(key) {
    return key in this.kvstore;
  },

  get: function(key) {
    if (this.hasKey(key)) this.kvstore[key].touch();
    return this.kvstore[key];
  },

  put: function(key, name, type, buffer) {
    var fileElement;
    if (this.hasKey(key)) {
      fileElement = this.kvstore[key].element;
    } else {
      fileElement = $(this.template({ email: name, available: true }));
      fileElement.attr("file-key", key);
      this.fileList.append(fileElement);
      this.fileList.animate({ marginTop: "3%" }, 700);
    }
    this.kvstore[key] = new FileEntry(key, name, type, buffer, fileElement);
  },

  delete: function(key) {
    if (!this.hasKey(key)) return;
    var entry = this.kvstore[key];
    entry.element.hide();
    delete kvstore[entry.key];
  }
}