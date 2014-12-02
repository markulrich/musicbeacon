var Connection = (function () {
  "use strict";

  var HOSTED = window.location.protocol !== "file:";
  var protocol = {
    CHANNEL: "get-my-file2",
    OFFER: "offer",
    ANSWER: "answer",
    REQUEST: "req-chunk",
    DATA: "data",
    DONE: "done",
    PLAY: "play"
  };

  function Connection(client, email, element, pubnub) {
    this.client = client;
    this.id = email;
    this.element = element; // UI handler. Messy but effective
    this.progress = element.querySelector(".progress");
    this.connected = false;
    this.p2pEstablished = false;
    this.shareStart = null;
    this.uuid = client.uuid;
    this.pubnub = pubnub;
    this.allConnections = client.allConnections;
    this.fileManager = new FileManager();

    // Create event callbacks
    this.createChannelCallbacks();
    this.createFileCallbacks();

    // Progress bar init
    this.initProgress();

    this.registerFileEvents();
  };

  Connection.prototype = {
    sendPlay: function (fileKey, playTime) {
      console.log("Broadcasting play for", fileKey);
      var msg = {
        uuid: this.uuid,
        target: this.id,
        fileKey: fileKey,
        playTime: playTime,
        action: protocol.PLAY,
      };

      this.pubnub.publish({
        channel: protocol.CHANNEL,
        message: msg
      });
    },

    offerShare: function () {
      console.log("Offering share to", this.id);
      this.isInitiator = true;
      this.connected = true;
      var msg = {
        uuid: this.uuid,
        target: this.id,
        fKey: this.fileManager.fileKey,
        fName: this.fileManager.fileName,
        fType: this.fileManager.fileType,
        nChunks: this.fileManager.fileChunks.length,
        action: protocol.OFFER,
      };

      this.pubnub.publish({
        channel: protocol.CHANNEL,
        message: msg
      });
    },

    answerShare: function () {
      console.log("Answering share from", this.id);
      // Tell other person to join the P2P channel
      this.pubnub.publish({
        channel: protocol.CHANNEL,
        message: {
          uuid: this.uuid,
          target: this.id,
          action: protocol.ANSWER
        }
      });
      this.p2pSetup();
      this.fileManager.requestChunks();
    },

    send: function (data) {
      this.pubnub.publish({
        channel: protocol.CHANNEL,
        user: this.id,
        message: data
      });
    },

    packageChunk: function (chunkId) {
      return JSON.stringify({
        action: protocol.DATA,
        id: chunkId,
        content: Base64Binary.encode(this.fileManager.fileChunks[chunkId])
      });
    },

    handleSignal: function (msg) {
      if (msg.action === protocol.ANSWER) {
        this.p2pSetup();
      } else if (msg.action === protocol.OFFER) {
        this.fileManager.stageRemoteFile(msg.fKey, msg.fName, msg.fType, msg.nChunks);
        this.shareAccepted();
      } else if (msg.action === protocol.PLAY) {
        console.log("Received remote play for", msg.fileKey);
        var buffer = this.client.fileStore.get(msg.fileKey).buffer;
        this.client.audioManager.playFile(buffer, msg.playTime);
      }
    },

    handlePresence: function (msg) {
      console.log("Connection handling presence msg: ", msg);
      if (msg.action === "join") {
        this.available = true;
        var j = $(this.element);
        j.show().prependTo(j.parent());
      } else {
        this.available = false;
        if (this.connected) {
          console.log(this.id + " has canceled the share.");
          this.reset();
        }
        var j = $(this.element);
        j.hide().appendTo(j.parent());
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
        console.log("P2P message: ", data.action);
        if (data.action === protocol.DATA) {
          self.fileManager.receiveChunk(data);
        }
        else if (data.action === protocol.REQUEST) {
          self.nChunksSent += data.ids.length;
          self.updateProgress(data.nReceived / self.fileManager.fileChunks.length);
          data.ids.forEach(function (id) {
            self.send(self.packageChunk(id));
          });
        }
        else if (data.action === protocol.DONE) {
          self.connected = false;
          self.reset();
          console.log("Share took " + ((Date.now() - self.shareStart) / 1000) + " seconds");
        }
      };
      this.shareAccepted = function (e) {
        self.answerShare();
        self.connected = true;
      };
      this.shareCancelled = function (e) {
        self.pubnub.publish({
          channel: protocol.CHANNEL,
          message: {
            uuid: self.uuid,
            action: protocol.CANCEL,
            target: self.id
          }
        });
        self.reset();
      };
    },

    createFileCallbacks: function () {
      var self = this;
      this.chunkRequestReady = function (chunks) {
        //console.log("Chunks ready: ", chunks.length);
        var req = JSON.stringify({
          action: protocol.REQUEST,
          ids: chunks,
          nReceived: self.fileManager.nChunksReceived
        });
        self.send(req);
      };
      this.transferComplete = function () {
        console.log("Last chunk received.");
        var fm = self.fileManager;
        fm.loadArrayBuffer(function(buffer) {
          self.client.fileStore.put(fm.fileKey, fm.fileName, fm.fileType, buffer);
          self.send(JSON.stringify({ action: protocol.DONE }));
          self.connected = false;
          self.reset();
        });
      };
    },

    registerFileEvents: function () {
      this.fileManager.onrequestready = this.chunkRequestReady;
      this.fileManager.onprogress = this.updateProgress;
      this.fileManager.ontransfercomplete = this.transferComplete;
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
      this.fileManager.clear();
      this.isInitiator = false;
      this.connected = false;
    }
  }

  return Connection;
})();