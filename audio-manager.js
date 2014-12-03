function AudioManager(client) {
  this.peerTime = client.peerTime;
  this.playBuffer = {};
}

AudioManager.prototype = {
  audioCtx: new (window.AudioContext || window.webkitAudioContext)(),

  bufferPlay: function(fileId, playTime) {
    this.playBuffer(fileId, playTime);
  },

  onFileReceived: function(fileId, buffer) {
    if (fileId in this.playBuffer) {
      this.playFile(fileId, buffer, this.playBuffer[fileId]);
    }
  },

  playFile: function(fileId, encodedBuffer, playTime) {
    var self = this;
    var source = this.audioCtx.createBufferSource();
    delete this.playBuffer[fileId];

    self.audioCtx.decodeAudioData(encodedBuffer, function (buffer) {
      source.buffer = buffer;
      source.connect(self.audioCtx.destination);
      var diff = (self.peerTime.currTime() - playTime) / 1000;
      console.log("Starting playback at", diff);
      source.start(0, diff);
    });
  }
};