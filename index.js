var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');
var debug;
var log;


function instance(system, id, config) {
	var self = this;

	// Request id counter
	self.request_id = 0;
	self.login = false;
	// super-constructor
	instance_skel.apply(this, arguments);
	self.status(1,'Instance Initializing');
	self.actions(); // export actions
	return self;
}

instance.prototype.updateConfig = function(config) {
	var self = this;
	self.config = config;
	self.init_tcp();
};


instance.prototype.incomingData = function(data) {
	var self = this;
	debug(data);

	// Match part of the copyright response from unit when a connection is made.
	// Send Info request which should reply with Config "CR 06 02"
	if (self.login === false && data.match(/F44004100D2.*$/)) {
		self.login = true;
		self.status(self.STATUS_OK);
		debug("logged in");
	}
	else {
		debug("data nologin", data);
	}
};

instance.prototype.init = function() {
	var self = this;
	debug = self.debug;
	log = self.log;
	self.init_tcp();
};

instance.prototype.init_tcp = function() {
	var self = this;
	var receivebuffer = '';

	if (self.socket !== undefined) {
		self.socket.destroy();
		delete self.socket;
		self.login = false;
	}

	if (self.config.host) {
		self.socket = new tcp(self.config.host, 10001);

		self.socket.on('status_change', function (status, message) {
			if (status !== self.STATUS_OK) {
				self.status(status, message);
			}
		});

		self.socket.on('error', function (err) {
			debug("Network error", err);
			self.log('error',"Network error: " + err.message);
		});

		self.socket.on('connect', function () {
			debug("Connected");
			self.login = false;
			if (self.socket !== undefined && self.socket.connected) {
				self.socket.write(self.build_packet(false,"0D2",""));
			}
		});

		self.socket.on('error', function (err) {
			debug("Network error", err);
			self.log('error',"Network error: " + err.message);
			self.login = false;
		});
		// if we get any data, display it to stdout
		self.socket.on("data", function(buffer) {
			var indata = buffer.toString("utf8");
			self.incomingData(indata);
		});

		self.login = true;
		self.status(self.STATUS_OK);
	}
};

instance.prototype.calculate_checksum = function(data) {
	sum = 0;
	for (i = 0; i < data.length; i = i + 2) {
		byte = data.substr(i,2)
		sum += parseInt(byte, 16)
	  }
	cs = sum.toString(16);
	cs = cs.slice(-2); // Limit to two chars
	return cs;
}

instance.prototype.build_packet = function(write, action, payload) {
	var self = this;

	cmd = "";
	if(write) {
		cmd += "44"; // write
	}
	else {
		cmd += "04"; // read
	}
	cmd += "00"; // Source (optional)
	cmd += "41"; // Primary window
	cmd += "0"; // Output
	cmd += action;
	cmd += payload.padStart(6,'0');

	cmd += self.calculate_checksum(cmd); // Checksum

	//Not included in checksum
	cmd =  "F" + cmd; // Start of packet
	cmd += "\r"; // CR to confirm

	return cmd;
}


// Fields for web config
instance.prototype.config_fields = function () {
	var self = this;
	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'This module is for the TVOne Corio2 scaler'
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Scaler IP address',
			width: 12,
			default: '192.168.2.100',
			regex: self.REGEX_IP
		}
	]
};

// When module gets deleted
instance.prototype.destroy = function () {
		var self = this;

		if (self.socket !== undefined) {
			self.socket.destroy();
		}
		debug("destroy", self.id);
};

instance.prototype.CHOICES_INPUTS = [
	{ label: 'RGB',   id: '10'   },
	{ label: 'YUV',   id: '11'   },
	{ label: 'DVI',  id: '12'  },
	{ label: 'SDI',  id: '50'   },
	{ label: 'CV', id: '40' },
	{ label: 'YC', id: '30' }
];

instance.prototype.CHOICES_TRANSITIONS = [
	{ label: 'CUT',   id: '0'   },
	{ label: 'FADE',   id: '1'   },
	{ label: 'PUSH RIGHT',  id: '2'  },
	{ label: 'PUSH LEFT',  id: '3'   },
	{ label: 'PUSH UP', id: '4' },
	{ label: 'PUSH DOWN', id: '5' }
];

instance.prototype.actions = function (system) {
	var self = this;
	var actions = {
		'input': {
			label: 'Select input',
			options: [{
					type: 'dropdown',
					label: 'input',
					id: 'input',
					default: '10',
					choices: self.CHOICES_INPUTS
			}]
		},
		'freeze': {
			label: 'Freeze frame',
			options: [{
					type: 'dropdown',
					label: 'freeze',
					id: 'enable',
					default: 'true',
					choices: self.CHOICES_YESNO_BOOLEAN
			}]
		},
		'transition': {
			label: 'Set transition',
			options: [{
					type: 'dropdown',
					label: 'transition',
					id: 'transition',
					default: '0',
					choices: self.CHOICES_TRANSITIONS
			}]
		}
	};

	self.setActions(actions);
};


instance.prototype.action = function (action) {
	var self = this;
	var id = action.action;
	var opt = action.options;
	var cmd;

	switch (id) {
		case 'input':
			if(opt.input !== null) {
				cmd = this.build_packet(true,"082",opt.input)
			}
			break;
		case 'freeze':
			if (opt.enable == 'true') {
				cmd = this.build_packet(true,"09C","1")
			}
			else {
				cmd = this.build_packet(true,"09C","0")
			}
			break;
		case 'transition':
			if (opt.transition !== null ) {
				cmd = this.build_packet(true,"112",opt.transition)
			}
			break;
	}

	if (cmd !== undefined) {
		if (self.socket !== undefined && self.socket.connected) {
			self.socket.write(cmd);
		} else {
			debug('Socket not connected :(');
		}
	}
};


instance_skel.extendedBy(instance);
exports = module.exports = instance;
