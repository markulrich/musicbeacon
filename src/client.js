var Client = (function() {
  'use strict';

  var MAX_FSIZE = 160; // MB - browser memory limit
  var pubnub;

  /**
   * A peer node in the system
   */
  function Client(channel, pubnubSettings) {
    this.connections = {};

    // Initialized after login
    this.uuid = null;
    this.peerTime = null;
    this.audioManager = null;
    this.fileStore = null;
    this.dht = null;

    this.userListView = new UserListView("#user-panel");
    this.fileListView = new FileListView("#file-panel");

    // File selection UI
    this.selectableTemplate = null;
    this.selected = null;

    this.bootstrapping = false;
    this.bootstrapped = false;
    this.bootstrappedNodes = null;

    this.channel = channel;
    this.pubnubSettings = pubnubSettings;
  }

  Client.prototype = {
    uploadFile: function() {
      var file = this.fileInput[0].files[0];
      if (!file) return;

      var mbSize = file.size / (1024 * 1024);
      if (mbSize > MAX_FSIZE) {
        toastr.error('File too large: ' + mbSize.toFixed(2) + '/' + MAX_FSIZE + ' MB.');
        return;
      }

      var reader = new FileReader();
      reader.onloadend = function(e) {
        if (reader.readyState !== FileReader.DONE) return;
        var fileId = this.fileStore.generateFileId(file);
        var replicas = this.dht.getReplicaIds(fileId);
        var pinned = _.contains(replicas, this.uuid);
        this.fileStore.put(fileId, file.name, file.type, reader.result, pinned);

        console.log('Replicating file to', replicas);
        _.each(this.connections, function(conn) {
          if (!conn.available) return;
          if (_.contains(replicas, conn.id)) {
            conn.offerShare(fileId, true);
          } else {
            conn.sendFileEntry(fileId, file.name);
          }
        }.bind(this));
      }.bind(this);
      reader.readAsArrayBuffer(file);
    },

    broadcastStop: function() {
      // TODO: Broadcast stop command
      this.audioManager.stop();
    },

    broadcastPlay: function(fileId) {
      var playTime = this.peerTime.currTime();

      if (this.fileStore.hasLocalId(fileId)) {
        this.audioManager.playFile(fileId, this.fileStore.get(fileId).buffer, playTime);
      } else {
        this.audioManager.bufferPlay(fileId, playTime);
        this.requestFile(fileId, false);
      }

      _.each(this.connections, function(conn) {
        if (conn.available) conn.sendPlay(fileId, playTime);
      });
    },

    requestFile: function(fileId, pinned) {
      var replicas = this.dht.getReplicaIds(fileId);
      replicas = _.filter(replicas, function(nodeId) {
        return nodeId !== this.uuid;
      }.bind(this));
      // TODO: weight by best rtt (ggp exploration?)
      var replica = replicas[Math.floor(Math.random() * replicas.length)];
      this.connections[replica].requestFile(fileId, pinned);
    },

    // DHT maintenance
    updateIndex: function() {
      for (var fileId in this.fileStore.kvstore) {
        var replicas = this.dht.getReplicaIds(fileId);
        var f;
        if (_.contains(replicas, this.uuid)) {
          if (!this.fileStore.hasLocalId(fileId)) {
            console.log('Assuming responsibility for', fileId);
            this.requestFile(fileId, true);
          } else {
            f = this.fileStore.get(fileId);
            f.pinned = true;
            f.updateElement();
          }
        } else {
          if (this.fileStore.hasLocalId(fileId)) {
            f = this.fileStore.get(fileId);
            f.pinned = false;
            f.updateElement();
          }
        }
      }
    },

    handleJoin: function(nodeId) {
      this.dht.addNode(nodeId);
      this.updateIndex();
    },

    handleLeave: function(nodeId) {
      this.dht.removeNode(nodeId);
      delete this.connections[nodeId];
      this.updateIndex();
    },

    // Bootstrapping
    checkBootstrapComplete: function() {
      if (!this.bootstrapping || this.bootstrapped) return;
      var bootstrapComplete = true;
      _.each(this.bootstrappedNodes, function(nodeId) {
        if (nodeId != this.uuid && !this.connections[nodeId]) bootstrapComplete = false;
      }.bind(this));

      if (bootstrapComplete) {
        console.log('Finished bootstrapping');
        this.bootstrapped = true;
        _.each(this.connections, function(conn) { conn.bootstrapJoin(); });
        this.updateIndex();
      }
    },

    handleBootstrapReply: function(replyNodeId, data) {
      if (this.bootstrapping || this.bootstrapped) return;
      this.bootstrapping = true;
      this.bootstrappedNodes = data.nodes;
      _.each(data.nodes, function(nodeId) { this.dht.addNode(nodeId); }.bind(this));
      _.each(data.files, function(f) {
        this.fileStore.put(f.fileId, f.fileName, null, null, false);
      }.bind(this));
      this.checkBootstrapComplete();
    },

    setupBootstrap: function() {
      if (this.bootstrapping || this.bootstrapped) return;
      var nodeIds = _.map(this.connections, function(conn, nodeId) { return nodeId; });
      if (nodeIds.length > 0) {
        console.log('Setting up bootstrap');
        var nodeId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
        this.connections[nodeId].requestBootstrap();
      }
      this.scheduleBootstrap();
    },

    scheduleBootstrap: function() {
      setTimeout(function() {
        this.setupBootstrap();
      }.bind(this), 1000);
    },

    login: function(name) {
      pubnub = PUBNUB.init({
        publish_key: this.pubnubSettings.pubKey,
        subscribe_key: this.pubnubSettings.subKey,
        uuid: name,
        ssl: true
      });

      this.uuid = name;
      this.peerTime = new PeerTime(pubnub);
      this.audioManager = new AudioManager(this.peerTime);
      this.fileStore = new FileStore(this.uuid);
      this.dht = new DHT(this);

      $('#my-username').html(this.uuid);

      pubnub.subscribe({
        channel: this.channel,
        heartbeat: 10,
        callback: this.handleSignal.bind(this),
        presence: this.handlePresence.bind(this)
      });
    },

    logout: function() {
      pubnub.unsubscribe({
        channel: this.channel
      });
    },

    handleSignal: function(msg) {
      // Don't care about messages we send
      if (msg.uuid !== this.uuid && msg.target === this.uuid &&
          msg.uuid in this.connections) {
        this.connections[msg.uuid].handleSignal(msg);
      }
    },

    /**
     * Handles connection creation. Heartbeats from existing connections are dispatched
     * the connection object itself, with callbacks to this.handle(join|leave) to handle
     * DHT maintenance.
     */
    handlePresence: function(msg) {
      var username = msg.uuid;
      if (this.connections[username]) {
        this.connections[username].handlePresence(msg);
        return;
      }

      if (msg.action === 'join' && msg.uuid !== this.uuid &&
          msg.uuid.indexOf('@') == -1) {

        this.userListView.put(username, "connected");

        this.connections[username] = new Connection(this, username, contactElement[0], pubnub);
        this.connections[username].handlePresence(msg);
        $(this.userListView.getDOMElement()).animate({ marginTop: '3%' }, 700);
      }
    }
  };

  return Client;
})();
