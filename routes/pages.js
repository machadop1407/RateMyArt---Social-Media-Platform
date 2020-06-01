const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const saltRounds = 10
const db = require('../db/connection')
const passport = require('passport')
const url = require('url')
var randomstring = require('randomstring')
const path = require('path')
const fs = require('fs')
const { Storage } = require('@google-cloud/storage')

const { check, validationResult } = require('express-validator')



const gc = new Storage({
    keyFilename: path.join(__dirname, '../ivory-program-276112-36e8e5c803cb.json'),
    projectId: 'ivory-program-276112'
})

const artImagesBucket = gc.bucket('art_images')

//get main page
router.get('/', (req, res, next) => {
    db.query("SELECT * FROM uploads WHERE upload_date > now() - interval 1 week ORDER BY (like_count + comment_count) desc limit 4", (err, hofResults) => {
        db.query("SELECT * FROM uploads ORDER BY id DESC LIMIT 10", (err, results) => {
            if (!req.isAuthenticated()) {
                res.render('index', {
                    upload: results,
                    hofUpload: hofResults,
                    randomId: randomstring.generate(7)
                })
            } else {
                db.query("SELECT * FROM likes WHERE user_id = ?", req.session.passport.user.user_id, (errors, rows) => {
                    res.render('index', {
                        username: req.session.passport.user.username,
                        firstname: req.session.passport.user.firstname,
                        lastname: req.session.passport.user.lastname,
                        email: req.session.passport.user.email,
                        upload: results,
                        hofUpload: hofResults,
                        randomId: randomstring.generate(7),
                        likeStats: rows
                    })
                })
            }
        })
    })
})

//GET NEXT UPLOADS
router.post('/viewMoreUploads', (req, res) => {
    var min = req.body.min
    var max = req.body.max

    db.query("SELECT * FROM uploads ORDER BY id DESC LIMIT " + min + "," + max + "", (err, results) => {
        res.send({ newUploads: results })
    })
})

//get to profile
router.get('/profile', authenticationMiddleware(), (req, res, next) => {
    db.query("SELECT * FROM uploads WHERE user_upload = ? ORDER BY id DESC", [req.session.passport.user.username], (err, results) => {
        res.render('profile', {
            username: req.session.passport.user.username,
            firstname: req.session.passport.user.firstname,
            lastname: req.session.passport.user.lastname,
            email: req.session.passport.user.email,
            bio: req.session.passport.user.bio,
            followersCount: req.session.passport.user.followers,
            upload: results,
            randomId: randomstring.generate(7)
        })
    })
})

// Edit Profile
router.post('/editProfile', (req, res) => {
    var firstName = req.body.first
    var lastName = req.body.last
    var bio = req.body.bio

    db.query('UPDATE users set first_name = ?, last_name = ?, bio_description = ? WHERE username = ?', [firstName, lastName, bio, req.session.passport.user.username], () => {
        req.session.passport.user.bio = bio
        req.session.passport.user.firstname = firstName
        req.session.passport.user.lastName = lastName
        res.redirect('/profile')
    })
})

//User Profiles Access
router.get('/users/:username', (req, res) => {
    var username = req.params.username
    if (req.isAuthenticated()) {
        var query = 'SELECT * FROM users WHERE username = ?;SELECT * FROM uploads WHERE user_upload = ? ORDER BY id DESC;SELECT * FROM likes WHERE user_id = ?;SELECT * FROM followers WHERE follow_id = ?'
        db.query(query, [username, username, req.session.passport.user.user_id, req.session.passport.user.user_id], (err, results) => {
            if (results[0][0] != undefined) {
                res.render('userProfile', {
                    userId: req.session.passport.user.user_id,
                    currentUserUsername: req.session.passport.user.username,
                    profileId: results[0][0].id,
                    username: results[0][0].username,
                    firstname: results[0][0].first_name,
                    lastname: results[0][0].last_name,
                    email: results[0][0].email,
                    bio: results[0][0].bio_description,
                    followersCount: results[0][0].followers_count,
                    upload: results[1],
                    likeStats: results[2],
                    followStats: results[3],
                    randomId: randomstring.generate(7)

                })
            } else {
                res.send('404: Page Not Found')
            }
        })
    } else {
        var query = 'SELECT * FROM users WHERE username = ?;SELECT * FROM uploads WHERE user_upload = ?;'
        db.query(query, [username, username], (err, results) => {
            if (results[0][0] != undefined) {
                res.render('userProfile', {
                    profileId: results[0][0].id,
                    username: results[0][0].username,
                    firstname: results[0][0].first_name,
                    lastname: results[0][0].last_name,
                    email: results[0][0].email,
                    bio: results[0][0].bio_description,
                    followersCount: results[0][0].followers_count,
                    upload: results[1],
                    randomId: randomstring.generate(7)
                })
            } else {
                res.send('404: Page Not Found')
            }
        })
    }
})

