//Include express and other needed packages
const express = require('express')
const bodyParser = require('body-parser')
const phpPasswords = require('node-php-password')
const mysql = require('mysql')
const config = require('config')
//Populate configs
let database_config;
if (config.has('database')) {
    database_config = config.get('database')
    console.info(database_config)
} else {

}