// Requirements
const mqtt = require('mqtt')
const Redis = require('redis')
const express = require('express')

const logging = require('./homeautomation-js-lib/logging.js')
require('./homeautomation-js-lib/devices.js')

// Config
const host = process.env.MQTT_HOST
const port = process.env.LISTENING_PORT
const redisHost = process.env.REDIS_HOST
const redisPort = process.env.REDIS_PORT
const redisDB = process.env.REDIS_DATABASE

const syslogHost = process.env.SYSLOG_HOST
const syslogPort = process.env.SYSLOG_PORT

// Set up Logging
logging.set_enabled(true)
logging.setRemoteHost(syslogHost, syslogPort)

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
    redis.valueForTopic(topic, function(err, result) {
        if (err !== null) return

        if (result !== null) {
            //logging.log('topic: ' + topic + ' value: ' + result)
            logging.info(JSON.stringify({ topic: topic, value: ('' + message) }))
        } else {
            logging.log('adding: ' + topic + ' value: ' + message)
        }
        redis.set(topic, message)
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

            html += '<!DOCTYPE html>\n'
            html += '<html>\n'
            html += '<head>\n'

            html += '<style>'
            html += '#devices {'
            html += '    font-family: "Trebuchet MS", Arial, Helvetica, sans-serif;'
            html += '    border-collapse: collapse;'
            html += '    width: 100%;'
            html += '}'
            html += ''
            html += '#devices td, #customers th {'
            html += '    border: 1px solid #ddd;'
            html += '    padding: 8px;'
            html += '}'
            html += ''
            html += '#devices tr:nth-child(even){background-color: #f2f2f2;}'
            html += ''
            html += '#devices tr:hover {background-color: #ddd;}'
            html += ''
            html += '#devices th {'
            html += '    padding-top: 12px;'
            html += '    padding-bottom: 12px;'
            html += '    text-align: left;'
            html += '    background-color: #4CAF50;'
            html += '    color: white;'
            html += '}'
            html += '</style>'

            html += '</head>\n'
            html += '<body>\n'
            html += '<h1>All Devices</h1>\n'
            html += '<form action="/action" method="post" form="main_form">'
            html += '<input type="submit" value="Generate Device File">'

            html += '<table style="width:100%" id="devices">\n'

            html += '<thead>\n'
            html += '<tr>\n'
            html += '<th>\n'
            html += ''
            html += '</th>\n'

            html += '<th>\n'
            html += 'Name'
            html += '</th>\n'

            html += '<th>\n'
            html += 'Other Topic'
            html += '</th>\n'

            html += '<th>\n'
            html += 'Topic'
            html += '</th>\n'
            html += '<th>\n'
            html += 'Value'
            html += '</th>\n'

            html += '</tr>\n'
            html += '</thead>\n'

            html += '<tbody>\n'

            for (var index = 0; index < keys.length; index++) {
                var key = keys[index]
                var value = values[index]

                if (key.endsWith('/set')) continue
                if (key.startsWith('/homeseer/action/')) continue

                html += '<tr>\n'
                html += '<td>\n'
                html += '<input type="checkbox" name="enabled_' + key + '" value="checked" id="enabled" form="main_form"/>'
                html += '</td>\n'

                html += '<td>\n'
                html += '<input type="text" name="name_' + key + '" id="name" form="main_form"/>'
                html += '</td>\n'

                html += '<td>\n'
                html += '<input type="text" name="topic_' + key + '" id="alttopic" form="main_form"/>'
                html += '</td>\n'

                html += '<td>\n'
                html += key
                html += '</td>\n'
                html += '<td>\n'
                html += value
                html += '</td>\n'

                html += '</tr>\n'
            }
            html += '</tbody>\n'

            html += '</table>\n'

            html += '</form>\n'


            html += '</body>\n'
            html += '</html>'

            res.send(html)
        })
    })
})

app.get('/device-file/', function(req, res) {
    redis.keys('*', function(err, result) {
        if (result === null) {
            res.send('err' + err)
            return
        }
        logging.log('keys: ' + result)
        const keys = result.sort()
        redis.mget(keys, function(err, values) {
            var html = ''
            for (var index = 0; index < keys.length; index++) {
                var key = keys[index]

                if (key.endsWith('/set')) continue
                if (key.startsWith('/homeseer/action/')) continue

                var components = key.split('/')
                var lastComponents = components.slice(components.length - 2, components.length)
                var baseString = lastComponents.join(' ')
                var name = baseString.replace(/\//g, ' ').replace(/_/g, ' ')

                var title = baseString.replace(/\//g, '_').replace(/ /g, '_')
                if (title.startsWith('_')) title = title.slice(1, title.length)
                if (name.startsWith(' ')) name = name.slice(1, name.length)
                html += '<code>'
                html += '' + title + ':<br>'
                html += '&nbsp;&nbsp;name: "' + name + '"<br>'
                html += '&nbsp;&nbsp;topic: "' + key + '"<br>'
                html += '&nbsp;&nbsp;change_topic: "' + key + '"<br>'
                html += '&nbsp;&nbsp;voice_control: false<br>'
                html += '</code>'
            }

            res.send(html)
        })
    })
})

app.listen(port, function() {
    logging.log('MQTT Store listening on port: ', port)
})