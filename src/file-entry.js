var FileEntry = (function() {
  function FileEntry(id, name, type, buffer, pinned, element) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.buffer = buffer;
    this.element = element;     // UI handler. Messy but effective
    this.pinned = pinned;       // Does the DHT protocol use this node as a replica for the file?

    this.updateElement();

    // For cache eviction
    this.lastModified = null;
    this.touch();
  }

  FileEntry.prototype = {
    touch: function() {
      this.lastModified = new Date().getTime(); // Appropriate to use local time
    },

    updateElement: function() {
      if (this.pinned) this.element.attr('status', 'pinned');
      else if (this.buffer) this.element.attr('status', 'local');
      else this.element.attr('status', 'remote');
    }
  };

  return FileEntry;
})();
