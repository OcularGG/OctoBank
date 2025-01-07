const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'db-slc-01.sparkedhost.us',
    port: 3306,
    user: 'u159065_NRReexzO8u',
    password: 'NYhVmPvK@BDoq=+y2j6DbMTC',
    database: 's159065_Test-Database'
};

// Create a connection pool
const pool = mysql.createPool(dbConfig);

module.exports = pool;
