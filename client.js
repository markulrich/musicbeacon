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
    OFFER: "offer",
    ANSWER: "answer",
    REQUEST: "req-chunk",
    DATA: "data",
    DONE: "done",
    ERR_REJECT: "err-reject",
    CANCEL: "cancel"
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

      this.createUICallbacks();
      this.registerUIEvents();
    };

    FSClient.prototype = {
      createUICallbacks: function () {
        var self = this;
        this.uploadFile = function() {
          var file = self.fileInput[0].files[0];
          if (!file) return;

          var mbSize = file.size / (1024 * 1024);
          if (mbSize > MAX_FSIZE) {
            toastr.error("File too large: " + mbSize.toFixed(2) + "/" + MAX_FSIZE + " MB.");
            return;
          }

          // TODO: disable or buffer uploading new files until finished
          // TODO: upload to cooperative cache nodes only?

          var reader = new FileReader();
          reader.onloadend = function(e) {
            if (reader.readyState !== FileReader.DONE) return;
            var fileKey = self.fileStore.generateKey();
            self.fileStore.put(fileKey, file.name, file.type, reader.result);

            _.each(self.connections, function (conn) {
              conn.fileManager.stageLocalFile(fileKey, file.name, file.type, reader.result);
              conn.offerShare();
            });
          }
          reader.readAsArrayBuffer(file);
        };
        this.broadcastPlay = function(fileKey) {
          var selectedFileElement = $(".file-list .selected");
          if (selectedFileElement.length === 0) {
            toastr.error("Please select a file.");
            return;
          }
          var fileKey = selectedFileElement.attr("file-key");

          var delay = parseInt(self.delaySlider.attr("value")) * 1000;
          var playTime = self.peerTime.currTime() + delay;

          self.audioManager.playFile(self.fileStore.get(fileKey).buffer, playTime);
          _.each(self.connections, function (conn) {
            conn.sendPlay(fileKey, playTime);
          });
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
        this.audioManager = new AudioManager(this.peerTime);
        this.fileStore = new FileStore(this.uuid, this.fileList, this.selectableTemplate);

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

      handlePresence: function (msg) {
        // Only care about presence messages from people in our Google contacts (if HOSTED)
        var email = msg.uuid;
        if (this.connections[email]) {
          this.connections[email].handlePresence(msg);
          return;
        }

        if (msg.action === "join" && !USING_GOOGLE
            && msg.uuid !== this.uuid && msg.uuid.indexOf("@") == -1) {
          var contactElement = $(this.template({ email: email, available: true }));
          this.contactList.append(contactElement);
          this.connections[email] = new Connection(this, email, contactElement[0],
            this.uuid, pubnub, this.audioManager, this.fileStore, this.connections);
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
    window.client = client; // Expose for debug
  });

  $(".login-area").fadeIn();
})();
