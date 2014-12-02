/**
 * DHT implements lookups for a CHORD-based DHT algorithm. This singleton class handles
 * transations from node uuids to DHT keyspace and lookups in DHT keyspace to the
 * corresponding replica uuids.
 */


var DHT_N = 1000;
var DHT_R = 3; // Replication factor

