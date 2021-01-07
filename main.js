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
    .get((req, res) => {
        // Display permission error on user site
        res.sendStatus(403);
    })
    .post((req, res) => {
        const action = req.body.action;
        if (action === 'create:account') {
            // Variable for the response data sent back to the client
            let responseData = {
                "userID": ""
            }
            // Get data from POST Request Body
            const personalData = req.body.personalData
            const accountData = req.body.accountData
            // Create SQL Query and set items to insert
            let query = "INSERT INTO users (uid, given_name, surname, email_address, password) VALUES (?, ?, ?, ?, ?)";
            let query_data = [
                Math.floor(Math.random() * Date.now()), personalData.given_name, personalData.surname, personalData.email_address, phpPasswords.hash(accountData.password)
            ]
            // Insert the user into the database
            connection.query(mysql.format(query, query_data), (error, results, fields) => {
                if (error) {
                    res.status(500).json(error);
                } else {
                    const internalUID = results.insertId
                    let updateQuery = "UPDATE activations SET used_by = ? WHERE activation_key = ?"
                    let updateData = [
                        internalUID, accountData.key
                    ]
                    connection.query(mysql.format(updateQuery, updateData), (updateError, updateResults, fields) => {
                        if (updateError) {
                            res.status(500).json(updateError);
                        } else {
                            connection.query(mysql.format('SELECT * FROM users WHERE internal_uid = ?', [internalUID]), (error, results, fields) => {
                                responseData.userID = results[0].uid;
                                if (accountData.type === 'admin') {
                                    const sql = "INSERT INTO admins (user_id) VALUES (?)"
                                    const data = [
                                        internalUID
                                    ];
                                    const query = mysql.format(sql, data);
                                    connection.query(query, (error, results, fields) => {
                                        if (error) {
                                            res.status(500).json(error);
                                        } else {
                                            res.status(201).json(responseData);
                                        }
                                    });
                                } else if (accountData.type === 'responder') {
                                    const sql = "INSERT INTO responders (user_id) VALUES (?)";
                                    const data = [
                                        internalUID
                                    ];
                                    const query = mysql.format(sql, data)
                                    connection.query(query, (error, results, fields) => {
                                        if (error) {
                                            res.status(500).json(error);
                                        } else {
                                            res.status(201).json(responseData);
                                        }
                                    });
                                }
                            });
                        }
                    })
                }
            })
        } else if (action === 'create:notification') {
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
                                "internal_id": results.insertId
                            }
                            res.status(201).json(responseData);
                        }
                    })
                })
                .catch((error) => {
                    console.log('ERROR: ', error)
                })

        } else if (action === 'login:mobile') {
            const loginData = req.body.loginData
            const sql = "SELECT * FROM users WHERE email_address = ?";
            const sql_data = [
                loginData.emailAddress
            ]
            connection.query(mysql.format(sql, sql_data), (error, results, fields) => {
                if (error) {
                    res.status(500).json(error)
                } else {
                    if (phpPasswords.verify(loginData.password, results[0].user_password)) {
                        let responseData = {
                            "validData": true,
                            "accountData": {
                                "internalID": results[0].internal_uid,
                                "accountID": results[0].uid,
                                "givenName": results[0].given_name,
                                "surname": results[0].surname,
                                "email_address": results[0].email_address,
                                "adminAccount": (results[0].isAdmin === 1),
                                "responderAccount": (results[0].isResponder === 1),
                                "developerAccount": (results[0].isDeveloper === 1),
                                "responderLevel": null
                            }
                        }
                        if (responseData.accountData.responderAccount) {
                            const sql = "SELECT responder_level FROM responders WHERE internal_uid = ?"
                            const sql_data = [responseData.accountData.internalID]
                            console.log(mysql.format(sql, sql_data))
                            connection.query(mysql.format(sql, sql_data), (error, results, fields) => {
                                if (error) {
                                    res.status(500).json(error)
                                } else {
                                    console.log(results[0].responder_level)
                                    responseData.accountData.responderLevel = results[0].responder_level
                                    res.json(responseData)
                                }
                            })
                        } else {
                            res.json(responseData)
                        }
                    }
                }
            })
        }
    })

// Handle status requests
api.route('/status')
    .get((req, res) => {
        // Send HTTP Code 418 ("I'm a teapot") as answer that the API Server is online
        res.sendStatus(418);
        console.log("Status request at " + tools.timeAndDate())
    })

/* Let the API Server listen on port and log time and date */
const port = config.get('express').port;
api.listen(port, () => console.log("Server started serving on port " + port))