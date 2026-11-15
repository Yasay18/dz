import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Users, Request, Room } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_LOGIN = "Conf2027";
const STATUSES = ["Новая", "Мероприятие назначено", "Завершено"];

app.set("view engine", "ejs");
app.set("views", join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(join(__dirname, "public")));

app.use(session({
  secret: process.env.SESSION_SECRET || "conference-rf-development-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 2,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  }
}));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.userId
    ? { id: req.session.userId, login: req.session.login, fio: req.session.fio }
    : null;
  res.locals.isAdmin = req.session.login === ADMIN_LOGIN;
  next();
});

app.use((req, res, next) => {
  if (!req.session.userId) return next();

  const now = Date.now();
  const inactivityLimit = 20 * 60 * 1000;
  if (req.session.lastActivity && now - req.session.lastActivity > inactivityLimit) {
    return req.session.destroy(() => res.redirect("/login?expired=1"));
  }
  req.session.lastActivity = now;
  next();
});

const requireAuth = (req, res, next) =>
  req.session.userId ? next() : res.redirect("/login");

const requireAdmin = (req, res, next) =>
  req.session.userId && req.session.login === ADMIN_LOGIN
    ? next()
    : res.status(req.session.userId ? 403 : 401).redirect(req.session.userId ? "/dashboard" : "/login");

const RULES = [
  { field: "login", test: (v) => /^[A-Za-z0-9]{6,}$/.test(v), msg: "Логин: латиница и цифры, минимум 6 символов." },
  { field: "password", test: (v) => v.length >= 8, msg: "Пароль должен содержать минимум 8 символов." },
  { field: "fio", test: (v) => /^[А-Яа-яЁё\s-]+$/.test(v), msg: "ФИО: используйте кириллицу, пробелы и дефис." },
  { field: "phone", test: (v) => /^8\(\d{3}\)\d{3}-\d{2}-\d{2}$/.test(v), msg: "Телефон: формат 8(ХХХ)ХХХ-ХХ-ХХ." },
  { field: "email", test: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), msg: "Введите корректный email." }
];

function validateRegistration(data) {
  return RULES.filter(({ field, test }) => !test(String(data[field] || "").trim()))
    .map((rule) => rule.msg);
}

function renderAuth(res, options = {}) {
  return res.render("auth", {
    mode: options.mode || "login",
    form: options.form || {},
    errors: options.errors || [],
    error: options.error || null,
    flash: options.flash || null
  });
}

app.get("/", (req, res) => res.redirect("/rooms"));

app.get("/about", (req, res) => res.render("about", { title: "О портале" }));

app.get("/register", (req, res) => renderAuth(res, { mode: "register" }));

app.post("/register", (req, res) => {
  const form = {
    login: String(req.body.login || "").trim(),
    fio: String(req.body.fio || "").trim(),
    phone: String(req.body.phone || "").trim(),
    email: String(req.body.email || "").trim()
  };
  const errors = validateRegistration({ ...form, password: String(req.body.password || "") });

  if (Users.exists(form.login)) errors.push("Такой логин уже занят.");
  if (errors.length) {
    return renderAuth(res, { mode: "register", form, errors });
  }

  try {
    Users.create({ ...form, password: String(req.body.password) });
    req.session.flash = { type: "success", text: "Регистрация прошла успешно. Теперь войдите." };
    return res.redirect("/login");
  } catch (error) {
    console.error("Ошибка регистрации:", error);
    return renderAuth(res, {
      mode: "register", form,
      errors: ["Не удалось создать пользователя. Проверьте введённые данные."]
    });
  }
});

app.get("/login", (req, res) => {
  const flash = req.session.flash || null;
  delete req.session.flash;
  const expired = req.query.expired ? "Сессия завершилась из-за бездействия. Войдите снова." : null;
  renderAuth(res, { mode: "login", flash, error: expired });
});

