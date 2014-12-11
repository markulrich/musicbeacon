var AudioManager = (function () {
  'use strict';

  var AudioContext = (window.AudioContext || window.webkitAudioContext);

  function PlayObj(fileId, playTime, duration, source) {
    this.fileId = fileId;
    this.playTime = playTime; // To determine order.
    this.duration = duration;
    this.source = source;
    this.playStart = null;    // Actual time to start depending on queue state.
  }

  function AudioManager(client) {
    this.peerTime = client.peerTime;
    this.fileIdToPlayObj = {};
  }

  AudioManager.prototype = {
    audioCtx: new AudioContext(),

    adjustPlayTimes: function () {
      var playList = _.map(this.fileIdToPlayObj, function (playObj) {
        return [playObj.playTime, playObj]
      });
      playList.sort();
      var currTime = this.peerTime.currTime();
      var nextTime = null;
      _.each(playList, function (pair) {
        var playObj = pair[1];
        if (nextTime === null) {
          nextTime = playObj.playTime;
        }
        if (playObj.playTime > nextTime) {
          nextTime = playObj.playTime;
        }
        if (nextTime < currTime + playObj.duration) {
          delete this.fileIdToPlayObj[nextTime];
          return true;
        }
        playObj.playStart = nextTime;
        if (playObj.source !== null) {
          playObj.source.stop();
          var diff = (currTime - playObj.playStart) / 1000;
          if (diff > 0) {
            playObj.source.start(0, diff);
          } else {
            playObj.source.start(context.currentTime - diff, 0);
          }
        }
        nextTime += playObj.duration;
      }.bind(this));
    },

    bufferPlay: function (fileId, playTime, duration) {
      this.fileIdToPlayObj[fileId] = new PlayObj(fileId, playTime, duration, null);
      this.adjustPlayTimes();
    },

    onFileReceived: function (fileId, buffer) {
      if (fileId in this.fileIdToPlayObj) {
        var playObj = this.fileIdToPlayObj[fileId];
        this.playFile(fileId, buffer, playObj.playTime, playObj.duration);
      } else {
        console.error('File', fileId, 'not in', this.fileIdToPlayObj)
      }
    },

    playFile: function (fileId, encodedBuffer, playTime, duration) {
      if (!(fileId in this.fileIdToPlayObj)) {
        this.bufferPlay(fileId, playTime, duration);
      }
      var playObj = this.fileIdToPlayObj[fileId];
      var source = this.audioCtx.createBufferSource();
      this.audioCtx.decodeAudioData(encodedBuffer, function (buffer) {
        source.buffer = buffer;
        source.connect(this.audioCtx.destination);
        playObj.soure = source;
        this.adjustPlayTimes();
      }.bind(this));
    },

    stopAll: function () {
      _.each(this.fileIdToPlayObj, function (playObj) {
        if (playObj.source !== null) {
          playObj.source.stop();
        }
      });
    }

    //stopFile: function(fileId) {
    //  var minTime = _.min(_.map(this.playing, function(source, playTime) { return playTime; }));
    //  if (minTime !== Infinity) {
    //    this.playing[minTime].stop();
    //    delete this.playing[minTime];
    //  }
    //}
  };

  return AudioManager;
})();
