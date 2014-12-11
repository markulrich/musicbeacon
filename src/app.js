(function() {
  'use strict';

  /**
   * Entry point of the application
   */

  var HOST = 'localhost:8000/index.html';
  if (window.location.host == HOST && window.location.protocol != 'https:') {
    window.location.protocol = 'https:';
  }

  var DEFAULT_CHANNEL = 'get-my-filez3';
  var PUBNUB_SETTINGS = {
    pubKey: 'pub-c-24cc8449-f45e-4bdf-97b5-c97bbb6479d0',
    subKey: 'sub-c-60fc9a74-6f61-11e4-b563-02ee2ddab7fe'
  };
  var client = new Client(DEFAULT_CHANNEL, PUBNUB_SETTINGS);

  var animals = $.get('data/animals.json');
  var adjectives = $.get('data/adjectives.json');
  $.when(animals, adjectives).done(function(animals, adjectives) {
    animals = animals[0];
    adjectives = adjectives[0];
    var animal = animals[Math.floor(Math.random() * animals.length)];
    var adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    adjective = adjective[0].toUpperCase() + adjective.slice(1);

    client.login(adjective + ' ' + animal);
    client.scheduleBootstrap();

    var playback = new PlaybackControlView(client);
    playback.registerEvents();

    window.onbeforeunload = function() {
      client.logout();
    };
  });

  window.client = client; // Expose for debug
})();
