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
const mqtt = require('mqtt'); /////////////////////////////////////////////////////

var conn;

const app = express();
app.set('view engine', 'ejs');

const jsonParser = bodyParser.json();

/////////////////////////////////////////////////
const options = {
    clean: true, // retain session
    connectTimeout: 4000, // Timeout period
    // Authentication information
    clientId: 'emqx_test',
    username: 'emqx_test',
    password: 'emqx_test',
  }
  const connectUrl = 'wss://broker.emqx.io:8084/mqtt'
  const client = mqtt.connect(connectUrl, options)
////////////////////////////////////////////////////////////

const dbConfiguration = {
    host: 'database-1.cwm6hivctpor.us-east-2.rds.amazonaws.com',
    port: 3306,
    user: 'admin',
    password: 'adminpassword',
    database: 'dbdialisis'

    /*host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'cdialisis'*/
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

        conn.query('SELECT id, username, pass FROM usuario WHERE username = ?', [username], (error, rows) => {
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
    
	conn.query('SELECT id, username FROM usuario WHERE id = ?', [id], (error, row) => {
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

///////////////////////////////////////////////////////////////////////////////////
client.on('connect', function() { // When connected
    console.log("Cliente conectado");

  // subscribe to a topic
  client.subscribe('esp32/test', function() {
    // when a message arrives, do something with it
    client.on('message', function(topic, message, packet) {
        console.log("Received '" + message + "' on '" + topic + "'");
        let d = new Date ();
        let month = d.getMonth()+1;
        let day = d.getDate();
        let hour = d.getHours()-4;
        let min = d.getMinutes();
        let sec = d.getSeconds();
        let fecha = d.getFullYear() + '/' + (month<10 ? '0' : '') + month + '/' + (day<10 ? '0' : '') + day + ' ' + hour + ':' + min + ':' + sec;
        connectDb();
        conn.query('INSERT INTO rfid(pac, fecha) ' +
               'VALUES (?, ?)', [message, fecha],
               (error, rows) => {
                   if (error) {
                       throw error;
                   }

                   closeDb();
               })
    });
  });


/////////////////////////////////////////////////////////////////////////////////7

app.get('/login', (req, res) => {
    connectDb();
    conn.query('SELECT id, rol FROM roles', (error, rows) => {
        if (error) {
            throw error;
        }

        res.render('main', {'title': 'Inicio sesion', 'message': '', 'content': 'login', 'roles': rows});
        closeDb();
    });
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
                if (req.body.tipoUsuario == 1) {
                    res.redirect('/pacienteInicio');
                }
                if (req.body.tipoUsuario == 2) {
                    res.redirect('/medicoInicio');
                }
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
    connectDb();
    conn.query('SELECT id, rol FROM roles', (error, rows) => {
        if (error) {
            throw error;
        }

        res.render('main', {'title': 'Registro', 'content': 'signup', 'roles': rows});
        closeDb();
    });
});

app.get('/', (req, res) => {
    res.render('main', {'title': 'Main Page', 'content': 'inicio', 'user': req.user});
});

app.post('/signup', (req, res) => {
    client.on('connect', function() { // When connected
        console.log("Cliente conectado 2");
    let user = req.body;

    connectDb();
    conn.query('INSERT INTO usuario(nombre, apellido_pat, apellido_mat,ci, fecha_nacimiento, telefono, tipo_usuario, username, pass) ' + 
               'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
               [user.nombre, user.apellidoP, user.apellidoM, user.ci, user.fechaNacimiento, 
                user.telefono, user.tipoUsuario, user.username, bcrypt.hashSync(user.password, 10)],
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
               
                    //publish into a topic
                    client.publish('esp32/dato', user.ci, function() {
                        console.log("Message is published");
                    });

               });
})
  
/*app.get('/', (req, res) => {
    res.render('main', {'title': 'Inicio', 'message': '', 'content': 'inicio'})
})*/

app.get('/pacienteInicio', (req, res) => {
    res.render('mainp', {'title': 'Pacientes: Inicio', 'content': 'pacienteInicio', 'user': req.user});
});

app.get('/medicoInicio', (req, res) => {
    connectDb();
    conn.query('SELECT * FROM usuario a inner JOIN rfid b ON a.ci=b.pac; ', (error,rows) => {
        if (error) {
            throw error;
        }

        res.render('mainm', {'content': 'medicoInicio', 'title': 'Medicos: Pacientes en sala', 'pacientes': rows, 'user': req.user});
        closeDb();
    })
});

app.get('/medicoListaPac', (req, res) => {
    connectDb();
    conn.query('SELECT id, nombre, apellido_pat, apellido_mat FROM usuario WHERE tipo_usuario = 1', (error,rows) => {
        if (error) {
            throw error;
        }

        res.render('mainm', {'content': 'medicoListaPac', 
                   'title': 'Medicos: Pacientes', 'pacientes': rows, 'user': req.user});
        closeDb();
    })
});

app.get('/medicoIngresarDatos/:id', (req, res) => {
    connectDb();
    conn.query('SELECT id, nombre, apellido_pat, apellido_mat FROM usuario ' +
               'WHERE id=?', [req.params.id],
               (error, rows) => {
                   if (error) {
                       throw error;
                   }

                   let usuario = rows[0];

                    conn.query('SELECT id, dato FROM maquinas ' ,(error, rows) => {
                        if (error) {
                            throw error;
                        } 
        
                           res.render('mainm', {'content': 'medicoIngresarDatos', 
                                'title': 'Medicos: Ingresar datos', 'usuario': usuario, 'maquinas': rows,'user': req.user});
                           closeDb();
                       })
               })
})

app.post('/ingresarDatosM', (req, res) => {
    let a = req.body;
    connectDb();
    conn.query('INSERT INTO dialisis(fecha, peso_ing, hora_inicio, hora_fin, peso_eg, valor, id_maquina, uf_prog, uf_fin, id_paciente, p_inicial, p1, p2, p3, p_final) ' +
               'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
               [a.fecha, a.pesoIng, a.horaInicio, a.horaFin, a.pesoEg, a.valor, a.maquina, a.ufProg, a.ufFin, a.usuarioId, a.pInicial, a.p1, a.p2, a.p3, a.pFinal],
               (error, rows) => {
                   if (error) {
                       throw error;
                   }
                   if (req.xhr) {
                    res.writeHead(200, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify(rows));
                    } else {
                        res.redirect('/medicoListaPac');
                        }
                closeDb();
    })
})

app.get('/medicoVerDatos/:id', (req, res) => {
    connectDb();
    conn.query('select * from dialisis a INNER JOIN usuario b on b.id=a.id_paciente INNER JOIN maquinas c on a.id_maquina=c.id where b.id=?', [req.params.id],
               (error,rows) => {
                if (error) {
                    throw error;
                }

                res.render('mainm', {'content': 'medicoVerDatos', 
                        'title': 'Medicos: Ver datos', 'pacientes': rows, 'user': req.user});
                closeDb();
    })
});

app.get('/pacienteVerDatos/:id', (req, res) => {
    connectDb();
    conn.query('select * from dialisis a INNER JOIN usuario b on b.id=a.id_paciente INNER JOIN maquinas c on a.id_maquina=c.id where b.id=?', [req.user.id],
               (error,rows) => {
                if (error) {
                    throw error;
                }

                let pacientes = rows;

                conn.query('SELECT b.id, b.nombre, b.apellido_pat, b.apellido_mat, a.fecha, a.tipo_acceso, a.observacion, a.id_paciente, c.tipo FROM acceso_pac a right JOIN usuario b ON a.id_paciente=b.id left join acceso c on a.tipo_acceso= c.id where b.id=?', [req.user.id],
                    (error, rows) => {
                        if (error) {
                            throw error;
                        }
                        res.render('mainp', {'content': 'pacienteVerDatos', 
                            'title': 'Pacientes: Mis datos', 'pacientes': pacientes, 'accesos': rows, 'user': req.user});
                    closeDb();
                })
    })
});

app.get('/pacienteIngresarDatos1', (req, res) => {
    res.render('mainp', {'title': 'Paciente: Ingresar síntomas', 'content': 'pacienteIngresarDatos1', 'user': req.user});
});

app.post('/ingresarDatosP', (req, res) => {
    let a = req.body;
    let d = new Date ();
    let month = d.getMonth()+1;
    let day = d.getDate();

    let fecha = d.getFullYear() + '/' + (month<10 ? '0' : '') + month + '/' + (day<10 ? '0' : '') + day;
    connectDb();
    conn.query('INSERT INTO detalle_dialisis(fecha, d_cabeza1, frio, nauseas1, calambres1, picor1, d_cabeza2, nauseas2, p_dormir, calambres2, ardor, edema, hiper, hipo, picor2, otros2, estres, depresion, ansiedad, otros3, id_paciente) ' +
               'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
               [fecha, a.dCabeza1, a.frio, a.nauseas1, a.calambres1, a.picor1, a.dCabeza2, a.nauseas2, a.dormir, a.calambres2, a.ardor, a.edema, a.hiper, a.hipo, a.picor2, a.otros2, a.estres, a.depresion, a.ansiedad, a.otros3, req.user.id],
               (error, rows) => {
                   if (error) {
                       throw error;
                   }

                   if (req.xhr) {
                    res.writeHead(200, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify(rows));
                    } else {
                    res.redirect('/pacienteInicio');
                    }
                   closeDb();
               })
})

app.get('/medicoSintomasPac/:id', (req, res) => {
    connectDb();
    conn.query('select * from usuario a INNER JOIN detalle_dialisis c on a.id=c.id_paciente where a.id=?', [req.params.id],
               (error,rows) => {
                if (error) {
                    throw error;
                }

                res.render('mainm', {'content': 'medicoSintomasPac', 
                        'title': 'Medicos: Ver síntomas', 'pacientes': rows, 'user': req.user});
                closeDb();
    })
});

app.get('/medicoAccesoPac/:id', (req, res) => {
    connectDb();
    conn.query('SELECT b.id, b.nombre, b.apellido_pat, b.apellido_mat, a.fecha, a.tipo_acceso, a.observacion, a.id_paciente, c.tipo FROM acceso_pac a right JOIN usuario b ON a.id_paciente=b.id left join acceso c on a.tipo_acceso=c.id' +
               ' WHERE b.id=?', [req.params.id],
               (error, rows) => {
                    if (error) {
                       throw error;
                    }

                    let usuarios = rows;

                    conn.query('SELECT id, tipo FROM acceso ' ,(error, rows) => {
                        if (error) {
                            throw error;
                        } 
        
                           res.render('mainm', {'content': 'medicoAccesoPac', 
                                'title': 'Medicos: Datos acceso vascular', 'usuarios': usuarios, 'accesos': rows,'user': req.user});
                           closeDb();
                       })
               })
})

app.post('/ingresarNuevoAcceso', (req, res) => {
    connectDb();
    conn.query('INSERT INTO acceso_pac(fecha, tipo_acceso, observacion, id_paciente) ' +
               'VALUES (?, ?, ?, ?)',
               [req.body.fecha, req.body.acceso, req.body.obs, req.body.pacienteId],
               (error, rows) => {
                   if (error) {
                       throw error;
                   }

                   if (req.xhr) {
                    res.writeHead(200, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify(rows));
                    } 
                    else {
                    //res.redirect('/MedicoListPac');
                    }
                   closeDb();
               })
})

app.get('/medicoMapa', (req, res) => {
    res.render('mainm', {'content': 'medicoMapa', 'title': 'Médico: Asignar MAPA', 'user': req.user});
});

app.get('/medicoMapaBuscar', (req, res) => {
    connectDb();
    conn.query('SELECT id, nombre, apellido_pat, apellido_mat FROM usuario WHERE ci= ?', [req.params.id], (error,rows) => {
        if (error) {
            throw error;
        }
        let paciente = rows[0];

        res.render('mainm', {'content': 'medicoMapa', 'title': 'Médico: Asignar MAPA', 'paciente': paciente, 'user': req.user});
        closeDb();
    })
});

app.post('/agregarMapa', (req, res) => {
    connectDb();
    conn.query('INSERT INTO mapa_medico(fecha, observacion, id_paciente) ' +
               'VALUES (?, ?, ?)',
               [req.body.fechaMapa, req.body.obMapa, ],
               (error, rows) => {
                   if (error) {
                       throw error;
                   }

                   if (req.xhr) {
                    res.writeHead(200, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify(rows));
                    } 
                    else {
                    //res.redirect('/MedicoListPac');
                    }
                   closeDb();
               })
})

app.listen(3000, () => {
    console.log('Server up');
})

});