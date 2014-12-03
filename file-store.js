/**
 * FileStore stores files locally for playback, and also responds to queries about
 * files in the local cache.
 *
 * FileStore contains a metadata entry for EVERY file in the distributed index, for discovery.
 * However, not all file data is stored locally.
 */

function FileEntry(id, name, type, buffer, pinned, element) {
  this.id = id;
  this.name = name;
  this.type = type;
  this.buffer = buffer;
  this.element = element;     // UI handler. Messy but effective
  this.pinned = pinned;       // Does the DHT protocol use this node as a replica for the file?

  // For cache eviction
  this.lastModified = null;
  this.touch();
}

FileEntry.prototype = {
  touch: function () {
    this.lastModified = new Date().getTime(); // Appropriate to use local time
  }
}

function FileStore(client) {
  // UI elements
  this.fileList = client.fileList;
  this.template = client.selectableTemplate;

  this.fileSuffix = _.map(client.uuid.split(" "), function (t) { return t.substr(0,3) }).join("");
  this.counter = 0;
  this.kvstore = {};
}

FileStore.prototype = {
  generateFileId: function () {
    return (this.counter++) + this.fileSuffix;
  },

  hasId: function (id) {
    return id in this.kvstore;
  },

  hasLocalId: function (id) {
    return this.hasId(id) && this.kvstore[id].buffer
  },

  get: function (id) {
    if (this.hasId(id)) this.kvstore[id].touch();
    return this.kvstore[id];
  },

  put: function (id, name, type, buffer, pinned) {
    var fileElement;
    if (this.hasId(id)) { // On overwrite, inherit the UI element
      fileElement = this.kvstore[id].element;
    } else {
      fileElement = $(this.template({ email: name, available: true }));
      fileElement.attr("file-id", id);
      this.fileList.append(fileElement);
      this.fileList.animate({ marginTop: "3%" }, 700);
    }
    this.kvstore[id] = new FileEntry(id, name, type, buffer, pinned, fileElement);
  },

  delete: function (id) {
    if (!this.hasId(id)) return;
    var entry = this.kvstore[id];
    entry.element.hide();
    delete kvstore[entry.id];
  }
}