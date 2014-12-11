var AudioManager = (function () {
  'use strict';

  var AudioContext = (window.AudioContext || window.webkitAudioContext);

  function PlayObj(fileId, playTime, durationSecs, source) {
    this.fileId = fileId;
    this.playTime = playTime; // To determine order.
    if (typeof durationSecs !== "number") {
      throw new Error('Duration must be a number, "' + durationSecs + '" is not valid.');
    }
    this.durationSecs = durationSecs;
    this.source = source;
    this.buffer = null;
    this.queuedPlayTime = null;    // Actual time to start depending on queue state.
    this.started = false;
  }

  function AudioManager(client) {
    this.peerTime = client.peerTime;
    this.fileIdToPlayObj = {};
  }

  AudioManager.prototype = {
    audioCtx: new AudioContext(),

    setupPlayObj: function (playObj) {
      var source = this.audioCtx.createBufferSource();
      source.buffer = playObj.buffer;
      source.connect(this.audioCtx.destination);
      var fileIdToPlayObj = this.fileIdToPlayObj;
      source.onended = function() {
        delete fileIdToPlayObj[playObj.fileId];
      };
      playObj.source = source;
    },

    resetPlayObj: function (playObj) {
      if (playObj.started) {
        playObj.started = false;
        playObj.source.stop();
      }
      this.setupPlayObj(playObj);
    },

    adjustPlayTimes: function () {
      var playList = _.map(this.fileIdToPlayObj, function (playObj) {
        return [playObj.playTime, playObj]
      });
      playList.sort();
      var nextTime = null;
      var currTime = this.peerTime.currTime();
      _.each(playList, function (pair) {
        var playObj = pair[1];
        var playEnd = playObj.playTime + playObj.durationSecs * 1000;
        if (currTime > playEnd) {
          delete this.fileIdToPlayObj[playObj.fileId];
          return true;
        }
        if (nextTime === null) {
          nextTime = playObj.playTime;
        }
        if (playObj.playTime > nextTime) {
          nextTime = playObj.playTime;
        }
        playObj.queuedPlayTime = nextTime;
        if (playObj.buffer !== null) {
          this.assignQueuedPlayTime(playObj);
        }
        nextTime += playObj.durationSecs * 1000;
      }.bind(this));
    },

    assignQueuedPlayTime: function (playObj) {
      if (typeof playObj.queuedPlayTime !== "number") {
        throw new Error('queuedPlayTime must be a number, "' + playObj.queuedPlayTime + '" is not valid.');
      }
      var currTime = this.peerTime.currTime();
      var diff = (currTime - playObj.queuedPlayTime) / 1000;
      if (diff >= 0 && !playObj.started) { // Play for the first time.
        this.setupPlayObj(playObj);
        playObj.source.start(0, diff);
      } else if (diff < 0) { // Play in the future.
        this.resetPlayObj(playObj);
        playObj.source.start(this.audioCtx.currentTime - diff, 0);
      }
      playObj.started = true;
    },

    bufferPlay: function (fileId, playTime, durationSecs) {
      if (fileId in this.fileIdToPlayObj) {
        toastr.error('File already in queue.');
        return false;
      }
      this.fileIdToPlayObj[fileId] = new PlayObj(fileId, playTime, durationSecs, null);
      this.adjustPlayTimes();
      return true;
    },

    onFileReceived: function (fileId, encodedBuffer) {
      if (fileId in this.fileIdToPlayObj) {
        this.processEncodedBuffer(fileId, encodedBuffer);
      }
    },

    processEncodedBuffer: function (fileId, encodedBuffer) {
      var playObj = this.fileIdToPlayObj[fileId];
      this.audioCtx.decodeAudioData(encodedBuffer, function (buffer) {
        playObj.buffer = buffer;
        this.assignQueuedPlayTime(playObj);
      }.bind(this));
    },

    playFile: function (fileId, encodedBuffer, playTime, durationSecs) {
      if (!this.bufferPlay(fileId, playTime, durationSecs)) {
        return false;
      }
      this.processEncodedBuffer(fileId, encodedBuffer);
      return true;
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
