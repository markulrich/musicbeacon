var PlaybackControlView = (function() {
  var template = ""; // TODO move template here

  // TODO: move the below to helpers
  var uploadButton = $('#upload-button');
  var fileInput = $('#upload-input');
  var playButton = $('#play-button');
  var stopButton = $('#stop-button');
  var fetchButton = $('#fetch-button');

  /**
   * Slightly different than the other views in that the elements
   * are already in the document.
   */
  function PlaybackControlView(client) {
    this.client = client;
  }

  PlaybackControlView.prototype = {
    registerEvents: function() {
      // Upload events
      // NOTE: Upload button merely tiggers hidden fileInput
      uploadButton.click(function() { fileInput.click(); });
      fileInput.change(function() {
        this.client.uploadFile();
      }.bind(this));

      fetchButton.click(function() {
        var fileId = this.fileStore.getSelectedFileId();
        if (fileId === null) {
          toastr.error('Please select a file.');
          return;
        }

        this.client.requestFile(fileId, false);
      }.bind(this));

      playButton.click(function() {
        var fileId = this.getSelectedFileId();
        if (fileId === null) {
          toastr.error('Please select a file.');
          return;
        }

        this.client.broadcastPlay(fileId);
      }.bind(this));

      stopButton.click(function() {
        this.client.broadcastStop(fileId);
      }.bind(this));
    }
  };

  return PlaybackControlView;
})();
