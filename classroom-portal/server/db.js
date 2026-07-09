const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config();

const dbFile = process.env.DATABASE_FILE || './data/register.db';
const dbDir = path.dirname(dbFile);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  reg_no TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  reg_no TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  reg_no TEXT,
  name TEXT,
  action TEXT NOT NULL,
  time TEXT NOT NULL
);

-- Shared subject list used to classify both Notes and Assignments.
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  uploader TEXT NOT NULL,
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS testpdfs (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  uploader TEXT NOT NULL,
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  uploader TEXT NOT NULL,
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  reg_no TEXT NOT NULL,
  student_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  date TEXT NOT NULL,
  review TEXT DEFAULT '',
  marks TEXT DEFAULT '',
  UNIQUE(assignment_id, reg_no)
);

CREATE TABLE IF NOT EXISTS attendance (
  reg_no TEXT PRIMARY KEY,
  name TEXT,
  total INTEGER DEFAULT 0,
  present INTEGER DEFAULT 0,
  absent INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS semresults (
  id TEXT PRIMARY KEY,
  reg_no TEXT NOT NULL,
  name TEXT,
  semester TEXT,
  sgpa TEXT,
  credits TEXT
);

CREATE TABLE IF NOT EXISTS cgpa_entries (
  reg_no TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Practicals get their own independent set of subjects/sections, separate
-- from the Notes/Assignments subject list.
CREATE TABLE IF NOT EXISTS practical_subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS practical_files (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES practical_subjects(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  uploader TEXT NOT NULL,
  date TEXT NOT NULL
);

-- Weekly quizzes: staff posts a link to an external form (Google Forms or
-- similar) and later enters each student's score for the leaderboard.
CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  form_url TEXT,
  date TEXT,
  uploader TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_scores (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  reg_no TEXT NOT NULL,
  name TEXT NOT NULL,
  score TEXT,
  UNIQUE(quiz_id, reg_no)
);
`);

module.exports = db;
