/**
 * DHT implements lookups for a CHORD-based DHT algorithm. This singleton class handles
 * translations from node uuids to DHT keyspace and from fileKeys in DHT keyspace to the
 * designated replica uuids.
 *
 * We distinguish between ids and keys.
 *   uuids are human-readable handles for nodes
 *   fileIds are human-readable handles for files
 *   key refers to a location on the DHT keyspace and is a hashed id.
 */
var DHT = (function () {
  var DHT_N = 10000;        // Keyspace max
  var DHT_R = 2;            // Replication factor

  function DHT(client) {
    this.uuid = client.uuid;
    hashedid = this.hash(client.uuid)

    // Maintain the invariant that this.nodes is always sorted.
    this.nodes = [hashedid];
    this.reverseMap = {};
    this.reverseMap[hashedid] = client.uuid;
  }

  DHT.prototype = {
    hash: function(str) {
      return _.reduce(str, function(h, c) {
        return (h * 37 + c.charCodeAt(0)) % DHT_N;
      }, 5381);
    },

    addNode: function(nodeId) {
      var h = this.hash(nodeId);
      this.reverseMap[h] = nodeId;

      var i = this.getSuccessorIndex(h);
      if (i == 0 && h > this.nodes[0]) i = this.nodes.length;
      this.nodes.splice(i, 0, h);
    },

    removeNode: function(nodeId) {
      var h = this.hash(nodeId);
      var i = this.nodes.indexOf(h);
      if (i >= 0) this.nodes.splice(i, 1);
    },

    getSuccessorIndex: function(key) {
      var i;
      for (i = this.nodes.length - 1; i >= 0; i--) {
        if (this.nodes[i] < key) return (i + 1) % this.nodes.length;
      }
      return 0;
    },

    getReplicaIds: function(key) {
      var replicaKeys;
      if (this.nodes.length < DHT_R) {
        replicaKeys = this.nodes;
      } else {
        var self = this;
        var start = this.getSuccessorIndex(key);
        var overflow = Math.max(DHT_R - (this.nodes.length - start), 0);
        replicaKeys = this.nodes.slice(start, DHT_R).concat(this.nodes.slice(0, overflow));
      }
      return _.map(replicaKeys, function(replicaKey) { return self.reverseMap[replicaKey]; });
    }
  }

  return DHT;
})();



