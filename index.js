var Scuttlebutt = require('scuttlebutt');
var inherits = require('util').inherits;
var u = require('scuttlebutt/util');
var Source = require('./source');

module.exports = RRTC;
inherits(RRTC, Scuttlebutt);

function RRTC(opts) {
	if(!(this instanceof RRTC)) return new RRTC(opts);
	Scuttlebutt.call(this, opts);
	this._sources = {};

	this._stateTimer = setInterval(this.updateState.bind(this),
		this.stateUpdateInterval);
}

var R = RRTC.prototype;

R.stateUpdateInterval = 10 * 60 * 1000;

R.getSource = function(id) {
	return this._sources[id] || (this._sources[id] = new Source(id, this));
};

R.history = function(sources) {
	// {source_id: timestamp, ...} = sources
	var updates = [];
	for (var id in this._sources) {
		this._sources[id].history(sources, updates);
	}
	return u.sort(updates);
};

R.applyUpdate = function(update) {
	// [value, timestamp, source_id, (signature)] = update
	//var timestamp = update[1];
	var source = this.getSource(update[2]);
	return source.applyUpdate(update);
};

/*
 * Set our global state. This lets other peers know whether they should try to
 * connect to us.
 */
R.setState = function(state) {
	this.state = state;
	this.updateState();
};

/*
 * Remind peers that we are here.
 */
R.updateState = function() {
	this.localUpdate([this.state]);
};

/*
 * Try to establish a peer connection to the peer with the given source id
 */
R.connect = function(peerId) {
	// this leads to shouldConnect(peer) returning true
	this.localUpdate([peerId, true]);
};

R._gotPeerConnection = function(source) {
	this.emit('peerconnection', source.id, source.pc);
};

R._gotState = function(source, state) {
	this.emit('peerstate', source.id, state);
};

// do we want to connect to the given source
R.shouldConnect = function(source) {
	return this.getMySource().descriptions[source.id];
};

R.getMySource = function() {
	return this.getSource(this.id);
};

R.toJSON = function() {
	return {};
};
