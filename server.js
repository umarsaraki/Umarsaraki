const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 1. KEYS DAGA ENVIRONMENT
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;
const FLW_PUBLIC_KEY = process.env.FLW_PUBLIC_KEY;
const FLW_SECRET_HASH = process.env.FLW_SECRET_HASH;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET = process.env.SUPABASE_SECRET;
const NELLO_USER = process.env.NELLO_USERID;

const sbHeaders = {
    'apikey': SUPABASE_SECRET,
    'Authorization': `Bearer ${SUPABASE_SECRET}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

const CSS = `<style>*{box-sizing:border-box;margin:0;font-family:'Segoe UI'}body{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}.box{background:#fff;padding:30px;border-radius:20px;box-shadow:0 15px 35px rgba(0,0,0,0.2);width:100%;max-width:500px}h2{color:#667eea;text-align:center;margin-bottom:15px}input,select{width:100%;padding:12px;margin:8px 0;border:2px solid #e0e0e0;border-radius:10px}button{width:100%;padding:14px;margin-top:10px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border:none;border-radius:10px;font-size:16px;font-weight:bold;cursor:pointer}a{color:#667eea;display:block;margin:5px 0;text-align:center}.balance{font-size:28px;color:#28a745;text-align:center}</style>`;

// HELPER: SAMU USER
async function getUser(email){
    const res = await fetch(`${SUPABASE_URL}users?email=eq.${email}`, {headers: sbHeaders});
    return (await res.json())[0];
}

// HELPER: BUY + PROFIT. PROFIT = 0 idan babu
async function buyAndLog(email, costPrice, sellingPrice, description, nelloUrl){
    const profit = sellingPrice - costPrice;
    const totalCharge = sellingPrice;
    const user = await getUser(email);
    if(!user || user.wallet < totalCharge) return {error: "Insufficient Balance"};

    await fetch(`${SUPABASE_URL}users?id=eq.${user.id}`, {method: 'PATCH', headers: sbHeaders, body: JSON.stringify({wallet: user.wallet - totalCharge})});
    const nello = await fetch(nelloUrl);
    const result = await nello.text();

    if(result.includes("Successful") || result.includes("delivered") || result.includes("PIN")){
        if(profit > 0){ // Sai idan akwai profit sai a ajiye
            await fetch(`${SUPABASE_URL}admin_wallet?id=eq.1`, {method:'PATCH', headers:sbHeaders, body:JSON.stringify({balance: profit})});
        }
        await fetch(`${SUPABASE_URL}transactions`, {method:'POST', headers:sbHeaders, body:JSON.stringify({user_email:email, type:'Debit', amount:totalCharge, description:description + ` Profit: ${profit}`})});
        return {success: true, result};
    } else {
        await fetch(`${SUPABASE_URL}users?id=eq.${user.id}`, {method: 'PATCH', headers: sbHeaders, body: JSON.stringify({wallet: user.wallet})});
        return {error: result};
    }
}

// 2. DASHBOARD
app.get('/', async (req,res)=>{
    const email = req.query.email;
    const user = await getUser(email);
    res.send(`${CSS}<div class="box"><h2>Dashboard</h2><p class="balance">₦${user?.wallet || 0}</p><a href="/fund?email=${email}">Fund Wallet</a><a href="/airtime?email=${email}">Buy Airtime</a><a href="/data?email=${email}">Buy Data</a><a href="/cable?email=${email}">Cable TV</a><a href="/light?email=${email}">Electricity</a><a href="/airtime-cash?email=${email}">Airtime to Cash</a><a href="/airtime-card?email=${email}">Buy Airtime Card</a><a href="/data-card?email=${email}">Buy Data Card</a><a href="/cards?email=${email}">Buy Exam Card</a><a href="/history?email=${email}">History</a><a href="/profile?email=${email}">Profile</a></div>`)
});

// 3. FUND WALLET + WEBHOOK
app.get('/fund', (req,res)=>{ res.send(`${CSS}<div class="box"><h2>Fund Wallet</h2><form method="POST" action="/fund"><input name="email" value="${req.query.email}" readonly><input name="amount" placeholder="Amount" required><button>Pay Now</button></form></div>`) });
app.post('/fund', async (req,res)=>{
    const {email, amount} = req.body;
    const tx_ref = `umarsaraki-${uuidv4()}`;
    const response = await fetch('https://api.flutterwave.com/v3/payments', {
        method: 'POST', headers: {'Authorization': `Bearer ${FLW_SECRET_KEY}`, 'Content-Type':'application/json'},
        body: JSON.stringify({tx_ref, amount, currency:"NGN", redirect_url:`https://umarsaraki-wallet.onrender.com/?email=${email}`, customer:{email}})
    });
    const data = await response.json();
    res.redirect(data.data.link);
});
app.post('/webhook', async (req,res)=>{
    if(req.headers['verif-hash']!== FLW_SECRET_HASH) return res.status(401).send('Unauthorized');
    if(req.body.event === 'charge.completed' && req.body.data.status === 'successful'){
        const {amount, customer:{email}} = req.body.data;
        const user = await getUser(email);
        await fetch(`${SUPABASE_URL}users?id=eq.${user.id}`, {method:'PATCH', headers:sbHeaders, body:JSON.stringify({wallet: user.wallet + amount})});
        await fetch(`${SUPABASE_URL}transactions`, {method:'POST', headers:sbHeaders, body:JSON.stringify({user_email:email, type:'Credit', amount, description:'Wallet Funding'})});
    }
    res.status(200).send('OK');
});

// 4. AIRTIME - BABU PROFIT
app.get('/airtime', (req,res)=>{ res.send(`${CSS}<div class="box"><h2>Buy Airtime</h2><form method="POST" action="/buy-airtime"><input name="email" value="${req.query.email}" readonly><select name="network"><option value="1">MTN</option><option value="2">Airtel</option><option value="3">Glo</option><option value="4">9Mobile</option></select><input name="phone" placeholder="Phone"><input name="amount" placeholder="Amount"><button>Buy</button></form></div>`) });
app.post('/buy-airtime', async (req,res)=>{
    const {email, network, amount, phone} = req.body;
    const url = `https://www.nellobytesystems.com/APIAirtimeNetworkV2.asp?UserID=${NELLO_USER}&APIKey=${process.env.NELLO_AIRTIME_KEY}&Network=${network}&Amount=${amount}&Mobile=${phone}`;
    const result = await buyAndLog(email, amount, amount, `Airtime ${amount} to ${phone}`, url); // PROFIT = 0
    res.send(JSON.stringify(result));
});

// 5. DATA - +50 PER 1GB
app.get('/data', (req,res)=>{ res.send(`${CSS}<div class="box"><h2>Buy Data</h2><form method="POST" action="/buy-data"><input name="email" value="${req.query.email}" readonly><select name="network"><option value="1">MTN</option><option value="2">Airtel</option></select><input name="plan" placeholder="PlanID,Price" value="1,250"><input name="planSizeGB" placeholder="GB Size" value="1"><input name="phone" placeholder="Phone"><button>Buy</button></form></div>`) });
app.post('/buy-data', async (req,res)=>{
    const {email, network, plan, planSizeGB, phone} = req.body;
    const costPrice = parseInt(plan.split(',')[1]);
    const sellingPrice = costPrice + (parseInt(planSizeGB) * 50); // NAN PROFIT
    const url = `https://www.nellobytesystems.com/APIDatabundleNetworkV2.asp?UserID=${NELLO_USER}&APIKey=${process.env.NELLO_DATA_KEY}&Network=${network}&Plan=${plan.split(',')[0]}&Mobile=${phone}`;
    const result = await buyAndLog(email, costPrice, sellingPrice, `Data ${planSizeGB}GB to ${phone}`, url);
    res.send(JSON.stringify(result));
});

// 6. CABLE TV - +50 FIXED
app.get('/cable', (req,res)=>{ res.send(`${CSS}<div class="box"><h2>Buy Cable</h2><form method="POST" action="/buy-cable"><input name="email" value="${req.query.email}" readonly><input name="cable" placeholder="dstv"><input name="package" placeholder="PackageID,Price" value="1,5000"><input name="smartcard" placeholder="Smartcard"><button>Buy</button></form></div>`) });
app.post('/buy-cable', async (req,res)=>{
    const {email, cable, package, smartcard} = req.body;
    const costPrice = parseInt(package.split(',')[1]);
    const sellingPrice = costPrice + 50;
    const url = `https://www.nellobytesystems.com/APICableTVV2.asp?UserID=${NELLO_USER}&APIKey=${process.env.NELLO_CABLE_KEY}&Cable=${cable}&Package=${package.split(',')[0]}&SmartCard=${smartcard}`;
    const result = await buyAndLog(email, costPrice, sellingPrice, `Cable ${cable}`, url);
    res.send(JSON.stringify(result));
});

// 7. LIGHT - +50 FIXED
app.get('/light', (req,res)=>{ res.send(`${CSS}<div class="box"><h2>Buy Electricity</h2><form method="POST" action="/buy-light"><input name="email" value="${req.query.email}" readonly><input name="disco" placeholder="ikeja"><input name="amount" placeholder="Amount"><input name="meter" placeholder="Meter No"><button>Buy</button></form></div>`) });
app.post('/buy-light', async (req,res)=>{
    const {email, disco, amount, meter} = req.body;
    const costPrice = parseInt(amount);
    const sellingPrice = costPrice + 50;
    const url = `https://www.nellobytesystems.com/APIElectricityV2.asp?UserID=${NELLO_USER}&APIKey=${process.env.NELLO_LIGHT_KEY}&Disco=${disco}&Amount=${amount}&MeterNo=${meter}`;
    const result = await buyAndLog(email, costPrice, sellingPrice, `Light ${disco}`, url);
    res.send(JSON.stringify(result));
});

// 8. AIRTIME TO CASH
app.get('/airtime-cash', (req,res)=>{ res.send(`${CSS}<div class="box"><h2>Airtime to Cash</h2><form method="POST" action="/airtime-to-cash"><input name="email" value="${req.query.email}" readonly><select name="network"><option value="1">MTN</option></select><input name="amount" placeholder="Airtime Amount"><input name="phone" placeholder="Your Phone"><input name="bank" placeholder="Bank"><input name="account" placeholder="Account No"><button>Convert</button></form></div>`) });
app.post('/airtime-to-cash', async (req,res)=>{
    const {email, network, amount, phone, bank, account} = req.body;
    const rate = 0.8;
    const cash = amount * rate;
    const profit = amount - cash;
    const nello = await fetch(`https://www.nellobytesystems.com/APIAirtimeNetworkV2.asp?UserID=${NELLO_USER}&APIKey=${process.env.NELLO_AIRTIME_KEY}&Network=${network}&Amount=${amount}&Mobile=${phone}`);
    const result = await nello.text();
    if(result.includes("Successful")){
        await fetch(`${SUPABASE_URL}admin_wallet?id=eq.1`, {method:'PATCH', headers:sbHeaders, body:JSON.stringify({balance: profit})});
        await fetch(`${SUPABASE_URL}transactions`, {method:'POST', headers:sbHeaders, body:JSON.stringify({user_email:email, type:'Airtime2Cash', amount, description:`Converted ${amount} to ${cash}. Profit: ${profit}`})});
        res.send(`Success. Sent ₦${cash} to ${bank} - ${account}`);
    } else { res.send("Airtime conversion failed: " + result); }
});

// 9. AIRTIME CARD - BABU PROFIT
app.get('/airtime-card', (req,res)=>{ res.send(`${CSS}<div class="box"><h2>Buy Airtime Card</h2><form method="POST" action="/buy-airtime-card"><input name="email" value="${req.query.email}" readonly><select name="network"><option value="1">MTN</option><option value="2">Airtel</option></select><input name="amount" placeholder="Amount 100,200,500"><input name="qty" placeholder="Quantity"><button>Buy</button></form></div>`) });
app.post('/buy-airtime-card', async (req,res)=>{
    const {email, network, amount, qty} = req.body;
    const costPrice = parseInt(amount) * qty;
    const sellingPrice = costPrice; // BABU PROFIT
    const url = `https://www.nellobytesystems.com/APIBuyAirtimeCard.asp?UserID=${NELLO_USER}&APIKey=${process.env.NELLO_AIRTIME_CARD_KEY}&Network=${network}&Amount=${amount}&Quantity=${qty}`;
    const result = await buyAndLog(email, costPrice, sellingPrice, `Airtime Card ${network} x${qty}`, url);
    res.send(JSON.stringify(result));
});

// 10. DATA CARD - +50 FIXED
app.get('/data-card', (req,res)=>{ res.send(`${CSS}<div class="box"><h2>Buy Data Card</h2><form method="POST" action="/buy-data-card"><input name="email" value="${req.query.email}" readonly><select name="network"><option value="1">MTN</option><option value="2">Airtel</option></select><input name="plan" placeholder="PlanID,Price" value="1,500"><input name="qty" placeholder="Quantity"><button>Buy</button></form></div>`) });
app.post('/buy-data-card', async (req,res)=>{
    const {email, network, plan, qty} = req.body;
    const costPrice = parseInt(plan.split(',')[1]) * qty;
    const sellingPrice = costPrice + (50 * qty);
    const url = `https://www.nellobytesystems.com/APIBuyDataCard.asp?UserID=${NELLO_USER}&APIKey=${process.env.NELLO_DATA_CARD_KEY}&Network=${network}&Plan=${plan.split(',')[0]}&Quantity=${qty}`;
    const result = await buyAndLog(email, costPrice, sellingPrice, `Data Card ${plan} x${qty}`, url);
    res.send(JSON.stringify(result));
});

// 11. EXAM CARD - +50 FIXED
app.get('/cards', (req,res)=>{ res.send(`${CSS}<div class="box"><h2>Buy Exam Card</h2><form method="POST" action="/buy-card"><input name="email" value="${req.query.email}" readonly><select name="type"><option value="waec">WAEC</option><option value="jamb">JAMB</option></select><input name="qty" placeholder="Quantity"><button>Buy</button></form></div>`) });
app.post('/buy-card', async (req,res)=>{
    const {email, type, qty} = req.body;
    const key = type === 'waec'? process.env.NELLO_WAEC_KEY : process.env.NELLO_JAMB_KEY;
    const costPrice = 2500 * qty;
    const sellingPrice = costPrice + (50 * qty);
    const url = `https://www.nellobytesystems.com/APIBuyEpin.asp?UserID=${NELLO_USER}&APIKey=${key}&Type=${type}&Quantity=${qty}`;
    const result = await buyAndLog(email, costPrice, sellingPrice, `${type} x${qty}`, url);
    res.send(JSON.stringify(result));
});

// 12. HISTORY
app.get('/history', async (req,res)=>{
    const email = req.query.email;
    const txRes = await fetch(`${SUPABASE_URL}transactions?user_email=eq.${email}&order=date.desc`, {headers: sbHeaders});
    const tx = await txRes.json();
    let rows = tx.map(t=>`<p>${t.date} - ${t.description} - ₦${t.amount}</p>`).join("");
    res.send(`${CSS}<div class="box"><h2>History</h2>${rows || "No transactions"}<br><a href="/">Back</a></div>`)
});

// 13. PROFILE
app.get('/profile', (req,res)=>{
    res.send(`${CSS}<div class="box"><h2>Profile Settings</h2>
    <form method="POST" action="/change-pin"><input name="email" value="${req.query.email}" readonly><input name="pin" placeholder="New 4-digit PIN"><button>Change PIN</button></form>
    <form method="POST" action="/change-password"><input name="email" value="${req.query.email}" readonly><input name="password" type="password" placeholder="New Password"><button>Change Password</button></form>
    <form method="POST" action="/biometric"><input type="hidden" name="email" value="${req.query.email}"><button>Toggle Biometric</button></form>
    </div>`)
});
app.post('/change-pin', async (req,res)=>{ const hash = await bcrypt.hash(req.body.pin, 10); await fetch(`${SUPABASE_URL}users?email=eq.${req.body.email}`, {method:'PATCH', headers:sbHeaders, body:JSON.stringify({pin: hash})}); res.send("PIN Updated") });
app.post('/change-password', async (req,res)=>{ const hash = await bcrypt.hash(req.body.password, 10); await fetch(`${SUPABASE_URL}users?email=eq.${req.body.email}`, {method:'PATCH', headers:sbHeaders, body:JSON.stringify({password: hash})}); res.send("Password Updated") });
app.post('/biometric', async (req,res)=>{ const user = await getUser(req.body.email); await fetch(`${SUPABASE_URL}users?id=eq.${user.id}`, {method:'PATCH', headers:sbHeaders, body:JSON.stringify({biometric_enabled:!user.biometric_enabled})}); res.send("Biometric Toggled") });

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Server running on ${PORT}`));
