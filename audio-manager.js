function AudioManager(peerTime) {
    this.peerTime = peerTime;
    this.clips = {};
}

AudioManager.prototype = {
    audioCtx: new (window.AudioContext || window.webkitAudioContext)(),

    addClip: function(fileManager) {
        var self = this;
        var source = this.audioCtx.createBufferSource();
        fileManager.loadArrayBuffer(function (arrayBuffer) {
            self.audioCtx.decodeAudioData(arrayBuffer, function (buffer) {
                source.buffer = buffer;
                source.connect(self.audioCtx.destination);
                var diff = (self.peerTime.currTime() - fileManager.playTime) / 1000;
                if (diff >= 0) {
                    console.log('Starting playback at', diff);
                    source.start(0, diff);
                } else {
                    console.error('Negative diff...');
                    source.start(-diff, 0);
                }
                // TODO add to pool self.clips
            });
        });
    }
};