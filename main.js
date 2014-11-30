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

      // Initialized at localLogin
      this.uuid = null;
      this.peerTime = null;
      this.audioManager = null;
      this.fileStore = null;

      this.uploadButton = $('#upload-button');
      this.fileInput = $('#upload-input');
      this.playButton = $('#play-button');
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
          var playTime = self.peerTime.currTime() + 1000; // TODO: make this adjustable

          // TODO: file selection ui to pick a key
          var fileKey;
          for (key in self.fileStore.kvstore) {
            fileKey = key;
          }

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
        this.fileStore = new FileStore(this);

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

        var list = $(".contact-list");
        var template = _.template($("#contact-template").html().trim());

        if (this.contactEmails[msg.uuid] && msg.action === "join") {
          list.prepend($(template({ email: email, available: true })));
          this.connections[email] = new Connection(email, document.getElementById("contact-" + email),
            this.uuid, pubnub, this.audioManager, this.fileStore, this.connections);
          this.connections[email].handlePresence(msg);
        } else if (!USING_GOOGLE
                    && msg.uuid !== this.uuid
                    && msg.uuid.indexOf("@") == -1 && msg.action === "join") {
          list.append($(template({ email: email, available: true })));
          this.connections[email] = new Connection(email, document.getElementById("contact-" + email),
            this.uuid, pubnub, this.audioManager, this.fileStore, this.connections);
          this.connections[email].handlePresence(msg);
          list.animate({ marginTop: "35px" }, 700);
        }
      }
    };
    return new FSClient();
  }

  var PUB_KEY = "pub-c-24cc8449-f45e-4bdf-97b5-c97bbb6479d0";
  var SUB_KEY = "sub-c-60fc9a74-6f61-11e4-b563-02ee2ddab7fe";

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  }

  function capitalize(s) {
    return _.map(s.split(" "), function(w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(" ");
  }

  var client = createFSClient();
  var animals = $.get("animals.json");
  var adjectives = $.get("adjectives.json");
  $.when(animals, adjectives).done(function(animals, adjectives) {
    animals = animals[0];
    adjectives = adjectives[0];
    var animal = animals[randomInt(0, animals.length)];
    var adjective = adjectives[randomInt(0, adjectives.length)];
    client.localLogin(capitalize(adjective + " " + animal));
    window.client = client; // Expose for debug
  });

  // First, parse the query string
  var params = {}, queryString = location.hash.substring(1),
    regex = /([^&=]+)=([^&]*)/g, m;
  while (m = regex.exec(queryString)) {
    params[decodeURIComponent(m[1])] = decodeURIComponent(m[2]);
  }

  if (params.access_token) {
    window.location.hash = "";
    USING_GOOGLE = true;
    client.getContacts(params.access_token);
    return;
  }
  else {
    $(".login-area").fadeIn();
  }
})();
