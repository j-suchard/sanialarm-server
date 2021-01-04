//Include express and other needed packages
const express = require('express');
const bodyParser = require('body-parser');
const phpPasswords = require('node-php-password');
const mysql = require('mysql');
const config = require('config');
const firebase = require('firebase-admin')
const tools = require('./tools');

//Create connection Pool for the node application
const databaseConfig = tools.getConnectionConfig()
if (databaseConfig === null) {
    console.error("There is no valid database config. Please check your configuration file")
    process.exit(1)
}
var connection = mysql.createConnection({
    host: databaseConfig.host,
    user: databaseConfig.user,
    password: databaseConfig.password,
    database: databaseConfig.database
});

//Create Express Server and configure middleware for request body parsing
const api = express()
api.use(bodyParser.json())
api.use(bodyParser.urlencoded({
    extended: true
}))

// Initialize the Firebase Services
firebase.initializeApp({
    credential: firebase.credential.cert(config.get('firebase').credentialLocation)
})

/* Routes for the REST-Server */

// Standard route for all requests going to webserver/
api.route('/')
    .all((req, res) => {
        // Display permission error on user site
        res.sendStatus(403);
    })

// Handle status requests
api.route('/status')
    .get((req, res) => {
        // Send HTTP Code 418 ("I'm a teapot") as answer that the API Server is online
        res.sendStatus(418);
        console.log("Status request at " + tools.timeAndDate())
    })

// Handle Requests concerning the creation of items
api.route('/create/:what')
    // Answer with method not allowed to GET-Requests
    .get((req, res) => {
        res.setHeader("Allow", "POST")
        res.sendStatus(405)
    })
    .post((req, res) => {
        const objectType = req.params.what;
        if (objectType === 'account') {
            const personalData = req.body.personalData
            const accountData = req.body.accountData
            let query = "INSERT INTO users (uid, given_name, surname, email_address, password) VALUES (?, ?, ?, ?, ?)";
            let query_data = [
                Date.now(), personalData.given_name, personalData.surname, personalData.email_address, accountData.password
            ]
            connection.query(query, query_data, (error, results, fields) => {
                if (error) {
                    res.status(500).json(error);
                } else {
                    const internalUID = results.insertedId
                    let query = "UPDATE keys SET used_by = ? WHERE key = ?"
                }
            })
        } else if (objectType === 'notification') {
            const notificationData = req.body.data
            const misc = req.body.misc;
            let notification = {
                data: {
                    location: notificationData.location,
                    description: notificationData.description
                },
                topic: 'on_duty_users'
            }
            firebase.messaging().send(notification, true)
                .then((response) => {
                    const messageID = response.replace('projects/sanialarm-cvd/messages/', '');
                    const time = Date.now() / 1000 | 0;
                    console.log('Sent message:', response, 'With data:', notificationData, 'Having messageID:', messageID, 'at', time)
                    connection.query("INSERT INTO notifications (message_id, location, description, created_by, created_at) VALUES (?, ?, ?, ?, FROM_UNIXTIME(?))", [messageID, notificationData.location, notificationData.description, misc.creator, time], (error, results, fields) => {
                        if (error) {
                            res.status(500).json(error);
                        } else {
                            const responseData = {
                                "status": "sent",
                                "firebase_id": messageID,
                                "internal_id": results.insertedId
                            }
                            res.status(201).json(responseData);
                        }
                    })
                })
                .catch((error) => {
                    console.log('ERROR: ', error)
                })
        }
    })

/* Let the API Server listen on port and log time and date */
const port = config.get('express').port;
api.listen(port, () => console.log("Server started serving on port " + port))