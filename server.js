const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
app.use(bodyParser.json());

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY; 
const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({ 
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.post('/webhook', async (req, res) => {
    const signature = req.headers['verif-hash'];
    
    if(signature !== FLW_SECRET_KEY){ 
        return res.status(401).send('Unauthorized'); 
    }

    const payload = req.body;
    
    if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
        const amount = payload.data.amount;
        const email = payload.data.customer.email;
        const sql = "UPDATE users SET wallet = wallet + $1 WHERE email = $2";
        await pool.query(sql, [amount, email]);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Ignored');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
