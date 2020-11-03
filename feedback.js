module.exports = {
    getFeedbacks : function() {
        var feedbacks = {
            'input_bg': {
                label: 'Change background colour by input',
                description: 'If the input specified is in use, change background color of the bank',
                options: [{
                    type: 'colorpicker',
                    label: 'Foreground color',
                    id: 'fg',
                    default: this.rgb(255, 255, 255)
                }, {
                    type: 'colorpicker',
                    label: 'Background color',
                    id: 'bg',
                    default: this.rgb(255, 0, 0)
                }, {
                    type: 'dropdown',
                    label: 'input',
                    id: 'input',
                    default: '10',
                    choices: this.CHOICES_INPUTS
                }],
                callback: (feedback, bank) => {
                    if (this.state.input === feedback.options.input) {
                        return {
                            color: feedback.options.fg,
                            bgcolor: feedback.options.bg
                        };
                    }
                }
            },
            'freeze_bg': {
                label: 'Change background colour by freeze status',
                description: 'If the output is frozen, change background color of the bank',
                options: [{
                    type: 'colorpicker',
                    label: 'Foreground color',
                    id: 'fg',
                    default: this.rgb(255, 255, 255)
                }, {
                    type: 'colorpicker',
                    label: 'Background color',
                    id: 'bg',
                    default: this.rgb(0, 0, 255)
                }],
                callback: (feedback, bank) => {
                    if (this.state.freeze) {
                        return {
                            color: feedback.options.fg,
                            bgcolor: feedback.options.bg
                        };
                    }
                }
            },
        }
        return feedbacks
    }
}