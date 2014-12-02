var IS_CHROME = !!window.webkitRTCPeerConnection;
var CHUNK_SIZE = (IS_CHROME ? 800 : 50000);

function FileManager() {
  this.fileId = null;
  this.fileName = null;
  this.fileChunks = [];
  this.missingChunks = [];
  this.numRequested = 0;
  this.requestMax = 90;
  this.requestThreshold = 70;
  this.expireTime = 2000;
  this.nChunksReceived = 0;
  this.nChunksExpected = 0;
  this.onrequestready = null;
};

FileManager.prototype = {
  stageLocalFile: function (fID, fName, fType, buffer) {
    this.fileId = fID;
    this.fileName = fName;
    this.fileType = fType;

    var nChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);
    this.fileChunks = new Array(nChunks);
    var start;
    for (var i = 0; i < nChunks; i++) {
      start = i * CHUNK_SIZE;
      this.fileChunks[i] = buffer.slice(start, start + CHUNK_SIZE);
    }

    console.log("File data staged");
  },

  stageRemoteFile: function (fID, fName, fType, nChunks) {
    this.fileId = fID;
    this.fileName = fName;
    this.fileType = fType;
    this.fileChunks = [];
    this.missingChunks = [];
    this.numRequested = 0;
    this.nChunksReceived = 0;
    this.nChunksExpected = nChunks;

    // All chunks are missing to start
    for (var i = 0; i < nChunks; i++) {
      this.missingChunks[i] = true;
    }
  },

  receiveChunk: function (data) {
    if (!this.fileChunks[data.id]) {
      this.fileChunks[data.id] = Base64Binary.decode(data.content);
      this.nChunksReceived++;
      this.numRequested--;
      if (typeof (this.onprogress) == "function") {
        this.onprogress(this.nChunksReceived / this.nChunksExpected);
      }
      if (!this.transferComplete()) {
        if (this.numRequested < this.requestThreshold) {
          this.requestChunks();
        }
      }
      else {
        this.ontransfercomplete();
      }
    }
  },

  requestChunks: function () {
    var self = this;
    var chunks = [];
    var n = 0;
    for (var id in this.missingChunks) {
      chunks.push(id);
      delete this.missingChunks[id];
      if (++n >= this.requestMax) break;
    }
    this.numRequested += n;
    if (!n) return;

    /***
     * This will act as a synchronous return when requestChunks
     * is called directly from Connection, but asynchronously
     * when called from the timeout.
     ***/
    this.onrequestready(chunks);

    this.chunkTimeout = setTimeout(function () {
      var expired = 0;
      for (var i in chunks) {
        var id = chunks[i];
        if (!self.fileChunks[id]) {
          expired++;
          self.numRequested--;
          self.missingChunks[id] = true;
        }
      }
      if (expired && self.numRequested < self.requestThreshold) {
        self.requestChunks();
      }
    }, this.expireTime);
  },

  transferComplete: function () {
    return (this.nChunksExpected == this.nChunksReceived);
  },

  loadArrayBuffer: function (onload) {
    var reader = new FileReader();
    reader.onload = function(e) {
      onload(reader.result);
    };
    reader.readAsArrayBuffer(this.getBlob());
  },

  getBlob: function() {
    return new Blob(this.fileChunks, { type: this.type });
  },

  download: function () {
    var blob = getBlob();
    var link = document.querySelector("#download");
    link.href = window.URL.createObjectURL(blob);
    link.download = this.fileName;
    link.click();
  },

  clear: function () {
    this.fileName = null;
    this.buffer = null;
    clearTimeout(this.chunkTimeout);
  }
};