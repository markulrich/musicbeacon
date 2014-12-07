var Client = (function() {
  'use strict';
  /**
   * Main entry point for the application
   */

  var MAX_FSIZE = 160; // MB - browser memory limit
  var DEFAULT_CHANNEL = 'get-my-filez3';
  var PUB_KEY = 'pub-c-24cc8449-f45e-4bdf-97b5-c97bbb6479d0';
  var SUB_KEY = 'sub-c-60fc9a74-6f61-11e4-b563-02ee2ddab7fe';
  var pubnub;

  function Client() {
    this.connections = {};

    // Initialized after login
    this.uuid = null;
    this.peerTime = null;
    this.audioManager = null;
    this.fileStore = null;
    this.dht = null;

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
      this.uploadFile = function() {
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
      }.bind(this);

      this.broadcastPlay = function(fileId) {
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
      }.bind(this);
      this.requestFile = function(fileId, pinned) {
        var replicas = this.dht.getReplicaIds(fileId);
        replicas = _.filter(replicas, function(nodeId) {
          return nodeId !== this.uuid;
        }.bind(this));
        // TODO: weight by best rtt (ggp exploration?)
        var replica = replicas[Math.floor(Math.random() * replicas.length)];
        this.connections[replica].requestFile(fileId, pinned);
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
          this.fileStore.put(f.fileId, f.fileName, null, null, false);
        }.bind(this));
        this.checkBootstrapComplete();
      }.bind(this);

      this.setupBootstrap = function() {
        if (this.bootstrapping || this.bootstrapped) return;
        var nodeIds = _.map(this.connections, function(conn, nodeId) { return nodeId; });
        if (nodeIds.length > 0) {
          console.log('Setting up bootstrap');
          var nodeId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
          this.connections[nodeId].requestBootstrap();
        }
        this.scheduleBootstrap();
      }.bind(this);

      this.scheduleBootstrap = function() {
        setTimeout(function() {
          this.setupBootstrap();
        }.bind(this), 1000);
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

    localLogin: function(name) {
      pubnub = PUBNUB.init({
        publish_key: PUB_KEY,
        subscribe_key: SUB_KEY,
        uuid: name,
        ssl: true
      });

      this.uuid = name;
      this.peerTime = new PeerTime(pubnub);
      this.audioManager = new AudioManager(this);
      this.fileStore = new FileStore(this);
      this.dht = new DHT(this);

      $('.my-email').html(this.uuid);

      pubnub.subscribe({
        channel: DEFAULT_CHANNEL,
        heartbeat: 10,
        callback: this.handleSignal.bind(this),
        presence: this.handlePresence.bind(this)
      });

      window.onbeforeunload = function() {
        pubnub.unsubscribe({
          channel: DEFAULT_CHANNEL
        });
      };
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
      var email = msg.uuid;
      if (this.connections[email]) {
        this.connections[email].handlePresence(msg);
        return;
      }

      if (msg.action === 'join' && msg.uuid !== this.uuid &&
          msg.uuid.indexOf('@') == -1) {
        var contactElement = $(this.template({ email: email, status: 'connected', fileId: ''}));
        this.contactList.append(contactElement);
        this.connections[email] = new Connection(this, email, contactElement[0], pubnub);
        this.connections[email].handlePresence(msg);
        this.contactList.animate({ marginTop: '3%' }, 700);
      }
    }
  };

  return Client;
})();
