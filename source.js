module.exports = Source;
var u = require('scuttlebutt/util');
var webrtc = require('webrtcsupport');

var rtcConfig = {
	iceServers: [
		{url: 'stun:124.124.124.2'}
	]
};
var constraints = {
	mandatory: {
		OfferToReceiveAudio: false,
		OfferToReceiveVideo: false,
	},
	optional: [
		//{googIPv6: true},
		//{DtlsSrtpKeyAgreement: true}
	]
};

var expiration = 15 * 60 * 1000;

function Source(id, rrtc) {
	this.id = id;
	this.rrtc = rrtc;

	// updates:

	// global state
	this.state = null;
	// session descriptions, one per peer
	this.descriptions = {};
	// arbitrary messages, list per peer
	this.messages = {};

	this.logError = Source_logError.bind(this);
}

var S = Source.prototype;

/*
 * get updates, suitable for replicating.
 * may not be in order.
 */
S.history = function(sources, updates) {
	// take advantage of this opportunity to remove expired updates
	var expireTime = Date.now() - expiration;
	updates = updates || [];
	if (this.state) {
		if (this.state[1] < expireTime) {
			this.state = null;
		} else if (u.filter(this.state, sources)) {
			updates.push(this.state);
		}
	}

	var peerId, update;
	for (peerId in this.descriptions) {
		update = this.descriptions[peerId];
		if (!update) continue;
		if (update[1] < expireTime) {
			delete this.descriptions[peerId];
		} else if (u.filter(update, sources)) {
			updates.push(update);
		}
	}

	for (peerId in this.messages) {
		var messages = this.messages[peerId];
		for (var i = 0; i < messages.length; i++) {
			update = messages[i];
			if (update[1] < expireTime) {
				messages.splice(i, 1);
				i--;
			} else if (u.filter(update, sources)) {
				updates.push(messages[i]);
			}
		}
	}
	return updates;
};

/* update types:
 * - state: [state]
 * - description: [target_id, description]
 * - relay: [target_id, type, data]
 */

/*
 * apply an update from this source.
 */
S.applyUpdate = function(update) {
	// [value, timestamp, source_id, (signature)] = update
	var value = update[0];
	if (value == null) {
		// invalid update
		return false;
	}

	var peerId = value[0];

	if (value.length == 1) {
		// state
		if (this.state && this.state[1] > update[1]) {
			// we have newer state
			return false;
		}
		this.state = update;
		if (this.id != this.rrtc.id) {
			this.gotState(value[0]);
		}

	} else if (value.length == 2) {
		// peer description
		var desc = this.descriptions[peerId];
		if (desc && desc[1] > update[1]) {
			// we have a newer description for this peer id
			console.log('desc too old');
			return false;
		}
		this.descriptions[peerId] = update;
		// console.log('peerId', peerId, 'rtc id', this.rrtc.id, 'this id', this.id);
		if (peerId == this.rrtc.id) {
			console.log('got remote', value[1], this.id, this.rrtc.id, peerId);
			this.gotRemoteDescription(value[1]);
		} else if (this.id == this.rrtc.id) {
			//console.log('got local', value[1], this.id, peerId);
			var peer = this.rrtc.getSource(peerId);
			peer.gotLocalDescription(value[1]);
		} else {
			//console.log('some desc', value[1], this.id, this.rrtc.id, peerId);
		}

	} else if (value.length == 3) {
		// relay message
		var messages = this.messages[peerId] || (this.messages[peerId] = []);
		messages.push(update);
		if (peerId == this.rrtc.id) {
			this.gotMessage(value[1], value[2]);
		}

	} else {
		// unknown update type
		return false;
	}
	return true;
};

S.localUpdate = function(data) {
	console.log('sending local', this.id, data);
	this.rrtc.localUpdate([this.id].concat(data));
};

function Source_logError(e) {
	console.error(e);
}

function Source_onIceCandidate(e) {
	if (e.candidate) {
		this.localUpdate(['ice', e.candidate]);
	}
}

function Source_onNegotiationNeeded() {
	console.log('negotiation needed');
	this.startNegotiation();
}

function Source_onSetRemoteDescription() {
	console.log('remote description set');
	// if we received an offer, we need to answer
	if (this.pc.remoteDescription.type == 'offer') {
		this.pc.createAnswer(Source_onLocalDescCreated.bind(this),
			this.logError);
	}
}

function Source_onLocalDescCreated(desc) {
	console.log('local description created', desc);
	this.pc.setLocalDescription(desc,
		Source_onSetLocalDescription.bind(this),
		this.logError);
}

function Source_onSetLocalDescription() {
	console.log('local description set');
	this.rrtc.getSource(this);
	this.localUpdate([this.pc.localDescription]);
	/*
	if (this.signalingState == 'stable') {
		this.rrtc._gotPeerConnection(this, this.pc);
	}
	*/
}

S.gotState = function(state) {
	this.rrtc._gotState(this, state);
};

// we changed our description
S.gotLocalDescription = function(desc) {
	if (!desc) return;
	var peerId = this.rrtc.id;
	var update, value;
	//this.rrtc.getSource(peerId).getRemoteDescription()
	//if (this.rrtc.getSource(peerId).shouldConnect(this))

	update = this.descriptions[peerId];
	if (update) {
		value = update[0];
		this.gotRemoteDescription(value[1]);
	}

	// release the messages
	for (peerId in this.messages) {
		var messages = this.messages[peerId];
		for (var i = 0; i < messages.length; i++) {
			update = messages[1];
			if (update) {
				value = update[0];
				this.gotMessage(value[1], value[2]);
			}
		}
	}
};

S.ensurePeerConnection = function() {
	if (this.pc) return;
	console.log('creating pc');
	this.pc = new webrtc.PeerConnection(rtcConfig, constraints);
	this.pc.onnegotiationneeded = Source_onNegotiationNeeded.bind(this);
	this.pc.onicecandidate = Source_onIceCandidate.bind(this);
	this.pc.onsignalingstatechange = function() {
		console.debug('signalling state', this.signalingState);
	};
	this.pc.oniceconnectionstatechange = function() {
		console.debug('ice connection state', this.iceConnectionState, this.iceGatheringState);
	};
	this.startNegotiation();
};

S.startNegotiation = function() {
	this.pc.createOffer(Source_onLocalDescCreated.bind(this), this.logError);
};

// we (rrtc) got a description from this remote peer
S.gotRemoteDescription = function(desc) {
	if (!this.rrtc.shouldConnect(this)) {
		// we don't care about this peer's connection attempt
		return;
	}

	this.ensurePeerConnection();

	if (!desc || typeof desc != 'object') return;

	console.debug('remote description setting', desc, this.signalingState);
	this.pc.setRemoteDescription(new webrtc.SessionDescription(desc),
		Source_onSetRemoteDescription.bind(this), this.logError);
};

S.gotMessage = function(type, data) {
	if (!this.rrtc.shouldConnect(this)) {
		// we don't care about this peer's connection attempt
		return;
	}

	if (type == 'ice') {
		this.ensurePeerConnection();
		//console.debug('got ice', data);
		try {
			this.pc.addIceCandidate(new webrtc.IceCandidate(data));
		} catch(e) {
			console.error('Error adding ICE candidate: ' + e.message, data);
		}
	}
};
