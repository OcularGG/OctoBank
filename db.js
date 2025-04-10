
require('dotenv').config();

const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-slc-01.sparkedhost.us',
    port: 3306,
    user: process.env.DBUSER,
    password: process.env.DBPASS,
    database: 's159065_Test-Database'
};

const pool = mysql.createPool(dbConfig);

module.exports = pool;
