// -------------------- server.js --------------------
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// ------------------ DATABASE ------------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

// ------------------ MODELS ------------------
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  password: String,
  otp: String,
  verified: { type: Boolean, default: false }
});

const diarySchema = new mongoose.Schema({
  userId: String,
  subject: String,
  date: String,
  time: String,
  content: String,
  theme: String
});

const User = mongoose.model("User", userSchema);
const Diary = mongoose.model("Diary", diarySchema);

// ------------------ ROUTES ------------------

// SIGNUP
app.post("/signup", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (password.length < 3) return res.status(400).json({ msg: "Password minimum 3 digits" });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ msg: "Email already registered" });

    const hashed = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const user = new User({ name, email, phone, password: hashed, otp });
    await user.save();

    // Email er jaygay console log
    console.log(`Signup OTP for ${email}: ${otp}`);

    res.json({ msg: "OTP generated (check console for now)" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// VERIFY OTP
app.post("/verify", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user || user.otp !== otp) return res.status(400).json({ msg: "Invalid OTP" });

    user.verified = true;
    user.otp = null;
    await user.save();

    res.json({ msg: "Verified" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.verified) return res.status(400).json({ msg: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ msg: "Wrong password" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// AUTH MIDDLEWARE
function auth(req, res, next) {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ msg: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ msg: "Invalid token" });
  }
}

// CREATE DIARY
app.post("/diary", auth, async (req, res) => {
  try {
    const diary = new Diary({ ...req.body, userId: req.user.id });
    await diary.save();
    res.json(diary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// GET DIARY
app.get("/diary", auth, async (req, res) => {
  try {
    const diaries = await Diary.find({ userId: req.user.id });
    res.json(diaries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// DELETE DIARY
app.delete("/diary/:id", auth, async (req, res) => {
  try {
    await Diary.findByIdAndDelete(req.params.id);
    res.json({ msg: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// FRONTEND
app.get("/", (req, res) => {
  res.send(`

<!DOCTYPE html>
<html>
<head>
<title>Love Diary</title>
<style>
body{font-family:Arial;text-align:center;background:#fff;margin:0;padding:0}
input,textarea,select{margin:5px;padding:5px}
textarea{width:250px;height:80px}
#welcome{display:none;font-size:30px;margin-top:150px}
.heartPage{width:300px;height:300px;margin:30px auto;position:relative;transform:rotate(-45deg)}
.heartPage::before,.heartPage::after{content:"";width:300px;height:300px;position:absolute;border-radius:50%}
.heartPage::before{top:-150px;left:0}
.heartPage::after{left:150px;top:0}
.pink,.pink::before,.pink::after{background:#ffc0cb}
.white,.white::before,.white::after{background:#fff;border:1px solid #ffb6c1}
.inner{transform:rotate(45deg);padding:30px}
</style>
</head>
<body>

<div id="auth">
<h2>Login</h2>
<input id="email" placeholder="Email"><br>
<input id="password" type="password" placeholder="Password"><br>
<button onclick="login()">Login</button>

<h3>Sign Up</h3>
<input id="name" placeholder="Name"><br>
<input id="signupEmail" placeholder="Email"><br>
<input id="phone" placeholder="Phone"><br>
<input id="signupPassword" type="password" placeholder="Password"><br>
<button onclick="signup()">Sign Up</button>

<h3>Verify OTP</h3>
<input id="verifyEmail" placeholder="Email"><br>
<input id="otp" placeholder="OTP"><br>
<button onclick="verify()">Verify</button>
</div>

<div id="welcome"><div id="message"></div></div>

<div id="app" style="display:none">
<h2>My Love Diary</h2>
<select id="theme">
<option value="pink">Baby Pink</option>
<option value="white">White</option>
</select><br>
<input id="subject" placeholder="Subject"><br>
<input type="date" id="date"><br>
<input type="time" id="time"><br>
<textarea id="content" placeholder="Write your love..."></textarea><br>
<button onclick="saveDiary()">Save</button>
<div id="diaryList"></div>
</div>

<script>
let token="";

async function signup(){
  const res = await fetch("/signup",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({name:name.value,email:signupEmail.value,phone:phone.value,password:signupPassword.value})});
  const data = await res.json();
  alert(data.msg);
}

async function verify(){
  const res = await fetch("/verify",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({email:verifyEmail.value,otp:otp.value})});
  const data = await res.json();
  alert(data.msg);
}

async function login(){
  const res = await fetch("/login",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({email:email.value,password:password.value})});
  const data = await res.json();
  if(data.token){
    token = data.token;
    auth.style.display="none";
    welcome.style.display="block";
    message.innerText="Happy Valentine's Day ❤️";
    setTimeout(()=>{
      message.innerText="I Love You 💖";
      setTimeout(()=>{
        welcome.style.display="none"; app.style.display="block"; loadDiary();
      },2000);
    },2000);
  } else {
    alert(data.msg);
  }
}

async function saveDiary(){
  await fetch("/diary",{method:"POST",headers:{"Content-Type":"application/json",Authorization:token},
  body:JSON.stringify({subject:subject.value,date:date.value,time:time.value,content:content.value,theme:theme.value})});
  loadDiary();
}

async function loadDiary(){
  const res = await fetch("/diary",{headers:{Authorization:token}});
  const diaries = await res.json();
  diaryList.innerHTML="";
  diaries.forEach(d=>{
    diaryList.innerHTML+=\`
    <div class="heartPage \${d.theme}">
      <div class="inner">
        <h3>\${d.subject}</h3>
        <p>\${d.date} \${d.time}</p>
        <p>\${d.content}</p>
        <button onclick="deleteDiary('\${d._id}')">Delete</button>
      </div>
    </div>\`;
  });
}

async function deleteDiary(id){
  await fetch("/diary/"+id,{method:"DELETE",headers:{Authorization:token}});
  loadDiary();
}
</script>

</body>
</html>

  `);
});

// ------------------ START SERVER ------------------
app.listen(process.env.PORT,()=>console.log("Server running on port "+process.env.PORT));
