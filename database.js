const Database = require('better-sqlite3');
const db = new Database('quiz.db');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize tables
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fullName TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        role TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quizzes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        timeLimit INTEGER NOT NULL,
        createdBy INTEGER,
        FOREIGN KEY (createdBy) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        quizId TEXT NOT NULL,
        type TEXT NOT NULL,
        text TEXT NOT NULL,
        options TEXT NOT NULL, -- Stored as JSON string
        correctAnswer INTEGER NOT NULL,
        points INTEGER DEFAULT 1,
        FOREIGN KEY (quizId) REFERENCES quizzes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        quizId TEXT NOT NULL,
        quizName TEXT NOT NULL,
        score INTEGER NOT NULL,
        maxScore INTEGER NOT NULL,
        timeTaken TEXT NOT NULL,
        submittedAt TEXT NOT NULL,
        answers TEXT NOT NULL, -- Stored as JSON string
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (quizId) REFERENCES quizzes(id)
    );
`);

module.exports = db;
