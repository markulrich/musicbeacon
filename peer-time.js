function PeerTime(pubnub, mode) {
    this.mode = typeof mode !== 'undefined' ? mode : 'moving-average';
    if (this.mode == 'array') {
        this.drifts = [];
    } else if (this.mode === 'moving-average') {
        this.drifts = [];
        this.window = 20;
    } else if (this.mode === 'exponential') {
        this.drift = 0;
    } else if (this.mode === 'none') {
        return;
    } else {
        throw new Error('Invalid mode', this.mode);
    }
    this.pubnub = pubnub;
    this.numSyncs = 0;
    this.syncDrift();
    var self = this;
    window.setInterval(function () {
        self.syncDrift();
    }, 1000);
}

PeerTime.prototype = {
    syncDrift: function () {
        var self = this;
        var tripStartTime = new Date();
        this.pubnub.time(
            function (timeIn10thOfNs) {
                var currTime = new Date();
                var TENTHS_OF_NANOSECOND_PER_MILLISECOND = 10000;
                var timeMs = timeIn10thOfNs / TENTHS_OF_NANOSECOND_PER_MILLISECOND;
                var estimatedTimeFromServer = (currTime - tripStartTime) / 2;
                var currDrift = timeMs - estimatedTimeFromServer - currTime;
                // TODO think about how to remove outliers.
                if (self.mode === 'total-average') {
                    self.drifts.push(currDrift);
                } else if (self.mode === 'moving-average') {
                    self.drifts.push(currDrift);
                    if (self.drifts.length > self.window) {
                        self.drifts.splice(0, 1);
                    }
                } else if (self.mode === 'exponential') {
                    var percPrevToUse = Math.min(self.numSyncs / (self.numSyncs + 1.0), 0.9);
                    self.drift = percPrevToUse * self.drift + (1.0 - percPrevToUse) * currDrift;
                } else if (this.mode === 'none') {
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
        if (this.mode === 'total-average') {
            drift = this.avgDrift();
        } else if (this.mode === 'moving-average') {
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
