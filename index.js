var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');

var feedback = require('./feedback');
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

	self.state = {
		"input" : null,
		"freeze" : null
	};
	self.message_queue = [];

	return self;
}

instance.prototype.updateConfig = function(config) {
	var self = this;
	self.config = config;
	self.init_tcp();
	self.initFeedbacks();

	self.message_queue = [];
	self.state = {
		"input" : null,
		"freeze" : null
	};
};

instance.prototype.init = function() {
	var self = this;
	debug = self.debug;
	log = self.log;
	self.init_tcp();
	self.initFeedbacks();
};


instance.prototype.incomingData = function(data) {
	var self = this;
	debug(data);

	result = self.parse_packet(data);

	if(!result.valid) {
		debug("Invalid packet");
		return;
	}

	if(result.ack) {
		self.login = true;
		self.status(self.STATUS_OK);
	}
	else {
		self.status(self.STATE_UNKNOWN);
		return;
	}

	//Send next message
	self.message_queue.shift(); //Remove acked message
	self.queue_pop();

	if(result.function === self.FUNCTION_CODES.input) {
		self.state.input = result.payload; //Remove leading zeros
		this.checkFeedbacks('input_bg');
	}
	else if(result.function === self.FUNCTION_CODES.freeze) {
		self.state.freeze = ( result.payload == "1");
		this.checkFeedbacks('freeze_bg');
	}
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
		self.socket = new tcp(self.config.host, self.config.port);

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
				// Get current input
				packet = self.build_packet(false, self.FUNCTION_CODES.input);
				self.send(packet)

				// Get current freeze status
				packet = self.build_packet(false, self.FUNCTION_CODES.freeze);
				self.send(packet)
			}
		});

		self.socket.on('error', function (err) {
			debug("Network error", err);
			self.log('error',"Network error: " + err.message);
			self.login = false;
		});
		
		// Process incoming data
		self.socket.on("data", function(buffer) {
			var indata = buffer.toString("utf8");
			self.incomingData(indata);
		});

		self.login = true;
		self.status(self.STATUS_OK);
	}
};

// Import feedbacks
instance.prototype.getFeedbacks = feedback.getFeedbacks;

//Define feedbacks
instance.prototype.initFeedbacks = function() {
	var feedbacks = this.getFeedbacks()
	this.setFeedbackDefinitions(feedbacks);
}

instance.prototype.parse_packet = function(packet) {
	var self = this;

	result = {
		"valid" : false,
		"ack" : false,
		"function": "",
		"payload": ""
	}
	if(packet.length != 20) return result;

	try {
		//Verify checksum
		packet_content = packet.substring(1,17)
		cs = self.calculate_checksum(packet_content)
		rx_cs = packet.substr(17,2);
		if(rx_cs != cs) return result;

		// Get data
		result.ack = (packet.substr(1,1) == "4")
		result.function = packet.substr(8,3)
		payload = packet.substr(11,6)
		result.payload = parseInt(payload,16).toString(16); //Remove leading zeros

		result.valid = true;
	}
	catch(e) {
		debug('Error parsing packet');
	}
	return result;
}

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

// Write (true = write action, false = read)
// Action: function code (string)
// Payload (payload), automatically padded
instance.prototype.build_packet = function(write, action, payload = "") {
	var self = this;

	cmd = "";
	if(write) {
		cmd += "04"; // write
	}
	else {
		cmd += "84"; // read
	}
	cmd += "00"; // Source (optional)
	cmd += "41"; // Primary window
	cmd += "0"; // Output
	cmd += action;

	if(write) {
		cmd += payload.padStart(6,'0');
	}

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
		},
		{
			type: 'textinput',
			id: 'port',
			label: 'Scaler TCP Port',
			width: 5,
			default: '10001',
			regex: self.REGEX_NUMBER
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

instance.prototype.FUNCTION_CODES = {
	input: "082",
	freeze: "09C",
	transition: "112"
}

instance.prototype.CHOICES_INPUTS = [
	{ label: 'RGB',   id: '10'   },
	{ label: 'YUV',   id: '11'   },
	{ label: 'DVI',  id: '12'  },
	{ label: 'YC', id: '30' },
	{ label: 'CV', id: '40' },
	{ label: 'SDI',  id: '50'   }
];

instance.prototype.CHOICES_TRANSITIONS = [
	{ label: 'CUT',   id: '0'   },
	{ label: 'FADE',   id: '1'   },
	{ label: 'PUSH RIGHT',  id: '2'  },
	{ label: 'PUSH LEFT',  id: '3'   },
	{ label: 'PUSH UP', id: '4' },
	{ label: 'PUSH DOWN', id: '5' },
	{ label: 'WIPE RIGHT', id: '6' },
	{ label: 'WIPE LEFT', id: '7' },
	{ label: 'WIPE UP', id: '8' },
	{ label: 'WIPE DOWN', id: '9' },
	{ label: 'WIPE DIAGONAL', id: '10' },
	{ label: 'WIPE DIAMOND', id: '11' }
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

instance.prototype.queue_pop = function() {
	self = this;

	if(self.message_queue.length === 0) return; // Empty
	cmd = self.message_queue[0] // Get first element

	if (self.socket !== undefined && self.socket.connected) {
		self.socket.write(cmd);
	} else {
		debug('Socket not connected :(');
	}
}

instance.prototype.send = function(data) {
	// Add to queue
	this.message_queue.push(data)
	if(this.message_queue.length == 1) { //Nothing in flight or queued
		this.queue_pop()
	}
}


instance.prototype.action = function (action) {
	var self = this;
	var id = action.action;
	var opt = action.options;
	var cmd;

	switch (id) {
		case 'input':
			if(opt.input !== null) {
				cmd = this.build_packet(true, self.FUNCTION_CODES.input ,opt.input)
			}
			break;
		case 'freeze':
			if (opt.enable == 'true') {
				cmd = this.build_packet(true, self.FUNCTION_CODES.freeze ,"1")
			}
			else {
				cmd = this.build_packet(true, self.FUNCTION_CODES.freeze ,"0")
			}
			break;
		case 'transition':
			if (opt.transition !== null ) {
				cmd = this.build_packet(true, self.FUNCTION_CODES.transition ,opt.transition)
			}
			break;
	}

	if (cmd !== undefined) {
		self.send(cmd);
	}
};


instance_skel.extendedBy(instance);
exports = module.exports = instance;
