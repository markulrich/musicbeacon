var Client = (function() {
  'use strict';
  /**
   * Main entry point for the application
   */

  var MAX_FSIZE = 160; // MB - browser memory limit
  var DEFAULT_CHANNEL = 'get-my-files8';
  var PUB_KEY = 'pub-c-24cc8449-f45e-4bdf-97b5-c97bbb6479d0';
  var SUB_KEY = 'sub-c-60fc9a74-6f61-11e4-b563-02ee2ddab7fe';
  var UPLOAD_TIMEOUT = 5000;
  var BOOTSTRAP_TIMEOUT = 1000;
  var pubnub;

  function Client() {
    this.connections = {};

    // Initialized after login
    this.uuid = null;
    this.peerTime = null;
    this.audioManager = null;
    this.fileStore = null;
    this.dht = null;
    this.pendingReplicas = {};

    this.uploadButton = $('#upload-button');
    this.fileInput = $('#upload-input');
    this.playButton = $('#play-button');
    this.stopButton = $('#stop-button');
    this.fetchButton = $('#fetch-button');
    this.fileList = $('.file-list');
    this.contactList = $('.contact-list');
    this.template = _.template($('#template').html().trim());

    // File selection UI
    this.selectableTemplate = null;
    this.selected = null;

    this.createCallbacks();
    this.registerUIEvents();

    this.bootstrapping = false;
    this.bootstrapped = false;
    this.bootstrappedNodes = null;

    this.channel = DEFAULT_CHANNEL;
  }

  Client.prototype = {
    createCallbacks: function() {
      // File ops
      this.uploadFile = function() {
        var file = this.fileInput[0].files[0];
        if (!file) return;

        var mbSize = file.size / (1024 * 1024);
        if (mbSize > MAX_FSIZE) {
          toastr.error('File too large: ' + mbSize.toFixed(2) + '/' + MAX_FSIZE + ' MB.');
          return;
        }

        var durationSecs = null;

        var reader = new FileReader();
        reader.onloadend = function(e) {
          if (reader.readyState !== FileReader.DONE) return;

          var fileId = this.fileStore.generateFileId(reader.result);
          if (this.fileStore.hasId(fileId)) return;

          var replicas = this.dht.getReplicaIds(fileId);
          var pinned = _.contains(replicas, this.uuid);
          this.fileStore.put(fileId, file.name, file.type, durationSecs, reader.result, pinned);

          console.log('Replicating', fileId, 'to', replicas);
          _.each(replicas, function(replica) {
            if (!this.connections[replica] || !this.connections[replica].available) return;
            this.connections[replica].offerShare(fileId, true);
          }.bind(this));

          var pending = replicas.length - (pinned ? 1 : 0)
          if (pending > 0) this.pendingReplicas[fileId] = pending;
          this.setupCheckUpload(fileId);
        }.bind(this);

        var tempAudio = $('<audio>');
        var objectUrl = URL.createObjectURL(file);
        tempAudio.on('canplaythrough', function(e) { // TODO is canplay or durationchange sufficient?
          durationSecs = e.currentTarget.duration;
          URL.revokeObjectURL(objectUrl);
          reader.readAsArrayBuffer(file);
        });
        tempAudio.prop("src", objectUrl);
        window.setTimeout(function() {
          if (durationSecs === null) {
            toastr.error('Sorry, could not decode music file. We support mp3, ogg, wav, and aac.');
          }
        }, 1000);
      }.bind(this);

      this.broadcastPlay = function(fileId) {
        var playTime = this.peerTime.currTime();
        var durationSecs = this.fileStore.get(fileId).durationSecs;
        if (this.fileStore.hasLocalId(fileId)) {
          this.audioManager.playFile(fileId, this.fileStore.get(fileId).buffer, playTime, durationSecs);
        } else {
          this.audioManager.bufferPlay(fileId, playTime, durationSecs);
          this.requestFile(fileId, false);
        }
        _.each(this.connections, function(conn) {
          if (conn.available) conn.sendPlay(fileId, playTime, durationSecs);
        });
      }.bind(this);
      this.requestFile = function(fileId, pinned) {
        var replicas = this.dht.getReplicaIds(fileId);
        replicas = _.filter(replicas, function(nodeId) {
          return nodeId !== this.uuid;
        }.bind(this));
        var replica = replicas[Math.floor(Math.random() * replicas.length)];
        this.connections[replica].requestFile(fileId, pinned);
      }.bind(this);

      // Upload 2-phase commit
      this.checkUploadTimeout = function(fileId) {
        var pending = this.pendingReplicas[fileId];
        if (!pending) return;
        _.each(this.connections, function(conn) {
          if (fileId in conn.fileStreams) pending--;
        }.bind(this));

        // Abort, since the file will never finish replication
        if (pending > 0) {
          console.log('Replication of', fileId, 'timed out');
          this.fileStore.delete(fileId);
          _.each(this.connections, function(conn) {
            if (!conn.available) return;
            conn.abortFile(fileId);
          }.bind(this));
        }

        this.setupCheckUpload();
      }.bind(this);

      this.setupCheckUpload = function(fileId) {
        setTimeout(function() {
          this.checkUploadTimeout(fileId);
        }.bind(this), UPLOAD_TIMEOUT);
      }.bind(this);

      this.handleUploadComplete = function(fileId) {
        if (this.pendingReplicas[fileId] && (--this.pendingReplicas[fileId] == 0)) {
          delete this.pendingReplicas[fileId];

          var replicas = this.dht.getReplicaIds(fileId);
          var fileEntry = this.fileStore.get(fileId);
          var fileName = fileEntry.name;
          _.each(this.connections, function(conn) {
            if (!conn.available || conn.id in replicas) return;
            conn.sendFileEntry(fileId, fileName, fileEntry.durationSecs);
          }.bind(this));
        }
      }.bind(this);

      // DHT maintenance
      this.updateIndex = function() {
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
      }.bind(this);

      this.handleJoin = function(nodeId) {
        this.dht.addNode(nodeId);
        this.updateIndex();
      }.bind(this);

      this.handleLeave = function(nodeId) {
        this.dht.removeNode(nodeId);
        delete this.connections[nodeId];
        this.updateIndex();
      }.bind(this);

      // Bootstrapping
      this.checkBootstrapComplete = function() {
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
      }.bind(this);

      this.handleBootstrapReply = function(replyNodeId, data) {
        if (this.bootstrapping || this.bootstrapped) return;
        this.bootstrapping = true;
        this.bootstrappedNodes = data.nodes;
        _.each(data.nodes, function(nodeId) { this.dht.addNode(nodeId); }.bind(this));
        _.each(data.files, function(f) {
          this.fileStore.put(f.fileId, f.fileName, null, f.durationSecs, null, false);
        }.bind(this));
        _.each(data.queue, function(queueObj) {
          this.audioManager.bufferPlay(queueObj.fileId, queueObj.playTime, queueObj.durationSecs);
          this.requestFile(queueObj.fileId, false);
        }.bind(this));
        this.checkBootstrapComplete();
      }.bind(this);

      this.setupBootstrap = function() {
        if (this.bootstrapping || this.bootstrapped) return;
        var nodeIds = _.map(this.connections, function(conn, nodeId) { return nodeId; });
        if (nodeIds.length > 0) {
          // console.log('Setting up bootstrap');
          var nodeId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
          this.connections[nodeId].requestBootstrap();
        }
        this.scheduleBootstrap();
      }.bind(this);

      this.scheduleBootstrap = function() {
        setTimeout(function() {
          this.setupBootstrap();
        }.bind(this), UPLOAD_TIMEOUT);
      }.bind(this);

      this.scheduleBootstrap();
    },

    registerUIEvents: function() {
      this.getSelectedFileId = function() {
        var selectedFileElement = $('.file-list .selected');
        if (selectedFileElement.length === 0) {
          toastr.error('Please select a file.');
          return null;
        }
        return selectedFileElement.attr('file-id');
      };
      this.uploadButton.click(function() { this.fileInput.click(); }.bind(this));
      this.fileInput.change(function() { this.uploadFile(); }.bind(this));
      this.fetchButton.click(function() {
        var fileId = this.getSelectedFileId();
        if (fileId) this.requestFile(fileId, false);
      }.bind(this));
      this.playButton.click(function() {
        var fileId = this.getSelectedFileId();
        if (fileId) this.broadcastPlay(fileId);
      }.bind(this));
      this.stopButton.click(function() { this.audioManager.stop(); }.bind(this));
      this.selectableTemplate = function(input) {
        var element = $(this.template(input));
        element.click(function() {
          if (this.selected) this.selected.removeClass('selected');
          element.addClass('selected');
          this.selected = element;
        }.bind(this));
        return element;
      }.bind(this);
    },

    login: function(uuid) {
      pubnub = PUBNUB.init({
        publish_key: PUB_KEY,
        subscribe_key: SUB_KEY,
        uuid: uuid,
        ssl: true
      });

      this.uuid = uuid;
      this.peerTime = new PeerTime(pubnub);
      this.audioManager = new AudioManager(this);
      this.fileStore = new FileStore(this);
      this.dht = new DHT(this);

      $('.my-username').html(this.uuid);

      pubnub.subscribe({
        channel: this.channel,
        heartbeat: 10,
        callback: this.handleSignal.bind(this),
        presence: this.handlePresence.bind(this)
      });

      window.onunload = window.onbeforeunload = function() {
        pubnub.unsubscribe({
          channel: this.channel
        });
      }.bind(this);
    },

    handleSignal: function(msg) {
      // Don't care about messages we send
      if (msg.uuid !== this.uuid &&
          msg.target === this.uuid &&
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
      console.log(msg);
      var username = msg.uuid;
      if (this.connections[username]) {
        this.connections[username].handlePresence(msg);
        return;
      }

      if (msg.action === 'join' && msg.uuid !== this.uuid &&
          msg.uuid.indexOf('@') == -1) {
        var contactElement = $(this.template({
          username: username, status: 'connected', fileId: ''
        }));
        this.contactList.append(contactElement);
        this.connections[username] = new Connection(this, username, contactElement[0], pubnub);
        this.connections[username].handlePresence(msg);
        this.contactList.animate({ marginTop: '3%' }, 700);
      }
    }
  };

  return Client;
})();
