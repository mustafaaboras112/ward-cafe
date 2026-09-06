const firebaseConfig = {
    apiKey: 'AIzaSyBKzR6NZsoF12YMtw9zwHcoNSs5IYEHLmg',
    authDomain: 'ward-cafe.firebaseapp.com',
    databaseURL: 'https://ward-cafe-default-rtdb.firebaseio.com/',
    projectId: 'ward-cafe',
    storageBucket: 'ward-cafe.firebasestorage.app',
    messagingSenderId: '1053049555269',
    appId: '1:1053049555269:web:601a644a1a8a185a63562c'
};

const firebaseConfigured = !Object.values(firebaseConfig).some(value => value.includes('YOUR_'));
let firebaseDatabase = null;

if (firebaseConfigured && window.firebase) {
    firebase.initializeApp(firebaseConfig);
    firebaseDatabase = firebase.database();
}
