/**
 * Main entry point for the application
 */

(function () {
  var HOST = "localhost:8000/index.html";
  var HOSTED = window.location.protocol !== "file:";
  var USING_GOOGLE = false;
  var MAX_FSIZE = 160; // MB - browser memory limit

  if (window.location.host == HOST && window.location.protocol != "https:") {
    window.location.protocol = "https:";
  }

  // Easier than comparing string literals
  var protocol = {
    CHANNEL: "get-my-file2",
    // Other primitives in connection.js - avoid duplication
  };

  function createFSClient() {
    var CONTACT_API_URL = "https://www.google.com/m8/feeds";
    var pubnub;

    function FSClient() {
      this.connections = {};
      this.contactEmails = {};

      // Initialized after login
      this.uuid = null;
      this.peerTime = null;
      this.audioManager = null;
      this.fileStore = null;
      this.dht = null;

      this.uploadButton = $("#upload-button");
      this.fileInput = $("#upload-input");
      this.playButton = $("#play-button");
      this.delaySlider = $("#delay-slider");
      this.fileList = $(".file-list");
      this.contactList = $(".contact-list");
      this.template = _.template($("#template").html().trim());

      // File selection UI
      this.selectableTemplate = null;
      this.selected = null;

      this.createCallbacks();
      this.registerUIEvents();
    };

    FSClient.prototype = {
      createCallbacks: function () {
        var self = this;
        this.uploadFile = function() {
          var file = self.fileInput[0].files[0];
          if (!file) return;

          var mbSize = file.size / (1024 * 1024);
          if (mbSize > MAX_FSIZE) {
            toastr.error("File too large: " + mbSize.toFixed(2) + "/" + MAX_FSIZE + " MB.");
            return;
          }

          var reader = new FileReader();
          reader.onloadend = function(e) {
            if (reader.readyState !== FileReader.DONE) return;
            var fileId = self.fileStore.generateFileId(file);
            var fileKey = self.dht.hash(fileId);

            var replicas = self.dht.getReplicaIds(fileKey);
            var localReplica = (replicas.indexOf(self.uuid) >= 0);
            self.fileStore.put(fileId, file.name, file.type, reader.result, localReplica);

            console.log('Replicating file locally and to', replicas);
            _.each(self.connections, function (conn) {
              if (!conn.available) return;
              if (replicas.indexOf(conn.id) >= 0) {
                conn.fileManager.stageLocalFile(fileId, file.name, file.type, reader.result);
                conn.offerShare();
              } else {
                conn.sendFileEntry(fileId, file.name);
              }
            });
          }
          reader.readAsArrayBuffer(file);
        };
        this.broadcastPlay = function() {
          var selectedFileElement = $(".file-list .selected");
          if (selectedFileElement.length === 0) {
            toastr.error("Please select a file.");
            return;
          }
          var fileId = selectedFileElement.attr("file-id");

          var delay = parseInt(self.delaySlider.attr("value")) * 1000;
          var playTime = self.peerTime.currTime() + delay;

          self.audioManager.playFile(self.fileStore.get(fileId).buffer, playTime);
          _.each(self.connections, function (conn) {
            if (!conn.available) return;
            conn.sendPlay(fileId, playTime);
          });
        };
        this.handleJoin = function(nodeId) {
          self.dht.addNode(nodeId);
        };
        this.handleLeave = function(nodeId) {
          self.dht.removeNode(nodeId);
        };
      },

      registerUIEvents: function () {
        var self = this;
        this.uploadButton.click(function() { self.fileInput.click(); });
        this.fileInput.change(function() { self.uploadFile(); });
        this.playButton.click(function() { self.broadcastPlay(); });
        this.selectableTemplate = function(input) {
          var element = $(self.template(input));
          element.click(function() {
            if (self.selected) self.selected.removeClass("selected");
            element.addClass("selected");
            self.selected = element;
          });
          return element;
        }
      },

      localLogin: function (name) {
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

        $(".my-email").html(this.uuid);

        pubnub.subscribe({
          channel: protocol.CHANNEL,
          heartbeat: 10,
          callback: this.handleSignal.bind(this),
          presence: this.handlePresence.bind(this)
        });

        window.onbeforeunload = function() {
          pubnub.unsubscribe({
            channel: protocol.CHANNEL
          });
        };
      },

      handleSignal: function (msg) {
        var self = this;
        // Don't care about messages we send
        if (msg.uuid !== this.uuid && msg.target === this.uuid) {
          var targetConnection = self.connections[msg.uuid];
          targetConnection.handleSignal(msg);
        }
      },

      /**
       * Handles connection creation. Heartbeats from existing connections are dispatched
       * the connection object itself, with callbacks to this.handle(join|leave) to handle
       * DHT maintenance.
       */
      handlePresence: function (msg) {
        var email = msg.uuid;
        if (this.connections[email]) {
          this.connections[email].handlePresence(msg);
          return;
        }

        if (msg.action === "join" && !USING_GOOGLE
            && msg.uuid !== this.uuid && msg.uuid.indexOf("@") == -1) {
          var contactElement = $(this.template({ email: email, available: true }));
          this.contactList.append(contactElement);
          this.connections[email] = new Connection(this, email, contactElement[0], pubnub);
          this.connections[email].handlePresence(msg);
          this.contactList.animate({ marginTop: "3%" }, 700);
        }
      }
    };
    return new FSClient();
  }

  var PUB_KEY = "pub-c-24cc8449-f45e-4bdf-97b5-c97bbb6479d0";
  var SUB_KEY = "sub-c-60fc9a74-6f61-11e4-b563-02ee2ddab7fe";

  var client = createFSClient();
  var animals = $.get("animals.json");
  var adjectives = $.get("adjectives.json");
  $.when(animals, adjectives).done(function(animals, adjectives) {
    animals = animals[0];
    adjectives = adjectives[0];
    var animal = animals[Math.floor(Math.random() * animals.length)];
    var adjective = adjectives[Math.floor(Math.random() *  adjectives.length)];
    adjective = adjective[0].toUpperCase() + adjective.slice(1);
    client.localLogin(adjective + " " + animal);
  });

  $(".login-area").fadeIn();
  window.client = client; // Expose for debug
})();
