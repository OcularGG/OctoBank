const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-buf-05.sparkedhost.us',
    port: 3306,
    user: 'u159065_dT0ZxTfNn0',
    password: 'e4!=6PqJ+dFyquGs@OczJcVR',
    database: 's159065_OctoBank'
};

// Create a connection pool
const pool = mysql.createPool(dbConfig);

module.exports = pool;
