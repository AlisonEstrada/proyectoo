const express = require('express');
const flash = require('express-flash');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const LocalStrategy = require('passport-local').Strategy;
const MySQLStore = require('express-mysql-session')(session);
const multer = require('multer');

var conn;

const app = express();
app.set('view engine', 'ejs');

const jsonParser = bodyParser.json();

const dbConfiguration = {
    host: 'database-1.cwm6hivctpor.us-east-2.rds.amazonaws.com',
    port: 3306,
    user: 'admin',
    password: 'adminpassword',
    database: 'dbdialisis'
}

module.exports = app;

var storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'static/images')
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname)
    }
  })
   
var upload = multer({ storage: storage })

app.set('sessionMiddleWare', session({
    secret: 'some secret',
    store: new MySQLStore(dbConfiguration),
    proxy: true
}))
app.use((...args) => app.get('sessionMiddleWare')(...args));

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use(bodyParser.urlencoded({
    extended: true
  }));
app.use(bodyParser.json());
app.use(express.static(__dirname + '/static'))
app.use(cookieParser());

app.all('/*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header("Access-Control-Allow-Credentials", true);
    next();
  });

app.use((req, res, next) => {
    if (req.url.indexOf('/signup') < 0 && req.url.indexOf('/login') < 0 
    && (!req.session || req.session.passport == null)) {
        res.redirect('/login');
    }   else{
        next();
    }
});

passport.use('local', new LocalStrategy(
	{
	    passReqToCallback : true
	},
	(req, username, password, done) => {
        connectDb();

        conn.query('SELECT id, username, pass FROM app_user WHERE username = ?', [username], (error, rows) => {
            closeDb();

            if (rows.length == 0) {
                return done(null, false);
            }

            let result = rows[0];

            bcrypt.compare(password, result.pass, (error, res) => {
                if (error) {
                    throw error;
                }

                if (res) {
                    return done(null, result);
                } else {
                    return done(null, false);
                }
            })
        })
	}
));

passport.serializeUser((user, done) => {
	return done(null, user.id);
});

passport.deserializeUser((id, done) => {
    connectDb();
    
	conn.query('SELECT id, username FROM app_user WHERE id = ?', [id], (error, row) => {
		if (row.length == 0) {
			return done(null, false);
        }
        
		return done(null, row[0]);
	});
});

connectDb = () => {
    conn = mysql.createConnection(dbConfiguration);

    conn.connect((err) => {
        if (err) {
            throw err;
        }

        console.log('Connected');
    })
}

closeDb = () => {
    conn.end();
}

app.get('/login', (req, res) => {
    res.render('main', {'title': 'Login', 'message': '', 'content': 'login'})
})

app.get('/loginerror', (req, res) => {
    res.render('main', {'title': 'Login', 'message': 'Login failed', 'content': 'login'})
})

app.post('/login', (req, res, next) => {
    passport.authenticate('local', (error, user, info) => {
        if (error) {
            return next(error);
        }

        if (!user) {
            return res.redirect('/loginerror');
        }

        req.logIn(user, (error) => {
            if (error) {
                return next(error);
            }

            req.session.save(() => {
                res.redirect('/');
            });
        })
    })(req, res, next);
})

app.get('/logout', (req, res) => {
    req.session.destroy((error) => {
        res.redirect('/login');
    });
});

app.get('/signup', (req, res) => {
    res.render('main', {'title': 'Sign Up', 'content': 'signup'});
});

app.get('/', (req, res) => {
    res.render('main', {'title': 'Main Page', 'content': 'inicio', 'user': req.user});
});

app.post('/signup', (req, res) => {
    let user = req.body;
    connectDb();
    conn.query('INSERT INTO app_user(nombre, apellido_pat, apellido_mat, fecha_nacimiento, telefono, username, pass) ' + 
               'VALUES (?, ?, ?, ?, ?, ?, ?)',
               [user.nombre, user.apellidoP, user.apellidoM, user.fechaNacimiento, 
                user.telefono, user.username, bcrypt.hashSync(user.password, 10)],
               (error, rows) => {
                   if (error) {
                       throw error;
                   }

                   if (req.xhr) {
                       res.writeHead(200, {'Content-Type': 'application/json'});
                       res.end(JSON.stringify(rows));
                   } else {
                       res.redirect('/login');
                   }
                   closeDb();
               });
})
  
/*app.get('/', (req, res) => {
    res.render('main', {'title': 'Inicio', 'message': '', 'content': 'inicio'})
})*/

app.listen(3000, () => {
    console.log('Server up');
})