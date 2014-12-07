(function() {
  'use strict';

  var HOST = 'localhost:8000/index.html';
  if (window.location.host == HOST && window.location.protocol != 'https:') {
    window.location.protocol = 'https:';
  }

  var client = new Client();

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
