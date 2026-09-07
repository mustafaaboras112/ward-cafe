// Trusted administrator migration. The secret is entered masked, never as a CLI argument.
'use strict';
const admin=require('firebase-admin');
const {digits,validNumber,validPin,loginEmail}=require('./numeric');
admin.initializeApp({databaseURL:process.env.WARD_DATABASE_URL || 'https://ward-cafe-default-rtdb.firebaseio.com'});
async function readPin(){
    if(!process.stdin.isTTY)throw Error('Run in an interactive terminal to enter the secret securely.');
    process.stdout.write('New numeric code (12-20 digits): ');process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdin.resume();
    return new Promise((resolve,reject)=>{let pin='';const done=()=>{process.stdin.setRawMode(false);process.stdin.pause();process.stdin.off('data',onData);process.stdout.write('\n');};const onData=chunk=>{for(const char of chunk){if(char==='\u0003'){done();reject(Error('Cancelled'));return;}if(char==='\r'||char==='\n'){done();resolve(pin);return;}if(char==='\u007f'||char==='\b'){if(pin){pin=pin.slice(0,-1);process.stdout.write('\b \b');}}else if(/^[0-9]$/.test(digits(char)) && pin.length<20){pin+=digits(char);process.stdout.write('*');}}};process.stdin.on('data',onData);});
}
(async()=>{
    const identifier=process.argv[2],number=digits(process.argv[3]);
    if(!identifier || !validNumber(number))throw Error('Usage: node functions/bootstrap-numeric.js EXISTING_EMAIL_OR_UID USER_NUMBER');
    const user=identifier.includes('@')?await admin.auth().getUserByEmail(identifier):await admin.auth().getUser(identifier);
    const pin=await readPin();if(!validPin(pin))throw Error('Code must contain 12-20 digits.');
    const permission=admin.database().ref('access/'+user.uid),current=(await permission.get()).val();
    await permission.update({active:false,revokedAt:Math.floor(Date.now()/1000)});
    await admin.auth().updateUser(user.uid,{email:loginEmail(number),password:pin});await admin.auth().revokeRefreshTokens(user.uid);
    await permission.update({role:current?.role || 'admin',active:true});
    console.log('Numeric login configured for user number:',number);
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>admin.app().delete());
