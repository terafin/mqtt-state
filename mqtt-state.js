// Requirements
const mqtt = require('mqtt')
const Redis = require('redis')
const express = require('express')

const logging = require('./homeautomation-js-lib/logging.js')

// Set up Logging
logging.set_enabled(true)
logging.setRemoteHost('10.0.1.42', 5000)

// Config
const host = process.env.MQTT_HOST
const port = process.env.LISTENING_PORT
const redisHost = process.env.REDIS_HOST
const redisPort = process.env.REDIS_PORT
const redisDB = process.env.REDIS_DATABASE

const redis = Redis.createClient({
    host: redisHost,
    port: redisPort,
    db: redisDB,
    retry_strategy: function(options) {
        if (options.error && options.error.code === 'ECONNREFUSED') {
            // End reconnecting on a specific error and flush all commands with a individual error
            return new Error('The server refused the connection')
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
            // End reconnecting after a specific timeout and flush all commands with a individual error
            return new Error('Retry time exhausted')
        }
        if (options.times_connected > 10) {
            // End reconnecting with built in error
            return undefined
        }
        // reconnect after
        return Math.min(options.attempt * 100, 3000)
    }
})

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
    if (topic.endsWith('/set')) return
    if (topic.startsWith('/homeseer/action/')) return

    const components = topic.split('/')
    if (components[0] === 'homeseer' && components[1] === 'action') return

    redis.get(topic, function(err, result) {
        if (result !== null) {
            //logging.log('topic: ' + topic + ' value: ' + result)
            logging.info(JSON.stringify({ topic: topic, value: ('' + message) }))
        } else {
            logging.log('adding: ' + topic + ' value: ' + message)
        }
        //redis.set(topic, message)
    })
})

// redis callbacks

redis.on('error', function(err) {
    logging.log('redis error ' + err)
})

redis.on('connect', function() {
    logging.log('redis connected')
    redis.keys('*', function(err, result) {
        logging.log(' keys:' + result)
    })

})

// Express
const app = express()

app.get('/', function(req, res) {
    redis.keys('*', function(err, result) {
        logging.log('keys: ' + result)
        const keys = result.sort()
        redis.mget(keys, function(err, values) {
            var html = ''

            html += '<!DOCTYPE html>'
            html += '<html>'
            html += '<body>'
            html += '<h1>All Devices</h1>'
            html += '<table style="width:100%">'

            for (var index = 0; index < keys.length; index++) {
                var key = keys[index]
                var value = values[index]

                if (key.endsWith('/set')) continue
                if (key.startsWith('/homeseer/action/')) continue

                html += '<tr>'
                html += '<td>'
                html += key
                html += '</td>'
                html += '<td>'
                html += value
                html += '</td>'

                html += '</tr>'
            }

            html += '</table>'
            html += '</body>'
            html += '</html>'

            res.send(html)
        })
    })
})

app.listen(port, function() {
    logging.log('MQTT Store listening on port: ', port)
})