const express=require('express');
const bodyParser=require('body-parser');
const db=require('./db.js');
const axios=require('axios');
const app=express();
app.use(bodyParser.json());

app.get('/',function(req,res){
    res.send("Server Connected");
});

const instaUser=require("./models/InstaUser.js");



const getting_url=require("./routes/getting_url.js");
app.use("/getting_url",getting_url);

const getting_follower_info=require("./routes/getting_follower_info.js");
app.use("/getting_follower_info",getting_follower_info);

const getting_following_info=require("./routes/getting_following_info.js");
app.use("/getting_following_info",getting_following_info);

const getting_tagged_accounts=require("./routes/getting_tagged_accounts.js");
app.use("/getting_tagged_accounts",getting_tagged_accounts);


app.listen(3000,()=>{
    console.log('Server port is SetUp');
});
