/**
 * Main entry point for the application
 */

(function() {
  'use strict';
  var HOST = 'localhost:8000/index.html';
  var HOSTED = window.location.protocol !== 'file:';
  var USING_GOOGLE = false;
  var MAX_FSIZE = 160; // MB - browser memory limit
  var DEFAULT_CHANNEL = 'get-my-filez3';

  if (window.location.host == HOST && window.location.protocol != 'https:') {
    window.location.protocol = 'https:';
  }

  function createClient() {
    var CONTACT_API_URL = 'https://www.google.com/m8/feeds';
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
      this.delaySlider = $('#delay-slider');
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
        var self = this;
        this.uploadFile = function() {
          var file = self.fileInput[0].files[0];
          if (!file) return;

          var mbSize = file.size / (1024 * 1024);
          if (mbSize > MAX_FSIZE) {
            toastr.error('File too large: ' + mbSize.toFixed(2) + '/' + MAX_FSIZE + ' MB.');
            return;
          }

          var reader = new FileReader();
          reader.onloadend = function(e) {
            if (reader.readyState !== FileReader.DONE) return;
            var fileId = self.fileStore.generateFileId(file);
            var replicas = self.dht.getReplicaIds(fileId);
            var pinned = _.contains(replicas, self.uuid);
            self.fileStore.put(fileId, file.name, file.type, reader.result, pinned);

            console.log('Replicating file to', replicas);
            _.each(self.connections, function(conn) {
              if (!conn.available) return;
              if (_.contains(replicas, conn.id)) {
                conn.offerShare(fileId, true);
              } else {
                conn.sendFileEntry(fileId, file.name);
              }
            });
          };
          reader.readAsArrayBuffer(file);
        };
        this.broadcastPlay = function(fileId) {
          var delay = parseInt(self.delaySlider.attr('value')) * 1000;
          var playTime = self.peerTime.currTime() + delay;

          if (self.fileStore.hasLocalId(fileId)) {
            self.audioManager.playFile(fileId, self.fileStore.get(fileId).buffer, playTime);
          } else {
            self.audioManager.bufferPlay(fileId, playTime);
            self.requestFile(fileId, false);
          }

          console.log('START PLAYBACK!!!!');
          console.log(this.peerTime.currTime());
          _.each(self.connections, function(conn) {
            if (conn.available) conn.sendPlay(fileId, playTime);
          });
        }.bind(this);
        this.requestFile = function(fileId, pinned) {
          var replicas = self.dht.getReplicaIds(fileId);
          replicas = _.filter(replicas, function(nodeId) { return nodeId !== self.uuid; });
          // TODO: weight by best rtt (ggp exploration?)
          var replica = replicas[Math.floor(Math.random() * replicas.length)];
          self.connections[replica].requestFile(fileId, pinned);
        };

        // DHT maintenance
        this.updateIndex = function() {
          for (var fileId in self.fileStore.kvstore) {
            var replicas = self.dht.getReplicaIds(fileId);
            var f;
            if (_.contains(replicas, self.uuid)) {
              if (!self.fileStore.hasLocalId(fileId)) {
                console.log('Assuming responsibility for', fileId);
                self.requestFile(fileId, true);
              } else {
                f = self.fileStore.get(fileId);
                f.pinned = true;
                f.updateElement();
              }
            } else {
              if (self.fileStore.hasLocalId(fileId)) {
                f = self.fileStore.get(fileId);
                f.pinned = false;
                f.updateElement();
              }
            }
          }
        };
        this.handleJoin = function(nodeId) {
          self.dht.addNode(nodeId);
          self.updateIndex();
        };
        this.handleLeave = function(nodeId) {
          self.dht.removeNode(nodeId);
          delete self.connections[nodeId];
          self.updateIndex();
        };

        // Bootstrapping
        this.checkBootstrapComplete = function() {
          if (!self.bootstrapping || self.bootstrapped) return;
          var bootstrapComplete = true;
          _.each(self.bootstrappedNodes, function(nodeId) {
            if (nodeId != self.uuid && !self.connections[nodeId]) bootstrapComplete = false;
          });

          if (bootstrapComplete) {
            console.log('Finished bootstrapping');
            self.bootstrapped = true;
            _.each(self.connections, function(conn) { conn.bootstrapJoin(); });
            self.updateIndex();
          }
        };
        this.handleBootstrapReply = function(replyNodeId, data) {
          if (self.bootstrapping || self.bootstrapped) return;
          self.bootstrapping = true;
          self.bootstrappedNodes = data.nodes;
          _.each(data.nodes, function(nodeId) { self.dht.addNode(nodeId); });
          _.each(data.files, function(f) { self.fileStore.put(f.fileId, f.fileName, null, null, false); });
          self.checkBootstrapComplete();
        };
        this.setupBootstrap = function() {
          if (self.bootstrapping || self.bootstrapped) return;
          nodeIds = _.map(self.connections, function(conn, nodeId) { return nodeId; });
          if (nodeIds.length > 0) {
            console.log('Setting up bootstrap');
            var nodeId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
            self.connections[nodeId].requestBootstrap();
          }
          self.scheduleBootstrap();
        };
        this.scheduleBootstrap = function() {
          setTimeout(function() {
            self.setupBootstrap();
          }, 1000);
        };
        this.scheduleBootstrap();
      },

      registerUIEvents: function() {
        var self = this;
        this.getSelectedFileId = function() {
          var selectedFileElement = $('.file-list .selected');
          if (selectedFileElement.length === 0) {
            toastr.error('Please select a file.');
            return null;
          }
          return selectedFileElement.attr('file-id');
        };
        this.uploadButton.click(function() { self.fileInput.click(); });
        this.fileInput.change(function() { self.uploadFile(); });
        this.fetchButton.click(function() {
          var fileId = self.getSelectedFileId();
          if (fileId) self.requestFile(fileId, false);
        });
        this.playButton.click(function() {
          var fileId = self.getSelectedFileId();
          if (fileId) self.broadcastPlay(fileId);
        });
        this.stopButton.click(function() { self.audioManager.stop(); });
        this.selectableTemplate = function(input) {
          var element = $(self.template(input));
          element.click(function() {
            if (self.selected) self.selected.removeClass('selected');
            element.addClass('selected');
            self.selected = element;
          });
          return element;
        };
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
        var self = this;
        // Don't care about messages we send
        if (msg.uuid !== this.uuid && msg.target === this.uuid && msg.uuid in self.connections) {
          self.connections[msg.uuid].handleSignal(msg);
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

        if (msg.action === 'join' && !USING_GOOGLE &&
            msg.uuid !== this.uuid && msg.uuid.indexOf('@') == -1) {
          var contactElement = $(this.template({ email: email, status: 'connected', fileId: ''}));
          this.contactList.append(contactElement);
          this.connections[email] = new Connection(this, email, contactElement[0], pubnub);
          this.connections[email].handlePresence(msg);
          this.contactList.animate({ marginTop: '3%' }, 700);
        }
      }
    };
    return new Client();
  }

  var PUB_KEY = 'pub-c-24cc8449-f45e-4bdf-97b5-c97bbb6479d0';
  var SUB_KEY = 'sub-c-60fc9a74-6f61-11e4-b563-02ee2ddab7fe';

  var client = createClient();
  var animals = $.get('data/animals.json');
  var adjectives = $.get('data/adjectives.json');
  $.when(animals, adjectives).done(function(animals, adjectives) {
    animals = animals[0];
    adjectives = adjectives[0];
    var animal = animals[Math.floor(Math.random() * animals.length)];
    var adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    adjective = adjective[0].toUpperCase() + adjective.slice(1);
    client.localLogin(adjective + ' ' + animal);
  });

  $('.login-area').fadeIn();
  window.client = client; // Expose for debug
})();
