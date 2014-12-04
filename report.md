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