app.post("/login", (req, res) => {
  const login = String(req.body.login || "").trim();
  const password = String(req.body.password || "");
  const user = Users.findByLogin(login);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return renderAuth(res, { mode: "login", error: "Неверный логин или пароль." });
  }

  req.session.regenerate((err) => {
    if (err) {
      console.error("Ошибка создания сессии:", err);
      return res.status(500).send("Не удалось начать сессию. Попробуйте ещё раз.");
    }
    req.session.userId = user.id;
    req.session.fio = user.fio;
    req.session.login = user.login;
    req.session.lastActivity = Date.now();
    res.redirect(user.login === ADMIN_LOGIN ? "/admin" : "/dashboard");
  });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

app.get("/rooms", (req, res) => {
  res.render("rooms", { rooms: Room.findAll() });
});

app.get("/rooms/type/:type", (req, res) => {
  res.render("rooms", { rooms: Room.findByType(req.params.type) });
});

app.get("/create", requireAuth, (req, res) => {
  res.render("create_request", {
    rooms: Room.findAll(),
    errors: [],
    form: {}
  });
});

app.post("/create", requireAuth, (req, res) => {
  const roomId = Number(req.body.room_id);
  const dateStart = String(req.body.date_start || "");
  const payment = String(req.body.payment || "");
  const errors = [];
  
if (errors.length) {
  return res.status(400).render("create_request", {
    rooms: Room.findAll(),
    errors,
    form: req.body
  });
}
  if (!Number.isInteger(roomId) || !Room.findById(roomId)) errors.push("Выберите существующее помещение.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStart) || Number.isNaN(Date.parse(dateStart))) {
    errors.push("Укажите корректную дату мероприятия.");
  } else if (dateStart < new Date().toISOString().slice(0, 10)) {
    errors.push("Дата мероприятия не может быть в прошлом.");
  }
  if (!["При очном посещении", "Перевод по СБП"].includes(payment)) {
    errors.push("Выберите способ оплаты.");
  }

  if (errors.length) {
    return res.status(400).render("create_request", {
      rooms: Room.findAll(), errors, form: req.body
    });
  }

  try {
    const created = Request.create({
      userId: req.session.userId,
      roomId,
      dateStart,
      payment
    });
    return res.redirect(`/request/${created.id}`);
  } catch (error) {
    console.error("Ошибка создания заявки:", error);
    return res.status(500).render("create_request", {
      rooms: Room.findAll(), errors: ["Не удалось сохранить заявку. Попробуйте ещё раз."], form: req.body
    });
  }
});

app.get("/dashboard", requireAuth, (req, res) => {
  res.render("requests_list", {
    isAdmin: false,
    requests: Request.findByUser(req.session.userId)
  });
});

app.get("/admin", requireAdmin, (req, res) => {
  res.render("requests_list", { isAdmin: true, requests: Request.findAllDetailed() });
});

app.post("/admin", requireAdmin, (req, res) => {
  const id = Number(req.body.id);
  const status = String(req.body.status || "");
  if (!Number.isInteger(id) || !STATUSES.includes(status)) {
    return res.status(400).send("Некорректный идентификатор заявки или статус.");
  }
  Request.updateStatus(id, status);
  res.redirect("/admin");
});

app.get("/request/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const request = Number.isInteger(id) ? Request.findDetailed(id) : null;
  if (!request) return res.status(404).send("Заявка не найдена.");

  const isOwner = request.user_id === req.session.userId;
  const isAdmin = req.session.login === ADMIN_LOGIN;
  if (!isOwner && !isAdmin) return res.status(403).send("Доступ запрещён.");

  res.render("requests_ditail", { request, isOwner, isAdmin });
});

app.post("/review/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const request = Number.isInteger(id) ? Request.findDetailed(id) : null;
  if (!request) return res.status(404).send("Заявка не найдена.");
  if (request.user_id !== req.session.userId) {
    return res.status(403).send("Только владелец заявки может оставить отзыв.");
  }
  if (request.status !== "Завершено") {
    return res.status(400).send("Отзыв можно оставить только после завершения заявки.");
  }

  const review = String(req.body.review || "").trim();
  if (!review) {
    return res.status(400).send("Текст отзыва не может быть пустым.");
  }
  Request.addReview(request.id, req.session.userId, review);
  res.redirect(`/request/${request.id}`);
});

app.use((req, res) => res.status(404).send("Страница не найдена. <a href='/rooms'>Перейти к помещениям</a>"));

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
