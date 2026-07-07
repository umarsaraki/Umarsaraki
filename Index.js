const express = require('express');
const app = express();
app.use(express.json());

// Load secret hash from environment variables for security
const secretHash = process.env.FLW_SECRET_HASH;

app.post('/webhook', (req, res) => {
    const signature = req.headers["verif-hash"];

    if (!signature || signature !== secretHash) {
        return res.status(401).send('Unauthorized');
    }

    const payload = req.body;

    if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
        const amount = payload.data.amount;
        const email = payload.data.customer.email;
        
        console.log(`Payment confirmed: ${amount} for ${email}`);
        // Database update logic will go here
    }

    res.status(200).send('Webhook Received');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
