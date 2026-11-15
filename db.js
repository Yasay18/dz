import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import bcrypt from "bcryptjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, "conf.db"));
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    fio TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    capacity INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    room_id INTEGER NOT NULL,
    date_start TEXT NOT NULL,
    payment TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Новая',
    review TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT
  );
`);

const hash = (password) => bcrypt.hashSync(password, 10);

if (db.prepare("SELECT COUNT(*) AS c FROM user").get().c === 0) {
  const insertUser = db.prepare(`
    INSERT INTO user (login, password, fio, phone, email)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertUser.run("ivan", hash("demo"), "Иван Ветров", "8(999)123-45-67", "ivan@mail.ru");
  insertUser.run("sergey", hash("demo"), "Сергей Сергеевич", "8(900)322-68-39", "sergey@mail.ru");
  insertUser.run("Conf2027", hash("Demo77"), "Администратор", "8(999)999-99-99", "admin@conference.local");
}

if (db.prepare("SELECT COUNT(*) AS c FROM rooms").get().c === 0) {
  const insertRoom = db.prepare("INSERT INTO rooms (name, type, capacity) VALUES (?, ?, ?)");
  insertRoom.run("Комната 1", "Аудитория", 25);
  insertRoom.run("Комната 15", "Кинозал", 135);
  insertRoom.run("Комната 99", "Кинозал", 60);
  insertRoom.run("Комната 13", "Коворкинг", 13);
}

if (db.prepare("SELECT COUNT(*) AS c FROM requests").get().c === 0) {
  const insertRequest = db.prepare(`
    INSERT INTO requests (user_id, room_id, date_start, payment)
    VALUES (?, ?, ?, ?)
  `);
  insertRequest.run(1, 1, "2027-03-15", "При очном посещении");
  insertRequest.run(1, 3, "2027-03-20", "Перевод по СБП");
  insertRequest.run(2, 4, "2027-04-01", "При очном посещении");
}

class User {
  constructor() { this.table = "user"; }

  findById(id) {
    return db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id);
  }

  findByLogin(login) {
    return db.prepare(`SELECT * FROM ${this.table} WHERE login = ?`).get(login);
  }

  findAll() {
    return db.prepare(`SELECT * FROM ${this.table} ORDER BY id DESC`).all();
  }

  count() {
    return db.prepare(`SELECT COUNT(*) AS total FROM ${this.table}`).get().total;
  }

  exists(login) {
    return Boolean(db.prepare(`SELECT 1 FROM ${this.table} WHERE login = ?`).get(login));
  }

  create({ login, password, fio, phone, email }) {
    const result = db.prepare(`
      INSERT INTO ${this.table} (login, password, fio, phone, email)
      VALUES (?, ?, ?, ?, ?)
    `).run(login, hash(password), fio, phone, email);
    return this.findById(result.lastInsertRowid);
  }
}

class RoomModel {
  constructor() { this.table = "rooms"; }

  findAll() {
    return db.prepare(`SELECT * FROM ${this.table} ORDER BY id`).all();
  }

  findById(id) {
    return db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id);
  }

  findByType(type) {
    return db.prepare(`SELECT * FROM ${this.table} WHERE type = ? ORDER BY id`).all(type);
  }

  count() {
    return db.prepare(`SELECT COUNT(*) AS total FROM ${this.table}`).get().total;
  }
}

class RequestModel {
  constructor() { this.table = "requests"; }

  findById(id) {
    return db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id);
  }

  findByUser(userId) {
    return db.prepare(`
      SELECT r.*, rm.name AS room_name, rm.type AS room_type, rm.capacity AS room_capacity
      FROM ${this.table} r
      JOIN rooms rm ON rm.id = r.room_id
      WHERE r.user_id = ?
      ORDER BY r.id DESC
    `).all(userId);
  }

  findAllDetailed() {
    return db.prepare(`
      SELECT r.*, u.login AS user_login, u.fio AS user_fio,
             rm.name AS room_name, rm.type AS room_type, rm.capacity AS room_capacity
      FROM ${this.table} r
      JOIN user u ON u.id = r.user_id
      JOIN rooms rm ON rm.id = r.room_id
      ORDER BY r.id DESC
    `).all();
  }

  findDetailed(id) {
    return db.prepare(`
      SELECT r.*, u.fio AS user_fio, u.login AS user_login,
             u.email AS user_email, u.phone AS user_phone,
             rm.name AS room_name, rm.type AS room_type, rm.capacity AS room_capacity
      FROM ${this.table} r
      JOIN user u ON u.id = r.user_id
      JOIN rooms rm ON rm.id = r.room_id
      WHERE r.id = ?
    `).get(id);
  }

  create({ userId, roomId, dateStart, payment }) {
    const result = db.prepare(`
      INSERT INTO ${this.table} (user_id, room_id, date_start, payment)
      VALUES (?, ?, ?, ?)
    `).run(userId, roomId, dateStart, payment);
    return this.findById(result.lastInsertRowid);
  }

  updateStatus(id, status) {
    return db.prepare(`UPDATE ${this.table} SET status = ? WHERE id = ?`).run(status, id);
  }

  addReview(id, userId, review) {
    if (!review || !review.trim()) return false;
    const result = db.prepare(`
      UPDATE ${this.table}
      SET review = ?
      WHERE id = ? AND user_id = ? AND status = 'Завершено'
    `).run(review.trim(), id, userId);
    return result.changes > 0;
  }

  count() {
    return db.prepare(`SELECT COUNT(*) AS total FROM ${this.table}`).get().total;
  }
}

export const Users = new User();
export const Room = new RoomModel();
export const Request = new RequestModel();
export default db;