//Follow
router.post('/follow', (req, res) => {
    let userId = req.body.userId
    let followUserId = req.body.followUserId

    db.query("UPDATE users set followers_count = followers_count + 1 WHERE id = ?", followUserId)
    db.query("INSERT INTO followers (follow_id, beingfollowed_id) VALUES (?,?)", [userId, followUserId])
    req.session.passport.user.followers = req.session.passport.user.followers + 1
})

//Unfollow
router.post('/unfollow', (req, res) => {
    let userId = req.body.userId
    let followUserId = req.body.followUserId

    db.query("UPDATE users set followers_count = followers_count - 1 WHERE id = ?", followUserId)
    db.query("DELETE FROM followers WHERE follow_id = ? AND beingfollowed_id = ?", [userId, followUserId])
    req.session.passport.user.followers = req.session.passport.user.followers - 1

})

//Following Feed
router.get('/followingFeed', (req, res) => {
    db.query("SELECT beingfollowed_id FROM followers WHERE follow_id = ?", req.session.passport.user.user_id, (err, results) => {
        var followingIds = [];
        results.forEach(id => {
            followingIds.push(id.beingfollowed_id)
        });
        var stringIds = followingIds.join(`','`)
        console.log(stringIds)
        db.query("SELECT username FROM users WHERE id IN ('" + stringIds + "')", (err, results) => {
            var followingUsernames = [];
            results.forEach(username => {
                followingUsernames.push(username.username)
            });
            var stringUsernames = followingUsernames.join(`','`)
            db.query("SELECT * FROM uploads WHERE user_upload in ('" + stringUsernames + "')", (err, results) => {
                db.query("SELECT * FROM likes WHERE user_id = ?", req.session.passport.user.user_id, (errors, rows) => {
                    res.render('followingFeed', {
                        username: req.session.passport.user.username,
                        firstname: req.session.passport.user.firstname,
                        lastname: req.session.passport.user.lastname,
                        email: req.session.passport.user.email,
                        upload: results,
                        randomId: randomstring.generate(7),
                        likeStats: rows
                    })
                })
            })
        })
    })
})

// Comment
router.post('/sendComment', (req, res) => {
    let time = Date.now();
    let date_ob = new Date(time);
    let date = date_ob.getDate();
    let month = date_ob.getMonth() + 1;
    let year = date_ob.getFullYear();
    const fullDate = year + "-" + month + "-" + date

    let id = req.body.uploadId
    let comment = req.body.comment
    var commentQuery = "INSERT INTO comments (upload_id, comment_user, comment, date) VALUES (?,?,?,?)"
    db.query(commentQuery, [id, req.session.passport.user.username, comment, fullDate])
    db.query("UPDATE uploads set comment_count = comment_count + 1 WHERE id = ?", id)
})

// Delete Comment
router.post('/deleteComment', (req, res) => {

    let id = req.body.uploadId
    let commentId = req.body.commentId
    let replyAmount = req.body.replyAmount

    db.query("DELETE FROM comments WHERE id = ? OR parent_id = ?", [commentId, commentId])
    db.query("UPDATE uploads set comment_count = comment_count - ? WHERE id = ?", [replyAmount, id])
})

// Reply Comment
router.post('/replyComment', (req, res) => {
    let time = Date.now();
    let date_ob = new Date(time);
    let date = date_ob.getDate();
    let month = date_ob.getMonth() + 1;
    let year = date_ob.getFullYear();
    const fullDate = year + "-" + month + "-" + date

    let id = req.body.uploadId
    let parentId = req.body.parentId
    let comment = req.body.comment
    var commentQuery = "INSERT INTO comments (upload_id, comment_user, parent_id, comment, date) VALUES (?,?,?,?,?); UPDATE comments set amount_of_replies = amount_of_replies + 1 WHERE id = ?; UPDATE uploads set comment_count = comment_count + 1 WHERE id = ?;"
    db.query(commentQuery, [id, req.session.passport.user.username, parentId, comment, fullDate, parentId, id])

})


