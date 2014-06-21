# r-rtc

WebRTC signalling through a [scuttlebutt](https://npm.im/scuttlebutt) object.

## Rationale

You have an app using
[Commutative Replicated Data Types](https://github.com/dominictarr/crdt).
You want instances of the app to synchronize over WebRTC datachannels. You also
want to the app to synchronize with a central server. You need a signalling
channel. Why not combine the centralized server with the signalling channel into
one CRDT? Putting the signalling channel into the CRDT state allows peer
connections to be negotiated over the existing peer connections, making the
network more resilient to disconnnections from the central server.

## Example

```js

var RRTC = require('r-rtc');
var signaller = new RRTC();

signalling.on('peerstate', function(id, active) {
	if (active) {
		console.log('found peer with source id', id);
		signalling.connect(id);
	}
});

signalling.on('peerconnection', function(id, peerConnection) {
	console.log('connected to peer', id, peerConnection);
	// add stuff to the peer connection. streams, data channels, listeners, etc.
});

signalling.setState(true);

```

## Status

Currently it seems to work. There are sometimes issues when renegotiating a
connection.

For an example in use, see [rtc-cards](https://github.com/clehner/rtc-cards).

## License

```
Fair License (Fair)
URL: http://opensource.org/licenses/Fair

Copyright (C) 2014, Charles Lehner

Usage of the works is permitted provided that this instrument
is retained with the works, so that any entity that uses the
works is notified of this instrument.

DISCLAIMER: THE WORKS ARE WITHOUT WARRANTY.
```
