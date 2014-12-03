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
    FILE_ENTRY: "file-entry"
  };

  function Connection(client, email, element, pubnub) {
    this.client = client;
    this.uuid = client.uuid;    // Local id
    this.id = email;            // Target id
    this.element = element;     // UI handler. Messy but effective
    this.progress = element.querySelector(".progress");
    this.p2pEstablished = false;
    this.shareStart = null;
    this.pubnub = pubnub;
    this.allConnections = client.allConnections;
    this.fileStreams = {};

    this.createChannelCallbacks();
    this.createFileCallbacks();
    this.initProgress();
  };

  Connection.prototype = {
    sendFileEntry: function (fileId, fileName) {
      console.log("Sending empty file entry for", fileId, "to", this.id);
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
      console.log("Sending play for", fileId, "to", this.id);
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
      console.log("Offering share of", fileId, "to", this.id);

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
      console.log("Answering share of", fileId, "from", this.id);
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
      console.log("Cancelling share of", fileId, "from", this.id);
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
        delete this.fileStreams[msg.fileId];
      } else if (msg.action === protocol.PLAY) {
        console.log("Received remote play for", msg.fileId);
        if (!this.client.fileStore.hasLocalId(msg.fileId)) {
          // TODO: fetch and buffer the play command
          console.log("Not replicated here...")
          return;
        }
        var buffer = this.client.fileStore.get(msg.fileId).buffer;
        this.client.audioManager.playFile(buffer, msg.playTime);
      } else if (msg.action === protocol.FILE_ENTRY) {
        if (this.client.fileStore.hasId(msg.fileId)) return;
        this.client.fileStore.put(msg.fileId, msg.fileName, null, null, false);
      }
    },

    handlePresence: function (msg) {
      console.log("Connection handling presence msg: ", msg);
      if (msg.action === "join") {
        this.available = true;

        var j = $(this.element);
        j.show().prependTo(j.parent());
        this.client.handleJoin(this.id);
      } else {
        this.available = false;
        console.log(this.id + " has canceled the share.");
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

      console.log("Setting up P2P with", this.id);
      this.shareStart = Date.now();
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
        // console.log("P2P message: ", data.action);
        if (data.action === protocol.DATA) {
          self.fileStreams[data.fileId].receiveChunk(data);
        } else if (data.action === protocol.REQUEST_CHUNK) {
          self.nChunksSent += data.ids.length;
          self.updateProgress(data.nReceived / self.fileStreams[data.fileId].fileChunks.length);
          data.ids.forEach(function (id) {
            self.send(self.packageChunk(data.fileId, id));
          });
        } else if (data.action === protocol.DONE) {
          delete self.fileStreams[data.fileId];
          self.reset();
          console.log("Share took " + ((Date.now() - self.shareStart) / 1000) + " seconds");
        }
      };
    },

    createFileCallbacks: function () {
      var self = this;
      this.chunkRequestReady = function (fileId, chunks) {
        // console.log("Chunks ready: ", chunks.length);
        var req = JSON.stringify({
          action: protocol.REQUEST_CHUNK,
          fileId: fileId,
          ids: chunks,
          nReceived: self.fileStreams[fileId].nChunksReceived
        });
        self.send(req);
      };
      this.transferComplete = function (fileId) {
        console.log("Last chunk received.");
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
      var manager = new FileManager()
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