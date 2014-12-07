/* *
 * Module to synchronize node times with a master server.
 * Nodes periodically ping the pubnub server and compute the drift based on historical latencies.
 */

var PeerTime = (function() {
  'use strict';
  function PeerTime(pubnub, mode) {
    this.mode = mode || 'weighted';
    this.drift = 0;
    this.drifts = [];
    this.pubnub = pubnub;
    this.numSyncs = 0;

    if (!(this.mode in this.driftAlgos)) {
      throw new Error('Invalid mode', this.mode);
      this.mode = 'none';
    }

    window.setInterval(function () {
      console.log('SYNCING!!');
      this.syncDrift();
    }.bind(this), this.REFRESH);
  }

  PeerTime.prototype = {
    REFRESH: 1500,
    MAX_RTT: 700,
    TENTHS_NS_PER_MS: 10000,
    TAKE_BEST: 4,
    MOVING_WINDOW: 10,
    EWMA_DECAY: 0.4,

    avgOfKey: function (arr, key) {
      var sum = 0, len = arr.length;
      for (var i = 0; i < len; i++) {
        sum += arr[i][key]
      }
      return sum / len;
    },

    driftAlgos: {
      lowRTT: function (currDrift, roundTripTime) {
        this.drifts.push({offset: currDrift, rtt: roundTripTime});
        if (this.drifts.length > this.MOVING_WINDOW) this.drifts.shift();
        var drifts = this.drifts.slice(0);
        drifts.sort(function (a, b) {
          return a.rtt - b.rtt;
        });
        drifts = drifts.slice(0, this.TAKE_BEST);
        this.drift = this.avgOfKey(drifts, 'offset');
      },
      highRTT: function (currDrift, roundTripTime) {
        this.drifts.push({offset: currDrift, rtt: roundTripTime});
        if (this.drifts.length > this.MOVING_WINDOW) this.drifts.shift();
        var drifts = this.drifts.slice(0);
        drifts.sort(function (a, b) {
          return b.rtt - a.rtt;
        });
        drifts = drifts.slice(0, this.TAKE_BEST);
        this.drift = this.avgOfKey(drifts, 'offset');
      },
      minRTT: function (currDrift, roundTripTime) {
        this.drifts.push({offset: currDrift, rtt: roundTripTime});
        if (this.drifts.length > this.MOVING_WINDOW) this.drifts.shift();
        var drifts = this.drifts.slice(0);
        drifts.sort(function (a, b) {
          return a.rtt - b.rtt;
        });
        this.drift = drifts[0].offset;
      },
      maxRTT: function (currDrift, roundTripTime) {
        this.drifts.push({offset: currDrift, rtt: roundTripTime});
        if (this.drifts.length > this.MOVING_WINDOW) this.drifts.shift();
        var drifts = this.drifts.slice(0);
        drifts.sort(function (a, b) {
          return b.rtt - a.rtt;
        });
        this.drift = drifts[0].offset;
      },
      total: function (currDrift) {
        this.drifts.push(currDrift);
        this.drift = this.avgDrift();
      },
      none: function () {
        this.drift = 0;
      },
      curr: function (currDrift) {
        this.drift = currDrift;
      },
      weighted: function (currDrift) {
        if (this.numSyncs === 0) this.drift = currDrift;
        this.drift = this.EWMA_DECAY * this.drift + (1 - this.EWMA_DECAY) * currDrift;
      }
    },

    syncDrift: function () {
      var startTime = new Date().getTime();
      this.pubnub.time(
          function (serverTimeTenthsNs) {
            var serverTime = serverTimeTenthsNs / this.TENTHS_NS_PER_MS;
            if (serverTime === 0) {
              console.error('Failed to return server.time result');
              return;
            }

            var currTime = new Date().getTime();
            var roundTripTime = currTime - startTime;
            if (roundTripTime > this.MAX_RTT) {
              console.error('Latency too high to compute drift:', roundTripTime);
              if (this.numSyncs > 0) {
                return;
              }
            }

            var currDrift = serverTime - currTime + roundTripTime / 2;
            this.driftAlgos[this.mode].call(this, currDrift, roundTripTime);
            this.numSyncs++;
          }.bind(this)
      );
    },

    avgDrift: function () {
      return _.reduce(this.drifts, function (a, b) {
            return a + b;
          }) / this.drifts.length;
    },

    currTime: function () {
      return new Date(new Date().getTime() + this.drift);
    },

    currDrift: function () {
      return this.drift;
    }
  };

  return PeerTime;
})();