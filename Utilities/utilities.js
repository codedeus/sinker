require('dotenv').config();

var email = require('emailjs');
const nodemailer = require('nodemailer');
var logger = require('./../logConfig/logConfig');

const jwt = require('jsonwebtoken');
var utilCtrl = {};

utilCtrl.CreateToken = (user) => {
  let scopes;
  // Check if the user object passed in
  // has admin set to true, and if so, set
  // scopes to admin

  if (user.IsAdmin) {
    scopes = 'admin';
  }
  // Sign the JWT
  return jwt.sign({ 
      _id: user._id, 
      Email: user.Email, 
      scope: scopes 
    }, 
    process.env.JWT_AUTHKEY, { 
        algorithm: 'HS256', 
        expiresIn: "24h" 
    });
};

var transporter = email.server.connect({
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    tls: true
});

utilCtrl.CreateGuid = ()=> {
    var d = Date.now();
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        d += performance.now(); //use high-precision timer if available
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

utilCtrl.SendEmail = (from,to,subject,text,htmlBody,isCb,cb)=>{
    var mailOptions = {
        from:from,
        to:to,
        subject:subject,
        bcc: "Contact Log <logs@healthstation.ng>",
        text:text,
        attachment:
            [
                { data: "<html>"+ htmlBody+" </html>", alternative: true }
            ]
    };
    // send the message and get a callback with an error or details of the message that was sent
    transporter.send(mailOptions, function (err, message) {
        logger.debug(err || message);
        
        if(isCb){
            var replyPayLoad = {};
            if(err){
                replyPayLoad.error = true;
            }
            return cb(replyPayLoad);
        }
    });
};

module.exports = utilCtrl;