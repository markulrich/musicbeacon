var Connection = (function () {
  "use strict";

  var HOSTED = window.location.protocol !== "file:";
  var protocol = {
    CHANNEL: "get-my-file3",
    OFFER: "offer",
    ANSWER: "answer",
    CANCEL: "cancel",
    REQUEST_CHUNK: "req-chunk",
    DATA: "data",
    DONE: "done",
    PLAY: "play",
    FILE_ENTRY: "file-entry",
    REQUEST_FILE: "req-file",
    REQUEST_BOOTSTRAP: "req-boot",
    REPLY_BOOTSTRAP: "rep-boot",
    BOOTSTRAP_JOIN: "boot-join"
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
    this.timeout = false;

    this.createChannelCallbacks();
    this.createFileCallbacks();
    this.initProgress();

    this.debug = function (msg) {
      console.log("<" + this.id + "> " + msg);
    }
  };

  Connection.prototype = {
    updateElement: function() {
      if (this.timeout) {
        $(this.element).attr("status", "timeout");
        this.updateProgress(0);
      } else {
        $(this.element).attr("status", "connected");
      }
    },

    bootstrapJoin: function () {
      // this.debug("Bootstrap joining");
      this.pubnub.publish({
        channel: protocol.CHANNEL,
        message: {
          uuid: this.uuid,
          target: this.id,
          action: protocol.BOOTSTRAP_JOIN
        }
      });
    },

    replyBootstrap: function () {
      this.debug("Responding to bootstrap");
      var nodes = _.map(this.client.connections, function (conn, nodeId) {
        return nodeId;
      }).concat(this.uuid);
      var files = _.map(this.client.fileStore.kvstore, function (f) {
        return { fileId: f.id, fileName: f.name };
      });
      this.pubnub.publish({
        channel: protocol.CHANNEL,
        message: {
          uuid: this.uuid,
          target: this.id,
          data: {
            nodes: nodes,
            files: files
          },
          action: protocol.REPLY_BOOTSTRAP
        }
      });
    },

    requestBootstrap: function () {
      this.debug("Requesting bootstrap");
      this.pubnub.publish({
        channel: protocol.CHANNEL,
        message: {
          uuid: this.uuid,
          target: this.id,
          action: protocol.REQUEST_BOOTSTRAP
        }
      });
    },

    requestFile: function (fileId, pinned) {
      this.debug("Requesting " + fileId);
      if (this.fileStreams[fileId]) {
        this.fileStreams[fileId].pinned |= pinned;
        return;
      }

      this.pubnub.publish({
        channel: protocol.CHANNEL,
        message: {
          uuid: this.uuid,
          target: this.id,
          fileId: fileId,
          pinned: pinned,
          action: protocol.REQUEST_FILE
        }
      });
    },

    sendFileEntry: function (fileId, fileName) {
      this.debug("Sending empty file entry " + fileId);
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

    offerShare: function (fileId, pinned) {
      this.debug("Offering share of " + fileId);
      if (this.fileStreams[fileId]) {
        this.fileStreams[fileId].pinned |= pinned;
        return;
      }

      var f = this.client.fileStore.get(fileId);
      var manager = this.setupFileManager();
      manager.stageLocalFile(fileId, f.buffer);
      this.fileStreams[fileId] = manager;

      this.pubnub.publish({
        channel: protocol.CHANNEL,
        message: {
          uuid: this.uuid,
          target: this.id,
          fileId: fileId,
          fileName: f.name,
          fileType: f.type,
          nChunks: manager.fileChunks.length,
          pinned: pinned,
          action: protocol.OFFER,
        }
      });
    },

    answerShare: function (fileId) {
      this.debug("Answering share of " + fileId);
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
      this.debug("Cancelling share of" + fileId);
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
          this.debug("Not replicated here...fetching data for " + msg.fileId);
          this.client.audioManager.bufferPlay(msg.fileId, msg.playTime);
          this.client.requestFile(msg.fileId);
        } else {
          var buffer = this.client.fileStore.get(msg.fileId).buffer;
          this.client.audioManager.playFile(msg.fileId, buffer, msg.playTime);
        }
      } else if (msg.action === protocol.FILE_ENTRY) {
        if (this.client.fileStore.hasId(msg.fileId)) return;
        this.client.fileStore.put(msg.fileId, msg.fileName, null, null, false);
      } else if (msg.action === protocol.REQUEST_FILE) {
        // TODO: redirect if not fully loaded yet
        this.offerShare(msg.fileId, msg.pinned);
      } else if (msg.action === protocol.REQUEST_BOOTSTRAP) {
        this.replyBootstrap();
      } else if (msg.action === protocol.REPLY_BOOTSTRAP) {
        this.client.handleBootstrapReply(this.id, msg.data);
      } else if (msg.action === protocol.BOOTSTRAP_JOIN) {
        this.client.handleJoin(this.id);
      }
    },

    handlePresence: function (msg) {
      this.debug("Connection handling presence msg: " + msg.action);
      if (msg.action === "join") {
        this.available = true;
        if (this.timeout) {
          this.timeout = false;
          this.updateElement();
        } else {
          // Can't bootstrap on join because target might not have connection
          this.client.checkBootstrapComplete();
        }
      } else if (msg.action === "timeout") {
        // TODO: kick out after multiple timeouts
        this.available = false;
        this.timeout = true;
        this.updateElement();
      } else if (msg.action === "leave") {
        $(this.element).hide();
        this.client.handleLeave(this.id);
        for (var fileId in this.fileStreams) {
          delete this.fileStreams[fileId];
        }
      }
    },

    p2pSetup: function () {
      if (this.p2pEstablished) return;
      this.p2pEstablished = true;

      // this.debug("Setting up P2P");
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
        self.send(JSON.stringify({
          action: protocol.REQUEST_CHUNK,
          fileId: fileId,
          ids: chunks,
          nReceived: self.fileStreams[fileId].nChunksReceived
        }));
      };
      this.transferComplete = function (fileId) {
        self.debug("Last chunk of " + fileId + " received.");
        var m = self.fileStreams[fileId];
        m.loadArrayBuffer(function(buffer) {
          var pinned = m.pinned || self.client.fileStore.hasLocalId(fileId);
          self.client.fileStore.put(fileId, m.fileName, m.fileType, buffer, m.pinned);
          self.send(JSON.stringify({
            fileId: fileId,
            action: protocol.DONE
          }));
          delete self.fileStreams[fileId];
          self.client.audioManager.onFileReceived(fileId, buffer);
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