const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const app = express();

app.use(bodyParser.json());

// Create a connection pool for better performance
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

app.post('/webhook', (req, res) => {
    const signature = req.headers['verif-hash'];
    
    // Tabbatar da Flutterwave
    if(signature !== process.env.FLW_SECRET_HASH){
        return res.status(401).send('Unauthorized');
    }

    const payload = req.body;

    if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
        const amount = payload.data.amount;
        const email = payload.data.customer.email;

        const sql = "UPDATE users SET balance = balance + ? WHERE email = ?";
        pool.execute(sql, [amount, email], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Database Error');
            }
            console.log("Balance updated successfully for:", email);
            res.status(200).send('OK');
        });
    } else {
        res.status(200).send('Event ignored');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));## Hi there 👋

<!--
**umarsaraki/Umarsaraki** is a ✨ _special_ ✨ repository because its `README.md` (this file) appears on your GitHub profile.

Here are some ideas to get you started:

- 🔭 I’m currently working on ...
- 🌱 I’m currently learning ...
- 👯 I’m looking to collaborate on ...
- 🤔 I’m looking for help with ...
- 💬 Ask me about ...
- 📫 How to reach me: ...
- 😄 Pronouns: ...
- ⚡ Fun fact: ...
-->
