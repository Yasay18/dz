import express from "express";

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.set('views', './views');


app.get("/", (req, res) => {
  res.send(`
    <a href="/about">О портале</a> 
    <a href="/contact">Контакты</a> 
    <a href="/help">Помощь</a> 
    <a href="/rooms">Список помещений</a>
    <a href="/register">Регистрация</a>
  `);
});

app.get('/register', (req, res) => {
  res.render('register', { title: 'Регистрация на портале' });
});


app.post('/register', (req, res) => {
  res.send(`Пользователь ${req.body.login} зарегистрирован в городе ${req.body.city}, с ФИО ${req.body.fio}, с номером ${req.body.phone}, с почтой ${req.body.email}`);
});


app.get('/login', (req, res) => {
  res.render('login', { title: "Войдите в аккаунт" }); 
});

app.post('/login', (req, res) => {
  res.redirect('/dashboard');
});


app.get("/dashboard", (req, res) => {
  res.render("dashboard", {
    title: "Мои заявки",
    user: {
      fio: "Иванов Иван"
    },
    requests: [
      {
        room_name: "Аудитория №1",
        status: "Новая"
      },
      {
        room_name: "Коворкинг",
        status: "Завершено"
      }
    ]
  });
});

app.get("/about", (req, res) => {
  res.render('about');
});

app.get("/contact", (req, res) => {
  res.send("<h2>Контакты</h2>");
});

app.get("/help", (req, res) => {
  res.send("<h2>Помощь</h2>");
});

app.get("/rooms", (req, res) => {
  res.send("<h2>Список помещений</h2>");
});

app.listen(PORT, () => {
  console.log(`Сервер: http://localhost:${PORT}`);
});