const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '..', 'config', 'history.json');
const MAX_HISTORY = 10;

function loadHistory() {
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(raw).projects || [];
  } catch (_) {
    return [];
  }
}

function saveHistory(projectPath) {
  const projects = loadHistory().filter(p => p.path !== projectPath);
  projects.unshift({
    path: projectPath,
    name: path.basename(projectPath),
    lastOpened: new Date().toISOString(),
  });
  const data = { projects: projects.slice(0, MAX_HISTORY) };
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = { loadHistory, saveHistory };
