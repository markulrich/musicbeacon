/**
 * FileStore stores files locally for playback, and also responds to queries about
 * files in the local cache.
 *
 * Keys are generated as client.uuid + '-' + <autoinc counter>
 * e.g. 'Quiet Dog-5'
 */

function FileEntry(key, name, type, buffer) {
  this.key = key;
  this.name = name;
  this.type = type;
  this.buffer = buffer;
  this.lastModified = null;
  this.touch(); // For eviction
}

FileEntry.prototype = {
  touch: function() {
    this.lastModified = new Date().getTime(); // Appropriate to use local time
  }
}

function FileStore(client) {
  this.client = client;
  this.counter = 0;
  this.kvstore = {};
}

FileStore.prototype = {
  generateKey: function() {
    return this.client.uuid + '-' + this.counter++;
  },

  hasKey: function(key) {
    return key in this.kvstore;
  },

  get: function(key) {
    this.kvstore[key].touch();
    return this.kvstore[key];
  },

  put: function(key, name, type, buffer) {
    this.kvstore[key] = new FileEntry(key, name, type, buffer);
  }
}