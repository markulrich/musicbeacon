/**
 * FileStore stores files locally for playback, and also responds to queries about
 * files in the local cache.
 *
 * FileStore maintains an entry for EVERY file in the
 */

function FileEntry(key, name, type, buffer, element, fixed, local) {
  this.key = key;
  this.name = name;
  this.type = type;
  this.buffer = buffer;
  this.element = element; // UI handler. Messy but effective

  this.fixed = fixed; // Does the DHT protocol store the file at this node?
  this.local = local; // Is this file's buffer fixed/cached at this node?

  // For cache eviction
  this.lastModified = null;
  this.touch();
}

FileEntry.prototype = {
  touch: function() {
    this.lastModified = new Date().getTime(); // Appropriate to use local time
  }
}

function FileStore(client) {
  // UI elements
  this.fileList = client.fileList;
  this.template = client.selectableTemplate;

  this.counter = 0;
  this.kvstore = {};
}

FileStore.prototype = {
  generateKey: function() {
    return '0';
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