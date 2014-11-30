function AudioManager(peerTime) {
  this.peerTime = peerTime;
  this.clips = {};
}

AudioManager.prototype = {
  audioCtx: new (window.AudioContext || window.webkitAudioContext)(),

  playFile: function(fileManager, playTime) {
    var self = this;
    var source = this.audioCtx.createBufferSource();

    fileManager.loadArrayBuffer(function (arrayBuffer) {
      self.audioCtx.decodeAudioData(arrayBuffer, function (buffer) {
        source.buffer = buffer;
        source.connect(self.audioCtx.destination);
        var diff = (self.peerTime.currTime() - playTime) / 1000;

        console.log('Starting playback at', diff);
        source.start(0, diff);
      });
    });
  }
};