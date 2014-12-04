# Music Beacon

## Team

* Lawrence Xing (lxing)
* Mark Ulrich (markulrich)
* Omar Diab (osdiab)

## Background

It is very common to want to synchronize music playback between multiple rooms in a house or
other buildings. There are a few ways to achieve this goal nowadays, but most common tools for
music synchronization have significant drawbacks:

1. You can buy a number of speakers designed to interface with one another, like Sonos; however,
due to the proprietary nature of those speakers and audio interfaces, the user becomes locked
into their product selection, and often the hardware is quite expensive, placing Sonos systems out
of reach of the average consumer.
2. You can set up a central media server and connect speakers to it physically; however, this
solution involves an up-front cost of buying a media server, time and technical familiarity to set
it up, and necessitates adding wiring to your home or building, which often is not feasible because
of cost, restrictions on modifying rented property, or physical infeasibility due to the
construction of the building.

The downsides of these two solutions suggest a few possible solutions:

1. A system like Sonos that uses specialized hardware like pre-programmed Arduinos or Raspberry
Pi's (or other custom hardware) to handle the synchronization of playback using ubiquitous,
cross-platform software. This solution would most likely depend on a centralized media server
due to the nature of the nodes themselves.
2. A centralized media server that can synchronize playback with other computers and mobile
devices, but provides the media itself.
3. A completely decentralized media system that can play songs located on any connected device,
broadcast to every other node in the system.

In this project we attempt to implement the third option. A decentralized media system like that
provides several benefits, especially given recent developments in web technologies:

1. No specialized hardware. It relies entirely on computing devices the average consumer would
already have in their home, like mobile phones, tablets, laptops, or desktops.
2. No software setup. One can just go to a website in a browser on any computing devices they have,
and without any software installation, can synchronize music playback and selection. This is
possible due to recent developments in Web Real Time Communication (WebRTC), which will be
discussed in the next section.
3. Flexibility: Nodes can be added or removed just by accessing or navigating away from a URL in a
browser. Once again, this requires no technical expertise or setup.
4. Expanded media library selection. Each device can have a different set of music files to
contribute to the cluster of playback machines. As a result, no setup is required to synchronize
file availability between multiple machines.

These benefits lead us to believe that a decentralized system of commodity computers and mobile
devices provides an ideal way to share file data and synchronize music across multiple machines.

## Web Real Time Communication (WebRTC) and PubNub

WebRTC is an open web standard for direct, peer-to-peer communication between browsers over the
web. Most common web browsers support it, including Chrome for desktop and mobile, Firefox, and
Opera. It provides a set of primitives that allow browsers to communicate with one another
directly without installing any plugins. It is intended for bandwidth-heavy applications like video
calling and peer to peer filesharing, which makes it an excellent choice for media applications
like this project.

The WebRTC protocol provides three APIs:

1. `MediaStream` (get camera and microphone data, accessed via `navigator.getUserMedia`)
2. `PeerConnection` (sending and receiving media)
3. `DataChannel` (sending arbitrary data directly between browsers)

For this project, while we are not accessing camera and microphone data, the MediaStream
abstraction can be used with media sourced on local disks as well, with a little work; and the
`PeerConnection` abstraction provides the means to actually communicate that data.

### Coordination

Unfortunately, while the protocol ultimately allows for peer-to-peer communication, it requires
interaction with a **signaling server** in order to coordinate metadata about the connection between
peers, discoverability of peer's addresses through which they can communicate, and a communication
channel that can cope with NAT addresses and firewall restrictions.

The signaling architecture is not specified by WebRTC, but rather by the Javascript Session
Establishment Protocol (JSEP). It specifies the format of messages via the Session Description
Protocol (SDP), which communicates information like the data format being sent via WebRTC, and data
necessary to establish connections between peers.

The signaling server need not be centralized (creating a master-follower relationship for metadata
management), but for the purposes of this project we have decided to follow that structure for the
sake of simplicity.

### PubNub

Due to the time constraints on implementing this project, rather than building and hosting a
signaling server by hand that we could use for the project, we decided to use a hosted third party
service, PubNub, as our signaling server. If we wish to in the future, we have the option of later
replacing PubNub with an open-source implementation or custom-built, self-hosted signaling server.

Specifically, PubNub provides a few abstractions over the signaling process that allow us to more
efficiently build our application:

* Time API: Query an atomic clock for the current time
* Rooms: A number of peers can connect to a room and declare a unique identifier. Each peer's
    unique identifiers are broadcast and publicly accessible in the room.
* Publish: publish a message containing binary data through a channel

These abstractions reduce the amount of boilerplate code necessary to distribute media playback,
allowing us to focus further on the design of the system and ways of mitigating inherent issues of
distributed media playback, like clock drift and network transit times.

## References

WebRTC Overview: https://www.youtube.com/watch?v=p2HzZkd2A40
WebRTC Structure: http://www.webrtc.org/reference/architecture#TOC-Your-Web-App
WebRTC Signaling: http://www.html5rocks.com/en/tutorials/webrtc/infrastructure/
Javascript Session Establishment Protocol: http://tools.ietf.org/html/draft-ietf-rtcweb-jsep-03
PubNub: http://www.pubnub.com/blog/what-is-webrtc/
