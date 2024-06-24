const mongoose=require('mongoose');
// define the mongodb connection URL
const mongoURL="mongodb://localhost:27017"
mongoose.connect(mongoURL,{
    useNewUrlParser:true,
    useUnifiedTopology:true,
});
// store the default mongoose connection object representing the MongoDB connection with NodeJS
const db=mongoose.connection;
// Check whether the connection is on
// EVENT LISTENER 
db.on('connected',()=>{
    console.log('Connected to MongoDB server');
});
db.on('error',(err)=>{
    console.log('Error in connection to MongoDB error '+err);
});
db.on('disconnected',()=>{
    console.log('isconnected from MongoDB server');
});
// Export the database connection
module.exports=db;