function AudioManager(peerTime) {
  this.peerTime = peerTime;
  this.clips = {};
}

AudioManager.prototype = {
  audioCtx: new (window.AudioContext || window.webkitAudioContext)(),

  playFile: function(encodedBuffer, playTime) {
    var self = this;
    var source = this.audioCtx.createBufferSource();

    self.audioCtx.decodeAudioData(encodedBuffer, function (buffer) {
      source.buffer = buffer;
      source.connect(self.audioCtx.destination);
      var diff = (self.peerTime.currTime() - playTime) / 1000;
      console.log('Starting playback at', diff);
      source.start(0, diff);
    });
  }
};