//Upload Images Access
router.get('/posts/:id', (req, res) => {
    var id = parseInt(req.params.id.substring(7))
    if (Number.isInteger(id)) {
        if (req.isAuthenticated()) {
            var query = "SELECT * FROM uploads WHERE id = ?;SELECT * FROM likes WHERE user_id = ?; SELECT * FROM comments WHERE upload_id = ? AND parent_id IS NULL ORDER BY id DESC; SELECT * FROM comments WHERE upload_id = ? AND parent_id IS NOT NULL ORDER BY id DESC;"
            db.query(query, [id, req.session.passport.user.user_id, id, id], (err, results) => {
                if (err) {
                    res.send('error')
                }
                if (results[0] != undefined || results[0][0] != undefined) {
                    res.render('artwork', {
                        id: results[0][0].id,
                        userPosted: results[0][0].user_upload,
                        image_link: results[0][0].image,
                        title: results[0][0].title,
                        description: results[0][0].description,
                        uploadDate: results[0][0].upload_date,
                        likeCount: results[0][0].like_count,
                        commentCount: results[0][0].comment_count,
                        likeStats: results[1],
                        comments: results[2],
                        replyComments: results[3],
                        username: req.session.passport.user.username
                    })
                } else {
                    res.send('404: Page Not Found')
                }
            })
        } else {
            var query = "SELECT * FROM uploads WHERE id = ?;SELECT * FROM comments WHERE upload_id = ? AND parent_id IS NULL ORDER BY id DESC; SELECT * FROM comments WHERE upload_id = ? AND parent_id IS NOT NULL ORDER BY id DESC;"
            db.query(query, [id, id, id], (err, results) => {
                if (err) {
                    res.send('error')
                }
                if (results[0] != undefined || results[0][0] != undefined) {
                    res.render('artwork', {
                        id: results[0][0].id,
                        userPosted: results[0][0].user_upload,
                        image_link: results[0][0].image,
                        title: results[0][0].title,
                        description: results[0][0].description,
                        uploadDate: results[0][0].upload_date,
                        likeCount: results[0][0].like_count,
                        commentCount: results[0][0].comment_count,
                        comments: results[1],
                        replyComments: results[2],
                        username: 'none'
                    })
                } else {
                    res.send('404: Page Not Found')
                }
            })
        }
    } else {
        res.send('404: Page Not Found')
    }

})


//gets to upload
router.get('/upload', (req, res) => {
    if (!req.isAuthenticated()) {
        res.redirect('/login')
    }
    res.render('upload')
})

const Multer = require('multer');
const mime = require('mime-types')

const multer = Multer({
    storage: Multer.MemoryStorage,
    limits: {
        fileSize: 10 * 1024 * 1024, // Maximum file size is 10MB
    },
});

//upload
router.post('/upload', multer.single('upload_image'), (req, res, next) => {

    if (!req.file) {
        res.send('No File Was Uploaded')
    }
    const type = mime.lookup(req.file.originalname);

    const blob = artImagesBucket.file(`${Date.now()}_${req.file.originalname}.${mime.extensions[type][0]}`);

    const stream = blob.createWriteStream({
        resumable: true,
        contentType: type,
    });

    stream.on('error', err => {
        next(err);
    });

    stream.on('finish', () => {
        let time = Date.now();
        let date_ob = new Date(time);
        let date = date_ob.getDate();
        let month = date_ob.getMonth() + 1;
        let year = date_ob.getFullYear();
        const fullDate = year + "-" + month + "-" + date

        var uploadQuery = "INSERT INTO uploads (user_upload, image, title, description, upload_date, like_count, comment_count) VALUES (?,?,?,?,?,0,0)"
        db.query(uploadQuery, [req.session.passport.user.username, blob.name, req.body.uploadTitle, req.body.uploadDescription, fullDate], (err, results) => {
            if (err) {
                res.send("Error Uploading Work")
            }
            res.redirect('/profile')
        })
    });

    stream.end(req.file.buffer);
})



