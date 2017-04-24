// Requirements
const mqtt = require('mqtt')

const logging = require('./homeautomation-js-lib/logging.js')
const mqttHelpers = require('./homeautomation-js-lib/mqtt_helpers.js')

// Set up Logging
logging.set_enabled(true)

// Config
const host = process.env.MQTT_HOST

// Setup MQTT
const client = mqtt.connect(host)

// MQTT Observation

client.on('connect', () => {
    logging.log('Reconnecting...\n')
    client.subscribe('#')
})

client.on('disconnect', () => {
    logging.log('Reconnecting...\n')
    client.connect(host)
})

client.on('message', (topic, message) => {
    logging.log(' ' + topic + ':' + message)
})