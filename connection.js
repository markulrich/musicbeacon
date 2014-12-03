var Connection = (function () {
  "use strict";

  var HOSTED = window.location.protocol !== "file:";
  var protocol = {
    CHANNEL: "get-my-file2",
    OFFER: "offer",
    ANSWER: "answer",
    CANCEL: "cancel",
    REQUEST_CHUNK: "req-chunk",
    DATA: "data",
    DONE: "done",
    PLAY: "play",
    FILE_ENTRY: "file-entry",
    REQUEST_FILE: "req-file"
  };

  function Connection(client, email, element, pubnub) {
    this.client = client;
    this.uuid = client.uuid;    // Local id
    this.id = email;            // Target id
    this.element = element;     // UI handler. Messy but effective
    this.progress = element.querySelector(".progress");
    this.p2pEstablished = false;
    this.pubnub = pubnub;
    this.allConnections = client.allConnections;
    this.fileStreams = {};

    this.createChannelCallbacks();
    this.createFileCallbacks();
    this.initProgress();

    this.debug = function(msg) {
      console.log("<" + this.id + "> " + msg);
    }
  };

  Connection.prototype = {
    requestFile: function (fileId) {
      this.debug("Requesting file entry for " + fileId);
    },

    sendFileEntry: function (fileId, fileName) {
      this.debug("Sending empty file entry for " + fileId);
      this.pubnub.publish({
        channel: protocol.CHANNEL,
        message: {
          uuid: this.uuid,
          target: this.id,
          fileId: fileId,
          fileName: fileName,
          action: protocol.FILE_ENTRY
        }
      });
    },

    sendPlay: function (fileId, playTime) {
      this.debug("Sending play for " + fileId);
      this.pubnub.publish({
        channel: protocol.CHANNEL,
        message: {
          uuid: this.uuid,
          target: this.id,
          fileId: fileId,
          playTime: playTime,
          action: protocol.PLAY,
        }
      });
    },

    offerShare: function (fileId, fileName, fileType, buffer, pinned) {
      this.debug("Offering share of", fileId);

      var manager = this.setupFileManager();
      manager.stageLocalFile(fileId, buffer);
      this.fileStreams[fileId] = manager;

      this.pubnub.publish({
        channel: protocol.CHANNEL,
        message: {
          uuid: this.uuid,
          target: this.id,
          fileId: fileId,
          fileName: fileName,
          fileType: fileType,
          nChunks: manager.fileChunks.length,
          pinned: pinned,
          action: protocol.OFFER,
        }
      });
    },

    answerShare: function (fileId) {
      this.debug("Answering share of", fileId);
      // Tell other node to join the P2P channel if not already on
      this.pubnub.publish({
        channel: protocol.CHANNEL,
        message: {
          uuid: this.uuid,
          target: this.id,
          fileId: fileId,
          action: protocol.ANSWER
        }
      });
      this.p2pSetup();
      this.fileStreams[fileId].requestChunks();
    },

    cancelShare: function (fileId) {
      this.debug("Cancelling share of", fileId);
      this.pubnub.publish({
        channel: protocol.CHANNEL,
        message: {
          uuid: this.uuid,
          target: this.id,
          fileId: fileId,
          action: protocol.ANSWER
        }
      });
    },

    send: function (data) {
      this.pubnub.publish({
        channel: protocol.CHANNEL,
        user: this.id,
        message: data
      });
    },

    packageChunk: function (fileId, chunkId) {
      return JSON.stringify({
        action: protocol.DATA,
        fileId: fileId,
        id: chunkId,
        content: Base64Binary.encode(this.fileStreams[fileId].fileChunks[chunkId])
      });
    },

    handleSignal: function (msg) {
      if (msg.action === protocol.OFFER) {
        this.debug("Received remote offer for " + msg.fileId);
        if (this.client.fileStore.hasLocalId(msg.fileId)) {
          this.cancelShare(msg.fileId);
        } else {
          var manager = this.setupFileManager();
          manager.stageRemoteFile(msg.fileId, msg.fileName, msg.fileType, msg.pinned, msg.nChunks);
          this.fileStreams[msg.fileId] = manager;
          this.answerShare(msg.fileId);
        }
      } else if (msg.action === protocol.ANSWER) {
        this.p2pSetup();
      } else if (msg.action === protocol.CANCEL) {
        this.debug('Share canceled.');
        delete this.fileStreams[msg.fileId];
      } else if (msg.action === protocol.PLAY) {
        this.debug("Received remote play for " + msg.fileId);
        if (!this.client.fileStore.hasLocalId(msg.fileId)) {
          this.debug("Not replicated here...fetching data for " + msg.fileId)
          this.client.audioManager.bufferPlay(msg.fileId, msg.playTime);
          this.client.requestFile(msg.fileId);
        } else {
          var buffer = this.client.fileStore.get(msg.fileId).buffer;
          this.client.audioManager.playFile(msg.fileId, buffer, msg.playTime);
        }
      } else if (msg.action === protocol.FILE_ENTRY) {
        if (this.client.fileStore.hasId(msg.fileId)) return;
        this.client.fileStore.put(msg.fileId, msg.fileName, null, null, false);
      }
    },

    handlePresence: function (msg) {
      this.debug("Connection handling presence msg: " + msg.action);
      if (msg.action === "join") {
        this.available = true;

        var j = $(this.element);
        j.show().prependTo(j.parent());
        this.client.handleJoin(this.id);
      } else {
        this.available = false;
        for (fileId in this.fileStreams) {
          delete this.fileStreams[fileId];
        }
        this.reset();

        var j = $(this.element);
        j.hide().appendTo(j.parent());
        this.client.dht.removeNode(this.id);
      }
    },

    p2pSetup: function () {
      if (this.p2pEstablished) return;
      this.p2pEstablished = true;

      this.debug("Setting up P2P");
      this.pubnub.subscribe({
        channel: protocol.CHANNEL,
        user: this.id,
        callback: this.onP2PMessage
      });
      var self = this;
    },

    createChannelCallbacks: function () {
      var self = this;
      this.onP2PMessage = function (data) {
        // this.debug("P2P message: ", data.action);
        if (data.action === protocol.DATA) {
          self.fileStreams[data.fileId].receiveChunk(data);
        } else if (data.action === protocol.REQUEST_CHUNK) {
          self.nChunksSent += data.ids.length;
          self.updateProgress(data.nReceived / self.fileStreams[data.fileId].fileChunks.length);
          data.ids.forEach(function (id) {
            self.send(self.packageChunk(data.fileId, id));
          });
        } else if (data.action === protocol.DONE) {
          var t = (Date.now() - self.fileStreams[data.fileId].started) / 1000;
          self.debug("Share of " + data.fileId + " took " + t + " seconds");
          delete self.fileStreams[data.fileId];
          self.reset();
        }
      };
    },

    createFileCallbacks: function () {
      var self = this;
      this.chunkRequestReady = function (fileId, chunks) {
        // this.debug("Chunks ready: ", chunks.length);
        var req = JSON.stringify({
          action: protocol.REQUEST_CHUNK,
          fileId: fileId,
          ids: chunks,
          nReceived: self.fileStreams[fileId].nChunksReceived
        });
        self.send(req);
      };
      this.transferComplete = function (fileId) {
        self.debug("Last chunk received.");
        var m = self.fileStreams[fileId];
        m.loadArrayBuffer(function(buffer) {
          self.client.fileStore.put(fileId, m.fileName, m.fileType, buffer, m.pinned);
          self.send(JSON.stringify({
            fileId: fileId,
            action: protocol.DONE
          }));
          delete self.fileStreams[fileId];
          self.reset();
        });
      };
    },

    setupFileManager: function () {
      var manager = new FileManager();
      manager.onrequestready = this.chunkRequestReady;
      manager.onprogress = this.updateProgress;
      manager.ontransfercomplete = this.transferComplete;
      return manager;
    },

    initProgress: function () {
      var self = this;
      var ctx = this.progress.getContext('2d');
      var imd = null;
      var circ = Math.PI * 2;
      var quart = Math.PI / 2;
      var interval;

      ctx.beginPath();
      ctx.strokeStyle = '#99CC33';
      ctx.lineCap = 'square';
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 4.0;

      imd = ctx.getImageData(0, 0, 36, 36);

      this.updateProgress = function (percent) {
        ctx.putImageData(imd, 0, 0);
        ctx.beginPath();
        ctx.arc(18, 18, 7, -(quart), ((circ) * percent) - quart, false);
        ctx.stroke();
      };
    },

    reset: function () {
      this.updateProgress(0);
    }
  }

  return Connection;
})();