router.post('/deleteUpload', async (req, res) => {
    var id = req.body.uploadId
    var imageName = req.body.uploadImageName

    console.log(id)
    if (!isNaN(id)) {
        db.query("DELETE FROM uploads WHERE id = ?", id)
        artImagesBucket.file(imageName).delete()
    } 

})

router.post('/like', (req, res) => {
    let id = req.body.uploadId
    let likeCount = parseInt(req.body.likeCount) + 1
    var likeQuery = "UPDATE uploads set like_count = ? WHERE id = ?"
    db.query(likeQuery, [likeCount, id])
    db.query("INSERT INTO likes (post_id, user_id) VALUES (?,?)", [id, req.session.passport.user.user_id])
})

router.post('/unlike', (req, res) => {
    let id = req.body.uploadId
    let likeCount = parseInt(req.body.likeCount) - 1
    var unlikeQuery = "UPDATE uploads set like_count = ? WHERE id = ?"
    db.query(unlikeQuery, [likeCount, id])
    db.query("DELETE FROM likes WHERE post_id = ? AND user_id = ?", [id, req.session.passport.user.user_id])
})

//SEARCH FUNCTIONALITY
//-----------------

router.post('/search', (req, res) => {
    var query = req.body.searchTerm + ""
    if (query.includes("'") || query.includes('"') || query.includes("`") || query.includes(";")) {
        res.send('Error, access to database denied')
    } else if (query == "") {
        res.redirect('/')
    } else {
        db.query("SELECT * FROM users WHERE username LIKE '%" + query + "%' LIMIT 4", (err, results, fields) => {

            res.send({
                searchResults: results,
                searchTerm: query
            })
        });
    }
})


//AUTHENTICATION
//-----------------

//get to login page
router.get('/login', (req, res, next) => {
    if (!req.isAuthenticated()) {
        res.render('login')
    } else {
        res.redirect('/')
    }
})

//checks login credential, starts session
router.post('/login', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
}))

//logs out
router.get('/logout', (req, res, next) => {
    if (!req.isAuthenticated()) {
        res.redirect('/login')
    } else {
        req.logout()
        req.session.destroy(() => {
            res.clearCookie('connect.sid')
            res.redirect('/')
        })
    }
})

//gets registering page
router.get('/register', (req, res, next) => {
    if (!req.isAuthenticated()) {
        res.render('register')
    } else {
        res.redirect('/')
    }
})

//registers user
router.post('/register',
    [check('username', 'Username Field Cannot Be Empty').notEmpty(),
    check('username', 'Username must be between 3-15 characters long').isLength(3, 15),
    check('password', 'Password Field Cannot Be Empty').notEmpty(),
    check('firstname', 'First Name Field Cannot Be Empty').notEmpty(),
    check('lastname', 'Last Name Field Cannot Be Empty').notEmpty(),
    check('email', 'Email Field Cannot Be Empty').notEmpty(),
    check('password', 'Password must be between 4-15 characters long').isLength(4, 15),
    check('email', 'Invalid Email').isEmail()],
    async (req, res) => {

        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            console.log(errors)
            res.render('register', {
                errors: errors.array()
            })
        } else {

            const hashedPassword = await bcrypt.hash(req.body.password, saltRounds)

            try {
                db.query("INSERT INTO users (username, password, first_name, last_name, email, bio_description, followers_count) VALUES (?,?,?,?,?,'',0)", [req.body.username, hashedPassword, req.body.firstname, req.body.lastname, req.body.email], (err, results, fields) => {
                    // db.query('SELECT LAST_INSERT_ID() as id', (err, results, fields) => {
                    //     try {
                    //         if (err) {
                    //         throw err
                    //     } else {
                    //         const user_id = results[0]
                    //         // req.login(user_id, (err) => {
                    //         //     res.redirect('/profile')
                    //         // })
                    //         res.redirect()

                    //     }
                    //     } catch (error) {
                    //         console.log(error)
                    //     }

                    // })
                    res.redirect('/profile')
                })
            } catch {
                res.redirect('/register')
            }
        }

    })

//serializes user
passport.serializeUser((user_id, done) => {
    done(null, user_id)
})

//deserializes user
passport.deserializeUser((user_id, done) => {
    done(null, user_id)
})

//autheticates
function authenticationMiddleware() {
    return (req, res, next) => {
        if (req.isAuthenticated()) {
            return next()
        }
        res.redirect('/login')
    }
}

module.exports = router