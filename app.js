if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}

const express = require('express')
const path = require('path')
const pageRouter = require('./routes/pages')
const bodyParser = require('body-parser')
const session = require('express-session')
const passport = require('passport')
const bcrypt = require('bcrypt')
const LocalStrategy = require('passport-local').Strategy
const db = require('./db/connection.js')
const cookieParser = require('cookie-parser')
const MySQLStore = require('express-mysql-session')(session)

const app = express()

var dbInfo = {
    host: process.env.HOST,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
    database: process.env.DATABASE,
    multipleStatements: true
}

var sessionStore = new MySQLStore(dbInfo)

app.use(session({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
    store: sessionStore
}))

app.use(passport.initialize())
app.use(passport.session())

// serve static files
app.use(express.static(path.join(__dirname, 'public')))

// template
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

//usage
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser())

app.use((req, res, next) => {
    res.locals.isAuthenticated = req.isAuthenticated()
    next()
})



//Routes
app.use('/', pageRouter)
passport.use(new LocalStrategy((username, password, done) => {

    db.query("SELECT * FROM users WHERE username = ?", [username], (err, results, fields) => {
        if (err) {
            done(err)
        } else {
            if (results.length === 0) {
                done(null, false)
            } else {
                const hash = results[0].password.toString()
                bcrypt.compare(password, hash, (err, res) => {
                    if (res === true) {
                        return done(null, {
                            user_id: results[0].id,
                            username: results[0].username,
                            firstname: results[0].first_name,
                            lastname: results[0].last_name,
                            email: results[0].email,
                            bio: results[0].bio_description,
                            followers: results[0].followers_count
                        })

                    } else {
                        return done(null, false)
                    }
                })
            }
        }
    })
    //return done(null, false)
}))
//Error
app.use((req, res, next) => {
    var err = new Error('Page not found');
    err.status = 404;
    next(err)
})

// Handling error
app.use((err, req, res, next) => {
    res.status(err.status || 500);
    res.send(err.message)
})


const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
})

server.on('clientError', (err, socket) => {
    console.error(err)
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');

})

module.exports = app