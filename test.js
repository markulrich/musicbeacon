(function () {

    var PUB_KEY = "pub-c-2e234ba3-5a2a-459b-bc82-9cab4307e02e";
    var SUB_KEY = "sub-c-175f3e5a-7c39-11e4-ad4f-02ee2ddab7fe";

    var pubnub = PUBNUB.init({
        publish_key: PUB_KEY,
        subscribe_key: SUB_KEY,
        uuid: this.uuid,
        ssl: true
    });

    function standardDeviation(values){
        var avg = average(values);

        var squareDiffs = values.map(function(value){
            var diff = value - avg;
            var sqrDiff = diff * diff;
            return sqrDiff;
        });

        var avgSquareDiff = average(squareDiffs);

        var stdDev = Math.sqrt(avgSquareDiff);
        return stdDev;
    }

    function average(data){
        var sum = data.reduce(function(sum, value){
            return sum + value;
        }, 0);

        var avg = sum / data.length;
        return avg;
    }

    function comparePeerTimes() {

        var NUM_COMPARES = 5;

        var ptCompares = [];
        for (var mode in PeerTime.prototype.driftAlgos) {
            var peerTimes = [];
            for (var i = 0; i < NUM_COMPARES; i++) {
                peerTimes.push(new PeerTime(pubnub, mode));
            }
            ptCompares.push({
                mode: mode,
                peerTimes: peerTimes
            });
        }

        var len = ptCompares.length;
        window.setInterval(function () {
            for (var i = 0; i < len; i++) {
                var ptc = ptCompares[i];
                var allDrifts = [];
                var numSyncs = 0;
                for (var j = 0; j < NUM_COMPARES; j++) {
                    allDrifts.push(ptc.peerTimes[j].currDrift());
                    numSyncs += ptc.peerTimes[j].numSyncs;
                }
                var std = standardDeviation(allDrifts);
                console.log(ptc.mode, ':\t', std, 'using', numSyncs, 'syncs.');
            }
        }, PeerTime.REFRESH);
    }

    comparePeerTimes();

})();