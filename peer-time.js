function PeerTime(pubnub, mode) {
    this.mode = typeof mode !== 'undefined' ? mode : 'moving';
    if (this.mode == 'total') {
        this.drifts = [];
    } else if (this.mode === 'moving') {
        this.drifts = [];
        this.window = 60;
    } else if (this.mode === 'exponential') {
        this.drift = 0;
    } else if (this.mode === 'none') {
        return;
    } else {
        throw new Error('Invalid mode', this.mode);
    }
    this.pubnub = pubnub;
    this.numSyncs = 0;
    var self = this;
    window.setInterval(function () {
        self.syncDrift();
    }, 1000);
}

PeerTime.prototype = {
    syncDrift: function () {
        var self = this;
        var startTime = new Date();
        this.pubnub.time(
            function (pubnubTimeIn10thOfNs) {
                var currTime = new Date();
                var roundTripTime = currTime - startTime;
                var HALF_SECOND = 500;
                if (roundTripTime < 1 || roundTripTime > HALF_SECOND) {
                    console.error('Connection is too slow to calculate drift, started at', startTime, 'but now', currTime);
                    return;
                }
                var TENTHS_OF_NANOSECOND_PER_MILLISECOND = 10000;
                var pubnubTimeMs = pubnubTimeIn10thOfNs / TENTHS_OF_NANOSECOND_PER_MILLISECOND;
                var estimatedTimeFromServer = roundTripTime / 2;
                var currDrift = pubnubTimeMs + estimatedTimeFromServer - currTime;
                // TODO think about how to remove outliers.
                if (self.mode === 'total') {
                    self.drifts.push(currDrift);
                } else if (self.mode === 'moving') {
                    self.drifts.push(currDrift);
                    if (self.drifts.length > self.window) {
                        self.drifts.splice(0, 1);
                    }
                } else if (self.mode === 'exponential') {
                    var percPrevToUse = Math.min(self.numSyncs / (self.numSyncs + 1.0), 0.9);
                    self.drift = percPrevToUse * self.drift + (1.0 - percPrevToUse) * currDrift;
                } else if (self.mode === 'none') {
                    // Do nothing.
                } else {
                    throw new Error('Invalid mode', self.mode);
                }
                self.numSyncs++;
            }
        );
    },

    avgDrift: function () {
        var drift = 0;
        var len = this.drifts.length;
        for (var i = 0; i < len; i++) {
            drift += this.drifts[i];
        }
        drift /= len;
        return drift;
    },

    currTime: function () {
        var curr = new Date();
        var drift;
        if (this.mode === 'total') {
            drift = this.avgDrift();
        } else if (this.mode === 'moving') {
            drift = this.avgDrift();
        }  else if (this.mode === 'exponential') {
            drift = this.drift;
        } else if (this.mode === 'none') {
            drift = 0;
        } else {
            throw new Error('Invalid mode', this.mode);
        }
        curr.setMilliseconds(curr.getMilliseconds() + drift);
        console.log('Currtime with drift', drift, 'is', curr);
        return curr;
    }
};
