/**
 * Module to synchronize node times with a master server.
 * Nodes periodically ping the pubnub server and compute the drift based on historical latencies.
 */

var PeerTime = (function() {
  function PeerTime(pubnub, mode) {
    this.mode = mode || 'moving';
    this.drift = 0;
    this.drifts = [];
    this.pubnub = pubnub;
    this.numSyncs = 0;

    if (!(this.mode in this.driftAlgos)) {
      throw new Error('Invalid mode', this.mode);
    }

    var self = this;
    window.setInterval(function() {
      self.syncDrift();
    }, this.REFRESH);
  }

  PeerTime.prototype = {
    REFRESH: 2000,
    MAX_TIMEOUT: 5000,
    TENTHS_NS_PER_MS: 10000,
    MOVING_WINDOW: 60,
    EWMA_DECAY: 0.90,

    driftAlgos: {
      total: function(currDrift) {
        this.drifts.push(currDrift);
      },
      moving: function(currDrift) {
        this.drifts.push(currDrift);
        if (this.drifts.length > this.MOVING_WINDOW) this.drifts.shift();
        this.drift = this.avgDrift();
      },
      exponential: function(currDrift) {
        if (this.numSyncs === 0) this.drift = currDrift;
        return this.EWMA_DECAY * this.drift + (1 - this.EWMA_DECAY) * currDrift;
      },
      none: function() {
        return 0;
      }
    },

    syncDrift: function() {
      var self = this;
      var startTime = new Date().getTime();
      this.pubnub.time(
        function(serverTimeTenthsNs) {
          var serverTime = serverTimeTenthsNs / self.TENTHS_NS_PER_MS;
          if (serverTime === 0) {
            // console.error("Failed to return server.time result");
            return;
          }

          var currTime = new Date().getTime();
          var roundTripTime = currTime - startTime;
          if (roundTripTime > self.MAX_TIMEOUT) {
            console.error('Latency too high to compute drift:', roundTripTime);
            return;
          }

          var currDrift = serverTime - currTime + roundTripTime / 2;
          self.driftAlgos[self.mode].call(self, currDrift);
          self.numSyncs++;
        }
      );
    },

    avgDrift: function() {
      return _.reduce(this.drifts, function(a, b) { return a + b; }) / this.drifts.length;
    },

    currTime: function() {
      return new Date().getTime() + this.drift;
    }
  };

  return PeerTime;
})();
