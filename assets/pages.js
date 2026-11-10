(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const page = document.body.dataset.page;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      return;
    }
  };
  const theme = read('sqlpath-theme', 'light');
  document.documentElement.dataset.theme = theme;
  $('theme-toggle').setAttribute('aria-pressed', String(theme === 'dark'));
  $('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    $('theme-toggle').setAttribute('aria-pressed', String(next === 'dark'));
    write('sqlpath-theme', next);
  });

  function createWorker(onTimeout) {
    const worker = new Worker('assets/sql-worker.js');
    let sequence = 0;
    const pending = new Map();
    worker.onmessage = ({ data }) => {
      const request = pending.get(data.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(data.id);
      if (data.ok) request.resolve(data);
      else request.reject(new Error(data.error));
    };
    worker.onerror = event => {
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error(event.message || 'SQLite worker could not load.'));
      }
      pending.clear();
    };
    return {
      worker,
      ask(type, fields = {}, timeout = 5000) {
        return new Promise((resolve, reject) => {
          const id = ++sequence;
          const timer = setTimeout(() => {
            pending.delete(id);
            worker.terminate();
            onTimeout();
            reject(new Error('Query timed out. Reset the database to start a fresh workspace.'));
          }, timeout);
          pending.set(id, { resolve, reject, timer });
          worker.postMessage({ id, type, ...fields });
        });
      }
    };
  }

  if (page === 'learn') {
    const { lessons } = SQLCourse;
    const completed = new Set(read('sqlpath-lessons', []));
    let current = 0;
    function renderTopics() {
      const search = $('lesson-search').value.toLowerCase();
      const category = $('lesson-category').value;
      const found = lessons.filter(item =>
        (category === 'all' || item.category === category) &&
        (item.name + ' ' + item.explanation).toLowerCase().includes(search));
      $('topic-list').innerHTML = found.map(item =>
        `<button type="button" class="topic ${item.id === current ? 'active' : ''}" data-lesson="${item.id}"><span>${completed.has(item.id) ? '✓ ' : ''}${escape(item.name)}</span><small>${escape(item.category)}</small></button>`
      ).join('') || '<p class="progress-label">No matching lessons. Try another search.</p>';
      $('topic-list').querySelectorAll('[data-lesson]').forEach(button => {
        button.addEventListener('click', () => renderLesson(Number(button.dataset.lesson)));
      });
    }
    function renderLesson(id) {
      current = id;
      const item = lessons[id];
      $('lesson-content').innerHTML = `<span class="overline">${escape(item.category)} · Lesson ${id + 1} of ${lessons.length}</span><h3>${escape(item.name)}</h3><p><strong>লক্ষ্য:</strong> ${escape(item.task)}</p><p>${escape(item.explanation)}</p><h4>Syntax in action</h4><pre class="code-block">${escape(item.sql)}</pre><div class="lesson-actions"><button class="primary" type="button" id="try-lesson">${item.executable ? 'Try it in Playground →' : 'Why SQLite differs'}</button><button class="secondary" type="button" id="complete-lesson">${completed.has(id) ? '✓ Completed' : 'Mark as completed'}</button><button class="secondary" type="button" id="next-lesson">Next lesson →</button></div><p id="lesson-note" role="status"></p><p><strong>Expected effect:</strong> ${escape(item.effect)}</p><div class="callout"><strong>Common mistake:</strong> ${escape(item.mistake)}</div>`;
      $('lesson-progress').textContent = `${completed.size} / ${lessons.length} lessons completed`;
      $('progress-fill').style.width = `${completed.size / lessons.length * 100}%`;
      $('topic-list') && renderTopics();
      $('try-lesson').addEventListener('click', () => {
        if (item.executable) location.href = `playground.html?sql=${encodeURIComponent(item.sql)}`;
        else $('lesson-note').textContent = 'SQLite sandbox-এ server user permission নেই; এই SQL শুধু reference lesson।';
      });
      $('complete-lesson').addEventListener('click', () => {
        completed.has(id) ? completed.delete(id) : completed.add(id);
        write('sqlpath-lessons', [...completed]);
        renderLesson(id);
      });
      $('next-lesson').addEventListener('click', () => renderLesson((id + 1) % lessons.length));
    }
    $('lesson-search').addEventListener('input', renderTopics);
    $('lesson-category').addEventListener('change', renderTopics);
    renderLesson(0);
  }

  if (page === 'playground') {
    const editor = $('query-editor');
    const status = (text, kind = '') => {
      $('execution-status').className = `execution-status ${kind}`;
      $('execution-status').textContent = text;
    };
    let connection;
    let ready = false;
    let tables = [];
    let selectedTable = '';
    const tableHTML = result => `<div class="table-wrap"><table><thead><tr>${result.columns.map(column => `<th>${escape(column)}</th>`).join('')}</tr></thead><tbody>${result.values.map(row => `<tr>${row.map(value => `<td>${value === null ? '<span class="null">NULL</span>' : escape(value)}</td>`).join('')}</tr>`).join('') || '<tr><td class="no-rows">No rows returned.</td></tr>'}</tbody></table></div>`;
    function renderExplorer() {
      if (!tables.some(table => table.name === selectedTable)) selectedTable = tables[0]?.name || '';
      $('sandbox-tabs').innerHTML = tables.map(table =>
        `<button type="button" class="small-btn ${table.name === selectedTable ? 'active' : ''}" data-table="${escape(table.name)}">${escape(table.name)} <small>${table.count}</small></button>`
      ).join('') || '<span class="progress-label">No tables yet. Try CREATE TABLE.</span>';
      $('sandbox-tabs').querySelectorAll('[data-table]').forEach(button => {
        button.addEventListener('click', () => {
          selectedTable = button.dataset.table;
          renderExplorer();
        });
      });
      const selected = tables.find(table => table.name === selectedTable);
      $('sandbox-table').innerHTML = selected
        ? `<h3>${escape(selected.name)}</h3><div class="schema-list">${selected.columns.map(column => `<div class="schema-row"><strong>${escape(column[1])}${column[5] ? ' 🔑 PK' : ''}</strong><code>${escape(column[2])}</code></div>`).join('')}</div>${tableHTML(selected.rows)}`
        : '';
      $('sandbox-relationships').textContent = tables.flatMap(table =>
        table.foreign.map(key => `${table.name}.${key[3]} → ${key[2]}.${key[4]}`)
      ).join(' · ') || 'No foreign keys in this database.';
    }
    async function boot() {
      ready = false;
      $('execute-query').disabled = true;
      $('reset-sandbox').disabled = true;
      connection = createWorker(() => {
        ready = false;
        $('engine-state').textContent = 'Stopped · reset required';
        $('reset-sandbox').disabled = false;
      });
      try {
        const data = await connection.ask('init', {}, 15000);
        ready = true;
        tables = data.tables;
        renderExplorer();
        $('engine-state').textContent = `SQLite ${data.version} · Ready`;
        $('execute-query').disabled = false;
        $('reset-sandbox').disabled = false;
        status('Ready. Run your first SELECT query.');
      } catch (error) {
        status(`SQLite could not load. Serve this folder over HTTP, then reload. ${error.message}`, 'error');
        $('engine-state').textContent = 'Engine unavailable';
      }
    }
    async function run() {
      if (!ready) return;
      const sql = editor.value.trim();
      if (!sql) {
        status('প্রথমে একটি SQL query লেখো।', 'error');
        return;
      }
      $('execute-query').disabled = true;
      status('Running query…');
      try {
        const data = await connection.ask('run', { sql });
        tables = data.tables;
        renderExplorer();
        $('query-results').innerHTML = data.results.map((result, index) =>
          `<div><div class="result-meta">Result ${index + 1} · ${result.count} rows</div>${tableHTML(result)}</div>`
        ).join('');
        status(`✓ Query complete · ${data.duration.toFixed(1)} ms`, 'success');
        const recent = [sql, ...read('sqlpath-recent', []).filter(query => query !== sql)].slice(0, 10);
        write('sqlpath-recent', recent);
        renderRecent();
      } catch (error) {
        status(`Query চালানো যায়নি। ${error.message}`, 'error');
      } finally {
        $('execute-query').disabled = !ready;
      }
    }
    function renderRecent() {
      const recent = read('sqlpath-recent', []);
      $('recent-queries').innerHTML = recent.map((query, index) =>
        `<button type="button" class="small-btn recent-query" data-recent="${index}">${escape(query)}</button>`
      ).join('') || '<p class="progress-label">Your successful queries will appear here.</p>';
      $('recent-queries').querySelectorAll('[data-recent]').forEach(button => {
        button.addEventListener('click', () => { editor.value = recent[Number(button.dataset.recent)]; });
      });
    }
    $('query-example').innerHTML = SQLCourse.lessons.filter(item => item.executable)
      .map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
    $('query-example').addEventListener('change', event => {
      editor.value = SQLCourse.lessons[Number(event.target.value)].sql;
    });
    $('copy-query').addEventListener('click', async event => {
      try {
        await navigator.clipboard.writeText(editor.value);
        event.currentTarget.textContent = '✓ Copied';
      } catch {
        status('Clipboard unavailable. Select the query and copy it manually.', 'error');
      }
    });
    $('clear-query').addEventListener('click', () => { editor.value = ''; editor.focus(); });
    editor.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        run();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
      }
    });
    $('execute-query').addEventListener('click', run);
    $('reset-sandbox').addEventListener('click', async () => {
      $('reset-sandbox').disabled = true;
      if (!ready) {
        await boot();
        return;
      }
      try {
        const data = await connection.ask('reset');
        tables = data.tables;
        renderExplorer();
        $('query-results').innerHTML = '';
        status('✓ Sample database restored.', 'success');
      } catch (error) {
        status(error.message, 'error');
      } finally {
        $('reset-sandbox').disabled = false;
      }
    });
    const query = new URLSearchParams(location.search).get('sql');
    if (query) editor.value = query;
    renderRecent();
    boot();
  }

  if (page === 'practice') {
    const { challenges } = SQLCourse;
    const solved = new Set(read('sqlpath-challenges', []));
    const editor = document.createElement('textarea');
    editor.id = 'practice-query';
    editor.className = 'editor';
    editor.setAttribute('aria-label', 'তোমার SQL উত্তর');
    editor.placeholder = 'এখানে SQL query লেখো…';
    $('challenge-content').after(editor);
    let current = 0;
    let connection;
    let ready = false;
    function renderChallenge(id) {
      current = id;
      const item = challenges[id];
      $('challenge-select').value = String(id);
      $('challenge-content').innerHTML = `<span class="overline">${escape(item.level)}</span><h3>${escape(item.title)}</h3><p>${escape(item.task)}</p><details><summary>Need a hint?</summary><p>${escape(item.hint)}</p></details><details><summary>Show solution & explanation</summary><pre class="code-block">${escape(item.sql)}</pre><p>${escape(item.hint)}</p></details>`;
      $('challenge-progress').textContent = `${solved.size} / ${challenges.length} solved`;
      $('challenge-feedback').textContent = '';
    }
    function renderOptions() {
      const level = $('challenge-level').value;
      const list = challenges.filter(item => level === 'All levels' || item.level === level);
      $('challenge-select').innerHTML = list.map(item =>
        `<option value="${item.id}">${solved.has(item.id) ? '✓ ' : ''}${escape(item.title)}</option>`
      ).join('');
      renderChallenge(list[0].id);
    }
    $('challenge-level').addEventListener('change', renderOptions);
    $('challenge-select').addEventListener('change', event => renderChallenge(Number(event.target.value)));
    $('challenge-load').addEventListener('click', () => {
      location.href = `playground.html?sql=${encodeURIComponent(`-- ${challenges[current].task}\n`)}`;
    });
    $('challenge-check').addEventListener('click', async () => {
      if (!ready) return;
      $('challenge-check').disabled = true;
      $('challenge-feedback').textContent = 'Checking against fresh sample data…';
      try {
        const data = await connection.ask('check', { sql: editor.value, index: current });
        $('challenge-feedback').textContent = data.correct
          ? '✓ সঠিক! তোমার query প্রত্যাশিত ফলাফল দিয়েছে।'
          : 'আরেকবার চেষ্টা করো। কলাম, row, sorting ও পরিবর্তনের লক্ষ্য মিলিয়ে দেখো।';
        if (data.correct) {
          solved.add(current);
          write('sqlpath-challenges', [...solved]);
          renderChallenge(current);
          $('challenge-feedback').textContent = '✓ সঠিক! তোমার query প্রত্যাশিত ফলাফল দিয়েছে।';
        }
      } catch (error) {
        $('challenge-feedback').textContent = error.message;
      } finally {
        $('challenge-check').disabled = !ready;
      }
    });
    connection = createWorker(() => {
      ready = false;
      $('challenge-check').disabled = true;
      $('challenge-feedback').textContent = 'Query timed out. Reload this page to restart.';
    });
    connection.ask('init', {}, 15000).then(() => {
      ready = true;
      $('challenge-check').disabled = false;
    }).catch(error => {
      $('challenge-feedback').textContent = `SQLite could not load. ${error.message}`;
    });
    $('challenge-check').disabled = true;
    renderOptions();
  }

  if (page === 'data-types') {
    const input = document.createElement('label');
    input.className = 'dtype-reference';
    input.innerHTML = 'Try a sample value<input id="type-suggest" placeholder="25, student@example.com, 2026-11-08"><p id="type-suggestion" role="status" aria-live="polite">একটি মান লিখে শুরু করো।</p>';
    document.querySelector('.datatype-section').append(input);
    $('type-suggest').addEventListener('input', event => {
      const value = event.target.value.trim();
      let suggestion = 'একটি মান লিখে শুরু করো।';
      if (/^-?\d+$/.test(value)) suggestion = 'INT / BIGINT; পরিচয় বা phone হলে TEXT বেছে নাও।';
      else if (/^-?\d+\.\d+$/.test(value)) suggestion = 'MySQL/PostgreSQL-এ নির্ভুল দশমিকের জন্য DECIMAL; SQLite-এ REAL আনুমানিক।';
      else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) suggestion = 'DATE candidate; SQLite-এ ISO date সাধারণত TEXT হিসেবে রাখা হয়।';
      else if (/^(true|false)$/i.test(value)) suggestion = 'BOOLEAN; SQLite-এ সাধারণত INTEGER 0 / 1।';
      else if (value) suggestion = 'VARCHAR / TEXT; সর্বোচ্চ দৈর্ঘ্য ও ব্যবহার অনুযায়ী বেছে নাও।';
      $('type-suggestion').textContent = suggestion;
    });
  }

  if (page === 'cheat-sheet') {
    const cheats = [
      ['Read & filter', 'SELECT name FROM students\nWHERE age > 20\nORDER BY name LIMIT 10;'],
      ['Group & summarize', 'SELECT department_id, COUNT(*)\nFROM students GROUP BY department_id\nHAVING COUNT(*) > 1;'],
      ['Connect tables', 'SELECT s.name, d.department_name\nFROM students s JOIN departments d\nON s.department_id = d.id;'],
      ['Write data', "INSERT INTO students(id,name)\nVALUES(6,'Sadia');\nUPDATE students SET age=20 WHERE id=6;"],
      ['Define a table', 'CREATE TABLE notes(\n  id INTEGER PRIMARY KEY,\n  body TEXT NOT NULL\n);'],
      ['Transactions', 'BEGIN;\nUPDATE students SET age=22 WHERE id=1;\nROLLBACK;']
    ];
    $('cheat-grid').innerHTML = cheats.map(([title, sql], index) =>
      `<div class="cheat-panel"><h3>${title}</h3><code>${escape(sql)}</code><button type="button" class="small-btn" data-cheat="${index}">Copy syntax</button></div>`
    ).join('');
    $('cheat-grid').querySelectorAll('[data-cheat]').forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(cheats[Number(button.dataset.cheat)][1]);
          button.textContent = '✓ Copied';
        } catch {
          button.textContent = 'Select and copy';
        }
      });
    });
    $('reset-progress').addEventListener('click', () => {
      localStorage.removeItem('sqlpath-lessons');
      localStorage.removeItem('sqlpath-challenges');
      $('reset-progress').textContent = 'Progress reset';
    });
  }
})();
